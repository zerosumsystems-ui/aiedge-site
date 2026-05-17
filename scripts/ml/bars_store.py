"""R2-backed Databento 1-minute bar store for the offline backtests.

The web/cloud container is ephemeral — it is cloned fresh from the repo
each session and has no persistent disk, and the repo cannot hold the
multi-GB parquet cache. So the 1-minute bars live in a Cloudflare R2
bucket; this module pulls the ticker/month parquet files it needs on
demand into the local cache and re-uses them within the session.

Locally (Will's Mac) the cache at ~/data/databento/ is already
populated, so the R2 round-trip is skipped entirely — same code path,
no config needed.

Parquet layout (one file per ticker-month, two possible feeds):
    {feed}_{ticker}_ohlcv-1m_{yyyy}-{mm}.parquet
    feed in {XNAS.ITCH, ARCX.PILLAR}
A tz-aware DatetimeIndex; columns open/high/low/close(/volume) in real
dollars — same files scripts/build/render_full_sessions.py reads.

Config (Claude Code Environment settings UI, mirrored in
.env.local.example):
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BARS_BUCKET

No HTTP/Databento here — when a file is genuinely absent everywhere we
return None and the caller skips that session.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import date as date_t
from pathlib import Path

import pandas as pd

# Bar5m — the shared 5-min bar shape used across the detectors.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "live"))
from tfo_detector import Bar5m  # noqa: E402

DATA_ROOT = Path.home() / "data" / "databento"
FEEDS = ("XNAS.ITCH", "ARCX.PILLAR")
ET = "America/New_York"
RTH_OPEN = "09:30"
RTH_CLOSE = "16:00"

# Per-process caches so a multi-day backtest reads each month parquet
# (and does each R2 pull) at most once.
_DF_CACHE: dict[tuple[str, int, int], pd.DataFrame | None] = {}
_R2_MISSING: set[str] = set()


@dataclass(frozen=True)
class Session:
    """One RTH session's bars, ready for detect + simulate."""
    ticker: str
    day: date_t
    bars_1m: list[dict]          # {t,o,h,l,c,v} — for the fill simulation
    bars_5m: list[Bar5m]         # for the detector
    prior_5m_closes: list[float] # prior trading day's RTH 5-min closes (EMA seed)


def _r2_client():
    """Lazy boto3 S3 client for R2, or None when R2 is not configured."""
    account = os.environ.get("R2_ACCOUNT_ID")
    key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    if not (account and key and secret):
        return None
    try:
        import boto3  # noqa: PLC0415 — optional dep, only needed for R2 pulls
    except ImportError:
        print("WARNING: R2 configured but boto3 is not installed "
              "(add it via scripts/requirements-ml.txt)", file=sys.stderr)
        return None
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
    )


def _ensure_parquet(ticker: str, year: int, month: int) -> Path | None:
    """Return a local path to the ticker-month parquet, pulling it from
    R2 if it is not already cached. None if it exists nowhere.
    """
    names = [f"{feed}_{ticker}_ohlcv-1m_{year:04d}-{month:02d}.parquet"
             for feed in FEEDS]
    for name in names:
        local = DATA_ROOT / name
        if local.exists():
            return local

    client = _r2_client()
    if client is None:
        return None
    bucket = os.environ.get("R2_BARS_BUCKET", "aiedge-bars")
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    from botocore.exceptions import ClientError  # noqa: PLC0415

    for name in names:
        key = f"databento/{name}"
        if key in _R2_MISSING:
            continue
        local = DATA_ROOT / name
        try:
            client.download_file(bucket, key, str(local))
            return local
        except ClientError:
            # 404 or similar — this feed has no file for this month.
            _R2_MISSING.add(key)
            if local.exists():
                local.unlink()  # drop any partial download
    return None


def _load_month(ticker: str, year: int, month: int) -> pd.DataFrame | None:
    """RTH-only 1-minute OHLCV for one ticker-month, ET-indexed."""
    cache_key = (ticker, year, month)
    if cache_key in _DF_CACHE:
        return _DF_CACHE[cache_key]

    path = _ensure_parquet(ticker, year, month)
    if path is None:
        _DF_CACHE[cache_key] = None
        return None
    try:
        df = pd.read_parquet(path)
    except Exception:
        _DF_CACHE[cache_key] = None
        return None
    if df.empty:
        _DF_CACHE[cache_key] = None
        return None

    df = df.copy()
    df.index = df.index.tz_convert(ET)
    df = df[(df.index.time >= pd.Timestamp(RTH_OPEN).time())
            & (df.index.time < pd.Timestamp(RTH_CLOSE).time())]
    keep = [c for c in ("open", "high", "low", "close", "volume") if c in df.columns]
    df = df[keep].sort_index()
    _DF_CACHE[cache_key] = df
    return df


def _to_5m(day_df: pd.DataFrame) -> list[Bar5m]:
    g = day_df.resample("5min").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    ).dropna()
    out: list[Bar5m] = []
    for ts, row in g.iterrows():
        out.append(Bar5m(
            t=int(ts.timestamp()),
            o=float(row["open"]), h=float(row["high"]),
            l=float(row["low"]), c=float(row["close"]), v=0.0,
        ))
    return out


def load_session(ticker: str, day: date_t) -> Session | None:
    """Assemble one RTH session, or None if the bars are unavailable.

    `prior_5m_closes` is the most-recent prior trading day in the same
    month parquet (matching render_full_sessions' EMA seeding). On the
    first trading day of a month it is empty and the caller seeds the
    EMA from scratch.
    """
    df = _load_month(ticker, day.year, day.month)
    if df is None:
        return None
    today = df[df.index.date == day]
    if today.empty:
        return None

    bars_1m = [
        {"t": int(ts.timestamp()), "o": float(r["open"]), "h": float(r["high"]),
         "l": float(r["low"]), "c": float(r["close"]),
         "v": float(r["volume"]) if "volume" in df.columns else 0.0}
        for ts, r in today.iterrows()
    ]
    bars_5m = _to_5m(today)
    if not bars_5m:
        return None

    prior = df[df.index.date < day]
    prior_5m_closes: list[float] = []
    if not prior.empty:
        last_prior = prior.index.date.max()
        prior_day = prior[prior.index.date == last_prior]
        prior_5m_closes = [float(b.c) for b in _to_5m(prior_day)]

    return Session(
        ticker=ticker, day=day,
        bars_1m=bars_1m, bars_5m=bars_5m, prior_5m_closes=prior_5m_closes,
    )
