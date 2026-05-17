#!/usr/bin/env python3
"""Fetch ~7 years of daily OHLCV for the US equity cross-section.

The consolidated feed (DBEQ.BASIC) only reaches back to 2023-03-28. The
~7-year history lives in the single-venue raw feeds, so this stitches
three of them:

    XNAS.ITCH     Nasdaq-listed names
    XNYS.PILLAR   NYSE-listed names
    ARCX.PILLAR   NYSE Arca (mostly ETFs)

Each feed is captured from 2018-05-01. A symbol trades on every venue,
so a (symbol, day) can appear in more than one feed; the consolidation
step keeps, per (symbol, day), the row from the venue where the symbol
traded the most volume — its primary market — which is the closest
single-source proxy for the consolidated daily bar.

Modes:
    --cost        estimate the Databento cost of the full pull, download nothing
    --validate    download one chunk (XNAS.ITCH, most recent year) and show it
    --full        download every dataset x year chunk (resumable)
    --consolidate build artifacts/daily/daily_consolidated.parquet from the raw pull

Raw chunks land in artifacts/daily/raw/<dataset>_<year>.parquet (gitignored,
regenerable). The pull is resumable — existing chunk files are skipped.

Usage:
    python3 scripts/fetch_daily_universe.py --cost
    python3 scripts/fetch_daily_universe.py --validate
    python3 scripts/fetch_daily_universe.py --full
    python3 scripts/fetch_daily_universe.py --consolidate
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import databento as db
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "artifacts" / "daily" / "raw"
CONSOLIDATED = ROOT / "artifacts" / "daily" / "daily_consolidated.parquet"

DATASETS = ["XNAS.ITCH", "XNYS.PILLAR", "ARCX.PILLAR"]
SCHEMA = "ohlcv-1d"
START = "2018-05-01"
END = "2026-05-14"          # last fully-available day across the venue feeds


def load_api_key() -> str:
    key = os.environ.get("DATABENTO_API_KEY")
    if key:
        return key
    for cand in (ROOT / ".env.local", ROOT / ".env"):
        if cand.exists():
            for raw in cand.read_text().splitlines():
                if raw.strip().startswith("DATABENTO_API_KEY="):
                    return raw.split("=", 1)[1].strip().strip('"').strip("'")
    print("ERROR: DATABENTO_API_KEY not found", file=sys.stderr)
    raise SystemExit(2)


def year_chunks() -> list[tuple[str, str, int]]:
    """(start, end, year) calendar-year chunks spanning START..END."""
    out = []
    y0, y1 = int(START[:4]), int(END[:4])
    for y in range(y0, y1 + 1):
        s = START if y == y0 else f"{y}-01-01"
        e = END if y == y1 else f"{y + 1}-01-01"
        out.append((s, e, y))
    return out


def chunk_path(dataset: str, year: int) -> Path:
    return RAW_DIR / f"{dataset}_{year}.parquet"


def estimate_cost(client: db.Historical) -> float:
    total = 0.0
    for ds in DATASETS:
        for s, e, y in year_chunks():
            c = client.metadata.get_cost(
                dataset=ds, symbols="ALL_SYMBOLS", schema=SCHEMA,
                start=s, end=e)
            total += c
            print(f"  {ds:14s} {y}  ${c:.4f}")
    return total


def fetch_chunk(client: db.Historical, dataset: str, s: str, e: str,
                year: int) -> Path:
    out = chunk_path(dataset, year)
    if out.exists():
        print(f"  skip (exists): {out.name}")
        return out
    data = client.timeseries.get_range(
        dataset=dataset, symbols="ALL_SYMBOLS", schema=SCHEMA, start=s, end=e)
    # An ALL_SYMBOLS pull does not embed the symbology, so to_df() can't
    # map instrument_id -> ticker on its own. Fetch and insert it first.
    data.insert_symbology_json(data.request_symbology(client))
    df = data.to_df()
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out)
    print(f"  wrote {out.name}  ({len(df):,} rows)")
    return out


def consolidate() -> None:
    """Per (symbol, day) keep the highest-volume venue's bar."""
    files = sorted(RAW_DIR.glob("*.parquet"))
    if not files:
        print("ERROR: no raw chunks — run --full first", file=sys.stderr)
        raise SystemExit(2)
    frames = []
    for f in files:
        df = pd.read_parquet(f)
        df = df.reset_index()
        keep = [c for c in ("ts_event", "symbol", "open", "high", "low",
                             "close", "volume") if c in df.columns]
        frames.append(df[keep])
    allrows = pd.concat(frames, ignore_index=True)
    allrows["date"] = pd.to_datetime(allrows["ts_event"]).dt.date
    # primary-venue pick: highest volume wins per (symbol, date)
    allrows = allrows.sort_values("volume", ascending=False)
    best = allrows.drop_duplicates(subset=["symbol", "date"], keep="first")
    best = best.sort_values(["symbol", "date"]).reset_index(drop=True)
    CONSOLIDATED.parent.mkdir(parents=True, exist_ok=True)
    best[["symbol", "date", "open", "high", "low", "close", "volume"]].to_parquet(
        CONSOLIDATED)
    print(f"consolidated: {len(best):,} (symbol, day) rows, "
          f"{best['symbol'].nunique():,} symbols -> "
          f"{CONSOLIDATED.relative_to(ROOT)}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--cost", action="store_true")
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--consolidate", action="store_true")
    args = ap.parse_args()

    if args.consolidate:
        consolidate()
        return 0

    client = db.Historical(load_api_key())

    if args.cost or not (args.validate or args.full):
        print(f"Cost estimate — {SCHEMA}, ALL_SYMBOLS, {START}..{END}, "
              f"{len(DATASETS)} venue feeds:")
        total = estimate_cost(client)
        print(f"\n  TOTAL estimated cost: ${total:.2f}")
        return 0

    if args.validate:
        s, e, y = year_chunks()[-1]
        print(f"Validation pull — XNAS.ITCH {y} ({s}..{e}):")
        path = fetch_chunk(client, "XNAS.ITCH", s, e, y)
        df = pd.read_parquet(path)
        print(f"\ncolumns: {list(df.columns)}")
        print(f"rows: {len(df):,}  symbols: {df['symbol'].nunique():,}")
        print(df[["symbol", "open", "high", "low", "close", "volume"]].head(6)
              .to_string())
        return 0

    if args.full:
        print(f"Full pull — {len(DATASETS)} feeds x {len(year_chunks())} years")
        for ds in DATASETS:
            for s, e, y in year_chunks():
                fetch_chunk(client, ds, s, e, y)
        print("done — run --consolidate next")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
