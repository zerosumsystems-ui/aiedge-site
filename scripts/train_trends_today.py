#!/usr/bin/env python3
"""Train a "will this day trend" classifier on the TFO context features.

The payoff test for tfo_context_features. The validation step found 9
features carry weak-but-real standalone signal (AUC ~0.58-0.60); this
asks whether COMBINING them clears a useful bar, and whether it holds
out of sample.

One row per session. Features = the signal subset of the context
features, snapshotted at a fixed decision bar (5-min index 4). Label =
the session closed in the far 30% of its range toward the trend
direction read at the decision bar (the objective "it trended" label).
recent_pullback_adr and pullback_ratio are dropped — at bar 4 they are
redundant with / constant against largest_pullback_adr.

Validation is honest about correlated samples:
  - GroupKFold by SESSION DATE — every symbol on a given calendar day
    shares a fold, so a market-wide trend day cannot leak between
    train and test.
  - plus a strict chronological holdout — fit on the earliest 70% of
    dates, score the latest 30% — the walk-forward check.

Writes artifacts/tfo-baseline/trends_today_report.json.

Usage: python3 scripts/train_trends_today.py
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score,
                             roc_auc_score)
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from backtest_first_pullback import aggregate_5m, BARS_CACHE
from tfo_context_features import extract_tfo_context

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "artifacts" / "tfo-baseline"

DECISION_BAR = 4
MIN_BARS = 12
TREND_CLOSE = 0.70
RANDOM_STATE = 17

# the validation-confirmed signal features (8 — recent_pullback dropped
# as redundant with largest_pullback at this decision bar)
FEATURES = [
    "max_consecutive_trend_bars",
    "close_position_session",
    "net_in_trend_adr",          # net_from_open_adr oriented by trend_dir
    "dist_from_ema_adr",
    "counter_trend_bar_frac",
    "bars_since_ema_touch",
    "largest_pullback_adr",
    "spike_present",
]


def build_dataset() -> tuple[np.ndarray, np.ndarray, np.ndarray, list]:
    """Return (X, y, dates, keys) — one row per qualifying session;
    keys are (symbol, date) tuples aligned to the rows."""
    files = sorted(BARS_CACHE.glob("*.json"))
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

    X, y, dates, keys = [], [], [], []
    for sym, sessions in by_symbol.items():
        a = adr.get(sym)
        if not a or a <= 0:
            continue
        sessions.sort(key=lambda x: x[0])
        prev_close: float | None = None
        for date, bars5 in sessions:
            feat = extract_tfo_context(bars5, at_index=DECISION_BAR,
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
            feat["net_in_trend_adr"] = feat["net_from_open_adr"] * (1 if d > 0 else -1)
            X.append([float(feat[k]) for k in FEATURES])
            y.append(1 if close_pos >= TREND_CLOSE else 0)
            dates.append(date)
            keys.append((sym, date))
    return np.array(X, dtype=float), np.array(y), np.array(dates), keys


def _scores(y, proba) -> dict:
    pred = (proba >= 0.5).astype(int)
    return {
        "auc": round(float(roc_auc_score(y, proba)), 4),
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "f1_pos": round(float(f1_score(y, pred, pos_label=1, zero_division=0)), 4),
        "brier": round(float(brier_score_loss(y, proba)), 4),
    }


def _lift(y, proba) -> list[dict]:
    """Actual trend-day rate by predicted-probability quintile."""
    order = np.argsort(proba)
    out = []
    for q in range(5):
        idx = order[q * len(order) // 5:(q + 1) * len(order) // 5]
        out.append({
            "quintile": q + 1,
            "n": int(len(idx)),
            "pred_proba_mean": round(float(proba[idx].mean()), 4),
            "actual_trend_rate": round(float(y[idx].mean()), 4),
        })
    return out


def main() -> int:
    X, y, dates, _keys = build_dataset()
    n = len(y)
    base = float(y.mean())
    n_dates = len(np.unique(dates))
    print(f"{n} sessions, {n_dates} calendar dates, "
          f"base rate (trend days) {base:.1%}\n")

    logistic = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=5000, class_weight="balanced",
                                   C=0.6, solver="lbfgs", random_state=RANDOM_STATE)),
    ])
    forest = RandomForestClassifier(n_estimators=400, max_depth=5,
                                    min_samples_leaf=8, class_weight="balanced",
                                    random_state=RANDOM_STATE, n_jobs=1)
    models = {"logistic_balanced": logistic, "random_forest_balanced": forest}

    n_splits = min(5, n_dates)
    cv = GroupKFold(n_splits=n_splits)
    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "decision_bar": DECISION_BAR,
        "label": f"closed in far {100*(1-TREND_CLOSE):.0f}% of range toward trend",
        "n_sessions": n, "n_dates": n_dates, "base_rate": round(base, 4),
        "features": FEATURES,
        "groupkfold_by_date": {}, "chronological_holdout": {},
    }

    # --- GroupKFold by date -----------------------------------------
    print(f"GroupKFold by session date ({n_splits} folds):")
    for name, model in models.items():
        proba = cross_val_predict(model, X, y, groups=dates, cv=cv,
                                  method="predict_proba", n_jobs=1)[:, 1]
        s = _scores(y, proba)
        report["groupkfold_by_date"][name] = s
        print(f"  {name:24s} AUC={s['auc']:.3f}  acc={s['accuracy']:.3f}  "
              f"F1={s['f1_pos']:.3f}  Brier={s['brier']:.3f}")
        if name == "logistic_balanced":
            report["groupkfold_by_date"]["lift_logistic"] = _lift(y, proba)

    # --- chronological holdout: earliest 70% train, latest 30% test --
    uniq = np.array(sorted(np.unique(dates)))
    cutoff = uniq[int(len(uniq) * 0.70)]
    tr, te = dates < cutoff, dates >= cutoff
    print(f"\nChronological holdout (train < {cutoff} <= test):")
    print(f"  train {int(tr.sum())} rows, test {int(te.sum())} rows  "
          f"(test base rate {y[te].mean():.1%})")
    for name, model in models.items():
        model.fit(X[tr], y[tr])
        proba = model.predict_proba(X[te])[:, 1]
        s = _scores(y[te], proba)
        report["chronological_holdout"][name] = s
        print(f"  {name:24s} AUC={s['auc']:.3f}  acc={s['accuracy']:.3f}  "
              f"F1={s['f1_pos']:.3f}  Brier={s['brier']:.3f}")

    forest.fit(X, y)
    imp = sorted(zip(FEATURES, forest.feature_importances_),
                 key=lambda t: t[1], reverse=True)
    report["feature_importances_rf"] = [
        {"feature": f, "importance": round(float(i), 4)} for f, i in imp]
    print("\nRandom-forest feature importance:")
    for f, i in imp:
        print(f"  {f:28s} {i:.4f}")

    print("\nLogistic CV — actual trend rate by predicted-probability quintile:")
    for q in report["groupkfold_by_date"]["lift_logistic"]:
        print(f"  Q{q['quintile']} n={q['n']:4d}  "
              f"pred={q['pred_proba_mean']:.3f}  actual={q['actual_trend_rate']:.3f}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "trends_today_report.json"
    path.write_text(json.dumps(report, indent=2) + "\n")
    print(f"\nReport: {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
