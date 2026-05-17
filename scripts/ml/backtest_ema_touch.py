#!/usr/bin/env python3
"""Backtest of the first-EMA-touch setup, with realistic execution.

A clean, no-look-ahead rebuild of the /ema-touches study. The original
engine is Mac-only; this one is in-repo and auditable.

The trade:

  detect  = the first pullback into the 10/20 EMA after a small trend
            (scripts/ml/ema_touch_detector.py), on 5-min bars.
  entry   = the close of the touch bar — what the trader acts on.
  stop    = 1 tick beyond the touch bar's extreme  (or, for the ATR
            variant, an ATR multiple beyond it).
  target  = an R-multiple of risk, or a measured move (the trend leg).

No look-ahead: the touch bar's own range is NEVER used to score the
trade. Entry is at the touch bar's 5-min close; the fill simulation
walks 1-minute bars strictly AFTER that close (same model as
backtest_spike.py). A 1-min bar straddling both stop and target is
scored stopped (conservative).

Minimum-risk filter: a setup whose risk is only a couple of ticks (or a
trivial fraction of price) is not realistically tradable — slippage
alone swamps the R. Such setups are dropped, not counted.

Bias guards baked into the report:
  - every variant is reported (no best-of-N spotlight),
  - a stocks-only cut (index/sector/leveraged ETFs fire correlated,
    non-independent trades — the pooled CI is too tight),
  - a by-day cluster-robust expectancy (one observation per session
    date).

Usage:
    python3 scripts/ml/backtest_ema_touch.py --start 2024-01-01 --end 2024-12-31
    python3 scripts/ml/backtest_ema_touch.py --start 2025-01-01 --end 2025-12-31
    python3 scripts/ml/backtest_ema_touch.py --tickers AAPL MSFT --start ... --end ...
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import date as date_t, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ema_touch_detector import EmaTouchConfig, EmaTouchSignal, detect_ema_touch  # noqa: E402
from bars_store import Session, load_session  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "artifacts" / "backtest"

# ----- pre-registered execution config (matches backtest_spike.py) ----
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0
RANDOM_STATE = 17
TICK = 0.01
BAR_5M = 300

# ----- minimum-risk filter (drop untradable few-tick setups) ----------
MIN_RISK_TICKS = 5       # risk must span at least this many ticks
MIN_RISK_BPS = 15.0      # ... and at least this many bps of entry price

# ----- universe -------------------------------------------------------
STOCKS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO",
    "NFLX", "JPM", "V", "MA", "HD", "CRM", "ADBE", "QCOM", "INTC", "MU",
    "AMAT", "ORCL", "LLY", "UNH", "CAT",
]
ETFS = [
    "SPY", "QQQ", "IWM", "DIA", "XLF", "XLE", "XLV", "XLI", "SMH",
    "TQQQ", "SQQQ", "TLT",
]
UNIVERSE = STOCKS + ETFS
ETF_SET = set(ETFS)


@dataclass(frozen=True)
class Variant:
    """A backtest variant — an EMA period, a stop rule, a target rule."""
    name: str
    ema_len: int
    stop: str            # 'touch' (1 tick beyond) | 'atr' (atr_mult beyond)
    atr_stop_mult: float
    target: str          # 'r' (R-multiple) | 'mm' (measured move)
    r_multiple: float


VARIANTS = [
    Variant("ema20_1r", 20, "touch", 0.0, "r", 1.0),
    Variant("ema20_2r", 20, "touch", 0.0, "r", 2.0),
    Variant("ema10_1r", 10, "touch", 0.0, "r", 1.0),
    Variant("ema10_2r", 10, "touch", 0.0, "r", 2.0),
    # New variants, beyond the original plain 1R/2R:
    Variant("ema20_mm", 20, "touch", 0.0, "mm", 0.0),       # measured move
    Variant("ema20_atr2r", 20, "atr", 1.0, "r", 2.0),       # ATR stop, 2R
]


# ----- pure: EMA seeding ----------------------------------------------


def seeded_ema(prior_closes: list[float], today_closes: list[float],
               period: int) -> list[float]:
    """EMA over [prior trading day's RTH closes] + [today's RTH closes],
    returning today's slice. Equivalent to pandas
    `ewm(span=period, adjust=False)` — recursive from the first value —
    which is how render_full_sessions seeds the chart EMA. With no prior
    day the EMA simply warms up from today's open.
    """
    combined = list(prior_closes) + list(today_closes)
    if not combined:
        return []
    alpha = 2.0 / (period + 1)
    e = combined[0]
    out: list[float] = []
    for i, c in enumerate(combined):
        e = c if i == 0 else c * alpha + e * (1 - alpha)
        out.append(e)
    return out[len(prior_closes):]


# ----- pure: trade sizing + the minimum-risk filter -------------------


def size_trade(sig: EmaTouchSignal, variant: Variant) -> dict | None:
    """Entry/stop/target/risk for a signal under a variant. None if the
    geometry is degenerate (non-positive risk)."""
    long = sig.direction == "long"
    if variant.stop == "atr":
        offset = variant.atr_stop_mult * sig.atr_at_touch
    else:
        offset = TICK
    stop = (sig.touch_extreme - offset) if long else (sig.touch_extreme + offset)
    entry = sig.entry_price
    risk = (entry - stop) if long else (stop - entry)
    if risk <= 0:
        return None

    if variant.target == "mm":
        target = entry + sig.trend_height if long else entry - sig.trend_height
    else:
        dist = variant.r_multiple * risk
        target = entry + dist if long else entry - dist

    return {
        "entry": round(entry, 4),
        "stop": round(stop, 4),
        "target": round(target, 4),
        "risk": round(risk, 4),
    }


def passes_min_risk(entry: float, risk: float,
                    min_ticks: int = MIN_RISK_TICKS,
                    min_bps: float = MIN_RISK_BPS) -> bool:
    """A setup is tradable only if its risk is wide enough that slippage
    and commission do not swamp the R. Drops the 'two-tick trade'."""
    if risk < min_ticks * TICK:
        return False
    if risk < (min_bps / 1e4) * entry:
        return False
    return True


# ----- pure: the no-look-ahead fill simulation ------------------------


def simulate(direction: str, entry_close_t: int, entry_price: float,
             stop: float, target: float, bars_1m: list[dict],
             cost_mult: float = 1.0) -> dict | None:
    """Walk 1-min bars strictly AT/AFTER the touch bar's 5-min close.
    First of {stop, target} hit wins; a straddle is scored stopped;
    unresolved trades exit at the last bar's close (time stop).
    """
    long = direction == "long"
    risk = (entry_price - stop) if long else (stop - entry_price)
    if risk <= 0:
        return None

    es = ENTRY_SLIPPAGE_BPS * cost_mult / 1e4
    ss = STOP_SLIPPAGE_BPS * cost_mult / 1e4
    entry_fill = entry_price * (1 + es) if long else entry_price * (1 - es)

    path = sorted((b for b in bars_1m if int(b["t"]) >= entry_close_t),
                  key=lambda b: int(b["t"]))
    if not path:
        return None

    exit_price = None
    exit_reason = None
    bars_held = 0
    for b in path:
        bars_held += 1
        hi, lo = float(b["h"]), float(b["l"])
        if long:
            hit_stop, hit_tgt = lo <= stop, hi >= target
        else:
            hit_stop, hit_tgt = hi >= stop, lo <= target
        if hit_stop and hit_tgt:
            exit_price = stop * (1 - ss) if long else stop * (1 + ss)
            exit_reason = "stop_straddle"
            break
        if hit_stop:
            exit_price = stop * (1 - ss) if long else stop * (1 + ss)
            exit_reason = "stop"
            break
        if hit_tgt:
            exit_price = target            # resting limit — clean fill
            exit_reason = "target"
            break
    if exit_price is None:
        last_close = float(path[-1]["c"])
        exit_price = last_close * (1 - es) if long else last_close * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if long else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE * cost_mult) / risk
    net_r = gross / risk - commission_r
    return {
        "exit_reason": exit_reason,
        "net_r": round(net_r, 4),
        "risk_per_share": round(risk, 4),
        "bars_held": bars_held,
    }


# ----- stats ----------------------------------------------------------


def _bootstrap_ci(values: np.ndarray, n: int = 5000) -> list[float]:
    if len(values) < 2:
        return [float("nan"), float("nan")]
    rng = np.random.default_rng(RANDOM_STATE)
    means = [rng.choice(values, size=len(values), replace=True).mean()
             for _ in range(n)]
    return [round(float(np.percentile(means, 2.5)), 4),
            round(float(np.percentile(means, 97.5)), 4)]


def summarize(trades: list[dict], label: str) -> dict:
    if not trades:
        return {"label": label, "n": 0}
    r = np.array([t["net_r"] for t in trades], dtype=float)
    reasons = [t["exit_reason"] for t in trades]
    wins, losses = r[r > 0], r[r <= 0]
    equity = np.cumsum(r)
    dd = equity - np.maximum.accumulate(equity)
    return {
        "label": label,
        "n": len(trades),
        "target_hit_rate": round(sum(x == "target" for x in reasons) / len(trades), 4),
        "expectancy_r": round(float(r.mean()), 4),
        "expectancy_ci95": _bootstrap_ci(r),
        "win_rate": round(float((r > 0).mean()), 4),
        "avg_win_r": round(float(wins.mean()), 4) if len(wins) else 0.0,
        "avg_loss_r": round(float(losses.mean()), 4) if len(losses) else 0.0,
        "profit_factor": round(float(wins.sum() / -losses.sum()), 3)
            if len(losses) and losses.sum() < 0 else None,
        "total_r": round(float(r.sum()), 2),
        "max_drawdown_r": round(float(dd.min()), 2),
    }


def summarize_daily(trades: list[dict], label: str) -> dict:
    """Cluster-robust: collapse each session date to its mean net_r,
    then measure expectancy + CI over those daily means. Same-day
    correlated trades (SPY + QQQ + sector ETFs) count once."""
    if not trades:
        return {"label": label, "n_days": 0}
    by_day: dict[str, list[float]] = {}
    for t in trades:
        by_day.setdefault(t["date"], []).append(t["net_r"])
    day_means = np.array([float(np.mean(v)) for v in by_day.values()])
    return {
        "label": label,
        "n_days": len(day_means),
        "expectancy_r": round(float(day_means.mean()), 4),
        "expectancy_ci95": _bootstrap_ci(day_means),
        "positive_day_rate": round(float((day_means > 0).mean()), 4),
    }


# ----- driver ---------------------------------------------------------


def _trading_days(start: date_t, end: date_t):
    d = start
    while d <= end:
        if d.weekday() < 5:        # Mon-Fri; non-trading days yield no data
            yield d
        d += timedelta(days=1)


def run(tickers: list[str], start: date_t, end: date_t) -> dict:
    """Backtest every variant over the universe and date range."""
    trades: dict[str, list[dict]] = {v.name: [] for v in VARIANTS}
    filtered = {v.name: 0 for v in VARIANTS}
    sessions_seen = 0

    for ticker in tickers:
        is_etf = ticker in ETF_SET
        for day in _trading_days(start, end):
            sess = load_session(ticker, day)
            if sess is None:
                continue
            sessions_seen += 1
            today_closes = [b.c for b in sess.bars_5m]
            ema_cache: dict[int, list[float]] = {}
            for variant in VARIANTS:
                if variant.ema_len not in ema_cache:
                    ema_cache[variant.ema_len] = seeded_ema(
                        sess.prior_5m_closes, today_closes, variant.ema_len)
                ema = ema_cache[variant.ema_len]
                sig = detect_ema_touch(
                    sess.bars_5m, ema, EmaTouchConfig(ema_len=variant.ema_len))
                if sig is None:
                    continue
                geo = size_trade(sig, variant)
                if geo is None:
                    continue
                if not passes_min_risk(geo["entry"], geo["risk"]):
                    filtered[variant.name] += 1
                    continue
                sim = simulate(sig.direction, sig.touch_ts + BAR_5M,
                               geo["entry"], geo["stop"], geo["target"],
                               sess.bars_1m)
                if sim is None:
                    continue
                trades[variant.name].append({
                    "ticker": ticker, "date": day.isoformat(),
                    "is_etf": is_etf, "direction": sig.direction,
                    "exit_reason": sim["exit_reason"], "net_r": sim["net_r"],
                    "risk_per_share": sim["risk_per_share"],
                })

    report: dict = {
        "config": {
            "entry": "close of the first-EMA-touch bar",
            "stop": "1 tick beyond the touch extreme (ATR variant: atr_mult beyond)",
            "target": "R-multiple of risk, or measured move",
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            "min_risk_ticks": MIN_RISK_TICKS,
            "min_risk_bps": MIN_RISK_BPS,
            "universe": tickers,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "sessions_loaded": sessions_seen,
        "variants": {},
    }
    all_trades: list[dict] = []
    for variant in VARIANTS:
        vt = trades[variant.name]
        all_trades += vt
        stocks_only = [t for t in vt if not t["is_etf"]]
        report["variants"][variant.name] = {
            "filtered_untradable": filtered[variant.name],
            "all": summarize(vt, f"{variant.name} (all)"),
            "stocks_only": summarize(stocks_only, f"{variant.name} (stocks only)"),
            "by_day": summarize_daily(vt, f"{variant.name} (by-day clustered)"),
        }
    report["pooled"] = summarize(all_trades, "all variants pooled")
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--start", required=True, help="YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD")
    ap.add_argument("--tickers", nargs="+", default=None,
                    help="Override the default universe")
    ap.add_argument("--out", default=None, help="Report path")
    args = ap.parse_args()

    start = date_t.fromisoformat(args.start)
    end = date_t.fromisoformat(args.end)
    tickers = args.tickers or UNIVERSE

    print(f"Backtesting {len(tickers)} tickers, {start} -> {end} ...")
    report = run(tickers, start, end)
    print(f"  {report['sessions_loaded']} sessions loaded")
    if report["sessions_loaded"] == 0:
        print("ERROR: no sessions loaded — is the R2 bar cache reachable? "
              "(R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / "
              "R2_BARS_BUCKET)", file=sys.stderr)
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out) if args.out else OUT_DIR / "ema_touch_report.json"
    out_path.write_text(json.dumps(report, indent=2) + "\n")

    print("\n=== FIRST-EMA-TOUCH BACKTEST ===")
    for name, v in report["variants"].items():
        a, d = v["all"], v["by_day"]
        if a["n"] == 0:
            print(f"  {name:14s} n=0  (filtered {v['filtered_untradable']})")
            continue
        print(f"  {name:14s} n={a['n']:4d}  win={a['win_rate']:.3f}  "
              f"exp={a['expectancy_r']:+.3f}R  CI{a['expectancy_ci95']}  "
              f"pf={a['profit_factor']}  | by-day exp={d['expectancy_r']:+.3f}R "
              f"CI{d['expectancy_ci95']}  (filtered {v['filtered_untradable']})")
    print(f"\nReport: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
