#!/usr/bin/env python3
"""Backtest of the Brooks trading-range breakout, traded by SCALING IN
behind a single WIDE protective stop.

This applies the Brooks scaling-in trade management proven out on the
spike setup (scripts/ml/backtest_spike.py) to the trading-range
breakout. The detector (scripts/ml/trading_range_detector.py) is
unchanged; the simulate logic is a deliberate per-setup copy so each
backtest stays self-contained and independently tunable.

----------------------------------------------------------------------
Scaling in — faithful to the primary source
----------------------------------------------------------------------
Al Brooks, *Trading Price Action: Trends* / *Trading Ranges* (Wiley,
2012), describes scaling into a position:

  1. Scale in lower / higher. Take the signal-bar entry, then ADD at
     better prices as the market pulls back.
  2. One wide protective stop on the WHOLE position, placed beyond the
     structure — "wide enough to let the trade work".
  3. Trail that stop to breakeven once the trade works.
  4. Exit the whole position at one shared target — the measured move.

For the trading-range breakout the measured move equals the range
height; the wide stop is widened beyond the far side of the range.
Long and short breakouts use identical mirrored rules — no bias.

R is the first tranche's risk to the wide stop. Costs: per-share
commission + entry/stop slippage in bps. Fills are simulated on the
downloaded 5-minute RTH bars; a bar straddling stop and target is
scored stopped, and a bar reaching the wide stop is assumed to fill
every pending add first (both conservative).

Usage:
    python3 scripts/ml/backtest_trading_range.py
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from tfo_detector import Bar5m  # noqa: E402
from trading_range_detector import detect_trading_range_breakouts  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ANALOGS_DIR = ROOT / "public" / "analogs"
OUT_DIR = ROOT / "artifacts" / "backtest"

# ----- pre-registered execution config (matches backtest_spike.py) ----
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0
RANDOM_STATE = 17

# ----- scaling-in config (Brooks: scale in, one wide stop) ------------
N_TRANCHES = 4               # signal-bar entry + three pullback adds
SCALE_STEP_FRAC = 0.30       # tranche spacing, as a fraction of the
                             # impulse-leg height
STOP_WIDEN_FRAC = 1.30       # the wide stop sits this fraction of the
                             # impulse height beyond the structural stop
BREAKEVEN_ARM_FRAC = 0.25    # once favourable excursion clears the
                             # average entry by this fraction of the
                             # impulse height, the protective stop trails
                             # to the average entry (set None to disable)

# corpus session.json prices come in two scales (old 1e9-scaled ints,
# new raw dollars) — detect per session.
SCALED_PRICE_THRESHOLD = 1e6
MIN_SESSION_BARS = 20


@dataclass(frozen=True)
class TradeSetup:
    """A normalised tradeable signal — whatever the detector, the
    scaling-in engine only needs these fields."""
    direction: str
    entry_index: int
    entry_ts: int
    entry_price: float
    stop_price: float        # tight structural stop
    target_price: float
    height: float            # measured-move / scaling unit


# ===== data loading ===================================================

def _epoch(date_str: str, hhmm: str) -> int:
    y, m, d = (int(x) for x in date_str.split("-"))
    hh, mm = (int(x) for x in hhmm.split(":"))
    return int(datetime(y, m, d, hh, mm, tzinfo=timezone.utc).timestamp())


def load_sessions() -> list[tuple[str, str, list[Bar5m]]]:
    """Read every downloaded 5-minute RTH session under public/analogs/."""
    out: list[tuple[str, str, list[Bar5m]]] = []
    for d in sorted(p for p in ANALOGS_DIR.iterdir() if p.is_dir()):
        sess = d / "session.json"
        if not sess.exists():
            continue
        try:
            s = json.loads(sess.read_text())
        except Exception:
            continue
        o, h, l, c = s.get("open"), s.get("high"), s.get("low"), s.get("close")
        if not c or len(c) < MIN_SESSION_BARS:
            continue
        if not all(x and x > 0 for x in (o[0], h[0], l[0], c[0])):
            continue
        date_str, _, symbol = d.name.rpartition("_")
        if not symbol or not date_str:
            continue
        scale = 1e9 if c[0] > SCALED_PRICE_THRESHOLD else 1.0
        times = s.get("times") or []
        bars: list[Bar5m] = []
        for i in range(len(c)):
            t = _epoch(date_str, times[i]) if i < len(times) else i * 300
            bars.append(Bar5m(t=t, o=o[i] / scale, h=h[i] / scale,
                               l=l[i] / scale, c=c[i] / scale))
        if any(b.h <= 0 or b.l <= 0 for b in bars):
            continue
        out.append((symbol, date_str, bars))
    return out


def setups_for_session(bars5: list[Bar5m]) -> list[TradeSetup]:
    """Turn this session's trading-range breakout signals into normalised
    TradeSetups. The detector already supplies the breakout entry, the
    structural stop, the measured-move target and the range height."""
    out: list[TradeSetup] = []
    for sig in detect_trading_range_breakouts(bars5, "5m"):
        out.append(TradeSetup(
            direction=sig.direction,
            entry_index=sig.fire_index,
            entry_ts=sig.fire_ts,
            entry_price=sig.entry_price,
            stop_price=sig.stop_price,
            target_price=sig.target_price,
            height=sig.move_height,
        ))
    return out


# ===== trade simulation (per-setup copy of the spike engine) ==========

def _slippage(cost_mult: float) -> tuple[float, float]:
    return (ENTRY_SLIPPAGE_BPS * cost_mult / 1e4,
            STOP_SLIPPAGE_BPS * cost_mult / 1e4)


def simulate_baseline(sig: TradeSetup, bars5: list[Bar5m],
                      cost_mult: float = 1.0) -> dict | None:
    """The original single-entry trade on the tight structural stop —
    kept only as the honest comparison for the scaled-in result."""
    direction = sig.direction
    entry, stop, target = sig.entry_price, sig.stop_price, sig.target_price
    risk = (entry - stop) if direction == "long" else (stop - entry)
    if risk <= 0:
        return None
    es, ss = _slippage(cost_mult)
    entry_fill = entry * (1 + es) if direction == "long" else entry * (1 - es)
    path = bars5[sig.entry_index + 1:]
    if not path:
        return None

    exit_price = exit_reason = None
    for b in path:
        if direction == "long":
            hit_stop, hit_tgt = b.l <= stop, b.h >= target
        else:
            hit_stop, hit_tgt = b.h >= stop, b.l <= target
        if hit_stop:
            exit_price = stop * (1 - ss) if direction == "long" else stop * (1 + ss)
            exit_reason = "stop_straddle" if hit_tgt else "stop"
            break
        if hit_tgt:
            exit_price, exit_reason = target, "target"
            break
    if exit_price is None:
        last = path[-1].c
        exit_price = last * (1 - es) if direction == "long" else last * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if direction == "long" else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE * cost_mult) / risk
    return {"exit_reason": exit_reason, "net_r": round(gross / risk - commission_r, 4)}


def scale_in_levels(sig: TradeSetup) -> tuple[float, list[float]]:
    """The wide stop and the tranche limit prices for one setup."""
    direction = sig.direction
    h = sig.height
    entry = sig.entry_price
    if direction == "long":
        wide_stop = sig.stop_price - STOP_WIDEN_FRAC * h
    else:
        wide_stop = sig.stop_price + STOP_WIDEN_FRAC * h

    tranches = [entry]
    for k in range(1, N_TRANCHES):
        if direction == "long":
            px = entry - k * SCALE_STEP_FRAC * h
            if px <= wide_stop:
                break
        else:
            px = entry + k * SCALE_STEP_FRAC * h
            if px >= wide_stop:
                break
        tranches.append(round(px, 4))
    return round(wide_stop, 4), tranches


def simulate_scaled(sig: TradeSetup, bars5: list[Bar5m],
                    cost_mult: float = 1.0) -> dict | None:
    """Scale into the setup behind a single wide stop, trail that stop to
    breakeven once it works, and exit the whole position at the measured
    move. Walks the 5-minute bars from the bar after the signal bar."""
    direction = sig.direction
    target = sig.target_price
    height = sig.height
    wide_stop, tranches = scale_in_levels(sig)
    entry = tranches[0]
    risk1 = (entry - wide_stop) if direction == "long" else (wide_stop - entry)
    if risk1 <= 0:
        return None

    es, ss = _slippage(cost_mult)
    filled = [entry * (1 + es) if direction == "long" else entry * (1 - es)]
    pending = list(tranches[1:])

    path = bars5[sig.entry_index + 1:]
    if not path:
        return None

    be_armed = False
    exit_price = exit_reason = None
    for b in path:
        avg = sum(filled) / len(filled)
        eff_stop = avg if be_armed else wide_stop
        if direction == "long":
            hit_stop, hit_tgt = b.l <= eff_stop, b.h >= target
        else:
            hit_stop, hit_tgt = b.h >= eff_stop, b.l <= target
        if hit_stop:
            if be_armed:
                exit_price = avg * (1 - ss) if direction == "long" else avg * (1 + ss)
                exit_reason = "breakeven_straddle" if hit_tgt else "breakeven"
            else:
                filled.extend(pending)
                pending = []
                exit_price = wide_stop * (1 - ss) if direction == "long" else wide_stop * (1 + ss)
                exit_reason = "stop_straddle" if hit_tgt else "stop"
            break
        if hit_tgt:
            exit_price, exit_reason = target, "target"
            break
        still: list[float] = []
        for tr in pending:
            reached = (b.l <= tr) if direction == "long" else (b.h >= tr)
            if reached:
                filled.append(tr)
            else:
                still.append(tr)
        pending = still
        if not be_armed and BREAKEVEN_ARM_FRAC is not None:
            avg = sum(filled) / len(filled)
            if direction == "long":
                be_armed = b.h >= avg + BREAKEVEN_ARM_FRAC * height
            else:
                be_armed = b.l <= avg - BREAKEVEN_ARM_FRAC * height
    if exit_price is None:
        last = path[-1].c
        exit_price = last * (1 - es) if direction == "long" else last * (1 + es)
        exit_reason = "time"

    m = len(filled)
    if direction == "long":
        gross = sum(exit_price - f for f in filled)
    else:
        gross = sum(f - exit_price for f in filled)
    commission_r = (2 * m * COMMISSION_PER_SHARE * cost_mult) / risk1
    return {
        "exit_reason": exit_reason,
        "net_r": round(gross / risk1 - commission_r, 4),
        "tranches_filled": m,
    }


# ===== reporting ======================================================

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
    out = {
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
    }
    if any("tranches_filled" in t for t in trades):
        tf = [t["tranches_filled"] for t in trades if "tranches_filled" in t]
        out["avg_tranches_filled"] = round(float(np.mean(tf)), 3)
    return out


def main() -> int:
    sessions = load_sessions()
    if not sessions:
        print(f"ERROR: no downloaded sessions under {ANALOGS_DIR}", file=sys.stderr)
        return 2
    print(f"Loaded {len(sessions)} downloaded 5-minute RTH sessions")

    trades: list[dict] = []
    baseline: list[dict] = []
    n_sig = 0
    for symbol, session_date, bars5 in sessions:
        for sig in setups_for_session(bars5):
            n_sig += 1
            scaled = simulate_scaled(sig, bars5)
            base = simulate_baseline(sig, bars5)
            if scaled is None:
                continue
            trades.append({**scaled, "symbol": symbol,
                           "session_date": session_date,
                           "direction": sig.direction})
            if base is not None:
                baseline.append(base)
    print(f"  {n_sig} trading-range breakout signals detected, {len(trades)} simulated")

    longs = [t for t in trades if t["direction"] == "long"]
    shorts = [t for t in trades if t["direction"] == "short"]

    report = {
        "config": {
            "setup": "trading-range breakout (trading_range_detector)",
            "data": "public/analogs/*/session.json (5-minute RTH)",
            "entry": "stop 1 tick beyond the range",
            "scale_in": f"{N_TRANCHES - 1} pullback adds, "
                        f"step {SCALE_STEP_FRAC} x range height",
            "stop": f"single wide stop, {STOP_WIDEN_FRAC} x range height "
                    f"beyond the far side of the range",
            "breakeven_arm_frac": BREAKEVEN_ARM_FRAC,
            "target": "measured move = the range height",
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
        },
        "baseline_all": summarize(baseline, "baseline (single entry, tight stop)"),
        "all": summarize(trades, "scaled-in range breakout"),
        "longs": summarize(longs, "scaled-in long range breakout"),
        "shorts": summarize(shorts, "scaled-in short range breakout"),
    }

    by_month: dict[str, list[dict]] = {}
    for t in trades:
        by_month.setdefault(t["session_date"][:7], []).append(t)
    report["by_month"] = [summarize(by_month[m], m) for m in sorted(by_month)]

    dist: dict[int, int] = {}
    for t in trades:
        dist[t["tranches_filled"]] = dist.get(t["tranches_filled"], 0) + 1
    report["tranche_fill_distribution"] = {str(k): dist[k] for k in sorted(dist)}

    report["cost_sensitivity"] = []
    for mult in (0.5, 1.0, 2.0):
        rs = [s for symbol, sd, bars5 in sessions
              for sig in setups_for_session(bars5)
              if (s := simulate_scaled(sig, bars5, cost_mult=mult)) is not None]
        s = summarize(rs, f"cost x{mult}")
        report["cost_sensitivity"].append({
            "cost_mult": mult,
            "expectancy_r": s["expectancy_r"],
            "total_r": s["total_r"],
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUT_DIR / "trading_range_scaled_backtest_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")

    def line(s: dict):
        if s["n"] == 0:
            print(f"  {s['label']:42s} n=0")
            return
        extra = (f"  tranches={s['avg_tranches_filled']}"
                 if "avg_tranches_filled" in s else "")
        print(f"  {s['label']:42s} n={s['n']:4d}  "
              f"tgt-hit={s['target_hit_rate']:.3f}  "
              f"exp={s['expectancy_r']:+.3f}R  CI{s['expectancy_ci95']}  "
              f"pf={s['profit_factor']}{extra}")

    print("\n=== TRADING-RANGE BREAKOUT BACKTEST — scaling in behind a wide stop ===")
    line(report["baseline_all"])
    line(report["all"])
    line(report["longs"])
    line(report["shorts"])
    print(f"  tranche-fill distribution: {report['tranche_fill_distribution']}")
    print(f"\nReport: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
