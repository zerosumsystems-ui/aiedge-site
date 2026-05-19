#!/usr/bin/env python3
"""Backtest of the microchannel-pullback refinement of the spike setup.

The opening-spike setup enters at the close of the 3rd spike bar
(it chases the spike). This refinement waits for the first pullback
out of the microchannel and enters on a with-trend breakout stop —
an H1 (bull) / L1 (bear). See microchannel_pullback.py.

Will asked to compare a couple of stop / target methods, so each trade
is simulated under three variants:

  A  tight stop, keep the 5-min target
       stop   = 1 tick beyond the first-pullback extreme
       target = the original spike measured-move price
  B  tight stop + a fresh measured move
       stop   = 1 tick beyond the first-pullback extreme
       target = the microchannel leg height projected from the entry
  C  keep the original 5-min stop and target
       stop   = the original spike's stop (1 tick beyond spike start)
       target = the original spike measured-move price

RESOLUTION: when a 1-minute session is cached under
artifacts/backtest/bars_1m/<SYMBOL>_<DATE>.json, the refinement runs on
those 1-min bars — the microchannel pullback is found INSIDE the 5-min
spike, exactly as intended. Otherwise it falls back to the 5-min spike
bars in public/spikes/examples.json. Each example records which
resolution it used. The detector is timeframe-agnostic, so the engine
is identical either way.

Writes:
  artifacts/backtest/microchannel_backtest_report.json
  public/spikes/microchannel.json   (drives the /spikes page)

Usage:
    python3 scripts/ml/backtest_microchannel.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from pullback_detector import Bar  # noqa: E402
from microchannel_pullback import TICK, detect_microchannel_pullback  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES_IN = ROOT / "public" / "spikes" / "examples.json"
CACHE_DIR = ROOT / "artifacts" / "backtest" / "bars_1m"
REPORT_OUT = ROOT / "artifacts" / "backtest" / "microchannel_backtest_report.json"
PAGE_OUT = ROOT / "public" / "spikes" / "microchannel.json"

# Execution model — identical to backtest_spike.py for a fair comparison.
COMMISSION_PER_SHARE = 0.005
ENTRY_SLIPPAGE_BPS = 2.0
STOP_SLIPPAGE_BPS = 4.0

VARIANTS = ("A", "B", "C")
VARIANT_LABEL = {
    "A": "tight stop, 5-min target",
    "B": "tight stop, microchannel measured move",
    "C": "original 5-min stop & target",
}


def to_bars(rows):
    return [Bar(t=r["t"], o=r["o"], h=r["h"], l=r["l"], c=r["c"]) for r in rows]


def simulate(direction, entry, stop, target, bars, fire_index):
    """Walk bars from the fill bar forward. First of {stop, target} hit
    wins; a bar that straddles both is scored stopped (conservative);
    an unresolved trade exits at the last close (time stop). Returns the
    sim dict including the exit bar's index within `bars`."""
    long = direction == "long"
    risk = (entry - stop) if long else (stop - entry)
    if risk <= 0:
        return None

    es = ENTRY_SLIPPAGE_BPS / 1e4
    ss = STOP_SLIPPAGE_BPS / 1e4
    entry_fill = entry * (1 + es) if long else entry * (1 - es)

    exit_price = None
    exit_reason = None
    exit_index = len(bars) - 1
    for off, b in enumerate(bars[fire_index:]):
        if long:
            hit_stop, hit_tgt = b.l <= stop, b.h >= target
        else:
            hit_stop, hit_tgt = b.h >= stop, b.l <= target
        if hit_stop and hit_tgt:
            exit_price = stop * (1 - ss) if long else stop * (1 + ss)
            exit_reason = "stop_straddle"
            exit_index = fire_index + off
            break
        if hit_stop:
            exit_price = stop * (1 - ss) if long else stop * (1 + ss)
            exit_reason = "stop"
            exit_index = fire_index + off
            break
        if hit_tgt:
            exit_price = target          # resting limit — clean fill
            exit_reason = "target"
            exit_index = fire_index + off
            break
    if exit_price is None:
        last_c = bars[-1].c
        exit_price = last_c * (1 - es) if long else last_c * (1 + es)
        exit_reason = "time"

    gross = (exit_price - entry_fill) if long else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE) / risk
    net_r = gross / risk - commission_r
    return {
        "exit_reason": exit_reason,
        "net_r": round(net_r, 4),
        "risk_per_share": round(risk, 4),
        "exit_index": exit_index,
    }


def variant_levels(variant, direction, mc, ex):
    """Stop & target for one variant. Returns (stop, target)."""
    long = direction == "long"
    entry = mc.entry_price
    tight_stop = (round(mc.pullback_extreme - TICK, 4) if long
                  else round(mc.pullback_extreme + TICK, 4))
    if variant == "A":
        return tight_stop, ex["target_price"]
    if variant == "B":
        target = (round(entry + mc.micro_leg_height, 4) if long
                  else round(entry - mc.micro_leg_height, 4))
        return tight_stop, target
    # C — the original 5-min spike levels
    return ex["stop_price"], ex["target_price"]


def summarize(trades, label):
    """trades: list of sim dicts ({exit_reason, net_r, ...})."""
    if not trades:
        return {"label": label, "n": 0}
    r = [t["net_r"] for t in trades]
    n = len(r)
    n_target = sum(1 for t in trades if t["exit_reason"] == "target")
    wins = [x for x in r if x > 0]
    losses = [x for x in r if x <= 0]
    loss_sum = sum(losses)
    return {
        "label": label,
        "n": n,
        "target_hit_rate": round(n_target / n, 4),
        "win_rate": round(len(wins) / n, 4),
        "expectancy_r": round(sum(r) / n, 4),
        "avg_win_r": round(sum(wins) / len(wins), 4) if wins else 0.0,
        "avg_loss_r": round(loss_sum / len(losses), 4) if losses else 0.0,
        "profit_factor": round(sum(wins) / -loss_sum, 3) if loss_sum < 0 else None,
        "total_r": round(sum(r), 2),
    }


def locate(ex):
    """Resolve an example to its bar series + the microchannel pullback.

    Prefers a cached 1-minute session (the microchannel pullback is then
    found inside the 5-min spike, at true 1-min resolution); falls back
    to the 5-min spike bars shipped in examples.json.

    Returns dict(resolution, rows, bars, mc, spike_start) or None.
    """
    direction = ex["direction"]
    cache = CACHE_DIR / f"{ex['symbol']}_{ex['session_date']}.json"
    if cache.exists():
        rows = json.loads(cache.read_text())
        bars = to_bars(rows)
        spike_open = min(ex["spike_bar_ts"])
        spike_start = next((i for i, b in enumerate(bars) if b.t >= spike_open), None)
        if spike_start is None:
            return None
        # On 1-min bars the spike is one continuous microchannel run; the
        # detector extends the lead and finds the first 1-min pullback.
        mc = detect_microchannel_pullback(bars, spike_start, 1, direction)
        return {"resolution": "1min", "rows": rows, "bars": bars,
                "mc": mc, "spike_start": spike_start}

    rows = ex["bars"]
    bars = to_bars(rows)
    spike_ts = set(ex["spike_bar_ts"])
    sidx = [i for i, r in enumerate(rows) if r["t"] in spike_ts]
    if not sidx:
        return None
    mc = detect_microchannel_pullback(bars, sidx[0], sidx[-1] - sidx[0] + 1, direction)
    return {"resolution": "5min", "rows": rows, "bars": bars,
            "mc": mc, "spike_start": sidx[0]}


def main() -> int:
    if not EXAMPLES_IN.exists():
        print(f"ERROR: {EXAMPLES_IN} not found", file=sys.stderr)
        return 2
    examples = json.loads(EXAMPLES_IN.read_text()).get("examples") or []
    print(f"Refining {len(examples)} spike examples into microchannel pullbacks...")

    per_variant = {v: [] for v in VARIANTS}
    per_variant_1m = {v: [] for v in VARIANTS}
    page_examples = []
    no_pullback = 0
    n_1min = 0

    for ex in examples:
        info = locate(ex)
        if info is None or info["mc"] is None:
            no_pullback += 1
            continue
        mc = info["mc"]
        bars = info["bars"]
        rows = info["rows"]
        direction = ex["direction"]
        is_1m = info["resolution"] == "1min"
        if is_1m:
            n_1min += 1

        variants_out = {}
        for v in VARIANTS:
            stop, target = variant_levels(v, direction, mc, ex)
            # The breakout entry fires AFTER the spike's 3rd bar, so it can
            # land past a target anchored to the spike. When that happens
            # the variant simply has no trade for this example.
            if direction == "long" and target <= mc.entry_price:
                continue
            if direction == "short" and target >= mc.entry_price:
                continue
            sim = simulate(direction, mc.entry_price, stop, target, bars, mc.fire_index)
            if sim is None:
                continue
            per_variant[v].append(sim)
            if is_1m:
                per_variant_1m[v].append(sim)
            variants_out[v] = {
                "stop": round(stop, 4),
                "target": round(target, 4),
                "exit_reason": sim["exit_reason"],
                "net_r": sim["net_r"],
            }

        # Bars for the chart card. 1-min sessions are windowed around the
        # trade so the card stays readable; 5-min sessions render whole.
        if is_1m and variants_out:
            exit_idx = max(
                simulate(direction, mc.entry_price,
                         *variant_levels(v, direction, mc, ex),
                         bars, mc.fire_index)["exit_index"]
                for v in variants_out
            )
            w0 = max(0, info["spike_start"] - 8)
            w1 = min(len(rows), exit_idx + 5)
            # Keep the card readable — cap at 120 one-minute bars so the
            # microchannel and its pullback stay legible.
            if w1 - w0 > 120:
                w1 = w0 + 120
            view_rows = rows[w0:w1]
        else:
            view_rows = rows

        page_examples.append({
            "symbol": ex["symbol"],
            "session_date": ex["session_date"],
            "direction": direction,
            "resolution": info["resolution"],
            "timeframe": "1min" if is_1m else "5min",
            "bars": view_rows,
            "microchannel_bar_ts": [
                rows[i]["t"] for i in range(info["spike_start"], mc.lead_end_index + 1)
            ],
            "pullback_bar_ts": [rows[i]["t"] for i in mc.pullback_bar_indices],
            "signal_ts": rows[mc.signal_index]["t"],
            "fire_ts": rows[mc.fire_index]["t"],
            "raw_spike_entry": ex["entry_price"],
            "entry_price": mc.entry_price,
            "variants": variants_out,
        })

    variant_summary = {
        v: summarize(per_variant[v], f"variant {v} — {VARIANT_LABEL[v]}")
        for v in VARIANTS
    }
    variant_summary_1m = {
        v: summarize(per_variant_1m[v], f"variant {v} — {VARIANT_LABEL[v]} (1-min)")
        for v in VARIANTS
    }
    traded = [v for v in VARIANTS if variant_summary[v]["n"] > 0]
    chosen = max(
        traded,
        key=lambda v: (variant_summary[v]["expectancy_r"],
                       variant_summary[v]["target_hit_rate"]),
    ) if traded else None

    note = (
        f"Microchannel-pullback refinement applied to {len(page_examples)} "
        f"curated spike examples — {n_1min} run on true 1-minute bars (the "
        f"pullback found inside the 5-min spike), the rest on 5-min bars. "
        f"{no_pullback} example(s) produced no qualifying first pullback. "
        f"A study gallery, not a full-corpus verdict."
    )

    report = {
        "config": {
            "entry": "first-pullback breakout stop (H1/L1) out of the spike",
            "variants": VARIANT_LABEL,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
        },
        "note": note,
        "examples_in": len(examples),
        "examples_traded": len(page_examples),
        "examples_1min": n_1min,
        "no_pullback": no_pullback,
        "chosen_variant": chosen,
        "variants": variant_summary,
        "variants_1min": variant_summary_1m,
    }
    REPORT_OUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT_OUT.write_text(json.dumps(report, indent=2) + "\n")

    PAGE_OUT.parent.mkdir(parents=True, exist_ok=True)
    PAGE_OUT.write_text(json.dumps({
        "generated_from": "scripts/ml/backtest_microchannel.py",
        "note": note,
        "chosen_variant": chosen,
        "examples_1min": n_1min,
        "variants": variant_summary,
        "variants_1min": variant_summary_1m,
        "examples": page_examples,
    }, indent=2) + "\n")

    def line(s):
        if s["n"] == 0:
            print(f"  {s['label']:54s} n=0")
            return
        print(f"  {s['label']:54s} n={s['n']:3d}  "
              f"tgt-hit={s['target_hit_rate']:.3f}  "
              f"win={s['win_rate']:.3f}  "
              f"exp={s['expectancy_r']:+.3f}R  "
              f"total={s['total_r']:+.2f}R  pf={s['profit_factor']}")

    print(f"\n=== MICROCHANNEL-PULLBACK REFINEMENT "
          f"({len(page_examples)} traded, {n_1min} at 1-min) ===")
    for v in VARIANTS:
        line(variant_summary[v])
    print("  -- 1-minute-resolution subset --")
    for v in VARIANTS:
        line(variant_summary_1m[v])
    print(f"\n  chosen variant: {chosen}")
    print(f"  report:  {REPORT_OUT.relative_to(ROOT)}")
    print(f"  page:    {PAGE_OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
