#!/usr/bin/env python3
"""Attach machine-readable first-four opening bars to the AAPL training deck.

The training UI shows PNGs for speed, but model training needs the actual
5-minute OHLC bars behind each answer. This script reads the source parquet
file already listed on each example and writes a compact `bars` array into
public/training/aapl-opening/examples.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public" / "training" / "aapl-opening" / "examples.json"


def load_opening_bars(path: Path) -> list[dict[str, float | int]]:
    df = pd.read_parquet(path)
    if "ts_event" in df.columns:
        df["ts_event"] = pd.to_datetime(df["ts_event"], utc=True)
        df = df.set_index("ts_event")
    elif df.index.name != "ts_event":
        df.index = pd.to_datetime(df.index, utc=True)

    df = df.sort_index().tz_convert("America/New_York")
    rth = df.between_time("09:30", "09:49")
    bars = (
        rth.resample("5min", label="left", closed="left")
        .agg(
            open=("open", "first"),
            high=("high", "max"),
            low=("low", "min"),
            close=("close", "last"),
            volume=("volume", "sum"),
        )
        .dropna(subset=["open", "high", "low", "close"])
        .iloc[:4]
    )

    out: list[dict[str, float | int]] = []
    for ts, row in bars.iterrows():
        out.append(
            {
                "t": int(ts.timestamp()),
                "o": round(float(row["open"]), 4),
                "h": round(float(row["high"]), 4),
                "l": round(float(row["low"]), 4),
                "c": round(float(row["close"]), 4),
                "v": int(row["volume"]),
            }
        )
    return out


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    examples = manifest.get("examples", [])
    updated = 0

    for example in examples:
        source = example.get("sourceFile")
        if not source:
            continue
        path = Path(source)
        if not path.exists():
            print(f"WARN missing source: {path}")
            continue
        bars = load_opening_bars(path)
        if len(bars) != 4:
            print(f"WARN {example.get('id')}: expected 4 opening bars, got {len(bars)}")
            continue
        example["bars"] = bars
        updated += 1

    manifest["version"] = max(int(manifest.get("version", 0)), 3)
    manifest["featureVersion"] = "first-four-ohlc-v1"
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {updated} examples in {MANIFEST}")


if __name__ == "__main__":
    main()
