#!/usr/bin/env python3
"""Backtest of the Brooks first-pullback setup, with realistic execution.

The first pullback is the High 1 / Low 1 resumption entry that follows
a spike (see first_pullback_detector.py for the verbatim Brooks rules).
Unlike the bare opening-spike setup — which backtested as a null — this
one waits for the first pullback and enters on a stop only if the trend
resumes.

The trade, faithful to the primary source:

  entry  = a stop 1 tick above the signal bar's high (Brooks, ch. 3:
           "buy at one tick above the high of the prior bar"); the
           High 1 bar is the entry bar
  stop   = 1 tick beyond the pullback's extreme (Brooks, ch. 1: stop
           "below the most recent minor pullback")
  target = scored against BOTH targets Brooks names for a High 1 buy
           (ch. 4: "lead to at least a new high and probably a measured
           move up"): a new high (1 tick beyond the spike extreme) and
           the full measured move (spike height from the extreme)

EXECUTION MODEL. The detector finds signals on 5-min bars; this engine
simulates each trade bar-by-bar on 1-MINUTE bars. It is a STOP entry,
so the fill is path-dependent: walking 1-min bars from the High 1 bar's
open, the entry fills the first time price trades through the trigger
(a gap through the trigger fills at the worse 1-min open). Only after
the fill are stop and target armed. When one 1-min bar straddles both
stop and target, the trade is scored STOPPED (conservative). Costs:
per-share commission + entry/stop slippage in bps — the same model as
backtest_spike.py and backtest_tfo.py, so the three verdicts are
directly comparable.

It reuses the 1-minute bar cache under artifacts/backtest/bars_1m/ —
no new data fetch.

Reports: expectancy in R after costs with a bootstrap CI; win rate and
profit factor; segmentation by opening-vs-intraday, direction, month,
pullback length, and whether the signal bar closed with a body.

Usage:
    python3 scripts/backtest_first_pullback.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from tfo_detector import Bar5m
from first_pullback_detector import detect_first_pullbacks

ROOT = Path(__file__).resolve().parents[1]
BARS_CACHE = ROOT / "artifacts" / "backtest" / "bars_1m"
OUT_DIR = ROOT / "artifacts" / "backtest"

# ----- pre-registered execution config (matches backtest_spike.py) ----
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0
BAR_5M = 300
RANDOM_STATE = 17


def aggregate_5m(bars1: list[dict]) -> list[Bar5m]:
    """Roll 1-min bars into 5-min Bar5m buckets."""
    buckets: dict[int, list[dict]] = {}
    for b in bars1:
        key = (int(b["t"]) // BAR_5M) * BAR_5M
        buckets.setdefault(key, []).append(b)
    out: list[Bar5m] = []
    for key in sorted(buckets):
        grp = sorted(buckets[key], key=lambda b: int(b["t"]))
        out.append(Bar5m(
            t=key,
            o=float(grp[0]["o"]),
            h=max(float(b["h"]) for b in grp),
            l=min(float(b["l"]) for b in grp),
            c=float(grp[-1]["c"]),
            v=sum(float(b.get("v") or 0) for b in grp),
        ))
    return out


def simulate(sig, bars1: list[dict], stop: float, target: float,
             cost_mult: float = 1.0) -> dict | None:
    """Walk 1-min bars from the High 1 / Low 1 entry bar forward.

    Phase 1 — fill: the entry is a stop order, so we wait for price to
    trade through the trigger. A 1-min bar that gaps past the trigger
    fills at its (worse) open. Phase 2 — manage: once filled, the first
    of {stop, target} hit wins; a straddle on a single 1-min bar is
    scored stopped. Unfilled-by-session-end -> no trade; filled but
    never exited -> time stop at the last close.

    `stop` and `target` are passed explicitly so the same signal can be
    scored against either Brooks stop (pullback vs spike) and either
    Brooks target (new high vs measured move).
    """
    direction = sig.direction
    trigger = sig.entry_trigger
    risk = (trigger - stop) if direction == "long" else (stop - trigger)
    if risk <= 0:
        return None

    es = ENTRY_SLIPPAGE_BPS * cost_mult / 1e4
    ss = STOP_SLIPPAGE_BPS * cost_mult / 1e4

    path = sorted((b for b in bars1 if int(b["t"]) >= sig.entry_ts),
                  key=lambda b: int(b["t"]))
    if not path:
        return None

    filled = False
    entry_fill = None
    exit_price = None
    exit_reason = None
    for b in path:
        hi, lo, op = float(b["h"]), float(b["l"]), float(b["o"])
        if not filled:
            if direction == "long":
                if hi >= trigger:
                    raw = max(trigger, op)        # gap-through fills worse
                    entry_fill = raw * (1 + es)
                    filled = True
            else:
                if lo <= trigger:
                    raw = min(trigger, op)
                    entry_fill = raw * (1 - es)
                    filled = True
            if not filled:
                continue
            # fall through: this same bar can also hit stop/target
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
            exit_price = target              # resting limit — clean fill
            exit_reason = "target"
            break
    if not filled:
        return None                          # entry never triggered
    if exit_price is None:
        last_close = float(path[-1]["c"])
        exit_price = last_close * (1 - es) if direction == "long" else last_close * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if direction == "long" else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE * cost_mult) / risk
    net_r = gross / risk - commission_r
    return {
        "exit_reason": exit_reason,
        "net_r": round(net_r, 4),
        "risk_per_share": round(risk, 4),
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
    }


def build_segments(trades: list[dict]) -> dict:
    """All segment summaries for one target's trade set."""
    opening = [t for t in trades if t["is_opening"]]
    intraday = [t for t in trades if not t["is_opening"]]
    longs = [t for t in trades if t["direction"] == "long"]
    shorts = [t for t in trades if t["direction"] == "short"]
    with_body = [t for t in trades if t["signal_bar_with_body"]]
    no_body = [t for t in trades if not t["signal_bar_with_body"]]

    seg = {
        "all_first_pullbacks": summarize(trades, "all first pullbacks"),
        "opening_first_pullbacks": summarize(opening, "opening first pullbacks"),
        "intraday_first_pullbacks": summarize(intraday, "intraday first pullbacks"),
        "longs": summarize(longs, "long first pullbacks"),
        "shorts": summarize(shorts, "short first pullbacks"),
        "signal_bar_with_body": summarize(with_body, "signal bar with body"),
        "signal_bar_no_body": summarize(no_body, "signal bar no body"),
    }

    by_len: dict[int, list[dict]] = {}
    for t in trades:
        by_len.setdefault(t["pullback_bar_count"], []).append(t)
    seg["by_pullback_length"] = [
        summarize(by_len[k], f"{k}-bar pullback") for k in sorted(by_len)
    ]

    by_month: dict[str, list[dict]] = {}
    for t in trades:
        by_month.setdefault(t["session_date"][:7], []).append(t)
    seg["by_month"] = [summarize(by_month[m], m) for m in sorted(by_month)]
    months = seg["by_month"]
    seg["months_positive"] = sum(
        1 for m in months if m["n"] and m["expectancy_r"] > 0)
    seg["months_total"] = len(months)

    # --- spike size as a fraction of ADR ------------------------------
    # Brooks scales moves to the average daily range: an opening range
    # under ~30% of ADR is "breakout mode" (room to run); a move that is
    # a large fraction of ADR is climactic / exhausted. Bucket on it.
    def adr_tag(pct: float) -> str:
        for lo, hi, tag in ((0.0, 0.20, "00-20%"), (0.20, 0.35, "20-35%"),
                            (0.35, 0.50, "35-50%"), (0.50, 0.75, "50-75%")):
            if lo <= pct < hi:
                return tag
        return "75%+"

    by_adr: dict[str, list[dict]] = {}
    for t in trades:
        if t.get("spike_pct") is None:
            continue
        by_adr.setdefault(adr_tag(t["spike_pct"]), []).append(t)
    seg["by_spike_adr"] = [
        summarize(by_adr[k], f"spike {k} of ADR")
        for k in ("00-20%", "20-35%", "35-50%", "50-75%", "75%+")
        if k in by_adr
    ]

    # Cohort split at half an ADR — Brooks' measuring-gap band tops out
    # near 1/2 ADR; beyond that the day's range is largely spent.
    room = [t for t in trades
            if t.get("spike_pct") is not None and t["spike_pct"] < 0.50]
    spent = [t for t in trades
             if t.get("spike_pct") is not None and t["spike_pct"] >= 0.50]
    seg["spike_under_half_adr"] = summarize(room, "spike < 50% ADR (room)")
    seg["spike_over_half_adr"] = summarize(spent, "spike >= 50% ADR (spent)")

    # Walk-forward: does the "room" cohort hold in the later half of the
    # sample? Split at the median session date.
    dates = sorted({t["session_date"] for t in trades})
    if dates and room:
        mid = dates[len(dates) // 2]
        seg["room_first_half"] = summarize(
            [t for t in room if t["session_date"] < mid], f"room  < {mid}")
        seg["room_second_half"] = summarize(
            [t for t in room if t["session_date"] >= mid], f"room >= {mid}")
        seg["walk_forward_split_date"] = mid
    return seg


def main() -> int:
    cache_files = sorted(BARS_CACHE.glob("*.json"))
    if not cache_files:
        print(f"ERROR: no cached 1-min bars in {BARS_CACHE}", file=sys.stderr)
        print("Run the TFO backtest's --fetch-only first.", file=sys.stderr)
        return 2
    print(f"Scanning {len(cache_files)} cached sessions for first pullbacks...")

    # Pre-pass: average daily range per symbol (mean session high-low).
    # ADR is a slow-moving scale, so a full-sample estimate carries only
    # negligible look-ahead — noted as a caveat in the report.
    ranges: dict[str, list[float]] = {}
    for cf in cache_files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        sym = cf.stem.rsplit("_", 1)[0]
        rng = max(float(b["h"]) for b in bars1) - min(float(b["l"]) for b in bars1)
        ranges.setdefault(sym, []).append(rng)
    adr = {s: sum(v) / len(v) for s, v in ranges.items() if v}

    # Grid: 2 Brooks stops x 2 Brooks targets. Same entry; each signal
    # is scored against all four combinations.
    combos = [
        ("pullback_stop / new_high",      "stop_pullback", "target_new_high"),
        ("pullback_stop / measured_move", "stop_pullback", "target_measured_move"),
        ("spike_stop / new_high",         "stop_spike",    "target_new_high"),
        ("spike_stop / measured_move",    "stop_spike",    "target_measured_move"),
    ]
    buckets: dict[str, list[dict]] = {name: [] for name, _, _ in combos}
    n_signals = 0
    for cf in cache_files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        symbol, session_date = cf.stem.rsplit("_", 1)
        bars5 = aggregate_5m(bars1)
        a = adr.get(symbol)
        for sig in detect_first_pullbacks(bars5):
            n_signals += 1
            meta = {
                "symbol": symbol,
                "session_date": session_date,
                "direction": sig.direction,
                "is_opening": sig.is_opening,
                "pullback_bar_count": sig.pullback_bar_count,
                "signal_bar_with_body": sig.signal_bar_with_body,
                "spike_pct": round(sig.spike_height / a, 4)
                             if a and a > 0 else None,
            }
            for name, stop_attr, tgt_attr in combos:
                sim = simulate(sig, bars1, getattr(sig, stop_attr),
                               getattr(sig, tgt_attr))
                if sim is None:
                    continue
                sim.update(meta)
                buckets[name].append(sim)
    print(f"  {n_signals} first-pullback signals detected")

    report = {
        "config": {
            "entry": "stop 1 tick beyond signal bar extreme (High 1 / Low 1)",
            "stop_pullback": "1 tick beyond the pullback extreme (tight)",
            "stop_spike": "1 tick beyond the spike's start extreme "
                          "(Brooks: 'the risk is to the bottom of the spike')",
            "target_new_high": "1 tick beyond the spike extreme "
                               "(Brooks: 'at least a new high')",
            "target_measured_move": "spike height projected from the spike "
                                    "extreme (Brooks: 'a measured move')",
            "min_pullback_bars": 1,
            "max_pullback_bars": 5,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            "adr": "per-symbol average daily range (mean session high-low, "
                   "full sample); spike_pct = spike height / ADR",
        },
        "results": {name: build_segments(buckets[name]) for name, _, _ in combos},
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = OUT_DIR / "first_pullback_backtest_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")

    def line(s: dict):
        if s["n"] == 0:
            print(f"    {s['label']:32s} n=0")
            return
        print(f"    {s['label']:32s} n={s['n']:5d}  "
              f"tgt-hit={s['target_hit_rate']:.3f}  win={s['win_rate']:.3f}  "
              f"exp={s['expectancy_r']:+.3f}R  CI{s['expectancy_ci95']}  "
              f"pf={s['profit_factor']}")

    print("\n=== BROOKS FIRST-PULLBACK BACKTEST (costed, 2 stops x 2 targets) ===")
    for name, _, _ in combos:
        seg = report["results"][name]
        print(f"\n  [{name}]")
        line(seg["all_first_pullbacks"])
        print("    -- by spike size vs average daily range --")
        for s in seg["by_spike_adr"]:
            line(s)
        line(seg["spike_under_half_adr"])
        line(seg["spike_over_half_adr"])
        if "room_first_half" in seg:
            print(f"    -- walk-forward, 'room' cohort, split {seg['walk_forward_split_date']} --")
            line(seg["room_first_half"])
            line(seg["room_second_half"])
        print(f"    months positive (all): "
              f"{seg['months_positive']}/{seg['months_total']}")
    print(f"\nReport: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
