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
| `TREND_LOOKBACK` | 15 | bars before push 1 read to classify flag vs reversal |

## 1.1 Good wedge vs bad wedge — the quality fields

Brooks is explicit that not every three-push wedge is tradeable —
"micro wedges by themselves don't usually lead to major reversals,"
and a wedge that reverses into "a relatively tight bear channel"
should be skipped. The detector does **not** drop the bad ones (that
would bias the sample); instead it tags every wedge with four quality
fields, each lifted directly from the primary source, so the backtest
can *segment* by them and let the data speak. All four were defined
from the book **before** any result was seen.

| Field | Brooks basis |
|---|---|
| `is_flag` | A wedge whose pushes run *against* the larger trend is a wedge *flag* — its reversal is a with-trend trade. Pushes *with* the trend make it a countertrend reversal. |
| `channel_overshoot` | "a bear micro wedge that overshot the trend channel line that could be drawn across the bottoms of the prior three bars." A real wedge's third push pokes *past* the line through pushes 1 & 2, then fails. >0 = overshoot. |
| `reversal_strength` | "the market rarely reverses very far on the first attempt, especially when the signal bar has a close in the middle instead of at its low." 0–1: body × close-at-extreme of the reversal bar. |
| `deepening_pullbacks` | "As a trend wears on, the bulls typically will want deeper pullbacks." A second pullback deeper than the first = the trend losing strength. |

`score` is a fixed, never-tuned weighting of these. §7 reports the
backtest segmented by each field — the actual good-vs-bad answer.

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

### 5.7 Scale-in variant — Brooks Figure 31.5

§5.1–5.6 describe a *single* entry with a tight one-tick structural
stop. Brooks also teaches the opposite execution — *scaling in* — and
the engine simulates it as a second, separately-reported model
(`simulate_wedge_scalein`). From *Reading Price Charts Bar by Bar*,
Fig 31.5 "Scaling into a Pullback":

> "the traders … scaled in at each one-point drop … for two or three
> entries … They could have risked maybe half of the average range,
> or about five points below their first entry."

Encoded, all parameters fixed before any result was seen:

| Parameter | Value | Meaning |
|---|---|---|
| `SCALEIN_TRANCHES` | 3 | Brooks' "two or three entries" |
| `SCALEIN_STEP_FRAC` | 0.5 | add one tranche every 0.5 × base risk *against* the position |
| `SCALEIN_WIDE_STOP_MULT` | 2.0 | one combined stop, 2 × base risk beyond the first entry |
| `SCALEIN_TARGET_MULT` | 1.0 | a modest target, 1 × base risk in favour of the first entry |

`base risk` is the single-entry tight risk (§5.2). Tranche 1 is a
market order at the bar after the reversal; tranches 2–3 are resting
limit orders 0.5 and 1.0 base-risk *against* the position. There is
**one wide stop** for the whole position. A wedge that dips then
recovers fills more tranches at a better basis and wins; only a full
run-through reaches the wide stop. Net R is expressed against the
*combined* risk to that wide stop — a different unit from the
single-entry R, but still "expectancy per unit of capital risked," so
the two models are comparable. §7.3 reports the result.

## 6. Metrics

- Expectancy (net R / trade) with a bootstrap 95% confidence interval
- Win rate, average win R, average loss R, profit factor
- Cumulative total R, maximum drawdown (R), Sharpe-like ratio
- Segmentation by wedge type (top vs bottom), by score tertile, and
  **by each Brooks good/bad-wedge quality field** (§1.1)
- **Benchmark**: a random-entry strategy of *matched frequency and
  holding period*. The wedge edge has to beat plain market drift —
  if the random benchmark earns as much, the wedge signal added
  nothing.
- The single-entry model (§5.1–5.6) and the **scale-in** model
  (§5.7) are reported side by side.

## 7. Result of record

### 7.1 The bare wedge is a loser

Traded as a plain three-push reversal — every wedge taken — the
intraday run is **net negative**, and the backtest reports that
plainly:

| Cut (primary 2R / 20 bars) | n | Expectancy | Win | PF |
|---|---|---|---|---|
| All trades | 790 | **−0.108R** (CI95 −0.194…−0.022) | 40.8% | 0.82 |
| Random-entry benchmark | 790 | −0.002R | — | — |

Every cell of the 4×2 target/horizon grid is negative; the loss
survives at 1× costs and worsens to −0.45R at 3×. The benchmark
(≈0R) confirms the loss is the setup, not market drift.

### 7.2 Good wedge vs bad wedge — what the Brooks markers show

Segmenting the same 790 trades by the four quality fields (§1.1) —
all defined from the book before any result was seen — is where the
good/bad-wedge question gets answered:

| Brooks marker | n | Expectancy | CI95 | PF |
|---|---|---|---|---|
| third push **overshot** the channel line | 214 | **+0.033R** | −0.136…+0.205 | 1.06 |
| third push undershot the channel line | 576 | −0.161R | −0.258…−0.061 | 0.74 |
| wedge flag (with-trend) | 177 | −0.135R | −0.311…+0.050 | 0.78 |
| wedge reversal (countertrend) | 613 | −0.101R | −0.199…−0.001 | 0.83 |
| strong reversal bar (≥ 0.5) | 474 | −0.100R | −0.208…+0.011 | 0.83 |
| **Brooks-clean** (flag + overshoot + strong bar) | 23 | +0.268R | −0.249…+0.808 | 1.58 |

The signal that separates good from bad is exactly the one Brooks
names first: the **trend-channel-line overshoot**. Wedges whose third
push overshot the line break even (+0.033R, PF 1.06); the wedges that
undershot are decisively negative (−0.161R, CI fully below zero). The
mechanical detector independently rediscovered the book's criterion.

Honest caveats, stated plainly:

- The overshoot cut is *break-even, not a proven edge* — its CI still
  straddles zero. It separates "stop losing" from "lose badly," which
  is real but not yet tradeable.
- `is_flag` and `reversal_strength`, on their own, did **not**
  separate edge here — both subsets stayed negative.
- The **Brooks-clean** triple cut looks strong (+0.268R, PF 1.58) but
  n = 23 is far too small; its CI runs −0.25 … +0.81. It is a
  *hypothesis the data suggests*, not a result — it would need
  pre-registered, out-of-sample confirmation before anyone traded it.

Read straight: the bare wedge has no edge, but Brooks' overshoot
criterion is a genuine, source-grounded filter that flips the worst
half of the sample off the table. That is the value of an unbiased
harness — it can both kill the naive strategy and confirm the one
piece of the primary source that actually holds up.

### 7.3 Scale-in (Brooks Fig 31.5) — the execution that works

The single-entry model loses because a tight one-tick stop is run
constantly. Brooks' own alternative — scale in, hold one wide stop
(§5.7) — was simulated on the *same 790 wedges*. It is the first
configuration in this whole study with a bootstrap CI **entirely
above zero**:

| Scale-in model | n | Expectancy | CI95 | Win | PF |
|---|---|---|---|---|---|
| All wedges | 790 | **+0.072R** | **+0.027…+0.116** | 63.0% | 1.30 |
| third push overshot the channel line | 214 | **+0.148R** | **+0.069…+0.222** | 66.8% | 1.81 |
| third push undershot the channel line | 576 | +0.043R | −0.010…+0.095 | 61.6% | 1.17 |

Single-entry on the identical wedges was −0.108R. Scaling in flips it
to +0.072R, CI above zero, win rate 41% → 63%. Only 117 of 790
trades ever reach the wide stop; 387 hit the modest target. Stacking
the one quality marker that held up — the channel overshoot — onto
the scale-in lifts it to +0.148R (PF 1.81), CI clearly positive.

Honest caveats, stated plainly:

- The scale-in config (3 tranches, 0.5-R step, 2-R wide stop, 1-R
  target) was pre-registered from the book — not tuned to this curve.
- Expectancy is **modest** (+0.072R) and `R` here is the *combined*
  risk to the wide stop, so the per-trade edge is small in absolute
  terms. The wide stop also means a worse tail: all-wedges max
  drawdown is −11.5R.
- It is still one ~year intraday corpus, ~11 names, one regime. A
  positive in-sample backtest is a *candidate*, not a proven edge —
  it needs out-of-sample and live-forward confirmation before size.

Read straight: traded Brooks' way — scale in, one wide stop — the
wedge is no longer a null. The single-entry tight-stop version was
losing to its own stop, not to the pattern. This is the first result
in the study that an unbiased harness reports as a genuine, if
modest, positive.

## 8. Known limitations

- **Survivorship**: the universe is "today's liquid names." A strict
  review should note the selection itself is hindsight.
- **Intraday-only wedges**: each session is one RTH day, so these are
  *intraday* wedges. A multi-day swing wedge would need a continuous
  daily series — run `--source daily` or `--source remote` once a
  working `/api/bars` is available.
- **Post-hoc combination**: the four quality fields are pre-registered
  (defined from the book before results), so segmenting by each one is
  legitimate. The *Brooks-clean* triple combination is one step more
  exploratory — it is the conjunction the markers suggest, reported as
  a hypothesis, not a result (§7.2). It needs out-of-sample proof.
- **Confluence not modelled**: Brooks stresses a wedge is strongest
  with *other* factors stacked on it (a higher-timeframe wedge, a
  measured move, a climax). This engine scores only the wedge's own
  geometry and reversal bar — the broader confluence is left to a
  future version.
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
`artifacts/backtest/wedge_trade_ledger.json` (every single-entry
fill), `artifacts/backtest/wedge_scalein_ledger.json` (every scale-in
fill — §5.7), and `artifacts/backtest/wedge_scan.json` (current live
signals). All ledgers are auditable line by line.
