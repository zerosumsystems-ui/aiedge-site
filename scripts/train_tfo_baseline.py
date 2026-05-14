#!/usr/bin/env python3
"""Baseline TFO classifier — Step 4 of the scanner ML pipeline.

Trains two binary classifiers on the labeled candidates from
setup_candidates (pattern='tfo' AND outcome_computed_at + features
both set):

    y_net  = outcome_net_pct > 0       (primary target; base rate ~69%)
    y_mfe1 = outcome_mfe_pct >= 1.0    (secondary; "did it pay 1%?")

Cross-validation is GroupKFold by session_date — every row in a fold
shares its session with no other fold. This is what stops the model
from learning "May 13 was a green day" instead of the setup.

Two models per target: LogisticRegression (scaled, balanced) and
RandomForestClassifier (balanced). Reports AUC, accuracy, F1, Brier
score, base rate, plus feature importances. Writes:

    artifacts/tfo-baseline/tfo_dataset.parquet
    artifacts/tfo-baseline/baseline_report.json
    artifacts/tfo-baseline/tfo_baseline_<target>.joblib

The dataset is read from a pre-fetched JSON dump by default
(artifacts/tfo-baseline/raw_dataset.json). Pass --from-supabase to
re-pull live (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).

Usage:
    python3 scripts/train_tfo_baseline.py
    python3 scripts/train_tfo_baseline.py --from-supabase
    python3 scripts/train_tfo_baseline.py --dataset path/to.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from joblib import dump
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "artifacts" / "tfo-baseline"
DEFAULT_DATASET = OUT_DIR / "raw_dataset.json"

# Order matters: keep stable so re-trains produce the same column order.
FEATURE_COLUMNS = [
    "fire_bar_body_ratio",
    "fire_bar_close_position",
    "fire_bar_upper_tail",
    "fire_bar_lower_tail",
    "fire_bar_range_pct",
    "fire_bar_vs_avg_range",
    "fire_bar_vs_avg_volume",
    "dist_from_open_pct",
    "confirming_avg_body_ratio",
    "confirming_avg_close_position",
    "bars_since_open",
    "consecutive_count",
    "strong_count",
    "strong_fraction",
]

TARGETS = {
    "net_positive": ("outcome_net_pct", lambda s: (s > 0).astype(int)),
    "mfe_ge_1pct": ("outcome_mfe_pct", lambda s: (s >= 1.0).astype(int)),
}

RANDOM_STATE = 17


def load_from_supabase() -> list[dict]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "ERROR: --from-supabase needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.\n"
            "Either set them in the Claude Code Environment settings, or omit\n"
            "--from-supabase to read from the pre-fetched JSON dump.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    qs = urllib.parse.urlencode(
        {
            "select": "id,symbol,session_date,direction,fire_ts,"
                      "outcome_net_pct,outcome_mfe_pct,outcome_mae_pct,"
                      "outcome_bars_seen,outcome_window_bars,features",
            "pattern": "eq.tfo",
            "outcome_computed_at": "not.is.null",
            "features_extracted_at": "not.is.null",
            "order": "session_date.asc,fire_ts.asc",
            "limit": "5000",
        }
    )
    endpoint = url.rstrip("/") + "/rest/v1/setup_candidates?" + qs
    req = urllib.request.Request(endpoint, headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def load_dataset(path: Path) -> list[dict]:
    return json.loads(path.read_text())


def build_frame(rows: list[dict]) -> pd.DataFrame:
    records = []
    for r in rows:
        feats = r.get("features") or {}
        rec = {
            "id": r["id"],
            "symbol": r["symbol"],
            "session_date": r["session_date"],
            "direction": r["direction"],
            "fire_ts": r["fire_ts"],
            "outcome_net_pct": r.get("outcome_net_pct"),
            "outcome_mfe_pct": r.get("outcome_mfe_pct"),
            "outcome_mae_pct": r.get("outcome_mae_pct"),
            "outcome_bars_seen": r.get("outcome_bars_seen"),
        }
        for col in FEATURE_COLUMNS:
            rec[col] = feats.get(col)
        records.append(rec)
    df = pd.DataFrame.from_records(records)

    # direction → numeric so the model can use it. -1 short, +1 long.
    df["dir_long"] = (df["direction"] == "long").astype(int)

    # Defensive: drop rows missing any feature or the outcome.
    must_have = FEATURE_COLUMNS + ["outcome_net_pct", "outcome_mfe_pct"]
    before = len(df)
    df = df.dropna(subset=must_have).copy()
    if len(df) != before:
        print(f"  dropped {before - len(df)} rows with missing features/outcome",
              file=sys.stderr)
    return df


def cv_predict_proba(estimator, x: np.ndarray, y: np.ndarray, groups: np.ndarray, n_splits: int) -> np.ndarray:
    cv = GroupKFold(n_splits=n_splits)
    proba = cross_val_predict(estimator, x, y, groups=groups, cv=cv, method="predict_proba", n_jobs=1)
    return proba[:, 1]


def evaluate_target(name: str, df: pd.DataFrame, feature_cols: list[str]) -> tuple[dict, object | None]:
    outcome_col, y_fn = TARGETS[name]
    y = y_fn(df[outcome_col]).to_numpy()
    x = df[feature_cols].to_numpy(dtype=float)
    groups = df["session_date"].to_numpy()

    n_pos = int(y.sum())
    n_neg = int(len(y) - n_pos)
    base_rate = float(n_pos) / float(len(y)) if len(y) else 0.0
    n_groups = int(pd.Series(groups).nunique())
    n_splits = min(5, n_groups)

    result = {
        "target": name,
        "outcome_column": outcome_col,
        "n_rows": int(len(y)),
        "n_pos": n_pos,
        "n_neg": n_neg,
        "base_rate": round(base_rate, 4),
        "n_session_groups": n_groups,
        "n_splits": n_splits,
        "models": {},
    }

    if n_pos < n_splits or n_neg < n_splits:
        result["warning"] = (
            f"too few of one class for {n_splits}-fold ({n_pos} pos / {n_neg} neg); "
            "skipping training."
        )
        return result, None

    logistic = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(
                max_iter=5000,
                class_weight="balanced",
                C=0.6,
                solver="lbfgs",
                random_state=RANDOM_STATE,
            )),
        ]
    )
    forest = RandomForestClassifier(
        n_estimators=400,
        max_depth=5,
        min_samples_leaf=4,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=1,
    )

    candidates = [
        ("logistic_balanced", logistic),
        ("random_forest_balanced", forest),
    ]

    for label, model in candidates:
        proba = cv_predict_proba(model, x, y, groups, n_splits)
        pred = (proba >= 0.5).astype(int)
        result["models"][label] = {
            "auc": round(float(roc_auc_score(y, proba)), 4),
            "accuracy": round(float(accuracy_score(y, pred)), 4),
            "f1_pos": round(float(f1_score(y, pred, pos_label=1, zero_division=0)), 4),
            "brier": round(float(brier_score_loss(y, proba)), 4),
        }

    # Fit RF on all data for feature-importance + model artifact.
    forest.fit(x, y)
    importances = sorted(
        [
            {"feature": col, "importance": round(float(imp), 5)}
            for col, imp in zip(feature_cols, forest.feature_importances_)
        ],
        key=lambda d: d["importance"],
        reverse=True,
    )
    result["top_features_rf"] = importances[:10]
    return result, forest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET,
                        help=f"JSON dump of rows (default {DEFAULT_DATASET.relative_to(ROOT)})")
    parser.add_argument("--from-supabase", action="store_true",
                        help="Pull fresh from Supabase REST instead of reading --dataset")
    args = parser.parse_args(argv)

    if args.from_supabase:
        rows = load_from_supabase()
    else:
        if not args.dataset.exists():
            print(f"ERROR: dataset not found at {args.dataset}", file=sys.stderr)
            return 2
        rows = load_dataset(args.dataset)

    df = build_frame(rows)
    feature_cols = FEATURE_COLUMNS + ["dir_long"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    parquet_path = OUT_DIR / "tfo_dataset.parquet"
    try:
        df.to_parquet(parquet_path, index=False)
    except Exception as e:  # pragma: no cover — only if pyarrow missing
        parquet_path = OUT_DIR / "tfo_dataset.csv"
        df.to_csv(parquet_path, index=False)
        print(f"  parquet unavailable ({e}); wrote CSV instead", file=sys.stderr)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_rows": int(len(df)),
        "feature_columns": feature_cols,
        "session_groups": int(df["session_date"].nunique()),
        "symbol_count": int(df["symbol"].nunique()),
        "dataset_path": str(parquet_path.relative_to(ROOT)),
        "targets": {},
    }
    model_paths = {}
    for target in TARGETS:
        result, model = evaluate_target(target, df, feature_cols)
        report["targets"][target] = result
        if model is not None:
            model_path = OUT_DIR / f"tfo_baseline_{target}.joblib"
            dump({
                "model": model,
                "feature_columns": feature_cols,
                "target": target,
                "trained_at": report["generated_at"],
            }, model_path)
            model_paths[target] = str(model_path.relative_to(ROOT))
    report["model_paths"] = model_paths

    report_path = OUT_DIR / "baseline_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")

    print(f"Rows: {report['n_rows']} | sessions: {report['session_groups']} | symbols: {report['symbol_count']}")
    print(f"Dataset: {report['dataset_path']}")
    print(f"Report:  {report_path.relative_to(ROOT)}")
    for target, result in report["targets"].items():
        if "warning" in result:
            print(f"\n[{target}] SKIPPED — {result['warning']}")
            continue
        print(
            f"\n[{target}] base_rate={result['base_rate']:.3f}  "
            f"n_pos={result['n_pos']}  n_neg={result['n_neg']}  "
            f"splits={result['n_splits']}"
        )
        for label, scores in result["models"].items():
            print(
                f"  {label:24s} AUC={scores['auc']:.3f}  "
                f"acc={scores['accuracy']:.3f}  "
                f"F1={scores['f1_pos']:.3f}  "
                f"Brier={scores['brier']:.3f}"
            )
        print("  top features (RF):")
        for feat in result["top_features_rf"][:6]:
            print(f"    {feat['feature']:30s} {feat['importance']:.4f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
