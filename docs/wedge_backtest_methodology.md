# Wedge Reversal — Backtest Methodology

A backtest of the **Brooks three-push wedge** reversal setup, with
simulated execution and realistic transaction costs. This document is
the methodology of record. Every choice below was fixed *before*
results were examined; nothing here is tuned to the equity curve.

Detector: `scripts/live/wedge_detector.py`. Engine + scanner:
`scripts/ml/backtest_wedge.py`. Outputs: `artifacts/backtest/`.

---

## 1. The setup — faithful to the source

The generic chart-book "wedge" is any pair of converging trendlines.
That is **not** what this detector trades. The source of record is
Al Brooks, *Trading Price Action: Reversals* (Wiley, 2012), whose
wedge — the same primary source the TFO and spike detectors are built
on — is a specific **three-push reversal**:

> Price makes three pushes in the same direction, each push reaching a
> new extreme; the moves lose momentum (the third push is weaker than
> the second); then price reverses, and the reversal is the trade.

So a Brooks wedge has two halves:

1. **Three pushes** — three swing highs `H1 < H2 < H3` (a *wedge top*,
   bearish) or three swing lows `L1 > L2 > L3` (a *wedge bottom*,
   bullish), each separated by a pullback, with the **third push
   decelerating** — its height is at most 85% of the second push's.
2. **The reversal** — the first reversal bar after the third push: a
   down bar closing below the prior bar's low (wedge top → trade
   `short`) or an up bar closing above the prior bar's high (wedge
   bottom → trade `long`).

The detector emits exactly one signal per wedge, at the *emission
bar* (§3). Pre-registered thresholds (in `wedge_detector.py`):

| Parameter | Value | Meaning |
|---|---|---|
| `PIVOT_K` | 3 | bars of swing confirmation on each side of a pivot |
| `WEDGE_LOOKBACK` | 80 | the three pushes must fall inside the last 80 bars |
| `MIN_WEDGE_SPAN` | 12 | push 1 → push 3 must span ≥ 12 bars |
| `DECELERATION_MAX` | 0.85 | push 3 height ≤ 85% of push 2 — momentum waning |
| `MAX_REVERSAL_GAP` | 8 | the reversal must come within 8 bars of push 3 |
| `COOLDOWN_BARS` | 10 | one wedge structure emits one signal |

## 2. Data

- **Source**: the analog corpus already committed in the repository
  under `public/analogs/*/session.json` — Databento-sourced 5-minute
  RTH sessions. No live fetch; the backtest runs fully offline. The
  engine also supports `--source daily` (the daily charts under
  `public/data/`) and `--source remote` (a live `/api/bars`); the
  result of record is the **intraday** run.
- **Resolution**: 5-minute RTH bars. The detector is timeframe-
  agnostic; on intraday bars it finds *intraday* wedges, at most one
  or two per RTH session.
- **Universe**: ~11 liquid US equities and index ETFs (AAPL, MSFT,
  NVDA, AMD, TSLA, META, GOOGL, SPY, QQQ, IWM, …) — whatever the
  corpus covers.
- **Sample**: 2,875 sessions; 1,107 wedge reversals detected; 790
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
a signal for emission bar `n` using only `bars[:n + 1]`:

- **Pushes are confirmed pivots, never hindsight.** A swing pivot at
  index `i` requires `PIVOT_K` bars of lower-high / higher-low context
  on *each* side, so it is only *confirmed* at index `i + PIVOT_K`.
  The detector uses only pivots with `i ≤ n − PIVOT_K`.
- **The reversal is a closed bar.** Its close has fully printed by the
  time the signal is known.
- **The emission bar** is `max(reversal bar, H3 + PIVOT_K)` — the
  first bar at which a live observer could know *both* that the third
  push was a genuine pivot *and* that price reversed. Entry is
  simulated at the next bar's open (§5.1).
- **Backfill == live.** Every check at bar `n` reads only
  `bars[:n + 1]`, so a historical sweep emits exactly the set of
  signals a streaming bar-by-bar scanner would have emitted in real
  time. There is no separate "backtest detector." Verified by
  `test_backfill_equals_live_replay` in `wedge_detector_test.py`.
- **No selection of winners.** Every three-push-then-reverse wedge is
  emitted, including the ones whose reversal immediately fails.

## 4. No model — no in-sample leakage

The TFO backtest ranks entries with a fitted logistic model and must
therefore use walk-forward validation to avoid leaking the future
into the past. **The wedge strategy fits nothing.** There is no
model, no parameter search, no threshold tuned to the equity curve.
The detector's `score` is a fixed arithmetic formula (a base plus a
deceleration term). The backtest only *reports* results bucketed by
score; it never optimises against them.

Because nothing is fit, there is no in-sample / out-of-sample
distinction to get wrong — every reported number is, by construction,
out-of-sample.

## 5. Execution simulation

Pre-registered. All parameters fixed before results were seen.
Implemented as the pure function `simulate_wedge_trade`, unit-tested
via `python3 scripts/ml/backtest_wedge.py --selftest`.

### 5.1 Entry

Market order at the **open of the bar following the reversal (fire)
bar**. Filling at the fire-bar close would be look-ahead — that price
has already printed by the time the signal is known.

### 5.2 Stop — structural

One tick ($0.01) beyond the **third push's extreme** — Brooks' wedge
stop. A wedge-top short is wrong if price runs back above the third
push high; a wedge-bottom long is wrong below the third push low. The
stop is chosen by setup structure, not by what optimises the curve.

A trade whose structural stop lands closer than **0.15% of price**
(`MIN_RISK_FRAC`) to the entry is **skipped** — a stop that tight is
inside the spread-plus-slippage band and is not a real, executable
trade. This is an execution-realism filter, pre-registered, not a
performance filter: it is applied identically to winners and losers.
It removes 317 of the 1,107 detected reversals, leaving 790.

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
- Segmentation by wedge type (top vs bottom) and by score tertile
- **Benchmark**: a random-entry strategy of *matched frequency and
  holding period*. The wedge edge has to beat plain market drift —
  if the random benchmark earns as much, the wedge signal added
  nothing.

## 7. Result of record

The intraday run is **net negative**, and the backtest reports that
plainly rather than hunting for a flattering cut:

| Cut (primary 2R / 20 bars) | n | Expectancy | Win | Profit factor |
|---|---|---|---|---|
| All trades | 790 | **−0.108R** (CI95 −0.194…−0.022) | 40.8% | 0.82 |
| Wedge tops (short) | 414 | −0.095R | 41.3% | — |
| Wedge bottoms (long) | 376 | −0.123R | 40.2% | — |
| Random-entry benchmark | 790 | −0.002R | — | — |

- **Every cell of the 4×2 target/horizon grid is negative.** There is
  no cell to cherry-pick — consistent with "an edge in one cell only
  is noise."
- **The detector's score is anti-predictive**: score tertile 1
  −0.032R, tertile 2 −0.117R, tertile 3 −0.175R. The wedges with the
  hardest-decelerating third push — the "best" Brooks wedges by the
  score — did *worst*.
- **The edge does not survive costs** — already negative at 1× and
  −0.45R at 3× costs.

Read straight: the Brooks three-push wedge, traded mechanically as a
standalone reversal on this 5-minute intraday sample, has **no
positive edge**. The random-entry benchmark (≈0R) confirms the loss
is the setup, not market drift. The value of this exercise is the
honest negative — the detector and harness are unbiased enough
(no hindsight, no cherry-picked cell, every reversal taken) to say so
rather than flatter the strategy. A tradeable wedge would need the
context Brooks himself stresses — the trend the wedge sits in, the
strength of the reversal bar, follow-through — which this purely
mechanical V1 deliberately omits.

## 8. Known limitations

- **Survivorship**: the universe is "today's liquid names." A strict
  review should note the selection itself is hindsight.
- **Intraday-only wedges**: each session is one RTH day, so these are
  *intraday* wedges. A multi-day swing wedge would need a continuous
  daily series — run `--source daily` or `--source remote` once a
  working `/api/bars` is available.
- **Context omitted**: Brooks treats the wedge as a reversal *in
  context* (a trend losing strength, a strong signal bar). This V1
  scores only the geometry. That omission is deliberate — it isolates
  whether the bare pattern has an edge — and §7 is the answer: it
  does not.
- **5-minute intrabar resolution**: a 5-min bar that straddles stop
  and target is scored as a stop. Conservative, but coarse.
- **Single regime span**: the corpus covers roughly one year. The
  by-tertile and benchmark views are the guards against a lucky
  stretch carrying the result.

## 9. Reproduce

```
# full backtest on the committed intraday corpus (no network)
python3 scripts/ml/backtest_wedge.py

# the unbiased scanner — wedges that reversed in the last 5 bars
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
