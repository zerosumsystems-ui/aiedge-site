#!/usr/bin/env python3
"""Build the BGU page data: merge daily history, run study, simulate stops, export JSON.

Pipeline:
  1. Merge scanner/data/xnas_daily_2018_2023.csv with leadership_daily_all_above_1_universe.csv
  2. Run BGU filter against the full extended history
  3. Simulate gap-day-low stop + 40d time exit per trade
  4. Compute aggregate stats (win rate, EV, R-mults, annual R)
  5. Write public/data/buyable-gap-up/all-trades.json for the page

Usage: python scripts/build_bgu_page_data.py
"""
from __future__ import annotations

import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path
from statistics import mean, median
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd

SITE = Path(__file__).resolve().parents[1]
SCANNER = SITE.parent / "scanner"
EXTENDED = SCANNER / "data" / "xnas_daily_2018_2023.csv"
CURRENT = SCANNER / "data" / "leadership_daily_all_above_1_universe.csv"
MERGED = SCANNER / "data" / "leadership_daily_extended.parquet"
OUT_DIR = SITE / "public" / "data" / "buyable-gap-up"
OUT_FILE = OUT_DIR / "all-trades.json"
PER_TRADE_DIR = OUT_DIR / "trades"
# Per-trade chart window: 20 before + 50 after = ~70 bars total (under 80 cap)
BARS_BEFORE_SIGNAL = 20
BARS_AFTER_SIGNAL = 50

ET = ZoneInfo("America/New_York")
TIME_STOP_DAYS = 40

# Filter spec (strict default)
MIN_INTRADAY_PCT = 15.0
MIN_VOL_RVOL = 1.5
MIN_AVG_VOL_SHARES = 500_000.0
MIN_PRICE = 1.0
MIN_CLOSE_LOCATION_PCT = 80.0  # close in top 20% of day's range — kills upper-wick fades
HIGH_WINDOW = 50
VOL_60D_WINDOW = 60
ISO_SPIKE_MULT = 1.5
ISO_SPIKE_WINDOW = 30
# Parabolic-top filter: gap-day close <= N x its close 30 trading days ago.
# CEI 2021-09-28 was 3.5x of its 30d-prior close — already in late-parabola
# territory before the BGU triggered. 2.0x = "no more than doubled in 30 days".
MAX_PRIOR_30D_RATIO = 2.0
PRIOR_RATIO_WINDOW = 30


def merge_daily(force: bool = False) -> pd.DataFrame:
    """Merge XNAS extension with current leadership universe and return clean df.

    Caches to a parquet file for fast re-runs.
    """
    if MERGED.exists() and not force:
        print(f"loading cached merge {MERGED}...")
        return pd.read_parquet(MERGED)

    print("merging extended + current daily data...")
    parts: list[pd.DataFrame] = []

    if EXTENDED.exists():
        print(f"  reading {EXTENDED}...")
        ext = pd.read_csv(
            EXTENDED,
            usecols=["ticker", "date", "open", "high", "low", "close", "volume"],
            dtype={"ticker": str},
        )
        # Filter out "NONE" and other malformed tickers
        ext = ext[ext["ticker"].str.match(r"^[A-Z][A-Z0-9.\-]*$", na=False)]
        # Cap at the day before current data starts to avoid duplication
        ext = ext[ext["date"] < "2023-05-01"]
        print(f"    {len(ext):,} rows after cleanup")
        parts.append(ext)

    print(f"  reading {CURRENT}...")
    cur = pd.read_csv(
        CURRENT,
        usecols=["ticker", "date", "open", "high", "low", "close", "volume"],
        dtype={"ticker": str},
    )
    print(f"    {len(cur):,} rows")
    parts.append(cur)

    df = pd.concat(parts, ignore_index=True)
    df["ticker"] = df["ticker"].astype(str).str.upper()
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["ticker", "date", "open", "high", "low", "close", "volume"])
    df = df[df["close"] > 0].copy()
    # Dedupe: prefer current (EQUS.MINI) over XNAS for overlap dates
    df = df.sort_values(["ticker", "date"]).drop_duplicates(["ticker", "date"], keep="last")
    df = df.reset_index(drop=True)
    print(f"  merged {len(df):,} rows / {df['ticker'].nunique():,} tickers")
    print(f"  range: {df['date'].min().date()} → {df['date'].max().date()}")

    print(f"  caching to {MERGED}...")
    df.to_parquet(MERGED, index=False)
    return df


sys.path.insert(0, str(Path(__file__).resolve().parent))
from _etf_exclusions import ETF_EXCLUSIONS  # noqa: E402


def find_events(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Apply BGU filter and return list of event dicts."""
    events: list[dict[str, Any]] = []
    for ticker, daily in df.groupby("ticker"):
        if ticker in ETF_EXCLUSIONS or len(daily) < 250:
            continue
        daily = daily.sort_values("date").reset_index(drop=True)
        h = daily["high"].astype(float)
        l = daily["low"].astype(float)
        o = daily["open"].astype(float)
        c = daily["close"].astype(float)
        v = daily["volume"].astype(float)

        prior_c = c.shift(1)
        intraday_pct = (c / o - 1.0) * 100.0
        gap_pct = (o / prior_c - 1.0) * 100.0
        rng = h - l
        close_loc = ((c - l) / rng * 100.0).where(rng > 0, 50.0).clip(0.0, 100.0)
        avg_vol_20d = v.shift(1).rolling(20, min_periods=10).mean()
        vol_rvol = v / avg_vol_20d
        avg_dvol_m = (c * v).shift(1).rolling(20, min_periods=10).mean() / 1_000_000.0

        sma200 = c.rolling(200, min_periods=200).mean()
        prior_high = c.shift(1).rolling(HIGH_WINDOW, min_periods=20).max()
        prior_vol_max = v.shift(1).rolling(VOL_60D_WINDOW, min_periods=30).max()
        prior_short_vol_max = v.shift(1).rolling(ISO_SPIKE_WINDOW, min_periods=15).max()
        prior_30d_close = c.shift(PRIOR_RATIO_WINDOW)
        prior_30d_ratio = c / prior_30d_close

        price_ok = (prior_c >= MIN_PRICE) & (o >= MIN_PRICE) & (c >= MIN_PRICE)
        mask = (
            price_ok
            & (intraday_pct >= MIN_INTRADAY_PCT)
            & (close_loc >= MIN_CLOSE_LOCATION_PCT)
            & (vol_rvol >= MIN_VOL_RVOL)
            & (avg_vol_20d >= MIN_AVG_VOL_SHARES)
            & (c >= sma200)
            & (c >= prior_high)
            & (v >= prior_vol_max)
            & (v >= ISO_SPIKE_MULT * prior_short_vol_max)
            & (prior_30d_ratio <= MAX_PRIOR_30D_RATIO)
        ).fillna(False)

        for idx in mask[mask].index.tolist():
            i = int(idx)
            if i + 1 >= len(daily):
                continue
            events.append({
                "ticker": ticker,
                "df": daily,
                "sig_idx": i,
                "signal_date": pd.Timestamp(daily.iloc[i]["date"]).strftime("%Y-%m-%d"),
                "intraday_gain_pct": float(intraday_pct.iloc[i]),
                "gap_up_pct": float(gap_pct.iloc[i]),
                "close_location_pct": float(close_loc.iloc[i]),
                "volume_rvol": float(vol_rvol.iloc[i]),
                "avg_vol_shares": float(avg_vol_20d.iloc[i]) if pd.notna(avg_vol_20d.iloc[i]) else None,
                "avg_dvol_m_20d": float(avg_dvol_m.iloc[i]) if pd.notna(avg_dvol_m.iloc[i]) else None,
                "gap_day_open": float(o.iloc[i]),
                "gap_day_high": float(h.iloc[i]),
                "gap_day_low": float(l.iloc[i]),
                "gap_day_close": float(c.iloc[i]),
                "next_open": float(o.iloc[i + 1]),
                "next_close": float(c.iloc[i + 1]),
            })
    return events


def simulate_trade(daily: pd.DataFrame, sig_idx: int) -> dict[str, Any]:
    """Walk forward: gap-low stop or 40d time exit. Tracks MFE/MAE."""
    entry_idx = sig_idx + 1
    if entry_idx >= len(daily):
        return {"skip": True}
    entry_price = float(daily.iloc[entry_idx]["close"])
    stop_price = float(daily.iloc[sig_idx]["low"])
    end_idx = min(entry_idx + TIME_STOP_DAYS, len(daily) - 1)

    mfe = 0.0  # max favorable (positive %)
    mae = 0.0  # max adverse (negative %)
    exit_idx = end_idx
    exit_price = float(daily.iloc[end_idx]["close"]) if end_idx > entry_idx else entry_price
    exit_reason = "time"

    for j in range(entry_idx + 1, end_idx + 1):
        h = float(daily.iloc[j]["high"])
        l = float(daily.iloc[j]["low"])
        # Update MFE/MAE intrabar
        bar_high_pct = (h / entry_price - 1.0) * 100.0
        bar_low_pct = (l / entry_price - 1.0) * 100.0
        mfe = max(mfe, bar_high_pct)
        mae = min(mae, bar_low_pct)
        # Stop check
        if l <= stop_price:
            exit_idx = j
            exit_price = stop_price
            exit_reason = "stop"
            break

    days_held = exit_idx - entry_idx
    return_pct = (exit_price / entry_price - 1.0) * 100.0
    stop_dist_pct = (stop_price / entry_price - 1.0) * 100.0  # negative
    r_mult = return_pct / abs(stop_dist_pct) if stop_dist_pct < 0 else 0.0

    return {
        "entry_price": entry_price,
        "stop_price": stop_price,
        "stop_distance_pct": stop_dist_pct,
        "exit_reason": exit_reason,
        "exit_idx": exit_idx,
        "exit_date": pd.Timestamp(daily.iloc[exit_idx]["date"]).strftime("%Y-%m-%d"),
        "exit_price": exit_price,
        "days_held": days_held,
        "return_pct": return_pct,
        "r_multiple": r_mult,
        "mfe_pct": mfe,
        "mae_pct": mae,
    }


def main() -> None:
    df = merge_daily(force=False)

    print("\nrunning BGU filter...")
    t0 = time.time()
    events = find_events(df)
    print(f"  found {len(events):,} events in {time.time() - t0:.1f}s")

    print("\nsimulating gap-low stop + 40d time exit...")
    trades = []
    for ev in events:
        sim = simulate_trade(ev["df"], ev["sig_idx"])
        if sim.get("skip"):
            continue
        trades.append({
            "ticker": ev["ticker"],
            "signalDate": ev["signal_date"],
            "intradayGainPct": round(ev["intraday_gain_pct"], 2),
            "gapUpPct": round(ev["gap_up_pct"], 2),
            "closeLocationPct": round(ev["close_location_pct"], 1),
            "volumeRvol": round(ev["volume_rvol"], 2),
            "avgVolShares": int(ev["avg_vol_shares"]) if ev["avg_vol_shares"] else None,
            "avgDollarVolM": round(ev["avg_dvol_m_20d"], 1) if ev["avg_dvol_m_20d"] else None,
            "gapDayOpen": round(ev["gap_day_open"], 4),
            "gapDayHigh": round(ev["gap_day_high"], 4),
            "gapDayLow": round(ev["gap_day_low"], 4),
            "gapDayClose": round(ev["gap_day_close"], 4),
            "nextOpen": round(ev["next_open"], 4),
            "nextClose": round(ev["next_close"], 4),
            "entryPrice": round(sim["entry_price"], 4),
            "stopPrice": round(sim["stop_price"], 4),
            "stopDistancePct": round(sim["stop_distance_pct"], 2),
            "exitReason": sim["exit_reason"],
            "exitDate": sim["exit_date"],
            "exitPrice": round(sim["exit_price"], 4),
            "daysHeld": sim["days_held"],
            "returnPct": round(sim["return_pct"], 2),
            "rMultiple": round(sim["r_multiple"], 2),
            "mfePct": round(sim["mfe_pct"], 2),
            "maePct": round(sim["mae_pct"], 2),
        })
    print(f"  simulated {len(trades):,} trades")

    # Aggregate stats
    rets = [t["returnPct"] for t in trades]
    rms = [t["rMultiple"] for t in trades]
    wins = [r for r in rets if r > 0]
    losses = [r for r in rets if r <= 0]
    win_rate = len(wins) / len(rets) if rets else 0
    avg_gain = mean(wins) if wins else 0
    avg_loss = mean(losses) if losses else 0
    avg_r = mean(rms) if rms else 0
    total_r = sum(rms)
    abs_loss = abs(avg_loss) if avg_loss else 1.0
    ev_pct = win_rate * avg_gain - (1 - win_rate) * abs_loss
    ev_r = win_rate * (avg_gain / abs_loss) - (1 - win_rate) if abs_loss > 0 else 0
    dates = sorted(t["signalDate"] for t in trades)
    if dates:
        start = dates[0]
        end = dates[-1]
        span_days = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days
        span_years = span_days / 365.25
        annual_r = total_r / span_years if span_years > 0 else 0
    else:
        start = end = ""
        span_years = 0
        annual_r = 0

    payload = {
        "generatedAt": datetime.now(ET).isoformat(timespec="seconds"),
        "filters": {
            "minIntradayGainPct": MIN_INTRADAY_PCT,
            "minVolumeRvol": MIN_VOL_RVOL,
            "minAvgVolumeShares": MIN_AVG_VOL_SHARES,
            "minCloseLocationPct": MIN_CLOSE_LOCATION_PCT,
            "highWindowDays": HIGH_WINDOW,
            "vol60dWindow": VOL_60D_WINDOW,
            "isolatedSpikeMult": ISO_SPIKE_MULT,
            "isolatedSpikeWindow": ISO_SPIKE_WINDOW,
            "maxPrior30dRatio": MAX_PRIOR_30D_RATIO,
            "requireAboveSma200": True,
            "requireNewHigh": True,
            "requireVol60dHigh": True,
            "excludeEtfs": True,
        },
        "stats": {
            "totalTrades": len(trades),
            "winRatePct": round(win_rate * 100, 2),
            "avgGainPct": round(avg_gain, 2),
            "avgLossPct": round(avg_loss, 2),
            "avgRMultiple": round(avg_r, 2),
            "evPct": round(ev_pct, 2),
            "evR": round(ev_r, 2),
            "totalRMultiples": round(total_r, 2),
            "annualR": round(annual_r, 2),
            "spanYears": round(span_years, 2),
            "start": start,
            "end": end,
        },
        "trades": sorted(trades, key=lambda t: t["signalDate"], reverse=True),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\nWrote {OUT_FILE}")

    # Per-trade chart bars — written one file per trade for lazy-load on row expand.
    PER_TRADE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nwriting per-trade bar files to {PER_TRADE_DIR}/...")
    written = 0
    # Map ticker -> df for fast lookup (we already have `df` in scope)
    bars_by_ticker = {tk: g.sort_values("date").reset_index(drop=True)
                      for tk, g in df.groupby("ticker")}
    for ev in events:
        tk = ev["ticker"]
        sig_idx = ev["sig_idx"]
        bars_df = bars_by_ticker.get(tk)
        if bars_df is None:
            continue
        start_idx = max(0, sig_idx - BARS_BEFORE_SIGNAL)
        end_idx = min(len(bars_df) - 1, sig_idx + BARS_AFTER_SIGNAL)
        window = bars_df.iloc[start_idx:end_idx + 1]
        # 20-EMA / 50-SMA / 200-SMA (computed on the FULL series so the values
        # at the visible bars are correct, not truncated by the window).
        full_close = bars_df["close"].astype(float)
        ema20 = full_close.ewm(span=20, adjust=False, min_periods=20).mean()
        sma50 = full_close.rolling(50, min_periods=50).mean()
        sma200 = full_close.rolling(200, min_periods=200).mean()
        bars_payload = []
        for j in range(start_idx, end_idx + 1):
            row = bars_df.iloc[j]
            bars_payload.append({
                "date": pd.Timestamp(row["date"]).strftime("%Y-%m-%d"),
                "open": round(float(row["open"]), 4),
                "high": round(float(row["high"]), 4),
                "low": round(float(row["low"]), 4),
                "close": round(float(row["close"]), 4),
                "volume": int(row["volume"]),
                "ema20": round(float(ema20.iloc[j]), 4) if pd.notna(ema20.iloc[j]) else None,
                "sma50": round(float(sma50.iloc[j]), 4) if pd.notna(sma50.iloc[j]) else None,
                "sma200": round(float(sma200.iloc[j]), 4) if pd.notna(sma200.iloc[j]) else None,
            })
        signal_date = ev["signal_date"]
        out_path = PER_TRADE_DIR / f"{tk}_{signal_date}.json"
        out_path.write_text(json.dumps({
            "ticker": tk,
            "signalDate": signal_date,
            "signalIndex": sig_idx - start_idx,  # local index within `bars`
            "bars": bars_payload,
        }), encoding="utf-8")
        written += 1
    print(f"  wrote {written} per-trade files")
    print(f"\nSample size:    {len(trades):,} trades")
    print(f"Span:           {span_years:.2f} years ({start} → {end})")
    print(f"Win rate:       {win_rate * 100:.1f}%")
    print(f"Avg gain:       +{avg_gain:.2f}%")
    print(f"Avg loss:       {avg_loss:.2f}%")
    print(f"EV per trade:   {ev_r:+.2f}R")
    print(f"Total R:        {total_r:+.2f}")
    print(f"Annual R:       {annual_r:+.2f}R/yr")


if __name__ == "__main__":
    main()
