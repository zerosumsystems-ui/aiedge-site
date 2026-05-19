#!/usr/bin/env python3
"""Backtest of the Brooks opening-spike setup, traded by SCALING IN
behind a single WIDE protective stop — faithful to Al Brooks' primary
sources.

The detector (scripts/ml/spike_detector.py) is unchanged: a spike is
N>=3 consecutive same-direction strong trend bars; one signal per spike,
emitted at the 3rd bar; entry = that bar's close; measured-move target =
the spike's height (Brooks, Trading Price Action: Trends, ch. 43).

What changed here is the TRADE MANAGEMENT, not the detection.

----------------------------------------------------------------------
Scaling in — faithful to the primary source
----------------------------------------------------------------------
Al Brooks, *Trading Price Action: Trends* and *Trading Price Action:
Trading Ranges* (Wiley, 2012), describes scaling into a position. The
mechanics encoded below follow his method (paraphrased — not verbatim):

  1. Scale in lower / higher. For a long, Brooks "scales in lower": he
     takes part of the position at the signal, then ADDS at better
     prices if the market pulls back. A short "scales in higher". The
     adds are averaging into the structure, betting the trend resumes.

  2. One wide protective stop on the WHOLE position. A trader who scales
     in does not use the tight one-tick signal-bar stop — he uses a stop
     "wide enough to let the trade work", placed beyond the structure
     (here: a fraction of the spike's height beyond the spike's start).
     Every tranche shares that one stop.

  3. One shared profit target. The entire scaled-in position is exited
     at a single price — Brooks' measured move (the spike's height),
     measured from the original signal-bar entry.

  4. Trail the protective stop to breakeven once the trade works. Brooks
     does not just sit behind the wide stop — once a scaled-in trade has
     moved his way he moves the whole position's protective stop up to
     the average entry, so a trade that pulled back, filled his adds,
     then recovered is scratched flat instead of risking the full wide
     stop. BREAKEVEN_ARM_FRAC controls how far the trade must travel in
     his favour before that breakeven stop arms.

  5. Adds spaced through the pullback. Brooks teaches a pullback usually
     has two legs; a trader scaling in adds across them. N_TRANCHES = 4
     here = the signal-bar entry plus three pullback adds spaced every
     SCALE_STEP_FRAC of the spike height.

This is deliberately "no bias": longs and shorts use identical, mirrored
rules — nothing tilts the engine toward one direction.

----------------------------------------------------------------------
R accounting
----------------------------------------------------------------------
The unit of risk R is the FIRST tranche's risk to the wide stop:

    R = |signal-bar entry - wide stop|

Each tranche is one unit of size. With m tranches filled, a profit/loss
is the summed per-tranche P&L divided by R. A single-tranche stop-out is
-1R (before costs); a fully scaled-in stop-out is a larger loss (the
later tranches filled closer to the stop, so each loses < 1R); a fully
scaled-in winner is a larger gain (a much better average price). That
asymmetry is the whole point of the test.

----------------------------------------------------------------------
Data
----------------------------------------------------------------------
Uses the historical 5-minute RTH sessions already downloaded under
public/analogs/<DATE>_<SYMBOL>/session.json — no new data fetch. Fills
are simulated bar-by-bar on those 5-minute bars; when one bar straddles
both the stop and the target the trade is scored stopped (conservative),
and a bar that hits the stop is assumed to fill every still-pending add
first (also conservative).

Costs: per-share commission + entry/stop slippage in bps (same model as
backtest_tfo.py). Resting limit orders (the pullback adds and the target)
get clean fills; the signal-bar entry and any time-stop exit pay entry
slippage; a stop exit pays stop slippage.

Usage:
    python3 scripts/ml/backtest_spike.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

# tfo_detector lives in scripts/live/ — add it to the path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from tfo_detector import Bar5m  # noqa: E402
from spike_detector import detect_spikes, TICK  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ANALOGS_DIR = ROOT / "public" / "analogs"
OUT_DIR = ROOT / "artifacts" / "backtest"

# ----- pre-registered execution config (matches backtest_tfo.py) ------
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0
RANDOM_STATE = 17
BROOKS_CLAIM = 0.60          # the hit-rate Brooks asserts for the move

# ----- scaling-in config (Brooks: scale in, one wide stop) ------------
N_TRANCHES = 4               # signal-bar entry + three pullback adds,
                             # spaced through the (typically two-legged)
                             # pullback Brooks scales into
SCALE_STEP_FRAC = 0.30       # spacing between tranches, as a fraction of
                             # the spike height: add k fills at
                             # entry -/+ k * SCALE_STEP_FRAC * height
STOP_WIDEN_FRAC = 1.30       # the wide stop sits this fraction of the
                             # spike height BEYOND the spike's start
                             # extreme — "wide enough to let it work"
BREAKEVEN_ARM_FRAC = 0.25    # Brooks also trails the protective stop to
                             # breakeven once the trade works: once the
                             # position's favourable excursion clears the
                             # average entry by this fraction of the
                             # spike height, the wide stop is replaced by
                             # a stop at the average entry. Set to None to
                             # disable and run the plain wide stop only.

# corpus session.json prices come in two scales: older sessions store
# integers scaled by 1e9, newer ones store raw dollars. Detect per
# session — anything above this threshold is the scaled encoding.
SCALED_PRICE_THRESHOLD = 1e6
MIN_SESSION_BARS = 20


# ===== data loading ===================================================

def _epoch(date_str: str, hhmm: str) -> int:
    """Wall-clock 'HH:MM' on a session date -> epoch seconds. The chart
    only needs monotonically increasing times; treating the RTH clock as
    UTC keeps bars ordered and labelled by their session minute."""
    y, m, d = (int(x) for x in date_str.split("-"))
    hh, mm = (int(x) for x in hhmm.split(":"))
    return int(datetime(y, m, d, hh, mm, tzinfo=timezone.utc).timestamp())


def load_sessions() -> list[tuple[str, str, list[Bar5m]]]:
    """Read every downloaded 5-minute RTH session under public/analogs/.
    Returns (symbol, session_date, bars) tuples, chronological bars."""
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
            continue  # a zero in the first bar marks a corrupt session
        date_str, _, symbol = d.name.rpartition("_")
        if not symbol or not date_str:
            continue
        scale = 1e9 if c[0] > SCALED_PRICE_THRESHOLD else 1.0
        times = s.get("times") or []
        bars: list[Bar5m] = []
        for i in range(len(c)):
            t = _epoch(date_str, times[i]) if i < len(times) else i * 300
            bars.append(Bar5m(
                t=t,
                o=o[i] / scale, h=h[i] / scale,
                l=l[i] / scale, c=c[i] / scale,
            ))
        if any(b.h <= 0 or b.l <= 0 for b in bars):
            continue
        out.append((symbol, date_str, bars))
    return out


# ===== trade simulation ===============================================

def _slippage(cost_mult: float) -> tuple[float, float]:
    return (ENTRY_SLIPPAGE_BPS * cost_mult / 1e4,
            STOP_SLIPPAGE_BPS * cost_mult / 1e4)


def simulate_baseline(sig, bars5: list[Bar5m], cost_mult: float = 1.0) -> dict | None:
    """The original single-entry trade: one unit at the signal-bar
    close, the tight one-tick stop, the measured-move target. Kept only
    as the honest comparison for the scaled-in result."""
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


def scale_in_levels(sig) -> tuple[float, list[float]]:
    """Brooks scaling-in geometry for one spike signal.

    Returns (wide_stop, tranche_prices). tranche_prices[0] is the
    signal-bar entry; the rest are resting limit adds at progressively
    better prices on the pullback. An add that would sit at/through the
    wide stop is dropped — you cannot scale in past your own stop."""
    direction = sig.direction
    h = sig.spike_height
    entry = sig.entry_price
    # the detector parked the tight stop one tick beyond the spike start.
    if direction == "long":
        spike_extreme = sig.stop_price + TICK          # the spike's low
        wide_stop = spike_extreme - STOP_WIDEN_FRAC * h
    else:
        spike_extreme = sig.stop_price - TICK          # the spike's high
        wide_stop = spike_extreme + STOP_WIDEN_FRAC * h

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


def simulate_scaled(sig, bars5: list[Bar5m], cost_mult: float = 1.0) -> dict | None:
    """Scale into the spike behind a single wide stop, trail that stop to
    breakeven once the trade works, and exit the whole position at the
    measured move (Brooks). Walks the session's 5-minute bars from the
    bar after the signal bar."""
    direction = sig.direction
    target = sig.target_price
    height = sig.spike_height
    wide_stop, tranches = scale_in_levels(sig)
    entry = tranches[0]
    risk1 = (entry - wide_stop) if direction == "long" else (wide_stop - entry)
    if risk1 <= 0:
        return None

    es, ss = _slippage(cost_mult)
    # tranche 0: a market fill at the signal-bar close -> entry slippage.
    filled = [entry * (1 + es) if direction == "long" else entry * (1 - es)]
    pending = list(tranches[1:])     # resting limit adds -> clean fills

    path = bars5[sig.entry_index + 1:]
    if not path:
        return None

    be_armed = False
    exit_price = exit_reason = None
    for b in path:
        avg = sum(filled) / len(filled)
        # once breakeven is armed the protective stop trails to the
        # average entry; until then it is the wide structural stop.
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
                # conservative: a bar reaching the wide stop is assumed
                # to have filled every still-pending add on the way.
                filled.extend(pending)
                pending = []
                exit_price = wide_stop * (1 - ss) if direction == "long" else wide_stop * (1 + ss)
                exit_reason = "stop_straddle" if hit_tgt else "stop"
            break
        if hit_tgt:
            # conservative: no new add is credited on the exit bar.
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
        # arm breakeven from this bar's favourable extreme — conservative:
        # a bar cannot both arm the breakeven stop and trigger it.
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
        "wide_stop": wide_stop,
        "scale_in_prices": tranches,
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

    trades: list[dict] = []          # scaled-in trades (the headline)
    baseline: list[dict] = []        # original single-entry, for contrast
    examples: list[dict] = []        # full detail for the /spikes gallery
    n_spikes = 0
    for symbol, session_date, bars5 in sessions:
        for sig in detect_spikes(bars5):
            n_spikes += 1
            scaled = simulate_scaled(sig, bars5)
            base = simulate_baseline(sig, bars5)
            if scaled is None:
                continue
            row = dict(scaled)
            row.update({
                "symbol": symbol,
                "session_date": session_date,
                "direction": sig.direction,
                "is_opening": sig.is_opening,
                "spike_bar_count": sig.spike_bar_count,
            })
            trades.append(row)
            if base is not None:
                baseline.append({**base, "is_opening": sig.is_opening})
            if sig.is_opening:
                spike_ts = [bars5[i].t for i in range(
                    sig.spike_start_index, sig.spike_start_index + sig.spike_bar_count)]
                examples.append({
                    "symbol": symbol,
                    "session_date": session_date,
                    "direction": sig.direction,
                    "bars": [{"t": b.t, "o": b.o, "h": b.h, "l": b.l, "c": b.c}
                             for b in bars5],
                    "spike_bar_ts": spike_ts,
                    "entry_ts": sig.entry_ts,
                    "entry_price": sig.entry_price,
                    "stop_price": scaled["wide_stop"],
                    "target_price": sig.target_price,
                    "scale_in_prices": scaled["scale_in_prices"],
                    "tranches_filled": scaled["tranches_filled"],
                    "spike_bar_count": sig.spike_bar_count,
                    "exit_reason": scaled["exit_reason"],
                    "net_r": scaled["net_r"],
                })
    print(f"  {n_spikes} spikes detected, {len(trades)} simulated")

    opening = [t for t in trades if t["is_opening"]]
    intraday = [t for t in trades if not t["is_opening"]]
    longs = [t for t in trades if t["direction"] == "long"]
    shorts = [t for t in trades if t["direction"] == "short"]
    base_open = [t for t in baseline if t["is_opening"]]

    report = {
        "config": {
            "data": "public/analogs/*/session.json (5-minute RTH)",
            "entry": "close of 3rd spike bar (signal-bar entry)",
            "scale_in": f"{N_TRANCHES - 1} pullback adds, "
                        f"step {SCALE_STEP_FRAC} x spike height",
            "stop": f"single wide stop, {STOP_WIDEN_FRAC} x spike height "
                    f"beyond the spike start",
            "target": "measured move = spike height (whole position)",
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            "brooks_claimed_target_hit_rate": BROOKS_CLAIM,
        },
        "scaling": {
            "n_tranches": N_TRANCHES,
            "scale_step_frac": SCALE_STEP_FRAC,
            "stop_widen_frac": STOP_WIDEN_FRAC,
        },
        "baseline_all_spikes": summarize(baseline, "baseline (single entry, tight stop)"),
        "baseline_opening": summarize(base_open, "baseline opening spikes"),
        "all_spikes": summarize(trades, "scaled-in spikes"),
        "opening_spikes": summarize(opening, "scaled-in opening spikes (Brooks TFO zone)"),
        "intraday_spikes": summarize(intraday, "scaled-in intraday spikes"),
        "longs": summarize(longs, "scaled-in long spikes"),
        "shorts": summarize(shorts, "scaled-in short spikes"),
    }

    by_month: dict[str, list[dict]] = {}
    for t in opening:
        by_month.setdefault(t["session_date"][:7], []).append(t)
    report["opening_by_month"] = [summarize(by_month[m], m) for m in sorted(by_month)]

    dist: dict[int, int] = {}
    for t in trades:
        dist[t["tranches_filled"]] = dist.get(t["tranches_filled"], 0) + 1
    report["tranche_fill_distribution"] = {str(k): dist[k] for k in sorted(dist)}

    # cost sensitivity — re-simulate the scaled trades at 0.5x / 1x / 2x.
    report["cost_sensitivity"] = []
    for mult in (0.5, 1.0, 2.0):
        rs: list[dict] = []
        for symbol, session_date, bars5 in sessions:
            for sig in detect_spikes(bars5):
                s = simulate_scaled(sig, bars5, cost_mult=mult)
                if s is not None:
                    rs.append(s)
        s = summarize(rs, f"cost x{mult}")
        report["cost_sensitivity"].append({
            "cost_mult": mult,
            "expectancy_r": s["expectancy_r"],
            "total_r": s["total_r"],
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUT_DIR / "spike_backtest_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")

    # --- curated examples for the /spikes page -----------------------
    # An even, honest spread — target-hits, breakeven scratches and
    # stop-hits, longs and shorts — not cherry-picked.
    def _outcome(e: dict) -> str:
        r = e["exit_reason"]
        if r.startswith("stop"):
            return "stop"
        if r.startswith("breakeven"):
            return "breakeven"
        return r  # "target" or "time"

    def _pick(direction, outcome, k):
        return [e for e in examples
                if e["direction"] == direction and _outcome(e) == outcome][:k]

    curated = []
    for direction in ("long", "short"):
        curated += _pick(direction, "target", 3)
        curated += _pick(direction, "breakeven", 2)
        curated += _pick(direction, "stop", 2)
        curated += _pick(direction, "time", 1)
    seen = set()
    deduped = []
    for e in curated:
        key = (e["symbol"], e["session_date"], e["direction"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)

    examples_dir = ROOT / "public" / "spikes"
    examples_dir.mkdir(parents=True, exist_ok=True)
    examples_path = examples_dir / "examples.json"
    examples_path.write_text(json.dumps({
        "generated_from": "scripts/ml/backtest_spike.py",
        "sessions_tested": len(sessions),
        "verdict": report["all_spikes"],
        "opening_verdict": report["opening_spikes"],
        "examples": deduped,
    }, indent=2) + "\n")
    print(f"  wrote {len(deduped)} curated examples -> {examples_path.relative_to(ROOT)}")

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

    print("\n=== BROOKS SPIKE BACKTEST — scaling in behind a wide stop ===")
    line(report["baseline_all_spikes"])
    line(report["baseline_opening"])
    line(report["all_spikes"])
    line(report["opening_spikes"])
    line(report["intraday_spikes"])
    line(report["longs"])
    line(report["shorts"])
    print(f"  tranche-fill distribution: {report['tranche_fill_distribution']}")
    print(f"\nReport: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
