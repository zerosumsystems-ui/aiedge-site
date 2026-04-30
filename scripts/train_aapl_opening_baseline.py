#!/usr/bin/env python3
"""Build and evaluate the AAPL first-four-bar opening label dataset.

This is the long-term loop:
  1. read the 100 AAPL examples and saved site labels,
  2. convert each first-four-bar view into Brooks-style numeric features,
  3. benchmark simple classifiers with cross-validation,
  4. write a reproducible dataset + report.

Usage:
    python3 scripts/train_aapl_opening_baseline.py
    python3 scripts/train_aapl_opening_baseline.py --base-url http://localhost:3000
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from joblib import dump
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).parent))
from opening_features import FEATURE_COLUMNS, LABEL_ORDER, extract_opening_features  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "public" / "training" / "aapl-opening" / "examples.json"
OUT_DIR = ROOT / "artifacts" / "aapl-opening"
DEFAULT_BASE_URL = "https://www.aiedge.trade"
DECK_ID = "aapl-opening-v1"
SCORE_COLUMNS = [f"score_{label}" for label in LABEL_ORDER]
META_COLUMNS = [
    "id",
    "symbol",
    "date",
    "label",
    "labelSource",
    "labelConfidence",
    "labeledAt",
    "note",
    "featureRead",
    "featureReadScore",
    "featureReadConfidence",
]


def fetch_json(url: str) -> dict:
    with urlopen(url, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def load_labels(base_url: str) -> dict:
    url = f"{base_url.rstrip('/')}/api/training-labels?deckId={DECK_ID}"
    return fetch_json(url)


def chosen_label(example_id: str, labels_payload: dict, prefer_review: bool) -> dict | None:
    labels = labels_payload.get("labels") or {}
    reviews = labels_payload.get("reviews") or {}

    if prefer_review and example_id in reviews:
        item = reviews[example_id]
        label = item.get("label")
        if label in LABEL_ORDER:
            return {
                "label": label,
                "source": "review",
                "confidence": item.get("confidence", ""),
                "labeledAt": item.get("labeledAt", ""),
                "note": item.get("note", ""),
            }

    item = labels.get(example_id)
    if item and item.get("label") in LABEL_ORDER:
        return {
            "label": item["label"],
            "source": "first_pass",
            "confidence": "",
            "labeledAt": item.get("labeledAt", ""),
            "note": item.get("note", ""),
        }

    return None


def build_rows(manifest: dict, labels_payload: dict, prefer_review: bool) -> list[dict]:
    rows: list[dict] = []

    for example in manifest.get("examples", []):
        label = chosen_label(example["id"], labels_payload, prefer_review)
        bars = example.get("bars") or []
        if not label or len(bars) < 4:
            continue

        features = extract_opening_features(
            bars,
            prior_day_high=example.get("yesterdayHigh"),
            prior_day_low=example.get("yesterdayLow"),
        )

        row = {
            "id": example["id"],
            "symbol": example.get("symbol", ""),
            "date": example.get("date", ""),
            "label": label["label"],
            "labelSource": label["source"],
            "labelConfidence": label["confidence"],
            "labeledAt": label["labeledAt"],
            "note": label["note"],
            "featureRead": features.read,
            "featureReadScore": features.read_score,
            "featureReadConfidence": features.read_confidence,
        }
        for label_name in LABEL_ORDER:
            row[f"score_{label_name}"] = features.scores[label_name]
        row.update(features.values)
        rows.append(row)

    return rows


def write_dataset(rows: list[dict], path: Path) -> None:
    columns = META_COLUMNS + SCORE_COLUMNS + FEATURE_COLUMNS
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column, "") for column in columns})


def sorted_labels(y: list[str]) -> list[str]:
    present = set(y)
    return [label for label in LABEL_ORDER if label in present]


def evaluate_rule_engine(rows: list[dict]) -> dict:
    y_true = [row["label"] for row in rows]
    y_pred = [row["featureRead"] for row in rows]
    labels = sorted_labels(y_true)
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macroF1": round(float(f1_score(y_true, y_pred, labels=labels, average="macro", zero_division=0)), 4),
        "weightedF1": round(float(f1_score(y_true, y_pred, labels=labels, average="weighted", zero_division=0)), 4),
        "confusionMatrix": confusion_matrix(y_true, y_pred, labels=labels).tolist(),
        "classificationReport": classification_report(y_true, y_pred, labels=labels, output_dict=True, zero_division=0),
    }


def feature_matrix(rows: list[dict]) -> tuple[np.ndarray, list[str]]:
    model_columns = SCORE_COLUMNS + FEATURE_COLUMNS
    x = np.array([[float(row[column]) for column in model_columns] for row in rows], dtype=float)
    return x, model_columns


def evaluate_model(name: str, estimator, x: np.ndarray, y: list[str], labels: list[str], cv) -> dict:
    predictions = cross_val_predict(estimator, x, y, cv=cv)
    return {
        "name": name,
        "accuracy": round(float(accuracy_score(y, predictions)), 4),
        "macroF1": round(float(f1_score(y, predictions, labels=labels, average="macro", zero_division=0)), 4),
        "weightedF1": round(float(f1_score(y, predictions, labels=labels, average="weighted", zero_division=0)), 4),
        "confusionMatrix": confusion_matrix(y, predictions, labels=labels).tolist(),
        "classificationReport": classification_report(y, predictions, labels=labels, output_dict=True, zero_division=0),
    }


def top_logistic_features(estimator: Pipeline, columns: list[str], limit: int = 15) -> list[dict]:
    clf = estimator.named_steps["clf"]
    coefs = np.abs(clf.coef_)
    mean_abs = coefs.mean(axis=0)
    ranked = np.argsort(mean_abs)[::-1][:limit]
    return [{"feature": columns[index], "weight": round(float(mean_abs[index]), 5)} for index in ranked]


def top_forest_features(estimator: RandomForestClassifier, columns: list[str], limit: int = 15) -> list[dict]:
    ranked = np.argsort(estimator.feature_importances_)[::-1][:limit]
    return [
        {"feature": columns[index], "importance": round(float(estimator.feature_importances_[index]), 5)}
        for index in ranked
    ]


def evaluate(rows: list[dict]) -> tuple[dict, object | None]:
    y = [row["label"] for row in rows]
    label_counts = Counter(y)
    labels = sorted_labels(y)
    x, model_columns = feature_matrix(rows)

    report: dict = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "deckId": DECK_ID,
        "rows": len(rows),
        "labelCounts": dict(label_counts),
        "labels": labels,
        "featureColumns": model_columns,
        "ruleEngine": evaluate_rule_engine(rows),
        "models": [],
        "bestModel": None,
        "topFeatures": {},
    }

    min_class = min(label_counts.values()) if label_counts else 0
    if len(label_counts) < 2 or min_class < 2:
        report["warning"] = "Need at least two labels per class for stratified cross-validation."
        return report, None

    n_splits = min(5, min_class)
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=17)
    knn_neighbors = min(7, max(1, len(rows) - len(rows) // n_splits - 1))

    logistic = Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(
                    max_iter=5000,
                    class_weight="balanced",
                    C=0.6,
                    solver="lbfgs",
                ),
            ),
        ]
    )
    knn = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", KNeighborsClassifier(n_neighbors=knn_neighbors, weights="distance")),
        ]
    )
    forest = RandomForestClassifier(
        n_estimators=500,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=17,
    )

    candidates = [
        ("logistic_balanced", logistic),
        ("knn_feature_neighbors", knn),
        ("random_forest_balanced", forest),
    ]

    for name, estimator in candidates:
        report["models"].append(evaluate_model(name, estimator, x, y, labels, cv))

    best = max(report["models"], key=lambda item: (item["macroF1"], item["accuracy"]))
    report["bestModel"] = best["name"]

    logistic.fit(x, y)
    forest.fit(x, y)
    report["topFeatures"]["logistic_balanced"] = top_logistic_features(logistic, model_columns)
    report["topFeatures"]["random_forest_balanced"] = top_forest_features(forest, model_columns)

    best_estimator = dict(candidates)[best["name"]]
    best_estimator.fit(x, y)
    return report, best_estimator


def print_summary(report: dict, dataset_path: Path, model_path: Path | None) -> None:
    print(f"Rows: {report['rows']}")
    print(f"Label counts: {report['labelCounts']}")
    print(
        "Rule engine: "
        f"accuracy={report['ruleEngine']['accuracy']:.3f} "
        f"macroF1={report['ruleEngine']['macroF1']:.3f}"
    )
    for model in report.get("models", []):
        print(f"{model['name']}: accuracy={model['accuracy']:.3f} macroF1={model['macroF1']:.3f}")
    if report.get("bestModel"):
        print(f"Best CV model: {report['bestModel']}")
    print(f"Dataset: {dataset_path}")
    print(f"Report: {OUT_DIR / 'baseline_report.json'}")
    if model_path:
        print(f"Model: {model_path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Site URL that serves /api/training-labels")
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    parser.add_argument("--prefer-review", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--no-model", action="store_true", help="Skip writing the fitted joblib model")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    labels_payload = load_labels(args.base_url)
    rows = build_rows(manifest, labels_payload, args.prefer_review)
    if not rows:
        print("No labeled rows with first-four bars found.")
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dataset_path = OUT_DIR / "aapl_opening_features.csv"
    report_path = OUT_DIR / "baseline_report.json"
    model_path = None if args.no_model else OUT_DIR / "aapl_opening_baseline.joblib"

    write_dataset(rows, dataset_path)
    report, model = evaluate(rows)
    report.update(
        {
            "baseUrl": args.base_url,
            "manifest": str(args.manifest),
            "preferReview": args.prefer_review,
            "datasetPath": str(dataset_path),
            "modelPath": str(model_path) if model_path else "",
        }
    )
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if model_path and model is not None:
        dump(
            {
                "model": model,
                "featureColumns": SCORE_COLUMNS + FEATURE_COLUMNS,
                "labels": report["labels"],
                "trainedAt": report["generatedAt"],
                "deckId": DECK_ID,
            },
            model_path,
        )

    print_summary(report, dataset_path, model_path if model is not None else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
