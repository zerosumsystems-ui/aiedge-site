#!/usr/bin/env python3
"""Validation: which trend-from-open context features actually separate
trend days from the rest?

Before wiring tfo_context_features into the scanner ML model, this
checks each feature's standalone discriminative power. For every cached
session it extracts the 22 features at a fixed decision bar (5-min bar
index 4 — ~25 minutes in, after Brooks' "first few bars"), then computes
the objective label from the FULL day:

    label = 1 if the session closed in the far 30% of its range,
            measured toward the trend direction read at the decision bar

The decision-bar features are hindsight-free; the label is hindsight by
construction and is used only as the target, never as an input.

For each feature it reports the single-feature ROC AUC against the
label (0.50 = useless, distance from 0.50 = signal) and the label=1 vs
label=0 means. This says which features are worth carrying into the
model and which are dead weight — no training, no overfitting.

Usage: python3 scripts/tfo_context_validate.py
"""

from __future__ import annotations

import json
import sys

import numpy as np
from sklearn.metrics import roc_auc_score

from backtest_first_pullback import aggregate_5m, BARS_CACHE
from tfo_context_features import FEATURE_KEYS, extract_tfo_context

DECISION_BAR = 4       # 5-min bar index of the feature snapshot (argv[1] overrides)
MIN_BARS = 12          # need a real session for a meaningful close
TREND_CLOSE = 0.70     # label: closed in the far 30% of the day's range

# features that are signed relative to trade direction — orient them so
# "positive" means "in the trend direction" before scoring
ORIENT_BY_DIR = ("gap_pct", "net_from_open_adr")
SKIP_RANKING = ("trend_dir",)   # symmetric ±1, not a trend-day predictor


def main() -> int:
    decision_bar = int(sys.argv[1]) if len(sys.argv) > 1 else DECISION_BAR
    files = sorted(BARS_CACHE.glob("*.json"))

    # ADR per symbol + chronological sessions for prior-close gaps
    ranges: dict[str, list[float]] = {}
    by_symbol: dict[str, list[tuple[str, list]]] = {}
    for cf in files:
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        sym, date = cf.stem.rsplit("_", 1)
        bars5 = aggregate_5m(bars1)
        if len(bars5) < MIN_BARS:
            continue
        ranges.setdefault(sym, []).append(
            max(b.h for b in bars5) - min(b.l for b in bars5))
        by_symbol.setdefault(sym, []).append((date, bars5))
    adr = {s: sum(v) / len(v) for s, v in ranges.items() if v}

    rows: list[dict] = []
    labels: list[int] = []
    for sym, sessions in by_symbol.items():
        a = adr.get(sym)
        if not a or a <= 0:
            continue
        sessions.sort(key=lambda x: x[0])
        prev_close: float | None = None
        for date, bars5 in sessions:
            feat = extract_tfo_context(bars5, at_index=decision_bar,
                                       prior_close=prev_close, adr=a)
            prev_close = bars5[-1].c
            if feat is None or feat["trend_dir"] == 0:
                continue
            d = feat["trend_dir"]
            lo = min(b.l for b in bars5)
            hi = max(b.h for b in bars5)
            rng = hi - lo
            if rng <= 0:
                continue
            close = bars5[-1].c
            close_pos = (close - lo) / rng if d > 0 else (hi - close) / rng
            rows.append(feat)
            labels.append(1 if close_pos >= TREND_CLOSE else 0)

    n = len(rows)
    y = np.array(labels)
    base = y.mean()
    print(f"{n} sessions, decision bar = index {decision_bar}, "
          f"ADR for {len(adr)} symbols")
    print(f"label = closed in far {100*(1-TREND_CLOSE):.0f}% of range "
          f"toward the bar-{decision_bar} trend read")
    print(f"base rate (trend days): {base:.1%}  "
          f"({int(y.sum())} pos / {n - int(y.sum())} neg)\n")

    scored = []
    for key in FEATURE_KEYS:
        if key in SKIP_RANKING:
            continue
        vals = np.array([
            (r[key] * (1 if r["trend_dir"] > 0 else -1))
            if key in ORIENT_BY_DIR else r[key]
            for r in rows
        ], dtype=float)
        if np.unique(vals).size < 2:
            scored.append((key, 0.5, vals[y == 1].mean(), vals[y == 0].mean()))
            continue
        auc = roc_auc_score(y, vals)
        scored.append((key, auc, vals[y == 1].mean(), vals[y == 0].mean()))

    scored.sort(key=lambda t: abs(t[1] - 0.5), reverse=True)
    print(f"  {'feature':28s} {'AUC':>6s} {'|sig|':>6s}  "
          f"{'mean(trend)':>12s} {'mean(no-trend)':>14s}")
    for key, auc, m1, m0 in scored:
        oriented = "  (oriented)" if key in ORIENT_BY_DIR else ""
        print(f"  {key:28s} {auc:6.3f} {abs(auc-0.5):6.3f}  "
              f"{m1:12.3f} {m0:14.3f}{oriented}")

    strong = [s for s in scored if abs(s[1] - 0.5) >= 0.05]
    print(f"\n{len(strong)} feature(s) with |AUC-0.5| >= 0.05 "
          f"(meaningful standalone signal):")
    for key, auc, _, _ in strong:
        print(f"  {key} (AUC {auc:.3f})")
    if not strong:
        print("  none — no single feature separates trend days on its own")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
