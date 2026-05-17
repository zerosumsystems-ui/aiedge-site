# TFO Setup — Backtest Methodology

A walk-forward backtest of the Trend-From-the-Open (TFO) intraday
setup, with simulated execution and realistic transaction costs. This
document is the methodology of record. Every choice below was fixed
*before* results were examined; nothing here is tuned to the equity
curve.

Engine: `scripts/ml/backtest_tfo.py`. Outputs: `artifacts/backtest/`.

---

## 1. The setup

A TFO fires when:

- The session low (long) or high (short) prints within the first 4
  regular-trading-hours 5-minute bars; **and**
- At least 3 consecutive in-direction closes follow the pivot bar; **and**
- At least 2 of those 3 confirming bars are Brooks-strong (body ≥ 50%
  of range, close in the top 25% of range for longs / bottom 25% for
  shorts).

The fire bar is the 3rd confirming bar. Detection is implemented in
`scripts/live/tfo_detector.py` and runs identically in backfill and in the
live Fly aggregator.

## 2. Data

- **Source**: Databento `ohlcv-1m` equity data, stored as monthly
  per-symbol parquet files in the Cloudflare R2 `aiedge-bars` bucket.
  Detection uses 5-minute RTH bars aggregated from the 1-minute feed;
  the execution simulation uses 1-minute RTH bars. RTH is judged in
  US/Eastern (09:30–16:00), matching the live `/api/bars` route.
- **Price-scale normalisation**: the R2 export is not internally
  consistent — parquet files dated 2025-10 onward store OHLC in
  nano-dollar fixed-point scale (real price × 1e-9), earlier months in
  dollars. The loader detects a sub-$1 median close (impossible for
  this universe) and rescales those files by 1e9. Without this every
  trade from 2025-10 on collapses to an exact −1R artefact.
- **Universe**: 49 liquid US equities and sector ETFs (index ETFs,
  sector ETFs, mega-cap single names). Chosen for tight spreads and
  clean microstructure.
- **Window**: 2024-12-27 → 2026-05-14 (~17 months, 339 trading
  sessions).
- **Sample**: 2,286 detected candidates with complete features and
  outcomes.

### 2.1 Split adjustment

The `/api/bars` data is **raw (not split-adjusted)**. Four corporate
splits occur inside the window:

| Ticker | Date | Ratio |
|---|---|---|
| NFLX | 2025-11-17 | ~10:1 |
| XLK | 2025-12-05 | 2:1 |
| XLY | 2025-12-05 | 2:1 |
| XLU | 2025-12-05 | 2:1 |

**This is immaterial to the results.** Every computation in the
pipeline — detection, the 14-feature vector, outcomes, and per-trade
R — is intraday and either a ratio, a percentage, or a count. A split
occurs overnight, so every bar within any single session is on one
consistent price scale. No calculation anywhere combines two
differently-scaled prices. An unadjusted feed therefore produces
results identical to an adjusted feed for this strategy. The splits
are catalogued here for completeness and auditability.

## 3. Detection — no hindsight

The detector emits a signal using only information available at the
fire bar's close (`bars[:fire_bar_idx + 1]`):

- The "session low/high" test uses the low/high **so far** at fire-bar
  close, not the eventual full-session extreme. A TFO whose pivot is
  later invalidated is still emitted — that is what a live trader
  sees, so the backtest must include it.
- The confirming-run length is **capped at 3** (`MIN_CONSECUTIVE`).
  Counting the full run would let the detector use strong bars that
  print *after* the fire bar to satisfy the 2-strong threshold —
  hindsight. The cap removes it.

These guarantees mean the backfill detector emits exactly the set of
signals the live aggregator would have emitted in real time.

## 4. Model & walk-forward validation

Each candidate is scored by a logistic-regression model on the
14-feature vector. Score = P(`is_good`) — the V2 label from migration
0008: the setup paid at least 1.5× its heat and moved at least 0.5%
favorably. This replaces the earlier `mfe_ge_1pct` target, which that
migration records as "ticker-blind and never volatility-aware". The
score-decile profile in `backtest_report.json` is the test of whether
the model adds edge; on the corrected data it does not, under either
target.

**Validation is walk-forward, not k-fold.** k-fold cross-validation
would let a model trained on 2026 sessions score a 2025 holdout —
future information leaking backward. Instead: the 339 sessions are
ordered chronologically and split into 10 equal folds. Fold 0 is the
initial training seed and receives no score (its candidates are
excluded from the backtest). Each later fold *k* is scored by a model
trained **only on folds 0…k-1** — strictly prior sessions. Every
score used in the equity curve is therefore a genuine "what you would
have known at the time" prediction.

## 5. Execution simulation

Pre-registered. All parameters fixed before results were seen.

### 5.1 Entry

Market order at the **open of the 5-minute bar following the fire
bar**. Filling at the fire-bar close would be lookahead — that price
has already printed by the time the signal is known.

### 5.2 Stop — structural

One tick ($0.01) beyond the LOD (long) / HOD (short) pivot bar's
extreme. This is the setup's actual invalidation level: if price
trades through the pivot, the "trend from the open" thesis is wrong.
The stop is chosen by setup logic, not by what optimizes the curve.

### 5.3 Target & time stop

Reported as a declared grid — targets {1R, 1.5R, 2R, 3R} × horizons
{2 h, end-of-session}. The **primary, pre-registered** configuration
is **2R / 2 h** (2 h matches the model's training horizon). All eight
cells are reported; the primary is headlined. If an edge appears in
only one cell, the report says so — that is noise, not signal.

If neither stop nor target is hit by the horizon, the position is
closed at market on the last bar of the window.

### 5.4 Intrabar path

The fill simulation walks **1-minute bars**, not 5-minute — detection
resolution and fill resolution are deliberately separated. When a
single 1-minute bar's range contains both the stop and the target,
the order of touches is unknowable from OHLC, so the trade is scored
as **stopped (conservative)**. This can only understate performance.

### 5.5 Transaction costs

| Cost | Value | Applied to |
|---|---|---|
| Commission | $0.005 / share, each side | Round trip |
| Entry slippage | 2 bps of price | Market entry crosses the spread |
| Stop slippage | 4 bps of price | Stops are market orders in motion |
| Target slippage | 0 bps | Resting limit order fills clean |

Costs are reported at 1× / 2× / 3× these assumptions. If the edge does
not survive 2× costs, it is fragile and the report states that.

### 5.6 Sizing & P&L

R = the intended per-share risk (ideal entry − stop). Every result is
reported in R-multiples — unit-free, comparable across tickers and
price levels. Net R per trade = (exit fill − entry fill) / R −
commission_R, where the fills include slippage. A fixed-fractional
equity curve is reported as a secondary view.

## 6. Metrics

- Expectancy (net R / trade) with a bootstrap 95% confidence interval
- Win rate, average win R, average loss R, profit factor
- Cumulative equity curve, maximum drawdown (R), longest losing streak
- Sharpe-like ratio (mean R / standard deviation of R)
- **Validation chart**: net R / trade by walk-forward score decile.
  A monotone rise with score is the evidence the model adds edge; a
  flat profile is the evidence it does not.
- Segmentation by symbol, by month, by direction
- Benchmarks: the strategy versus (a) taking every TFO blind and
  (b) random entry of matched frequency and holding period

## 7. Known limitations

- **Survivorship**: the 49-name universe was selected from names
  liquid as of 2026. All 49 traded the full window with no
  delistings, so there is no dropped-loser bias — but the universe is
  still "today's liquid names," which a strict review should note.
- **Capacity**: position sizing is not constrained against average
  daily volume. At retail size this is immaterial; at scale it would
  need a capacity model.
- **Single setup, single market regime span**: 17 months covers one
  partial market cycle. The by-month breakdown is the guard against a
  single lucky stretch carrying the result.
- **The model's training target** (MFE ≥ 1%) is a proxy used only to
  rank entries. The backtest's P&L is computed entirely from simulated
  execution — the proxy never enters the equity curve.

## 8. Reproduce

```
# 1. dataset (candidates + features + outcomes + pivot_ts): read from
#    artifacts/tfo-baseline/raw_dataset.json, or auto-pulled from
#    Supabase when that file is absent (needs SUPABASE_URL +
#    SUPABASE_SERVICE_ROLE_KEY).
# 2. gather + cache 1-minute bars (from the Cloudflare R2 bars bucket;
#    needs R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /
#    R2_BARS_BUCKET).
python3 scripts/ml/backtest_tfo.py --fetch-only
# 3. full backtest
python3 scripts/ml/backtest_tfo.py
```

1-minute bars come from the R2 bars bucket — monthly Databento
ohlcv-1m parquet files, one per symbol/month. Sessions for a
symbol/month the bucket does not yet carry are skipped, and the run
reports the coverage (`sessions_with_bars` / `sessions_total`).

Outputs: `artifacts/backtest/backtest_report.json` (aggregate) and
`artifacts/backtest/trade_ledger.json` (every simulated fill, auditable
line by line).
