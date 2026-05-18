# Index-Futures Backtest Methodology

A faithfulness test: the Brooks setups, run on the market Brooks' books
are actually written about — the US equity index futures.

Engine: `scripts/ml/backtest_futures.py`. Output:
`artifacts/backtest/futures_backtest_report.json`.

## 1. Why

The TFO, opening-spike and small-pullback backtests all run on liquid
single-stocks and ETFs, and all return null-to-negative. Brooks'
primary source, however, illustrates its price-action claims on the
E-mini S&P futures. Before concluding the setup family has no edge,
it has to be tested on the instrument the source material describes.

## 2. Instruments & data

The four US equity index futures the R2 bucket carries — **ES, NQ,
YM, RTY** — front-month continuous contracts, 1-minute Databento
`ohlcv-1m`, full 2019-2026 history. Chosen before the run: these are
Brooks' instruments. The other 18 R2 futures (energy, metals, rates,
FX, crypto) are deliberately *not* swept — picking the best of 22
markets after the fact would be a curve-fit.

Roll gaps in a continuous contract are overnight, so within any single
RTH session every bar is one contract on one price scale — the same
argument the TFO methodology makes for stock splits. The nano-dollar
price-scale guard from the equity loader is applied here too.

## 3. Method

Identical, reused code to the equity backtests — nothing re-tuned:

- Sessions are the RTH cash window (09:30-16:00 ET).
- Detection on 5-minute bars; fills simulated on 1-minute bars.
- Pullback: `backtest_pullback.simulate` — pre-registered 2R/2h cell,
  1-tick structural stop, 5-bps risk floor.
- Spike: `backtest_spike.simulate` — Brooks measured-move target.
- Costs: $0.005/side commission, 2/4 bps entry/stop slippage.
- R-multiples are unit-free, so contract point values and tick sizes
  never enter the arithmetic — the futures result is directly
  comparable to the equity result.

## 4. Reading the result

Headline is the pooled cohort per setup; per-instrument and per-year
breakdowns guard against one market or one regime carrying it. A 95 %
bootstrap CI that straddles zero is a null; one wholly below zero is a
net loser.
