#!/usr/bin/env python3
"""Does the 'trends-today' regime read convert the first pullback to
dollars?

The first-pullback backtest ran a clean breakeven (~-0.04R bps). The
trends-today model is a robust ~0.615-AUC "will this day trend" read.
This asks the only question that matters: do first-pullback trades
taken on the model's TOP trend-likely days actually beat breakeven?

Two points of rigor:

  - Leakage: each session's trend-probability is an OUT-OF-FOLD
    prediction — GroupKFold by session date, so the model that scored a
    day never trained on that day. No session grades itself.

  - Direction: the model predicts P(the day closes near its extreme in
    the direction read at bar 4). A first-pullback LONG only benefits
    from that if the bar-4 read is UP. So trades are split into those
    ALIGNED with the bar-4 trend read and those AGAINST it; the
    probability quintiles are bucketed within the aligned set, where a
    high probability genuinely means "the day favours this trade."

If, among aligned trades, the top probability quintile is clearly
positive and the bottom clearly negative, the regime filter converts.

Usage: python3 scripts/first_pullback_regime_test.py
"""

from __future__ import annotations

import json

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from backtest_first_pullback import (aggregate_5m, BARS_CACHE, simulate,
                                     simulate_scaleout, summarize)
from first_pullback_detector import detect_first_pullbacks
from tfo_context_features import extract_tfo_context
from train_trends_today import build_dataset, RANDOM_STATE


def main() -> int:
    # ----- out-of-fold trend probability per session -----------------
    X, y, dates, keys = build_dataset()
    n_dates = len(np.unique(dates))
    logistic = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=5000, class_weight="balanced",
                                   C=0.6, solver="lbfgs", random_state=RANDOM_STATE)),
    ])
    cv = GroupKFold(n_splits=min(5, n_dates))
    proba = cross_val_predict(logistic, X, y, groups=dates, cv=cv,
                              method="predict_proba", n_jobs=1)[:, 1]
    trend_p = {k: float(p) for k, p in zip(keys, proba)}
    print(f"{len(trend_p)} sessions scored out-of-fold "
          f"(trend prob: min {proba.min():.2f}, median {np.median(proba):.2f}, "
          f"max {proba.max():.2f})\n")

    # ----- first-pullback trades, tagged with prob + alignment -------
    variants = ("reward=risk", "scale-out", "measured_move")
    aligned: dict[str, list[dict]] = {v: [] for v in variants}
    against: dict[str, list[dict]] = {v: [] for v in variants}
    n_sig = n_skipped = 0
    for cf in sorted(BARS_CACHE.glob("*.json")):
        try:
            bars1 = json.loads(cf.read_text())
        except Exception:
            continue
        if not bars1:
            continue
        sym, date = cf.stem.rsplit("_", 1)
        bars5 = aggregate_5m(bars1)
        ctx = extract_tfo_context(bars5, at_index=4)
        bar4_dir = ctx["trend_dir"] if ctx else 0
        for sig in detect_first_pullbacks(bars5):
            n_sig += 1
            p = trend_p.get((sym, date))
            if p is None:
                n_skipped += 1
                continue
            trade_dir = 1 if sig.direction == "long" else -1
            is_aligned = (bar4_dir == trade_dir)
            stop = sig.stop_spike
            risk = ((sig.entry_trigger - stop) if sig.direction == "long"
                    else (stop - sig.entry_trigger))
            t1r = (sig.entry_trigger + risk if sig.direction == "long"
                   else sig.entry_trigger - risk)
            sims = {
                "reward=risk": simulate(sig, bars1, stop, t1r),
                "scale-out": simulate_scaleout(sig, bars1, stop,
                                               sig.target_measured_move),
                "measured_move": simulate(sig, bars1, stop,
                                          sig.target_measured_move),
            }
            for v, sim in sims.items():
                if sim is None:
                    continue
                sim["p_trend"] = p
                (aligned if is_aligned else against)[v].append(sim)
    print(f"{n_sig} first-pullback signals ({n_skipped} skipped — not scored)")
    a0 = aligned["reward=risk"]
    g0 = against["reward=risk"]
    print(f"  {len(a0)} aligned with the bar-4 trend read, {len(g0)} against\n")

    # ----- aligned trades: expectancy by trend-probability quintile --
    for v in variants:
        rows = sorted(aligned[v], key=lambda t: t["p_trend"])
        if not rows:
            continue
        print(f"[{v}]  aligned trades, spike stop, bps slippage")
        for q in range(5):
            grp = rows[q * len(rows) // 5:(q + 1) * len(rows) // 5]
            s = summarize(grp, f"Q{q+1}")
            pr = np.mean([t["p_trend"] for t in grp])
            print(f"  Q{q+1}  p_trend~{pr:.2f}  n={s['n']:4d}  "
                  f"win={s['win_rate']:.3f}  exp={s['expectancy_r']:+.3f}R  "
                  f"CI{s['expectancy_ci95']}")
        cut = 2 * len(rows) // 5
        bot = summarize(rows[:cut], "bottom 40%")
        top = summarize(rows[-cut:], "top 40%")
        ag = summarize(against[v], "against")
        print(f"  bottom 40%: n={bot['n']:4d}  exp={bot['expectancy_r']:+.3f}R  "
              f"CI{bot['expectancy_ci95']}")
        print(f"  top 40%:    n={top['n']:4d}  exp={top['expectancy_r']:+.3f}R  "
              f"CI{top['expectancy_ci95']}")
        print(f"  against the bar-4 read: n={ag['n']:4d}  "
              f"exp={ag['expectancy_r']:+.3f}R  CI{ag['expectancy_ci95']}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
