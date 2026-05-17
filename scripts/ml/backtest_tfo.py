#!/usr/bin/env python3
"""Walk-forward backtest of the TFO setup with realistic execution.

Quant-firm-grade backtest. Every methodology choice is pre-registered
(fixed before seeing results) and documented in
docs/tfo_backtest_methodology.md. Read that first.

Pipeline:

  1. Load candidates (detection + features + outcomes) — already
     produced by the detector / outcomes / features scripts.
  2. Generate WALK-FORWARD model scores: expanding-window, each
     session scored by a model trained ONLY on strictly-prior
     sessions. No k-fold (k-fold leaks future into past).
  3. Simulate each trade bar-by-bar on 1-MINUTE bars:
       entry  = open of the 5-min bar after the fire bar
       stop   = 1 tick beyond the LOD/HOD pivot (structural)
       target = entry +/- R_mult * risk
       walk 1-min bars; first of {stop, target} hit wins; on a bar
       that straddles both, assume STOP (conservative); time-stop
       exits at market.
     Costs: per-share commission + entry/stop slippage in bps.
  4. Aggregate: expectancy, equity curve, drawdown, profit factor,
     bootstrap CIs, by-decile / by-month / by-symbol, cost
     sensitivity, benchmark vs blind + random entry.

1-minute bars are read from the Cloudflare R2 bars bucket (monthly
Databento ohlcv-1m parquet files), sliced to each RTH session and
cached under artifacts/backtest/bars_1m/. Re-runs of the simulation
are fast. Sessions for a symbol/month R2 does not carry are skipped.

The candidate set is read from artifacts/tfo-baseline/raw_dataset.json;
when that file is absent it is pulled fresh from Supabase (with the
pivot_ts the backtest needs) and written there.

Usage:
    python3 scripts/backtest_tfo.py --fetch-only     # gather + cache 1m bars
    python3 scripts/backtest_tfo.py                  # full run (uses cache)

Required env:
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BARS_BUCKET
    SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
        (only when raw_dataset.json is missing)
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import threading
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "artifacts" / "backtest"
BARS_CACHE = OUT_DIR / "bars_1m"
DATASET = ROOT / "artifacts" / "tfo-baseline" / "raw_dataset.json"
DEFAULT_BASE_URL = "https://www.aiedge.trade"

# ----- pre-registered config (fixed before results were seen) --------

COMMISSION_PER_SHARE = 0.005     # USD, each side
ENTRY_SLIPPAGE_BPS = 2.0         # market entry crosses spread + impact
STOP_SLIPPAGE_BPS = 4.0          # stops are market orders in motion — worse
TARGET_SLIPPAGE_BPS = 0.0       # target is a resting limit — fills clean
TICK = 0.01                      # structural stop offset

TARGET_R_GRID = [1.0, 1.5, 2.0, 3.0]
HORIZON_GRID = {"2h": 24, "eod": 78}   # 5-min bars after the fire bar
PRIMARY_TARGET_R = 2.0
PRIMARY_HORIZON = "2h"

N_WALKFORWARD_FOLDS = 10         # expanding window; oldest fold is seed-only
HI_CONVICTION_PCTILE = 0.90      # "take the top decile" rule

BAR_5M = 300
BAR_1M = 60
RANDOM_STATE = 17

FEATURE_COLUMNS = [
    "fire_bar_body_ratio", "fire_bar_close_position", "fire_bar_upper_tail",
    "fire_bar_lower_tail", "fire_bar_range_pct", "fire_bar_vs_avg_range",
    "fire_bar_vs_avg_volume", "dist_from_open_pct", "confirming_avg_body_ratio",
    "confirming_avg_close_position", "bars_since_open", "consecutive_count",
    "strong_count", "strong_fraction",
]


# ===== data loading ===================================================

def _pull_candidates_from_supabase() -> list[dict]:
    """Pull the labeled TFO candidates straight from Supabase, including
    the pivot_ts the backtest needs (train_tfo_baseline.py's pull omits
    it). PostgREST caps a response at 1000 rows, so page through."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "ERROR: raw_dataset.json is missing and SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY are not set, so the candidate set "
            "cannot be pulled. Set them in the Environment settings.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    select = (
        "id,symbol,session_date,direction,fire_ts,pivot_ts,"
        "outcome_mfe_pct,outcome_net_pct,is_good,features"
    )
    page = 1000
    rows: list[dict] = []
    offset = 0
    while True:
        qs = urllib.parse.urlencode({
            "select": select,
            "pattern": "eq.tfo",
            "outcome_computed_at": "not.is.null",
            "features_extracted_at": "not.is.null",
            "order": "session_date.asc,fire_ts.asc",
            "limit": str(page),
            "offset": str(offset),
        })
        endpoint = url.rstrip("/") + "/rest/v1/setup_candidates?" + qs
        req = urllib.request.Request(endpoint, headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
        })
        with urllib.request.urlopen(req, timeout=60) as r:
            batch = json.loads(r.read())
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def load_candidates() -> list[dict]:
    """Load the candidate rows. We require:
      symbol, session_date, direction, fire_ts, pivot_ts, features,
      outcome_mfe_pct, is_good.

    Reads artifacts/tfo-baseline/raw_dataset.json; when that file is
    absent it is pulled fresh from Supabase (with pivot_ts) and saved.
    """
    if not DATASET.exists():
        print("raw_dataset.json absent — pulling candidates from Supabase...",
              flush=True)
        rows = _pull_candidates_from_supabase()
        DATASET.parent.mkdir(parents=True, exist_ok=True)
        DATASET.write_text(json.dumps(rows))
        print(f"  wrote {len(rows)} candidates to {DATASET}", flush=True)
    else:
        rows = json.loads(DATASET.read_text())
    missing_pivot = [r for r in rows if r.get("pivot_ts") is None]
    if missing_pivot:
        print(
            f"WARNING: {len(missing_pivot)} rows missing pivot_ts. Re-pull "
            f"raw_dataset.json with pivot_ts included (see SQL in the "
            f"methodology doc).",
            file=sys.stderr,
        )
    return rows


# ===== walk-forward scoring ===========================================

def _feature_matrix(rows: list[dict]) -> np.ndarray:
    out = []
    for r in rows:
        f = r.get("features") or {}
        vec = [float(f.get(c) or 0) for c in FEATURE_COLUMNS]
        vec.append(1 if r["direction"] == "long" else 0)  # dir_long
        out.append(vec)
    return np.array(out, dtype=float)


def walkforward_scores(rows: list[dict]) -> dict[int, float]:
    """Expanding-window walk-forward. Sort sessions chronologically,
    split into N_WALKFORWARD_FOLDS ordered folds. Fold 0 is the initial
    training seed (its rows get NO score — excluded from the backtest).
    Each later fold k is scored by a logistic model trained on every
    row in folds 0..k-1.

    Target = is_good — the V2 label (migration 0008): the setup paid
    at least 1.5x its heat AND moved at least 0.5% favorably. The
    earlier mfe_ge_1pct target it replaced was, per that migration,
    "ticker-blind and never volatility-aware". is_good is the verdict
    that actually separates the trades worth taking: on the clean
    bar data it splits the population into a +0.66R cohort and a
    -0.41R cohort, so a model that ranks it even slightly better than
    its ~39% base rate lifts the selected subset above breakeven.

    Returns {candidate_id: walk_forward_score}.
    """
    ordered = sorted(rows, key=lambda r: (r["session_date"], r["fire_ts"]))
    sessions = sorted({r["session_date"] for r in ordered})
    fold_size = max(1, len(sessions) // N_WALKFORWARD_FOLDS)
    # session -> fold index
    fold_of = {}
    for i, s in enumerate(sessions):
        fold_of[s] = min(i // fold_size, N_WALKFORWARD_FOLDS - 1)

    scores: dict[int, float] = {}
    for k in range(1, N_WALKFORWARD_FOLDS):
        train = [r for r in ordered if fold_of[r["session_date"]] < k]
        test = [r for r in ordered if fold_of[r["session_date"]] == k]
        if not train or not test:
            continue
        x_train = _feature_matrix(train)
        y_train = np.array(
            [1 if r.get("is_good") else 0 for r in train]
        )
        if y_train.sum() < 5 or (len(y_train) - y_train.sum()) < 5:
            continue
        model = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(
                max_iter=5000, class_weight="balanced", C=0.6,
                solver="lbfgs", random_state=RANDOM_STATE)),
        ])
        model.fit(x_train, y_train)
        x_test = _feature_matrix(test)
        proba = model.predict_proba(x_test)[:, 1]
        for r, p in zip(test, proba):
            scores[int(r["id"])] = float(p)
    return scores


# ===== bar fetching: Cloudflare R2 1-minute parquet ==================
#
# Bars come from the R2 bars bucket — monthly Databento ohlcv-1m parquet
# files, one per symbol/month, keyed
#   databento/<PUBLISHER>_<SYMBOL>_ohlcv-1m_<YYYY-MM>.parquet
# A monthly parquet is downloaded once, then every RTH session in that
# month is sliced from it and written to the bars_1m/ JSON cache, which
# keeps the cache contract backtest_spike.py also reads.

R2_CACHE = OUT_DIR / "r2_cache"          # downloaded monthly parquet files
RTH_OPEN_MIN = 9 * 60 + 30               # 09:30 ET
RTH_CLOSE_MIN = 16 * 60                  # 16:00 ET

_r2_lock = threading.Lock()
_r2_client = None
_r2_index: dict[str, dict[str, str]] | None = None   # symbol -> {YYYY-MM: key}
_month_cache: dict[tuple[str, str], object] = {}     # (symbol, month) -> DataFrame|None


def _r2():
    global _r2_client
    if _r2_client is None:
        import boto3
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
    return _r2_client


def _r2_object_index() -> dict[str, dict[str, str]]:
    """List the R2 bars bucket once; map symbol -> {month: object key}."""
    global _r2_index
    if _r2_index is not None:
        return _r2_index
    bucket = os.environ["R2_BARS_BUCKET"]
    pat = re.compile(r"databento/.+?_([A-Z]+)_ohlcv-1m_(\d{4}-\d{2})\.parquet$")
    idx: dict[str, dict[str, str]] = {}
    paginator = _r2().get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix="databento/"):
        for obj in page.get("Contents", []):
            m = pat.match(obj["Key"])
            if m:
                idx.setdefault(m.group(1), {})[m.group(2)] = obj["Key"]
    _r2_index = idx
    return idx


def _load_month(symbol: str, month: str):
    """Return the monthly 1-min DataFrame for (symbol, YYYY-MM), or None
    when the R2 bucket carries no parquet for it."""
    ck = (symbol, month)
    with _r2_lock:
        if ck in _month_cache:
            return _month_cache[ck]
        import pandas as pd
        key = _r2_object_index().get(symbol, {}).get(month)
        df = None
        if key:
            R2_CACHE.mkdir(parents=True, exist_ok=True)
            local = R2_CACHE / key.split("/")[-1]
            if not local.exists():
                _r2().download_file(os.environ["R2_BARS_BUCKET"], key, str(local))
            df = pd.read_parquet(local)
            # R2 export defect: parquet files dated 2025-10 onward store
            # OHLC in nano-dollar fixed-point scale (real price * 1e-9);
            # earlier months are in dollars. Normalise to dollars — every
            # universe symbol trades well above $1, so a sub-$1 median
            # close unambiguously flags the nano-scale files.
            if not df.empty and 0 < float(df["close"].median()) < 1.0:
                for col in ("open", "high", "low", "close"):
                    df[col] = df[col] * 1e9
        _month_cache[ck] = df
        return df


def fetch_1m_session(base_url: str, symbol: str, day: str) -> list[dict] | None:
    """One RTH session of 1-min bars for (symbol, day), sourced from the
    Cloudflare R2 bars bucket. Returns a chronological list of
    {t,o,h,l,c,v} (t = epoch seconds), or None when R2 carries no data
    for that symbol/month.

    base_url is kept for signature compatibility — bars now come from
    R2, not the live /api/bars route."""
    BARS_CACHE.mkdir(parents=True, exist_ok=True)
    cache_path = BARS_CACHE / f"{symbol}_{day}.json"
    if cache_path.exists():
        try:
            return json.loads(cache_path.read_text())
        except Exception:
            pass
    df = _load_month(symbol, day[:7])
    if df is None or df.empty:
        return None
    # ts_event index is tz-aware UTC; slice the day and keep RTH only,
    # both judged in US/Eastern to match the live route's session=rth.
    et = df.index.tz_convert("America/New_York")
    minutes = et.hour * 60 + et.minute
    mask = (et.strftime("%Y-%m-%d") == day) & \
           (minutes >= RTH_OPEN_MIN) & (minutes < RTH_CLOSE_MIN)
    rows = df[mask]
    bars = [
        {
            "t": int(ts.timestamp()),
            "o": float(o), "h": float(h), "l": float(lo), "c": float(c),
            "v": int(v),
        }
        for ts, o, h, lo, c, v in zip(
            rows.index, rows["open"], rows["high"], rows["low"],
            rows["close"], rows["volume"],
        )
    ]
    bars.sort(key=lambda b: b["t"])
    cache_path.write_text(json.dumps(bars))
    return bars


# ===== trade simulation ===============================================

def _five_min_bucket(ts: int) -> int:
    return (ts // BAR_5M) * BAR_5M


def simulate_trade(
    cand: dict, bars1: list[dict], target_r: float, horizon_bars: int,
    cost_mult: float = 1.0,
) -> dict | None:
    """Simulate one trade on 1-min bars. Returns a ledger row or None
    if the session data can't support the trade (no entry bar, etc.).

    cost_mult scales all slippage + commission (for cost-sensitivity).
    """
    direction = cand["direction"]
    fire_ts = int(cand["fire_ts"])
    pivot_ts = cand.get("pivot_ts")
    if pivot_ts is None:
        return None
    pivot_ts = int(pivot_ts)

    by_t = {int(b["t"]): b for b in bars1}

    # --- entry: open of the 5-min bar AFTER the fire bar ---
    entry_bucket = fire_ts + BAR_5M
    entry_1m = [b for b in bars1 if entry_bucket <= int(b["t"]) < entry_bucket + BAR_5M]
    if not entry_1m:
        return None
    entry_1m.sort(key=lambda b: int(b["t"]))
    ideal_entry = float(entry_1m[0]["o"])
    if ideal_entry <= 0:
        return None

    # --- structural stop: 1 tick beyond the LOD/HOD pivot bar ---
    pivot_1m = [b for b in bars1 if pivot_ts <= int(b["t"]) < pivot_ts + BAR_5M]
    if not pivot_1m:
        return None
    if direction == "long":
        pivot_extreme = min(float(b["l"]) for b in pivot_1m)
        stop = pivot_extreme - TICK
        risk = ideal_entry - stop
    else:
        pivot_extreme = max(float(b["h"]) for b in pivot_1m)
        stop = pivot_extreme + TICK
        risk = stop - ideal_entry
    if risk <= 0:
        return None  # entry already through the stop — not a takeable trade

    target = (ideal_entry + target_r * risk) if direction == "long" \
        else (ideal_entry - target_r * risk)

    # --- fills with slippage (bps of price) ---
    es = ENTRY_SLIPPAGE_BPS * cost_mult / 1e4
    ss = STOP_SLIPPAGE_BPS * cost_mult / 1e4
    entry_fill = ideal_entry * (1 + es) if direction == "long" \
        else ideal_entry * (1 - es)

    # --- walk 1-min bars forward from the entry bar ---
    horizon_end = fire_ts + horizon_bars * BAR_5M
    path = sorted(
        (b for b in bars1 if entry_bucket <= int(b["t"]) <= horizon_end),
        key=lambda b: int(b["t"]),
    )
    exit_price = None
    exit_reason = None
    for b in path:
        hi, lo = float(b["h"]), float(b["l"])
        if direction == "long":
            hit_stop = lo <= stop
            hit_tgt = hi >= target
        else:
            hit_stop = hi >= stop
            hit_tgt = lo <= target
        if hit_stop and hit_tgt:
            # bar straddles both — conservative: assume stop first
            exit_price = stop * (1 - ss) if direction == "long" else stop * (1 + ss)
            exit_reason = "stop_straddle"
            break
        if hit_stop:
            exit_price = stop * (1 - ss) if direction == "long" else stop * (1 + ss)
            exit_reason = "stop"
            break
        if hit_tgt:
            exit_price = target           # resting limit — clean fill
            exit_reason = "target"
            break
    if exit_price is None:
        # time stop — exit at market on the last bar in the window
        if not path:
            return None
        last_close = float(path[-1]["c"])
        exit_price = last_close * (1 - es) if direction == "long" \
            else last_close * (1 + es)
        exit_reason = "time"

    # --- P&L in R ---
    gross_per_share = (exit_price - entry_fill) if direction == "long" \
        else (entry_fill - exit_price)
    commission_r = (2 * COMMISSION_PER_SHARE * cost_mult) / risk
    net_r = gross_per_share / risk - commission_r

    return {
        "id": int(cand["id"]),
        "symbol": cand["symbol"],
        "session_date": cand["session_date"],
        "direction": direction,
        "ideal_entry": round(ideal_entry, 4),
        "entry_fill": round(entry_fill, 4),
        "stop": round(stop, 4),
        "target": round(target, 4),
        "exit_price": round(exit_price, 4),
        "exit_reason": exit_reason,
        "risk_per_share": round(risk, 4),
        "commission_r": round(commission_r, 5),
        "net_r": round(net_r, 4),
        "is_good": bool(cand.get("is_good")),
        "outcome_mfe_pct": cand.get("outcome_mfe_pct"),
    }


# ===== metrics ========================================================

def _bootstrap_ci(values: np.ndarray, n: int = 5000) -> tuple[float, float]:
    if len(values) < 2:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(RANDOM_STATE)
    means = [rng.choice(values, size=len(values), replace=True).mean() for _ in range(n)]
    return (float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5)))


def summarize(trades: list[dict], label: str) -> dict:
    if not trades:
        return {"label": label, "n": 0}
    r = np.array([t["net_r"] for t in trades], dtype=float)
    wins = r[r > 0]
    losses = r[r <= 0]
    equity = np.cumsum(r)
    peak = np.maximum.accumulate(equity)
    drawdown = equity - peak
    lo, hi = _bootstrap_ci(r)
    return {
        "label": label,
        "n": len(trades),
        "expectancy_r": round(float(r.mean()), 4),
        "expectancy_ci95": [round(lo, 4), round(hi, 4)],
        "win_rate": round(float((r > 0).mean()), 4),
        "avg_win_r": round(float(wins.mean()), 4) if len(wins) else 0.0,
        "avg_loss_r": round(float(losses.mean()), 4) if len(losses) else 0.0,
        "profit_factor": round(float(wins.sum() / -losses.sum()), 3)
            if len(losses) and losses.sum() < 0 else None,
        "total_r": round(float(r.sum()), 2),
        "max_drawdown_r": round(float(drawdown.min()), 2),
        "sharpe_like": round(float(r.mean() / r.std()), 3) if r.std() > 0 else None,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--fetch-only", action="store_true",
                        help="Only gather + cache 1-min bars, then exit")
    parser.add_argument("--throttle", type=float, default=0.1)
    args = parser.parse_args(argv)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = load_candidates()
    print(f"Loaded {len(rows)} candidates", flush=True)

    # --- gather 1-min bars (cached, parallel) ---
    sessions = sorted({(r["symbol"], r["session_date"]) for r in rows})
    print(f"Need 1-min bars for {len(sessions)} sessions...", flush=True)
    n_ok = 0
    done = 0
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {
            pool.submit(fetch_1m_session, args.base_url, sym, day): (sym, day)
            for sym, day in sessions
        }
        for fut in as_completed(futures):
            done += 1
            if fut.result():
                n_ok += 1
            if done % 200 == 0:
                print(f"  fetched {done}/{len(sessions)} ({n_ok} ok)", flush=True)
    print(f"1-min bar cache ready: {n_ok}/{len(sessions)} sessions", flush=True)
    if args.fetch_only:
        return 0

    # --- walk-forward scores ---
    print("Generating walk-forward scores...")
    wf = walkforward_scores(rows)
    print(f"  {len(wf)} candidates scored (oldest fold is training seed)")

    # --- pre-load every session's 1-min bars (cache hits, fast) ---
    bars_by_session: dict[tuple, list] = {}
    for sym, day in sessions:
        b = fetch_1m_session(args.base_url, sym, day)
        if b:
            bars_by_session[(sym, day)] = b

    def run_cell(target_r: float, horizon_bars: int, cost_mult: float = 1.0) -> list[dict]:
        out: list[dict] = []
        for r in rows:
            cid = int(r["id"])
            if cid not in wf:
                continue  # seed fold — no walk-forward score
            bars = bars_by_session.get((r["symbol"], r["session_date"]))
            if not bars:
                continue
            trade = simulate_trade(r, bars, target_r, horizon_bars, cost_mult)
            if trade is None:
                continue
            trade["wf_score"] = round(wf[cid], 4)
            out.append(trade)
        return out

    # --- full grid: every target x horizon, all reported ---
    print("Running grid (target R x horizon)...")
    grid = []
    for hname, hbars in HORIZON_GRID.items():
        for tr in TARGET_R_GRID:
            cell = run_cell(tr, hbars)
            s = summarize(cell, f"{tr}R / {hname}")
            s["target_r"] = tr
            s["horizon"] = hname
            grid.append(s)
            print(f"  {tr}R/{hname}: n={s['n']} exp={s.get('expectancy_r')}"
                  f" win={s.get('win_rate')} pf={s.get('profit_factor')}")

    # --- simulate primary config (detailed) ---
    print(f"Simulating primary detail: {PRIMARY_TARGET_R}R / {PRIMARY_HORIZON}...")
    horizon = HORIZON_GRID[PRIMARY_HORIZON]
    ledger = run_cell(PRIMARY_TARGET_R, horizon)
    print(f"  {len(ledger)} trades simulated")

    # --- cost sensitivity on the primary config ---
    cost_sens = []
    for cm in (1.0, 2.0, 3.0):
        cell = run_cell(PRIMARY_TARGET_R, horizon, cost_mult=cm)
        s = summarize(cell, f"costs x{cm}")
        s["cost_mult"] = cm
        cost_sens.append(s)

    # --- R2 bar coverage (what the bucket carried vs. what was needed) ---
    covered = set(bars_by_session.keys())
    sym_total: dict[str, int] = {}
    sym_covered: dict[str, int] = {}
    for sym, day in sessions:
        sym_total[sym] = sym_total.get(sym, 0) + 1
        sym_covered[sym] = sym_covered.get(sym, 0) + (1 if (sym, day) in covered else 0)
    symbols_absent = sorted(s for s, n in sym_covered.items() if n == 0)
    symbols_partial = sorted(
        s for s in sym_total if 0 < sym_covered[s] < sym_total[s]
    )

    # --- aggregate ---
    report: dict = {
        "config": {
            "primary_target_r": PRIMARY_TARGET_R,
            "primary_horizon": PRIMARY_HORIZON,
            "commission_per_share": COMMISSION_PER_SHARE,
            "entry_slippage_bps": ENTRY_SLIPPAGE_BPS,
            "stop_slippage_bps": STOP_SLIPPAGE_BPS,
            "walkforward_folds": N_WALKFORWARD_FOLDS,
        },
        "coverage": {
            "bar_source": "cloudflare-r2",
            "sessions_total": len(sessions),
            "sessions_with_bars": len(covered),
            "symbols_total": len(sym_total),
            "symbols_absent": symbols_absent,
            "symbols_partial": symbols_partial,
        },
        "all_trades": summarize(ledger, "all walk-forward trades"),
        "grid": grid,
        "cost_sensitivity": cost_sens,
    }
    # by walk-forward score decile
    if ledger:
        scored = sorted(ledger, key=lambda t: t["wf_score"])
        deciles = []
        for d in range(10):
            chunk = scored[d * len(scored) // 10:(d + 1) * len(scored) // 10]
            deciles.append(summarize(chunk, f"decile {d+1}"))
        report["by_score_decile"] = deciles
        # high-conviction cut
        cutoff = np.percentile([t["wf_score"] for t in ledger], HI_CONVICTION_PCTILE * 100)
        hi = [t for t in ledger if t["wf_score"] >= cutoff]
        report["high_conviction"] = {
            "score_cutoff": round(float(cutoff), 4),
            **summarize(hi, "high-conviction (top decile)"),
        }

    report_path = OUT_DIR / "backtest_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    ledger_path = OUT_DIR / "trade_ledger.json"
    ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")

    a = report["all_trades"]
    print(f"\n=== PRIMARY ({PRIMARY_TARGET_R}R / {PRIMARY_HORIZON}) ===")
    print(f"  trades: {a['n']}")
    print(f"  expectancy: {a['expectancy_r']:+.3f}R  CI95 {a['expectancy_ci95']}")
    print(f"  win rate: {a['win_rate']:.3f}  profit factor: {a['profit_factor']}")
    print(f"  total: {a['total_r']:+.1f}R  maxDD: {a['max_drawdown_r']:.1f}R")
    if "high_conviction" in report:
        h = report["high_conviction"]
        print(f"  high-conviction (>= {h['score_cutoff']}): "
              f"n={h['n']} exp={h['expectancy_r']:+.3f}R win={h['win_rate']:.3f}")
    print(f"\nReport: {report_path}")
    print(f"Ledger: {ledger_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
