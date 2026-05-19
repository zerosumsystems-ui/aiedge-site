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

- **Source**: the analog corpus already committed in the repository
  under `public/analogs/*/session.json` — Databento-sourced 5-minute
  RTH sessions. No live fetch; the backtest runs fully offline. The
  engine also supports `--source daily` (the daily charts under
  `public/data/`) and `--source remote` (a live `/api/bars`), but the
  result of record is the **intraday** run.
- **Resolution**: 5-minute RTH bars. The wedge detector is
  timeframe-agnostic; on intraday bars it finds *intraday* wedges, one
  per RTH session.
- **Universe**: ~11 liquid US equities and index ETFs (AAPL, MSFT,
  NVDA, AMD, TSLA, META, GOOGL, SPY, QQQ, IWM, …) — whatever the
  corpus covers.
- **Sample**: 2,875 sessions; 2,095 wedge breakouts detected; 1,484
  with an executable structural stop (see §5.2).

### 2.1 Price scaling

A subset of the corpus sessions store raw Databento fixed-point
prices (integer nano-dollars, ×1e9). The loader detects a non-price
magnitude (median close > 1e6) and rescales by 1e9. Because every
quantity the backtest reports is a ratio (R-multiples, percentages),
rescaling changes nothing in the result — it only keeps printed
prices and the per-share commission sane. Sessions with a zero or
negative price are dropped.

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

A trade whose structural stop lands closer than **0.15% of price**
(`MIN_RISK_FRAC`) to the entry is **skipped** — a stop that tight is
inside the spread-plus-slippage band and is not a real, executable
trade. This is an execution-realism filter, pre-registered, not a
performance filter: it is applied identically to winners and losers.
It removes 611 of the 2,095 detected breakouts, leaving 1,484.

### 5.3 Target & time stop

Reported as a declared grid — targets {1R, 1.5R, 2R, 3R} × horizons
{20 bars, 40 bars} held before the time-stop. The **primary,
pre-registered** configuration is **2R / 20 bars**. All eight cells
are reported; the primary is headlined. If an edge appears in only one
cell, the report says so — that is noise, not signal.

If neither stop nor target is hit by the horizon, the position is
closed at market on the last bar of the window (time stop).

### 5.4 Intrabar path

The fill simulation walks bars at the detection resolution (5-minute
for the intraday run). When a single bar's range contains both the
stop and the target, the order of touches is unknowable from OHLC, so
the trade is scored **stopped (conservative)**. This can only
understate performance.

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

## 7. Result of record

The intraday run is **net negative**, and the backtest reports that
plainly rather than hunting for a flattering cut:

| Cut (primary 2R / 20 bars) | n | Expectancy | Win | Profit factor |
|---|---|---|---|---|
| All trades | 1,484 | **−0.090R** (CI95 −0.146…−0.034) | 43.4% | 0.83 |
| Falling wedges | 703 | −0.110R | 43.5% | 0.79 |
| Rising wedges | 781 | −0.072R | 43.3% | 0.87 |
| Random-entry benchmark | 1,484 | −0.003R | — | — |

- **Every cell of the 4×2 target/horizon grid is negative.** There is
  no cell to cherry-pick — consistent with "an edge in one cell only
  is noise."
- **The detector's score is mildly anti-predictive**: score tertile 1
  −0.049R, tertile 2 −0.091R, tertile 3 −0.129R. Tighter, more
  converged wedges did *worse*, not better.
- **The edge does not survive costs** — it is already negative at 1×
  and reaches −0.39R at 3× costs.

Read straight: a naive wedge breakout, entered mechanically on the
breakout close with a structural stop, has **no positive edge** on
this 5-minute intraday sample. The benchmark (≈0R) confirms the loss
is the setup, not market drift. The value of this exercise is the
honest negative — the detector and harness are unbiased enough to say
so. Any future wedge strategy would need a genuine filter (context,
regime, confirmation) that this V1 does not have.

## 8. Known limitations

- **Survivorship**: the universe is "today's liquid names." A strict
  review should note the selection itself is hindsight.
- **Intraday-only wedges**: each session is one RTH day, so these are
  *intraday* wedges. A multi-day swing wedge would need a continuous
  daily series — run `--source daily` or `--source remote` once a
  working `/api/bars` is available.
- **5-minute intrabar resolution**: a 5-min bar that straddles stop
  and target is scored as a stop. Conservative, but coarse.
- **Single regime span**: the corpus covers roughly one year. The
  by-tertile and benchmark views are the guards against a lucky
  stretch carrying the result.

## 9. Reproduce

```
# full backtest on the committed intraday corpus (no network)
python3 scripts/ml/backtest_wedge.py

# the unbiased scanner — wedges that broke out in the last 5 bars
python3 scripts/ml/backtest_wedge.py scan

# daily-chart variant / live variant
python3 scripts/ml/backtest_wedge.py --source daily
python3 scripts/ml/backtest_wedge.py --source remote

# simulator unit check (no network)
python3 scripts/ml/backtest_wedge.py --selftest

# detector unit tests (no network)
python3 scripts/live/wedge_detector_test.py
```

Outputs: `artifacts/backtest/wedge_backtest_report.json` (aggregate),
`artifacts/backtest/wedge_trade_ledger.json` (every simulated fill,
auditable line by line), and `artifacts/backtest/wedge_scan.json`
(current live signals).
