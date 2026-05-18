# Wedge Breakout — Backtest Methodology

A backtest of the wedge (converging-trendline) breakout setup, with
simulated execution and realistic transaction costs. This document is
the methodology of record. Every choice below was fixed *before*
results were examined; nothing here is tuned to the equity curve.

Detector: `scripts/live/wedge_detector.py`. Engine + scanner:
`scripts/ml/backtest_wedge.py`. Outputs: `artifacts/backtest/`.

---

## 1. The setup

A wedge is two converging trendlines fit through swing pivots:

- **Rising wedge** — resistance and support both slope up, support
  rising faster, so the channel narrows. Conventionally bearish; the
  trade is the **downside** break (a close below support).
  Direction = `short`.
- **Falling wedge** — resistance and support both slope down,
  resistance falling faster, so the channel narrows. Conventionally
  bullish; the trade is the **upside** break (a close above
  resistance). Direction = `long`.

The pattern alone is not a trade — a wedge is only a signal once it
**breaks out**. The detector emits exactly one signal per wedge, on
the bar whose **close** first prints outside the wedge in the
conventional direction. That bar is the *fire bar*.

Pre-registered thresholds (in `wedge_detector.py`):

| Parameter | Value | Meaning |
|---|---|---|
| `PIVOT_K` | 3 | bars of swing confirmation on each side of a pivot |
| `WEDGE_WINDOW` | 60 | lookback the trendlines are fit within |
| `MIN_PIVOTS` | 3 | confirmed pivots required per trendline |
| `MIN_WEDGE_SPAN` | 12 | minimum bar span the pivots must cover |
| `CONVERGENCE_MAX` | 0.80 | right-edge width must be ≤ 80% of left-edge width |
| `MAX_BARS_SINCE_PIVOT` | 15 | the wedge must be fresh at the breakout |
| `COOLDOWN_BARS` | 10 | one structure emits one signal |
| `LINE_FIT_TOLERANCE` | 0.50 | collinearity guard — pivots must hug their line |

## 2. Data

- **Source**: Databento equity data, served through the application's
  `/api/bars` endpoint. Detection and execution both use **daily RTH
  bars** — wedges are swing-scale patterns, so daily is the natural
  resolution.
- **Universe**: 49 liquid US equities and sector / index ETFs (see
  `UNIVERSE` in `backtest_wedge.py`). Chosen for tight spreads and
  clean daily bars.
- **Window**: 2021-01-01 → 2026-05-15 (~5.4 years of daily bars).

### 2.1 Split adjustment

`/api/bars` data is raw (not split-adjusted). This matters more for a
daily-bar swing strategy than for an intraday one, because a wedge can
span a split. The detector and the simulator are nonetheless
split-robust: a stock split is a clean ratio applied to every price,
so the *shape* of a wedge (slopes, convergence ratio) and every
per-trade quantity (R-multiples, percentage moves) are unchanged by
it. The one exception is a trendline fit across a split date, where
two differently-scaled price regimes are mixed — those few wedges are
noise in the aggregate and are catalogued as a known limitation
(§7).

## 3. Detection — no hindsight

This is the core of "a scanner that isn't biased." The detector emits
a signal for fire bar `n` using only `bars[:n + 1]`:

- **Pivots are confirmed, never hindsight.** A swing pivot at index
  `i` requires `PIVOT_K` bars of lower-high / higher-low context on
  *each* side, so it is only *confirmed* at index `i + PIVOT_K`. When
  the detector evaluates a breakout at bar `n` it uses only pivots
  with `i ≤ n − PIVOT_K`. A live observer would already have seen
  every pivot the detector uses.
- **Trendlines are fit on confirmed pivots only** — never on the
  future.
- **The breakout test is a closed bar's close** crossing a line. The
  fire bar has fully printed by the time the signal is known.
- **Backfill == live.** Because every check at bar `n` reads only
  `bars[:n + 1]`, a historical sweep emits exactly the set of signals
  a streaming bar-by-bar scanner would have emitted in real time.
  There is no separate "backtest detector." This is verified by
  `test_backfill_equals_live_replay` in `wedge_detector_test.py`.
- **No selection of winners.** Every wedge that breaks out is emitted,
  including those that immediately fail. The backtest takes all of
  them.

## 4. No model — no in-sample leakage

The TFO backtest ranks entries with a fitted logistic model and must
therefore use walk-forward validation to avoid leaking the future
into the past. **The wedge strategy fits nothing.** There is no
model, no parameter search, no threshold tuned to the equity curve.
The detector's `score` is a fixed arithmetic formula (pivot-touch
count plus a convergence term). The backtest only *reports* results
bucketed by score; it never optimises against them.

Because nothing is fit, there is no in-sample / out-of-sample
distinction to get wrong — every reported number is, by construction,
out-of-sample.

## 5. Execution simulation

Pre-registered. All parameters fixed before results were seen.
Implemented as the pure function `simulate_wedge_trade`, unit-tested
via `python3 scripts/ml/backtest_wedge.py --selftest`.

### 5.1 Entry

Market order at the **open of the bar following the fire bar**.
Filling at the fire-bar close would be look-ahead — that price has
already printed by the time the signal is known.

### 5.2 Stop — structural

One tick ($0.01) beyond the wedge's most recent pivot:

- Long (falling wedge): below the lowest support pivot used.
- Short (rising wedge): above the highest resistance pivot used.

This is the setup's actual invalidation level — if price falls back
through the wedge, the breakout thesis is wrong. The stop is chosen
by setup structure, not by what optimises the curve.

### 5.3 Target & time stop

Reported as a declared grid — targets {1R, 1.5R, 2R, 3R} × horizons
{20 trading days, 40 trading days}. The **primary, pre-registered**
configuration is **2R / 20d**. All eight cells are reported; the
primary is headlined. If an edge appears in only one cell, the report
says so — that is noise, not signal.

If neither stop nor target is hit by the horizon, the position is
closed at market on the last bar of the window (time stop).

### 5.4 Intrabar path

The fill simulation walks **daily bars**. When a single daily bar's
range contains both the stop and the target, the order of touches is
unknowable from OHLC, so the trade is scored **stopped
(conservative)**. This can only understate performance.

### 5.5 Transaction costs

| Cost | Value | Applied to |
|---|---|---|
| Commission | $0.005 / share, each side | Round trip |
| Entry slippage | 2 bps of price | Market entry crosses the spread |
| Stop slippage | 4 bps of price | Stops are market orders in motion |
| Target slippage | 0 bps | Resting limit order fills clean |

Costs are reported at 1× / 2× / 3× these assumptions. If the edge
does not survive 2× costs, it is fragile and the report states that.

### 5.6 Sizing & P&L

R = the intended per-share risk (ideal entry − stop). Every result is
reported in R-multiples — unit-free, comparable across tickers and
price levels. Net R per trade = (exit fill − entry fill) / R −
commission_R, where the fills include slippage.

## 6. Metrics

- Expectancy (net R / trade) with a bootstrap 95% confidence interval
- Win rate, average win R, average loss R, profit factor
- Cumulative total R, maximum drawdown (R), Sharpe-like ratio
- Segmentation by wedge type (rising vs falling) and by score tertile
- **Benchmark**: a random-entry strategy of *matched frequency and
  holding period*. The wedge edge has to beat plain market drift over
  the same window — if the random benchmark earns as much, the wedge
  signal added nothing.

## 7. Known limitations

- **Survivorship**: the universe is "today's liquid names." All
  traded the full window, so there is no dropped-loser bias inside
  the window — but the selection itself is hindsight and a strict
  review should note it.
- **Splits across a trendline** (§2.1): the handful of wedges whose
  pivots straddle a split date mix two price scales. Immaterial in
  aggregate; catalogued for auditability.
- **Daily intrabar resolution**: a daily bar that straddles stop and
  target is scored as a stop. Conservative, but coarse.
- **One partial market cycle**: 5.4 years is a single broad regime
  span. The by-tertile and benchmark views are the guards against a
  lucky stretch carrying the result.

## 8. Reproduce

```
# full backtest (fetches + caches daily bars under artifacts/)
python3 scripts/ml/backtest_wedge.py

# the unbiased scanner — wedges that broke out in the last 5 sessions
python3 scripts/ml/backtest_wedge.py scan

# simulator unit check (no network)
python3 scripts/ml/backtest_wedge.py --selftest

# detector unit tests (no network)
python3 scripts/live/wedge_detector_test.py
```

Outputs: `artifacts/backtest/wedge_backtest_report.json` (aggregate),
`artifacts/backtest/wedge_trade_ledger.json` (every simulated fill,
auditable line by line), and `artifacts/backtest/wedge_scan.json`
(current live signals).
