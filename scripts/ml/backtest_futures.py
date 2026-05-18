#!/usr/bin/env python3
"""Backtest the Brooks setups on the index futures — Brooks' own market.

The trend-from-the-open, opening-spike and small-pullback backtests
all run on liquid US single-stocks + ETFs, and all come back null to
negative. But Al Brooks' primary source material is written about, and
illustrated on, the E-mini S&P 500 futures. The price-action
behaviour Brooks describes is a claim about *that* market first.

This engine runs the same detectors and the same realistic-execution
simulation on the four US equity index futures the R2 bucket carries —
ES, NQ, YM, RTY — over their full 2019-2026 history. It is a
faithfulness test: does the setup family work on the instrument the
book is actually about?

Detection is on 5-minute RTH bars; fills are simulated on 1-minute
bars. Everything is pre-registered — the R-multiple target grid, the
costs, the 1-tick structural stop — and reused verbatim from
backtest_pullback.py / backtest_spike.py so the futures result is
directly comparable to the equity result. R-multiples are unit-free,
so contract point values and tick sizes never enter the arithmetic.

Bars come from the Cloudflare R2 bars bucket (one continuous
front-month parquet per contract). Roll gaps are overnight, so within
any single RTH session every bar is one contract on one price scale —
the same argument the TFO methodology makes for stock splits.

Usage:
    python3 scripts/ml/backtest_futures.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from pullback_detector import detect_pullbacks, PullbackConfig  # noqa: E402
from spike_detector import detect_spikes  # noqa: E402

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE))
import backtest_pullback as pb  # noqa: E402
import backtest_spike as sp  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "artifacts" / "backtest"
R2_CACHE = OUT_DIR / "r2_cache"

# Brooks' instruments — the US equity index futures.
INSTRUMENTS = {
    "ES": "databento/GLBX.MDP3_ES-c-0_ohlcv-1m_2019-2026.parquet",
    "NQ": "databento/GLBX.MDP3_NQ-c-0_ohlcv-1m_2019-2026.parquet",
    "YM": "databento/GLBX.MDP3_YM-c-0_ohlcv-1m_2019-2026.parquet",
    "RTY": "databento/GLBX.MDP3_RTY-c-0_ohlcv-1m_2019-2026.parquet",
}

RTH_OPEN_MIN = 9 * 60 + 30
RTH_CLOSE_MIN = 16 * 60


def _r2():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def load_rth_sessions(key: str) -> dict[str, list[dict]]:
    """Download a continuous-contract parquet and split it into RTH
    sessions: {YYYY-MM-DD: [chronological {t,o,h,l,c,v}, ...]}."""
    import pandas as pd

    R2_CACHE.mkdir(parents=True, exist_ok=True)
    local = R2_CACHE / key.split("/")[-1]
    if not local.exists():
        _r2().download_file(os.environ["R2_BARS_BUCKET"], key, str(local))
    df = pd.read_parquet(local)
    if df.empty:
        return {}
    # nano-dollar scale guard (same R2 export defect as the equities)
    if 0 < float(df["close"].median()) < 1.0:
        for col in ("open", "high", "low", "close"):
            df[col] = df[col] * 1e9

    et = df.index.tz_convert("America/New_York")
    minutes = et.hour * 60 + et.minute
    mask = (minutes >= RTH_OPEN_MIN) & (minutes < RTH_CLOSE_MIN)
    rth = df[mask]
    days = et[mask].strftime("%Y-%m-%d")
    ts = (rth.index.asi8 // 1_000_000_000).astype("int64")

    sessions: dict[str, list[dict]] = {}
    for t, day, o, h, l, c, v in zip(
        ts, days,
        rth["open"].values, rth["high"].values, rth["low"].values,
        rth["close"].values, rth["volume"].values,
    ):
        sessions.setdefault(day, []).append(
            {"t": int(t), "o": float(o), "h": float(h),
             "l": float(l), "c": float(c), "v": float(v)})
    for day in sessions:
        sessions[day].sort(key=lambda b: b["t"])
    return sessions


def main() -> int:
    horizon = pb.HORIZON_GRID[pb.PRIMARY_HORIZON]
    cfg = PullbackConfig()

    report: dict = {
        "config": {
            "instruments": list(INSTRUMENTS),
            "pullback_primary": f"{pb.PRIMARY_TARGET_R}R/{pb.PRIMARY_HORIZON}",
            "spike_target": "measured move = spike height",
            "commission_per_share": pb.COMMISSION_PER_SHARE,
            "entry_slippage_bps": pb.ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": pb.STOP_SLIPPAGE_BPS,
        },
        "per_instrument": {},
    }
    pull_all: list[dict] = []
    spike_all: list[dict] = []
    spike_open_all: list[dict] = []

    for sym, key in INSTRUMENTS.items():
        print(f"Loading {sym} ...", flush=True)
        sessions = load_rth_sessions(key)
        pulls: list[dict] = []
        spikes: list[dict] = []
        spikes_open: list[dict] = []
        for day, bars1 in sorted(sessions.items()):
            if len(bars1) < 60:
                continue
            bars5 = pb.aggregate_5m(bars1)

            for sig in detect_pullbacks(bars5, cfg, timeframe="5m"):
                sim = pb.simulate(sig, bars1, pb.PRIMARY_TARGET_R, horizon)
                if sim is None:
                    continue
                sim["session_date"] = day
                pulls.append(sim)

            for sig in detect_spikes(bars5):
                sim = sp.simulate(sig, bars1)
                if sim is None:
                    continue
                row = {"net_r": sim["net_r"], "exit_reason": sim["exit_reason"],
                       "direction": sig.direction, "session_date": day}
                spikes.append(row)
                if sig.is_opening:
                    spikes_open.append(row)

        report["per_instrument"][sym] = {
            "sessions": len(sessions),
            "pullback": pb.summarize(pulls, f"{sym} pullback"),
            "spike_all": sp.summarize(spikes, f"{sym} spikes"),
            "spike_opening": sp.summarize(spikes_open, f"{sym} opening spikes"),
        }
        pull_all += pulls
        spike_all += spikes
        spike_open_all += spikes_open
        print(f"  {sym}: {len(pulls)} pullbacks, {len(spikes)} spikes "
              f"({len(spikes_open)} opening)", flush=True)

    report["pooled"] = {
        "pullback": pb.summarize(pull_all, "all index futures — pullback"),
        "spike_all": sp.summarize(spike_all, "all index futures — spikes"),
        "spike_opening": sp.summarize(spike_open_all,
                                      "all index futures — opening spikes"),
    }

    # by-year on the pooled cohorts — guards against one regime carrying it
    def by_year(trades: list[dict], summ) -> list[dict]:
        years: dict[str, list[dict]] = {}
        for t in trades:
            years.setdefault(t["session_date"][:4], []).append(t)
        return [summ(years[y], y) for y in sorted(years)]

    report["pullback_by_year"] = by_year(pull_all, pb.summarize)
    report["spike_opening_by_year"] = by_year(spike_open_all, sp.summarize)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / "futures_backtest_report.json"
    out.write_text(json.dumps(report, indent=2) + "\n")

    def line(s: dict):
        if not s.get("n"):
            print(f"  {s['label']:38s} n=0")
            return
        print(f"  {s['label']:38s} n={s['n']:5d}  exp={s['expectancy_r']:+.3f}R"
              f"  CI{s['expectancy_ci95']}  win={s['win_rate']:.3f}"
              f"  pf={s['profit_factor']}")

    print("\n=== BROOKS SETUPS ON THE INDEX FUTURES ===")
    for sym in INSTRUMENTS:
        pi = report["per_instrument"][sym]
        line(pi["pullback"])
        line(pi["spike_opening"])
    print("  --- pooled ---")
    line(report["pooled"]["pullback"])
    line(report["pooled"]["spike_all"])
    line(report["pooled"]["spike_opening"])
    print(f"\nReport: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
