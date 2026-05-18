# Small-Pullback Setup — Backtest Methodology

A backtest of the Brooks with-trend small-pullback setup, with
simulated execution and realistic transaction costs. Pre-registered:
every choice below was fixed before results were examined.

Engine: `scripts/ml/backtest_pullback.py`. Output:
`artifacts/backtest/pullback_backtest_report.json`.

## 1. Why this setup

The trend-from-the-open and opening-spike backtests are both nulls.
Brooks' primary source predicts that: breakouts and reversals fail far
more often than they work ("about 80 percent of trading-range
breakouts fail", "about 80 percent of trend-reversal attempts fail" —
`src/content/blog/traders-equation.md`). The setup Brooks rates
*high*-probability is the opposite — a with-trend entry on a small
pullback inside an established trend. This backtest tests that setup,
which the scanner already detects but which had never been backtested.

## 2. The setup

A signal fires (`scripts/live/pullback_detector.py`) when, on 5-minute
RTH bars:

- a strong impulse leg runs ≥ 3 bars and covers ≥ 2.0 × ATR;
- a brief shallow pullback follows — 1 to 4 bars, retracing ≤ 50 % of
  the impulse, holding the 20-EMA (a ≤ 0.75 × ATR poke is allowed);
- price then trades one tick past the prior bar's extreme — the
  with-trend prior-bar breakout-stop entry.

The EMA trend filter is the `always-in` State Layer; the retrace/depth
test is `channel-pressure`; the bar-count caps are `leg-count`. The
signal only fires when those states already agree, so no post-hoc
state filter is layered on — that is what keeps this a clean test.

## 3. Detection — no hindsight

The detector is a pure sliding window: a fire at bar *i* uses only
`bars[:i+1]`. It emits the same signals fed a streaming buffer or a
full array. Detection is on 5-minute bars; fills are simulated on
1-minute bars.

## 4. Execution simulation

Pre-registered, and identical in spirit to the TFO/spike engines.

- **Entry**: a resting stop order at the prior bar's extreme. It fills
  intrabar on the fire bar — the simulation finds the first 1-minute
  bar that trades through the trigger price.
- **Stop**: one tick beyond the pullback's far side (Brooks' structural
  invalidation). A signal whose resulting risk is below 5 bps of price
  is skipped — a stop that tight sits inside the spread and is not a
  real, tradeable stop (it flags a degenerate flat/illiquid bar).
- **Target & time stop**: a declared grid — {1, 1.5, 2, 3} R ×
  {2 h, end-of-session}. Primary, pre-registered cell: **2R / 2h**.
- **Intrabar path**: 1-minute bars. A bar that straddles both stop and
  target is scored stopped (conservative).
- **Costs**: $0.005/share/side commission, 2 bps entry slippage, 4 bps
  stop slippage, 0 bps target slippage. Reported at 1× / 2× / 3×.

## 5. Data

Same Cloudflare R2 1-minute Databento feed as the TFO backtest,
including the nano-dollar price-scale normalisation (see
`tfo_backtest_methodology.md` §2). The run covers whatever sessions the
R2 bucket carries — the report's `coverage` block records the symbol
set, which is currently a subset of the full 49-name universe.

## 6. Reading the result

The headline is the primary cell on every detected signal. If the 95 %
bootstrap CI of expectancy straddles zero the verdict is a null; if it
sits wholly below zero the setup is a net loser. The detector's own
rule-based score (never fit to P&L) drives a decile breakdown — a flat
profile is evidence the score does not rank tradeability.
