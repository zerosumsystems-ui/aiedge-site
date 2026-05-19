#!/usr/bin/env python3
"""Build the /wedges study-gallery data file.

Runs the wedge detector + trade simulator over the committed intraday
corpus, picks a diverse spread of real detections, and writes them —
with the three push bars, the reversal bar, and the entry / stop /
target levels — to public/wedges/examples.json for the /wedges page.

Mirrors scripts that feed the /spikes gallery.

Usage:  python3 scripts/ml/build_wedge_examples.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from wedge_detector import detect_wedges  # noqa: E402
from backtest_wedge import (  # noqa: E402
    load_intraday_sessions, simulate_wedge_trade,
    PRIMARY_TARGET_R, PRIMARY_HORIZON, HORIZON_GRID,
)

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "artifacts" / "backtest" / "wedge_backtest_report.json"
OUT = ROOT / "public" / "wedges" / "examples.json"
N_EXAMPLES = 21


def main() -> int:
    sessions = load_intraday_sessions()
    horizon = HORIZON_GRID[PRIMARY_HORIZON]

    found: list[dict] = []
    for slug, bars in sorted(sessions.items()):
        date, _, symbol = slug.partition("_")
        for sig in detect_wedges(bars):
            trade = simulate_wedge_trade(bars, sig, PRIMARY_TARGET_R, horizon)
            if trade is None:
                continue
            found.append({
                "symbol": symbol,
                "session_date": date,
                "direction": sig.direction,
                "wedge_type": sig.wedge_type,
                "bars": [
                    {"t": b.t, "o": b.o, "h": b.h, "l": b.l, "c": b.c}
                    for b in bars
                ],
                "push_bar_ts": list(sig.push_ts),
                "reversal_ts": sig.fire_ts,
                "entry_price": round(trade["ideal_entry"], 2),
                "stop_price": round(trade["stop"], 2),
                "target_price": round(trade["target"], 2),
                "deceleration": round(sig.deceleration, 3),
                # Brooks good/bad-wedge quality fields.
                "is_flag": sig.is_flag,
                "channel_overshoot": round(sig.channel_overshoot, 3),
                "reversal_strength": round(sig.reversal_strength, 3),
                "deepening_pullbacks": sig.deepening_pullbacks,
                "brooks_clean": bool(
                    sig.is_flag and sig.channel_overshoot > 0
                    and sig.reversal_strength >= 0.5),
                "exit_reason": trade["exit_reason"],
                "net_r": round(trade["net_r"], 2),
            })

    # Diverse spread: Brooks-clean wedges, channel-overshoot wedges,
    # and the worst undershoot losers — the gallery is a study, so it
    # must show the good/bad contrast Brooks draws.
    by_r = sorted(found, key=lambda f: f["net_r"])
    picks: list[dict] = []
    picks += [f for f in by_r if f["brooks_clean"]][::-1][:6]   # good
    overshoot = [f for f in by_r if f["channel_overshoot"] > 0
                 and not f["brooks_clean"]]
    picks += overshoot[::-1][:6]                                # mixed
    undershoot = [f for f in by_r if f["channel_overshoot"] <= 0]
    picks += undershoot[:9]                                     # bad
    # De-dup, keep order, cap.
    seen: set[tuple] = set()
    examples: list[dict] = []
    for f in picks:
        key = (f["symbol"], f["session_date"])
        if key in seen:
            continue
        seen.add(key)
        examples.append(f)
    examples = examples[:N_EXAMPLES]
    # Tops first, then bottoms, each by score-ish (deceleration asc).
    examples.sort(key=lambda f: (f["wedge_type"], f["deceleration"]))

    report = json.loads(REPORT.read_text())
    a = report["all_trades"]
    verdict = {
        "n": a["n"],
        "expectancy_r": a["expectancy_r"],
        "expectancy_ci95": a["expectancy_ci95"],
        "win_rate": a["win_rate"],
        "profit_factor": a["profit_factor"],
        "sessions": len(sessions),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(
        {"generated_from": "backtest_wedge.py intraday",
         "verdict": verdict, "examples": examples}, indent=2) + "\n")
    print(f"Wrote {OUT}  ({len(examples)} examples, "
          f"verdict n={verdict['n']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
