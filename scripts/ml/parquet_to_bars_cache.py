#!/usr/bin/env python3
"""Convert a Databento ohlcv-1m parquet into the 1-min bar cache.

The spike / microchannel backtests read 1-minute RTH sessions from
artifacts/backtest/bars_1m/<SYMBOL>_<YYYY-MM-DD>.json. That cache is
gitignored — it stays local. This rebuilds one session of it from the
monthly Databento parquet files (XNAS.ITCH_<SYM>_ohlcv-1m_<YYYY-MM>.parquet).

Parquet conventions:
  - the index is a tz-aware UTC DatetimeIndex,
  - open/high/low/close may be plain dollars or DBN fixed-point ints
    (price * 1e9); the scale is auto-detected off the median close,
  - regular session is 09:30 (inclusive) to 16:00 (exclusive) ET.

Usage:
    python3 scripts/ml/parquet_to_bars_cache.py <parquet> <SYMBOL> <YYYY-MM-DD>
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "artifacts" / "backtest" / "bars_1m"
ET = "America/New_York"
RTH_OPEN = dt.time(9, 30)
RTH_CLOSE = dt.time(16, 0)


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    parquet, symbol, day = sys.argv[1], sys.argv[2], sys.argv[3]
    target = dt.date.fromisoformat(day)

    df = pd.read_parquet(parquet)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    df.index = df.index.tz_convert(ET)

    # Auto-detect the price scale. US equity / ETF prices sit roughly in
    # 1..10000; a parquet may instead carry DBN fixed-point ints
    # (price * 1e9) or 1e-9-scaled floats.
    med = float(df["close"].median())
    scale = 1e-9 if med > 1e6 else 1e9 if 0 < med < 1e-2 else 1.0
    if scale != 1.0:
        for c in ("open", "high", "low", "close"):
            df[c] = df[c] * scale

    df = df[df.index.date == target]
    df = df[(df.index.time >= RTH_OPEN) & (df.index.time < RTH_CLOSE)]
    if df.empty:
        print(f"ERROR: no RTH bars for {symbol} {day} in {parquet}", file=sys.stderr)
        return 1

    vol_col = next((c for c in ("volume", "size", "v") if c in df.columns), None)
    bars = [
        {
            "t": int(ts.timestamp()),
            "o": round(float(r["open"]), 4),
            "h": round(float(r["high"]), 4),
            "l": round(float(r["low"]), 4),
            "c": round(float(r["close"]), 4),
            "v": float(r[vol_col]) if vol_col else 0.0,
        }
        for ts, r in df.iterrows()
    ]

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out = CACHE_DIR / f"{symbol}_{day}.json"
    out.write_text(json.dumps(bars))
    lo = min(b["l"] for b in bars)
    hi = max(b["h"] for b in bars)
    print(f"{symbol} {day}: {len(bars)} 1-min bars, "
          f"price {lo:.2f}-{hi:.2f} -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
