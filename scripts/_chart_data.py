"""Build ChartData objects for the Phase 6 interactive charts.

Used by sync_audit.py and sync_trades.py to replace the old base64 PNGs.
Fetches 1-min OHLC via the scanner's DatabentClient, resamples to 5-min,
converts to the {bars, keyLevels, annotations} shape the site expects.
"""

from __future__ import annotations

import os
import re
import sys
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

# Make the scanner's shared modules importable (databento client lives there).
VP = Path("/Users/williamkosloski/video-pipeline")
if VP.is_dir() and str(VP) not in sys.path:
    sys.path.insert(0, str(VP))

# Load the .env so DATABENTO_API_KEY is set. Same pattern used by _annotate_all.py.
ENV_PATH = VP / "credentials" / ".env"
if ENV_PATH.exists():
    for _line in ENV_PATH.read_text().splitlines():
        _line = _line.strip()
        if "=" in _line and not _line.startswith("#"):
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k, _v)

log = logging.getLogger(__name__)

# Single cached client so many tickers share one query.
_CLIENT = None


def _get_client():
    global _CLIENT
    if _CLIENT is None:
        from shared.databento_client import DatabentClient  # type: ignore
        _CLIENT = DatabentClient()
    return _CLIENT


# ────────────────────────────────────────────────────────────────────────────
# Session window helpers
# ────────────────────────────────────────────────────────────────────────────

def parse_audit_dir_name(name: str) -> tuple[str, str]:
    """`2026-04-15_1255ET` → ('2026-04-15', '12:55'). Returns ('', '') on miss."""
    date_match = re.match(r"^(\d{4}-\d{2}-\d{2})", name)
    time_match = re.search(r"_(\d{2})(\d{2})ET", name)
    if not date_match:
        return "", ""
    date = date_match.group(1)
    if time_match:
        return date, f"{time_match.group(1)}:{time_match.group(2)}"
    return date, ""


def _et_to_utc(year: int, month: int, day: int, hour: int, minute: int) -> datetime:
    """Convert an ET wall-clock time to UTC. Crude DST: March–November is DST."""
    is_dst = 3 <= month <= 10
    offset = 4 if is_dst else 5
    return datetime(year, month, day, hour + offset, minute, tzinfo=timezone.utc)


def _session_window(date: str, end_time_et: str) -> tuple[datetime, datetime]:
    """RTH session window in UTC: 09:30 ET → end_time_et (+5m grace).

    Note: the +5m grace uses timedelta rather than `mm + 5` to handle
    minute rollover correctly — a scan captured at e.g. 12:55 ET would
    otherwise produce minute=60 and crash datetime().
    """
    y, m, d = (int(x) for x in date.split("-"))
    if end_time_et and ":" in end_time_et:
        hh, mm = (int(x) for x in end_time_et.split(":"))
    else:
        # Default to full RTH close if we don't know the scan time.
        hh, mm = 16, 0
    start = _et_to_utc(y, m, d, 9, 30)
    end = _et_to_utc(y, m, d, hh, mm) + timedelta(minutes=5)
    return start, end


# ────────────────────────────────────────────────────────────────────────────
# OHLC fetch + resample
# ────────────────────────────────────────────────────────────────────────────

def fetch_5m_bars(
    tickers: list[str],
    date: str,
    end_time_et: str,
) -> dict[str, list[dict]]:
    """{ticker: [{t,o,h,l,c,v}, ...]} — 5-min bars on `date` through `end_time_et`.

    Empty list per ticker on failure.
    """
    if not tickers:
        return {}
    try:
        client = _get_client()
    except Exception as e:
        log.warning(f"No Databento client: {e}")
        return {t: [] for t in tickers}

    start, end = _session_window(date, end_time_et)
    try:
        df_all = client.query_ohlcv(
            dataset="EQUS.MINI",
            symbols=list(tickers),
            schema="ohlcv-1m",
            start=start,
            end=end,
        )
    except Exception as e:
        log.warning(f"Databento fetch failed: {e}")
        return {t: [] for t in tickers}

    if df_all is None or df_all.empty:
        return {t: [] for t in tickers}

    df_all = df_all.copy()
    df_all.columns = [c.lower() for c in df_all.columns]
    if "symbol" not in df_all.columns:
        return {t: [] for t in tickers}

    out: dict[str, list[dict]] = {}
    for ticker in tickers:
        df_t = df_all[df_all["symbol"] == ticker].copy()
        if df_t.empty:
            out[ticker] = []
            continue
        df_t = df_t.reset_index()
        if "ts_event" in df_t.columns:
            df_t["datetime"] = pd.to_datetime(df_t["ts_event"], utc=True)
        elif "datetime" in df_t.columns:
            df_t["datetime"] = pd.to_datetime(df_t["datetime"], utc=True)
        else:
            log.debug(f"{ticker}: no datetime column, skipping")
            out[ticker] = []
            continue
        df_t = df_t.set_index("datetime").sort_index()

        keep = [c for c in ("open", "high", "low", "close", "volume") if c in df_t.columns]
        if not {"open", "high", "low", "close"}.issubset(keep):
            out[ticker] = []
            continue
        df_t = df_t[keep]

        df_5m = df_t.resample("5min").agg(
            {
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                **({"volume": "sum"} if "volume" in keep else {}),
            }
        ).dropna(subset=["open"])

        bars: list[dict] = []
        for ts, row in df_5m.iterrows():
            bar = {
                "t": int(ts.timestamp()),
                "o": float(row["open"]),
                "h": float(row["high"]),
                "l": float(row["low"]),
                "c": float(row["close"]),
            }
            if "volume" in keep and row.get("volume") is not None:
                bar["v"] = float(row["volume"])
            bars.append(bar)
        out[ticker] = bars
    return out


# ────────────────────────────────────────────────────────────────────────────
# Annotations: reads_parsed.json record → ChartAnnotations dict
# ────────────────────────────────────────────────────────────────────────────

def _direction_from_always_in(always_in: str | None) -> str:
    if not always_in:
        return "long"
    return "long" if always_in.startswith("long") else "short"


def build_annotations(rec: dict, bars: list[dict]) -> dict:
    """Convert an audit `reads_parsed.json` entry into ChartAnnotations.

    Resolves bar indices (trendline endpoints, signal bar) to unix seconds by
    indexing into `bars`. Returns {} if the record is empty/malformed.
    """
    if not rec:
        return {}

    a: dict = {}
    phase = rec.get("phase_brooks")
    ai = rec.get("always_in_brooks")
    net = rec.get("signs_of_strength_net")
    if phase:
        a["phaseLabel"] = phase
    if ai:
        a["alwaysIn"] = ai
    if net:
        a["strength"] = net

    hints = rec.get("annotation_hints") or {}

    # Signal bar — prefer signal_bar_box (has bar index + lo/hi), else signal_bar_index.
    sbb = hints.get("signal_bar_box")
    bar_idx = None
    if sbb and len(sbb) >= 1 and sbb[0] is not None:
        bar_idx = sbb[0]
    elif rec.get("signal_bar_index") is not None:
        bar_idx = rec["signal_bar_index"]
    if bar_idx is not None and bars:
        try:
            bi = int(bar_idx)
            if 0 <= bi < len(bars):
                a["signalBar"] = {
                    "time": bars[bi]["t"],
                    "direction": _direction_from_always_in(ai),
                }
        except (TypeError, ValueError):
            pass

    # Trendline — [[bi1, p1], [bi2, p2]]
    tl = hints.get("trendline")
    if tl and len(tl) == 2 and tl[0] is not None and tl[1] is not None and bars:
        try:
            bi1, p1 = int(tl[0][0]), float(tl[0][1])
            bi2, p2 = int(tl[1][0]), float(tl[1][1])
            if 0 <= bi1 < len(bars) and 0 <= bi2 < len(bars):
                a["trendline"] = {
                    "from": {"t": bars[bi1]["t"], "price": p1},
                    "to": {"t": bars[bi2]["t"], "price": p2},
                }
        except (TypeError, ValueError, IndexError):
            pass

    if rec.get("stop_price") is not None:
        try:
            a["stopPrice"] = float(rec["stop_price"])
        except (TypeError, ValueError):
            pass
    if rec.get("target_price") is not None:
        try:
            a["targetPrice"] = float(rec["target_price"])
        except (TypeError, ValueError):
            pass

    dec = rec.get("decision_brooks")
    prob = rec.get("probability_brooks")
    rr = rec.get("rr_brooks")
    if dec and prob is not None and rr is not None:
        try:
            a["verdict"] = {
                "decision": str(dec),
                "probability": int(round(float(prob))),
                "rr": round(float(rr), 2),
            }
        except (TypeError, ValueError):
            pass

    av = rec.get("agreement_vs_scanner")
    if av:
        a["agreement"] = av

    return a


# ────────────────────────────────────────────────────────────────────────────
# Top-level: build ChartData dict for many tickers in one pass
# ────────────────────────────────────────────────────────────────────────────

def build_charts_for_audit(
    tickers: list[str],
    audit_date: str,
    end_time_et: str,
    reads_by_ticker: dict[str, dict],
) -> dict[str, dict]:
    """{ticker: ChartData dict}. ChartData = {bars, timeframe, annotations}.

    Skips tickers with no bars. Empty annotations → omitted from output.
    """
    bars_by_ticker = fetch_5m_bars(tickers, audit_date, end_time_et)
    out: dict[str, dict] = {}
    for ticker in tickers:
        bars = bars_by_ticker.get(ticker) or []
        if not bars:
            continue
        chart: dict = {"bars": bars, "timeframe": "5min"}
        rec = reads_by_ticker.get(ticker) or {}
        ann = build_annotations(rec, bars)
        if ann:
            chart["annotations"] = ann
        out[ticker] = chart
    return out
