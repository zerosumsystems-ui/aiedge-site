#!/usr/bin/env python3
"""Backtest + scanner for the wedge breakout strategy.

Methodology of record: docs/wedge_backtest_methodology.md. Read that
first. Every parameter below was fixed *before* any result was seen.

Why this backtest is unbiased — the property Will asked for:

  * The detector (scripts/live/wedge_detector.py) emits a signal using
    only bars[:fire_idx + 1]. A historical sweep therefore produces
    exactly the signals a live scanner would have produced bar by bar.
  * Nothing is fit to the data. There is no model, no parameter
    search, no threshold tuned to the equity curve — so there is no
    in-sample / out-of-sample leakage to worry about. The detector's
    `score` is a fixed formula; the backtest only *reports* results by
    score bucket, it never optimises against them.
  * Entry is the bar AFTER the fire bar's open — filling at the
    fire-bar close would be look-ahead.
  * Intrabar fills walk one bar at a time; when a bar straddles both
    stop and target the trade is scored STOPPED (conservative).
  * Every wedge breakout is taken. Losers are not dropped. A random-
    entry benchmark of matched frequency and holding period is
    reported alongside, so a reader can see whether the wedge edge is
    real or just market drift.

Two modes:

    python3 scripts/ml/backtest_wedge.py             # full backtest
    python3 scripts/ml/backtest_wedge.py scan        # today's live wedges
    python3 scripts/ml/backtest_wedge.py --selftest  # simulator unit check

`scan` is the unbiased scanner: it runs the identical detector over the
most recent daily bars and lists the wedges that have just broken out.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

# wedge_detector lives in scripts/live/ — add it to the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from wedge_detector import Bar, WedgeSignal, detect_wedges  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "artifacts" / "backtest"
BARS_CACHE = OUT_DIR / "bars_daily"
DEFAULT_BASE_URL = "https://www.aiedge.trade"

# ----- pre-registered config (fixed before any result was seen) ------

COMMISSION_PER_SHARE = 0.005     # USD, each side
ENTRY_SLIPPAGE_BPS = 2.0         # market entry crosses the spread
STOP_SLIPPAGE_BPS = 4.0          # stops are market orders in motion
TICK = 0.01                      # structural stop offset

TARGET_R_GRID = [1.0, 1.5, 2.0, 3.0]
HORIZON_GRID = {"20d": 20, "40d": 40}   # trading days held before time-stop
PRIMARY_TARGET_R = 2.0
PRIMARY_HORIZON = "20d"

RANDOM_STATE = 17

# A universe of liquid US equities + sector / index ETFs. Tight
# spreads, clean daily bars. Same spirit as the TFO universe. The
# survivorship caveat is documented in the methodology.
UNIVERSE = [
    "SPY", "QQQ", "IWM", "DIA", "XLK", "XLF", "XLE", "XLV", "XLY",
    "XLP", "XLI", "XLU", "XLB", "XLC", "SMH", "AAPL", "MSFT", "NVDA",
    "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO", "NFLX", "JPM",
    "BAC", "WMT", "COST", "HD", "DIS", "INTC", "CSCO", "ORCL", "CRM",
    "PFE", "KO", "PEP", "MCD", "NKE", "BA", "CAT", "GE", "F", "T",
    "VZ", "XOM", "CVX", "UNH",
]

# Default daily-bar window. Wedges are swing-scale, so the backtest
# needs years of daily data.
DEFAULT_FROM = "2021-01-01"
DEFAULT_TO = "2026-05-15"


# ===== bar fetching + caching =========================================

def fetch_daily_bars(
    base_url: str, symbol: str, date_from: str, date_to: str,
) -> list[Bar] | None:
    """Fetch a symbol's daily bars over [date_from, date_to], cached on
    disk. Returns chronological list[Bar] or None on failure."""
    BARS_CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = BARS_CACHE / f"{symbol}_{date_from}_{date_to}.json"
    raw: list[dict] | None = None
    if cache_path.exists():
        try:
            raw = json.loads(cache_path.read_text())
        except Exception:
            raw = None
    if raw is None:
        qs = urllib.parse.urlencode({
            "ticker": symbol, "from": date_from, "to": date_to,
            "tf": "daily", "limit": "2000",
        })
        url = f"{base_url}/api/bars?{qs}"
        last_exc = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    raw = json.loads(r.read()).get("bars") or []
                cache_path.write_text(json.dumps(raw))
                break
            except Exception as e:  # noqa: BLE001
                last_exc = e
                time.sleep(2 ** attempt)
        if raw is None:
            print(f"  [skip] daily {symbol}: {last_exc}", file=sys.stderr)
            return None
    bars = sorted(
        (Bar(t=int(b["t"]), o=float(b["o"]), h=float(b["h"]),
             l=float(b["l"]), c=float(b["c"]), v=float(b.get("v") or 0))
         for b in raw),
        key=lambda b: b.t,
    )
    return bars


# ===== trade simulation (pure function) ===============================

def simulate_wedge_trade(
    bars: list[Bar],
    signal: WedgeSignal,
    target_r: float,
    horizon_bars: int,
    *,
    cost_mult: float = 1.0,
) -> dict | None:
    """Simulate one wedge trade on daily bars. Pure function — no I/O.

    Entry  = open of the bar AFTER the fire bar (the fire-bar close has
             already printed when the signal is known; filling there
             would be look-ahead).
    Stop   = structural — one tick beyond the wedge's most recent
             pivot. A long (falling wedge) is wrong if price falls back
             through the support pivot; a short (rising wedge) is wrong
             above the resistance pivot.
    Target = entry +/- target_r * risk.
    Exit   = first of {stop, target}; a bar straddling both is scored
             STOPPED; otherwise a time-stop closes at the horizon.

    Returns a ledger row, or None if the data cannot support the trade.
    """
    fire_idx = signal.fired_bar_index
    entry_idx = fire_idx + 1
    if entry_idx >= len(bars):
        return None  # breakout is the last bar — no entry bar exists yet

    direction = signal.direction
    ideal_entry = bars[entry_idx].o
    if ideal_entry <= 0:
        return None

    # --- structural stop from the most recent pivot ---
    by_t = {b.t: b for b in bars}
    if direction == "long":
        # falling wedge: stop below the lowest support pivot used.
        pivot_lows = [by_t[t].l for t in signal.pivot_low_ts if t in by_t]
        if not pivot_lows:
            return None
        stop = min(pivot_lows) - TICK
        risk = ideal_entry - stop
    else:
        # rising wedge: stop above the highest resistance pivot used.
        pivot_highs = [by_t[t].h for t in signal.pivot_high_ts if t in by_t]
        if not pivot_highs:
            return None
        stop = max(pivot_highs) + TICK
        risk = stop - ideal_entry
    if risk <= 0:
        return None  # entry already through the stop — not takeable

    target = (ideal_entry + target_r * risk) if direction == "long" \
        else (ideal_entry - target_r * risk)

    es = ENTRY_SLIPPAGE_BPS * cost_mult / 1e4
    ss = STOP_SLIPPAGE_BPS * cost_mult / 1e4
    entry_fill = ideal_entry * (1 + es) if direction == "long" \
        else ideal_entry * (1 - es)

    # --- walk bars forward from the entry bar ---
    path = bars[entry_idx:entry_idx + horizon_bars]
    if not path:
        return None
    exit_price = None
    exit_reason = None
    for b in path:
        if direction == "long":
            hit_stop = b.l <= stop
            hit_tgt = b.h >= target
        else:
            hit_stop = b.h >= stop
            hit_tgt = b.l <= target
        if hit_stop and hit_tgt:
            exit_price = stop * (1 - ss) if direction == "long" \
                else stop * (1 + ss)
            exit_reason = "stop_straddle"
            break
        if hit_stop:
            exit_price = stop * (1 - ss) if direction == "long" \
                else stop * (1 + ss)
            exit_reason = "stop"
            break
        if hit_tgt:
            exit_price = target            # resting limit — clean fill
            exit_reason = "target"
            break
    if exit_price is None:
        last_close = path[-1].c
        exit_price = last_close * (1 - es) if direction == "long" \
            else last_close * (1 + es)
        exit_reason = "time"

    gross_per_share = (exit_price - entry_fill) if direction == "long" \
        else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE * cost_mult) / risk
    net_r = gross_per_share / risk - commission_r

    return {
        "fire_ts": signal.fire_ts,
        "direction": direction,
        "wedge_type": signal.wedge_type,
        "score": round(signal.score, 4),
        "convergence": round(signal.convergence, 4),
        "ideal_entry": round(ideal_entry, 4),
        "entry_fill": round(entry_fill, 4),
        "stop": round(stop, 4),
        "target": round(target, 4),
        "exit_price": round(exit_price, 4),
        "exit_reason": exit_reason,
        "risk_per_share": round(risk, 4),
        "net_r": round(net_r, 4),
    }


# ===== metrics ========================================================

def _bootstrap_ci(values: np.ndarray, n: int = 5000) -> tuple[float, float]:
    if len(values) < 2:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(RANDOM_STATE)
    means = [rng.choice(values, size=len(values), replace=True).mean()
             for _ in range(n)]
    return (float(np.percentile(means, 2.5)),
            float(np.percentile(means, 97.5)))


def summarize(trades: list[dict], label: str) -> dict:
    if not trades:
        return {"label": label, "n": 0}
    r = np.array([t["net_r"] for t in trades], dtype=float)
    wins = r[r > 0]
    losses = r[r <= 0]
    equity = np.cumsum(r)
    drawdown = equity - np.maximum.accumulate(equity)
    lo, hi = _bootstrap_ci(r)
    return {
        "label": label,
        "n": len(trades),
        "expectancy_r": round(float(r.mean()), 4),
        "expectancy_ci95": [round(lo, 4), round(hi, 4)],
        "win_rate": round(float((r > 0).mean()), 4),
        "avg_win_r": round(float(wins.mean()), 4) if len(wins) else 0.0,
        "avg_loss_r": round(float(losses.mean()), 4) if len(losses) else 0.0,
        "profit_factor": round(float(wins.sum() / -losses.sum()), 3)
            if len(losses) and losses.sum() < 0 else None,
        "total_r": round(float(r.sum()), 2),
        "max_drawdown_r": round(float(drawdown.min()), 2),
        "sharpe_like": round(float(r.mean() / r.std()), 3)
            if r.std() > 0 else None,
    }


def random_entry_benchmark(
    bars_by_symbol: dict[str, list[Bar]],
    n_trades: int,
    horizon_bars: int,
) -> dict:
    """Benchmark: `n_trades` long entries at random (symbol, bar), held
    `horizon_bars` then closed at market. Same count and holding period
    as the strategy, so any wedge edge has to beat plain market drift."""
    rng = np.random.default_rng(RANDOM_STATE)
    symbols = [s for s, b in bars_by_symbol.items() if len(b) > horizon_bars + 2]
    if not symbols:
        return {"label": "random-entry benchmark", "n": 0}
    rets: list[dict] = []
    for _ in range(n_trades):
        sym = symbols[rng.integers(len(symbols))]
        b = bars_by_symbol[sym]
        i = int(rng.integers(1, len(b) - horizon_bars - 1))
        entry = b[i].o
        exit_px = b[i + horizon_bars].c
        if entry <= 0:
            continue
        # Normalise to R using a notional 5% stop, so the unit matches.
        risk = entry * 0.05
        rets.append({"net_r": (exit_px - entry) / risk})
    return summarize(rets, "random-entry benchmark")


# ===== modes ==========================================================

def run_backtest(base_url: str, date_from: str, date_to: str) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Fetching daily bars for {len(UNIVERSE)} symbols "
          f"({date_from} -> {date_to})...", flush=True)

    bars_by_symbol: dict[str, list[Bar]] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(fetch_daily_bars, base_url, s, date_from, date_to): s
            for s in UNIVERSE
        }
        for fut in as_completed(futures):
            sym = futures[fut]
            bars = fut.result()
            if bars and len(bars) > 60:
                bars_by_symbol[sym] = bars
    print(f"  loaded {len(bars_by_symbol)}/{len(UNIVERSE)} symbols", flush=True)
    if not bars_by_symbol:
        print("No data — aborting.", file=sys.stderr)
        return 1

    # --- detect every wedge breakout ---
    detections: list[tuple[str, list[Bar], WedgeSignal]] = []
    for sym, bars in sorted(bars_by_symbol.items()):
        for sig in detect_wedges(bars):
            detections.append((sym, bars, sig))
    print(f"  {len(detections)} wedge breakouts detected", flush=True)

    def run_cell(target_r: float, horizon: int, cost_mult: float = 1.0) -> list[dict]:
        out: list[dict] = []
        for sym, bars, sig in detections:
            trade = simulate_wedge_trade(
                bars, sig, target_r, horizon, cost_mult=cost_mult)
            if trade is not None:
                trade["symbol"] = sym
                out.append(trade)
        return out

    # --- grid: every target x horizon ---
    print("Running grid (target R x horizon)...", flush=True)
    grid = []
    for hname, hbars in HORIZON_GRID.items():
        for tr in TARGET_R_GRID:
            cell = run_cell(tr, hbars)
            s = summarize(cell, f"{tr}R / {hname}")
            s["target_r"], s["horizon"] = tr, hname
            grid.append(s)
            print(f"  {tr}R/{hname}: n={s['n']} exp={s.get('expectancy_r')}"
                  f" win={s.get('win_rate')} pf={s.get('profit_factor')}")

    # --- primary config, detailed ---
    horizon = HORIZON_GRID[PRIMARY_HORIZON]
    ledger = run_cell(PRIMARY_TARGET_R, horizon)
    print(f"Primary {PRIMARY_TARGET_R}R/{PRIMARY_HORIZON}: "
          f"{len(ledger)} trades", flush=True)

    # --- cost sensitivity ---
    cost_sens = []
    for cm in (1.0, 2.0, 3.0):
        cell = run_cell(PRIMARY_TARGET_R, horizon, cost_mult=cm)
        s = summarize(cell, f"costs x{cm}")
        s["cost_mult"] = cm
        cost_sens.append(s)

    report: dict = {
        "config": {
            "window": [date_from, date_to],
            "universe_size": len(bars_by_symbol),
            "primary_target_r": PRIMARY_TARGET_R,
            "primary_horizon": PRIMARY_HORIZON,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
        },
        "all_trades": summarize(ledger, "all wedge trades"),
        "grid": grid,
        "cost_sensitivity": cost_sens,
    }

    # --- segmentation: by wedge type, by direction, by score tertile ---
    report["by_wedge_type"] = [
        summarize([t for t in ledger if t["wedge_type"] == wt], wt)
        for wt in ("falling", "rising")
    ]
    if ledger:
        scored = sorted(ledger, key=lambda t: t["score"])
        thirds = []
        for d in range(3):
            chunk = scored[d * len(scored) // 3:(d + 1) * len(scored) // 3]
            thirds.append(summarize(chunk, f"score tertile {d + 1}"))
        report["by_score_tertile"] = thirds

    # --- benchmark: random entry of matched frequency + horizon ---
    report["benchmark_random_entry"] = random_entry_benchmark(
        bars_by_symbol, max(len(ledger), 1), horizon)

    report_path = OUT_DIR / "wedge_backtest_report.json"
    ledger_path = OUT_DIR / "wedge_trade_ledger.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")

    a = report["all_trades"]
    print(f"\n=== PRIMARY ({PRIMARY_TARGET_R}R / {PRIMARY_HORIZON}) ===")
    print(f"  trades: {a['n']}")
    if a["n"]:
        print(f"  expectancy: {a['expectancy_r']:+.3f}R  "
              f"CI95 {a['expectancy_ci95']}")
        print(f"  win rate: {a['win_rate']:.3f}  "
              f"profit factor: {a['profit_factor']}")
        print(f"  total: {a['total_r']:+.1f}R  "
              f"maxDD: {a['max_drawdown_r']:.1f}R")
        bm = report["benchmark_random_entry"]
        print(f"  random-entry benchmark: exp={bm.get('expectancy_r')}R "
              f"(n={bm.get('n')})")
    print(f"\nReport: {report_path}")
    print(f"Ledger: {ledger_path}")
    return 0


def run_scan(base_url: str, lookback_bars: int) -> int:
    """The unbiased scanner: run the identical detector over recent
    daily bars and list wedges that broke out in the last
    `lookback_bars` sessions."""
    today = time.strftime("%Y-%m-%d")
    # ~2 trading years of context so trendlines have room to form.
    date_from = time.strftime(
        "%Y-%m-%d", time.gmtime(time.time() - 2 * 365 * 86400))
    print(f"Scanning {len(UNIVERSE)} symbols for fresh wedge breakouts "
          f"(last {lookback_bars} bars)...", flush=True)

    hits: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(fetch_daily_bars, base_url, s, date_from, today): s
            for s in UNIVERSE
        }
        for fut in as_completed(futures):
            sym = futures[fut]
            bars = fut.result()
            if not bars or len(bars) < 60:
                continue
            cutoff = len(bars) - lookback_bars
            for sig in detect_wedges(bars):
                if sig.fired_bar_index >= cutoff:
                    hits.append({
                        "symbol": sym,
                        "wedge_type": sig.wedge_type,
                        "direction": sig.direction,
                        "fire_ts": sig.fire_ts,
                        "bars_ago": len(bars) - 1 - sig.fired_bar_index,
                        "score": round(sig.score, 3),
                        "convergence": round(sig.convergence, 3),
                    })

    hits.sort(key=lambda h: (-h["score"], h["bars_ago"]))
    print(f"\n{len(hits)} fresh wedge breakout(s):\n")
    for h in hits:
        ts = time.strftime("%Y-%m-%d", time.gmtime(h["fire_ts"]))
        print(f"  {h['symbol']:<6} {h['wedge_type']:<8} "
              f"{h['direction']:<6} fired {ts} ({h['bars_ago']}d ago)  "
              f"score={h['score']:<6} conv={h['convergence']}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "wedge_scan.json"
    out_path.write_text(json.dumps(hits, indent=2) + "\n")
    print(f"\nScan written: {out_path}")
    return 0


def run_selftest() -> int:
    """Verify the trade simulator on synthetic bars — no network."""
    # A long trade that should hit a 2R target. Entry bar opens at 100.
    bars = [Bar(t=i, o=100, h=101, l=99, c=100) for i in range(5)]
    # fire bar = index 3; entry bar = index 4 opens at 100.
    bars[4] = Bar(t=4, o=100.0, h=100.0, l=100.0, c=100.0)
    bars.append(Bar(t=5, o=100, h=100, l=98, c=99))   # pivot-low source
    sig = WedgeSignal(
        direction="long", wedge_type="falling", fire_ts=3,
        fired_bar_index=3, upper_at_fire=100.0, lower_at_fire=98.0,
        pivot_high_ts=(0,), pivot_low_ts=(5,), convergence=0.3, score=8.0,
    )
    # pivot low = bar 5 low = 98 -> stop = 97.99, risk = 100 - 97.99 = 2.01.
    # 2R target = 100 + 4.02 = 104.02.
    bars.append(Bar(t=6, o=100, h=104.5, l=100, c=104))  # hits target
    trade = simulate_wedge_trade(bars, sig, target_r=2.0, horizon_bars=20)
    assert trade is not None, "selftest: trade should simulate"
    assert trade["exit_reason"] == "target", \
        f"selftest: expected target, got {trade['exit_reason']}"
    assert trade["net_r"] > 1.5, f"selftest: expected ~2R, got {trade['net_r']}"

    # A long trade that gets stopped.
    bars2 = list(bars)
    bars2[6] = Bar(t=6, o=100, h=100.5, l=97.0, c=97.5)  # trades through stop
    trade2 = simulate_wedge_trade(bars2, sig, target_r=2.0, horizon_bars=20)
    assert trade2 is not None and trade2["exit_reason"] == "stop", \
        f"selftest: expected stop, got {trade2 and trade2['exit_reason']}"
    assert trade2["net_r"] < 0, f"selftest: stop should lose, got {trade2['net_r']}"

    # Straddle bar -> scored as stop (conservative).
    bars3 = list(bars)
    bars3[6] = Bar(t=6, o=100, h=104.5, l=97.0, c=101)   # hits both
    trade3 = simulate_wedge_trade(bars3, sig, target_r=2.0, horizon_bars=20)
    assert trade3 is not None and trade3["exit_reason"] == "stop_straddle", \
        f"selftest: expected straddle, got {trade3 and trade3['exit_reason']}"

    print("PASS simulator: target / stop / straddle all correct")
    print("all backtest_wedge self-tests passed")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("mode", nargs="?", default="backtest",
                        choices=["backtest", "scan"])
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--from", dest="date_from", default=DEFAULT_FROM)
    parser.add_argument("--to", dest="date_to", default=DEFAULT_TO)
    parser.add_argument("--lookback", type=int, default=5,
                        help="scan mode: how many recent bars count as fresh")
    parser.add_argument("--selftest", action="store_true",
                        help="run the simulator unit check and exit")
    args = parser.parse_args(argv)

    if args.selftest:
        return run_selftest()
    if args.mode == "scan":
        return run_scan(args.base_url, args.lookback)
    return run_backtest(args.base_url, args.date_from, args.date_to)


if __name__ == "__main__":
    raise SystemExit(main())
