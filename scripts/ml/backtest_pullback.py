#!/usr/bin/env python3
"""Backtest of the Brooks small-pullback setup, with realistic execution.

The trend-from-the-open and opening-spike backtests both came back
NULL. Brooks' primary source is explicit about why that is expected:
breakouts and reversals fail far more often than they work ("about 80
percent of trading-range breakouts fail", "about 80 percent of
trend-reversal attempts fail" — src/content/blog/traders-equation.md).
The setup Brooks rates *high*-probability is the opposite one: a
with-trend entry on a small pullback inside an established trend.

This engine tests that setup. It is the with-trend small pullback the
scanner already detects (scripts/live/pullback_detector.py):

  - a strong impulse leg (>= impulse_min_atr * ATR over >= 3 bars),
  - a brief shallow pullback (<= 4 bars, retraces <= 50% of impulse,
    holds the 20-EMA),
  - a with-trend *prior-bar breakout-stop* entry — price trades one
    tick past the prior bar's extreme, where the resting stop fills.

The detector already operationalises several State Layers: the EMA
trend filter is the `always-in` direction state, the retrace / depth
test is `channel-pressure`, and the bar-count limits are `leg-count`.
A signal therefore only fires when those states agree — there is no
extra post-hoc state filter, which is what keeps this a clean test
rather than a curve-fit.

  entry  = prior bar's extreme (the resting stop-order fill)
  stop   = the pullback's far side (structural invalidation)
  target = a pre-registered R-multiple grid {1, 1.5, 2, 3}R x
           horizons {2h, eod}; primary cell 2R / 2h

Detection runs on 5-minute RTH bars; the fill simulation walks
1-MINUTE bars for fidelity. A 1-min bar that straddles both stop and
target is scored STOPPED (conservative). Costs: per-share commission +
entry/stop slippage in bps — the same model as backtest_tfo.py /
backtest_spike.py. It reuses the 1-minute bar cache under
artifacts/backtest/bars_1m/ — no new data fetch.

Everything below is pre-registered: fixed before results were seen.
If the result is a null, the report says so.

Usage:
    python3 scripts/ml/backtest_pullback.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

# pullback_detector lives in scripts/live/ — add it to the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from pullback_detector import (  # noqa: E402
    Bar,
    PullbackConfig,
    detect_pullbacks,
)

ROOT = Path(__file__).resolve().parents[2]
BARS_CACHE = ROOT / "artifacts" / "backtest" / "bars_1m"
OUT_DIR = ROOT / "artifacts" / "backtest"

# ----- pre-registered execution config (matches backtest_tfo.py) ------
COMMISSION_PER_SHARE = 0.005     # USD, each side
ENTRY_SLIPPAGE_BPS = 2.0         # market/stop entry crosses the spread
STOP_SLIPPAGE_BPS = 4.0          # stops are market orders in motion
TARGET_SLIPPAGE_BPS = 0.0       # target is a resting limit — clean fill
TICK = 0.01                      # protective-stop offset (Brooks: 1 tick)
MIN_RISK_FRAC = 0.0005           # tradeability floor: a stop tighter than
                                 # 5 bps of price is inside the spread —
                                 # not a real stop. Such signals are
                                 # skipped (degenerate flat/illiquid bars).
BAR_5M = 300
RANDOM_STATE = 17

TARGET_R_GRID = [1.0, 1.5, 2.0, 3.0]
HORIZON_GRID = {"2h": 24, "eod": 78}   # 5-min bars after the fire bar
PRIMARY_TARGET_R = 2.0
PRIMARY_HORIZON = "2h"

# Detector config — the V1 defaults, untouched. Stated here so the run
# is reproducible and the thresholds are auditable in one place.
DETECTOR_CONFIG = PullbackConfig()


def aggregate_5m(bars1: list[dict]) -> list[Bar]:
    """Roll chronological 1-min bars into 5-min pullback_detector Bars."""
    buckets: dict[int, list[dict]] = {}
    for b in bars1:
        key = (int(b["t"]) // BAR_5M) * BAR_5M
        buckets.setdefault(key, []).append(b)
    out: list[Bar] = []
    for key in sorted(buckets):
        grp = sorted(buckets[key], key=lambda b: int(b["t"]))
        out.append(Bar(
            t=key,
            o=float(grp[0]["o"]),
            h=max(float(b["h"]) for b in grp),
            l=min(float(b["l"]) for b in grp),
            c=float(grp[-1]["c"]),
            v=sum(float(b.get("v") or 0) for b in grp),
        ))
    return out


def simulate(
    sig, bars1: list[dict], target_r: float, horizon_bars: int,
    cost_mult: float = 1.0,
) -> dict | None:
    """Simulate one pullback trade on 1-min bars.

    Entry is a resting stop order at the prior bar's extreme; it fills
    intrabar on the fire bar, the moment price first trades through it.
    The stop/target walk starts on that same 1-min bar (a bar that
    straddles both is scored stopped — conservative). The position is
    time-stopped at horizon_bars 5-min bars after the fire bar.
    """
    direction = sig.direction
    fire_ts = int(sig.fire_ts)
    ideal_entry = float(sig.entry_price)
    # Protective stop: one tick beyond the pullback's far side (Brooks).
    stop = (float(sig.stop_price) - TICK) if direction == "long" \
        else (float(sig.stop_price) + TICK)
    risk = (ideal_entry - stop) if direction == "long" else (stop - ideal_entry)
    if risk <= 0 or risk < MIN_RISK_FRAC * ideal_entry:
        return None

    es = ENTRY_SLIPPAGE_BPS * cost_mult / 1e4
    ss = STOP_SLIPPAGE_BPS * cost_mult / 1e4
    entry_fill = ideal_entry * (1 + es) if direction == "long" \
        else ideal_entry * (1 - es)
    target = (ideal_entry + target_r * risk) if direction == "long" \
        else (ideal_entry - target_r * risk)

    # --- entry trigger: first 1-min bar inside the fire bar that
    #     trades through the resting stop price ---
    fire_window = sorted(
        (b for b in bars1 if fire_ts <= int(b["t"]) < fire_ts + BAR_5M),
        key=lambda b: int(b["t"]),
    )
    trigger_t = None
    for b in fire_window:
        crossed = (float(b["h"]) >= ideal_entry) if direction == "long" \
            else (float(b["l"]) <= ideal_entry)
        if crossed:
            trigger_t = int(b["t"])
            break
    if trigger_t is None:
        return None  # entry never actually triggered intrabar

    # --- walk every 1-min bar from the trigger bar to the horizon ---
    horizon_end = fire_ts + horizon_bars * BAR_5M
    path = sorted(
        (b for b in bars1 if trigger_t <= int(b["t"]) < horizon_end),
        key=lambda b: int(b["t"]),
    )
    if not path:
        return None

    exit_price = None
    exit_reason = None
    for b in path:
        hi, lo = float(b["h"]), float(b["l"])
        if direction == "long":
            hit_stop, hit_tgt = lo <= stop, hi >= target
        else:
            hit_stop, hit_tgt = hi >= stop, lo <= target
        if hit_stop and hit_tgt:
            exit_price = stop * (1 - ss) if direction == "long" else stop * (1 + ss)
            exit_reason = "stop_straddle"
            break
        if hit_stop:
            exit_price = stop * (1 - ss) if direction == "long" else stop * (1 + ss)
            exit_reason = "stop"
            break
        if hit_tgt:
            exit_price = target           # resting limit — clean fill
            exit_reason = "target"
            break
    if exit_price is None:
        last_close = float(path[-1]["c"])
        exit_price = last_close * (1 - es) if direction == "long" \
            else last_close * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if direction == "long" \
        else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE * cost_mult) / risk
    net_r = gross / risk - commission_r
    return {
        "direction": direction,
        "exit_reason": exit_reason,
        "risk_per_share": round(risk, 4),
        "net_r": round(net_r, 4),
        "score": sig.score,
        "impulse_atr": sig.impulse_atr,
        "retrace": sig.retrace,
        "pullback_len": sig.pullback_len,
    }


def _bootstrap_ci(values: np.ndarray, n: int = 5000) -> list[float]:
    if len(values) < 2:
        return [float("nan"), float("nan")]
    rng = np.random.default_rng(RANDOM_STATE)
    means = [rng.choice(values, size=len(values), replace=True).mean() for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 4),
            round(float(np.percentile(means, 97.5)), 4)]


def summarize(trades: list[dict], label: str) -> dict:
    if not trades:
        return {"label": label, "n": 0}
    r = np.array([t["net_r"] for t in trades], dtype=float)
    reasons = [t["exit_reason"] for t in trades]
    n_target = sum(1 for x in reasons if x == "target")
    wins = r[r > 0]
    losses = r[r <= 0]
    equity = np.cumsum(r)
    dd = equity - np.maximum.accumulate(equity)
    return {
        "label": label,
        "n": len(trades),
        "target_hit_rate": round(n_target / len(trades), 4),
        "expectancy_r": round(float(r.mean()), 4),
        "expectancy_ci95": _bootstrap_ci(r),
        "win_rate": round(float((r > 0).mean()), 4),
        "avg_win_r": round(float(wins.mean()), 4) if len(wins) else 0.0,
        "avg_loss_r": round(float(losses.mean()), 4) if len(losses) else 0.0,
        "profit_factor": round(float(wins.sum() / -losses.sum()), 3)
            if len(losses) and losses.sum() < 0 else None,
        "total_r": round(float(r.sum()), 2),
        "max_drawdown_r": round(float(dd.min()), 2),
        "sharpe_like": round(float(r.mean() / r.std()), 3) if r.std() > 0 else None,
    }


def main() -> int:
    cache_files = sorted(BARS_CACHE.glob("*.json"))
    if not cache_files:
        print(f"ERROR: no cached 1-min bars in {BARS_CACHE}", file=sys.stderr)
        print("Run backtest_tfo.py first to populate the cache.", file=sys.stderr)
        return 2
    print(f"Scanning {len(cache_files)} cached sessions for small pullbacks...",
          flush=True)

    # --- detect every pullback once; keep the signal + its session bars ---
    detected: list[tuple] = []   # (symbol, session_date, sig, bars1)
    symbols: set[str] = set()
    sessions_with_signal = 0
    for cf in cache_files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        symbol, session_date = cf.stem.rsplit("_", 1)
        symbols.add(symbol)
        bars5 = aggregate_5m(bars1)
        sigs = detect_pullbacks(bars5, DETECTOR_CONFIG, timeframe="5m")
        if sigs:
            sessions_with_signal += 1
        for sig in sigs:
            detected.append((symbol, session_date, sig, bars1))
    print(f"  {len(detected)} pullback signals across "
          f"{sessions_with_signal} sessions", flush=True)

    def run_cell(target_r: float, horizon_bars: int, cost_mult: float = 1.0) -> list[dict]:
        out: list[dict] = []
        for symbol, session_date, sig, bars1 in detected:
            sim = simulate(sig, bars1, target_r, horizon_bars, cost_mult)
            if sim is None:
                continue
            sim["symbol"] = symbol
            sim["session_date"] = session_date
            out.append(sim)
        return out

    # --- full grid: every target x horizon ---
    print("Running grid (target R x horizon)...", flush=True)
    grid = []
    for hname, hbars in HORIZON_GRID.items():
        for tr in TARGET_R_GRID:
            cell = run_cell(tr, hbars)
            s = summarize(cell, f"{tr}R / {hname}")
            s["target_r"] = tr
            s["horizon"] = hname
            grid.append(s)
            print(f"  {tr}R/{hname}: n={s['n']} exp={s.get('expectancy_r')}"
                  f" win={s.get('win_rate')} pf={s.get('profit_factor')}",
                  flush=True)

    # --- primary, pre-registered configuration (detailed) ---
    horizon = HORIZON_GRID[PRIMARY_HORIZON]
    ledger = run_cell(PRIMARY_TARGET_R, horizon)
    longs = [t for t in ledger if t["direction"] == "long"]
    shorts = [t for t in ledger if t["direction"] == "short"]

    # --- cost sensitivity on the primary config ---
    cost_sens = []
    for cm in (1.0, 2.0, 3.0):
        s = summarize(run_cell(PRIMARY_TARGET_R, horizon, cost_mult=cm), f"costs x{cm}")
        s["cost_mult"] = cm
        cost_sens.append(s)

    report: dict = {
        "config": {
            "setup": "Brooks with-trend small pullback (prior-bar breakout-stop)",
            "entry": "prior bar extreme (resting stop fill)",
            "stop": "pullback far side (structural)",
            "primary_target_r": PRIMARY_TARGET_R,
            "primary_horizon": PRIMARY_HORIZON,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            "detector": {
                "ema_len": DETECTOR_CONFIG.ema_len,
                "atr_len": DETECTOR_CONFIG.atr_len,
                "impulse_min_bars": DETECTOR_CONFIG.impulse_min_bars,
                "impulse_min_atr": DETECTOR_CONFIG.impulse_min_atr,
                "pullback_max_bars": DETECTOR_CONFIG.pullback_max_bars,
                "pullback_max_retrace": DETECTOR_CONFIG.pullback_max_retrace,
            },
        },
        "coverage": {
            "bar_source": "cloudflare-r2 (cached 1-min sessions)",
            "sessions_scanned": len(cache_files),
            "sessions_with_signal": sessions_with_signal,
            "symbols": sorted(symbols),
        },
        "all_trades": summarize(ledger, f"all trades ({PRIMARY_TARGET_R}R/{PRIMARY_HORIZON})"),
        "grid": grid,
        "longs": summarize(longs, "long pullbacks"),
        "shorts": summarize(shorts, "short pullbacks"),
        "cost_sensitivity": cost_sens,
    }

    # by walk-forward-free detector-score decile (the score is the
    # rule-based V1 formula — known at the fire bar, never fit to P&L)
    if ledger:
        scored = sorted(ledger, key=lambda t: t["score"])
        deciles = []
        for d in range(10):
            chunk = scored[d * len(scored) // 10:(d + 1) * len(scored) // 10]
            deciles.append(summarize(chunk, f"decile {d+1}"))
        report["by_score_decile"] = deciles

    # by month
    by_month: dict[str, list[dict]] = {}
    for t in ledger:
        by_month.setdefault(t["session_date"][:7], []).append(t)
    report["by_month"] = [summarize(by_month[m], m) for m in sorted(by_month)]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUT_DIR / "pullback_backtest_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    ledger_path = OUT_DIR / "pullback_trade_ledger.json"
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")

    def line(s: dict):
        if s.get("n", 0) == 0:
            print(f"  {s['label']:34s} n=0")
            return
        print(f"  {s['label']:34s} n={s['n']:4d}  "
              f"exp={s['expectancy_r']:+.3f}R  CI{s['expectancy_ci95']}  "
              f"win={s['win_rate']:.3f}  pf={s['profit_factor']}")

    print("\n=== BROOKS SMALL-PULLBACK BACKTEST ===")
    print(f"  primary: {PRIMARY_TARGET_R}R / {PRIMARY_HORIZON}")
    line(report["all_trades"])
    line(report["longs"])
    line(report["shorts"])
    a = report["all_trades"]
    lo, hi = a["expectancy_ci95"]
    verdict = ("POSITIVE — CI excludes zero" if lo > 0
               else "NEGATIVE — CI excludes zero" if hi < 0
               else "NULL — CI straddles zero")
    print(f"  verdict: {verdict}")
    print(f"\nReport: {report_path}")
    print(f"Ledger: {ledger_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
