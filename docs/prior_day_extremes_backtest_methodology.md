# Prior-Day Extremes — Backtest Methodology

A reproducible, look-ahead-free backtest of the prior-day-extremes
failed-breakout reversal — the setup the `/prior-day-extremes` study
showcases. The shipped study previously headlined a near-coin-flip
(+0.035R, profit factor 1.08) and noted it "still wants filtering
before it becomes a trading rule." This is that filtering work, done
in-repo and honestly.

Engine: `scripts/ml/backtest_prior_day_extremes.py`.
Detector: `scripts/ml/prior_day_extremes_detector.py`.

## The setup

Intraday price pokes through the prior regular-session high (or low),
fails to hold beyond that level, and the **very next bar closes back
inside** it. That next bar is the reversal-confirmation bar; the trade
fades the failed breakout — short a failed high poke, long a failed low
poke. This is the "1_reversal_bar" variant the study headlines.

- **Entry**: the close of the reversal bar.
- **Stop**: just beyond the breakout swing extreme (the higher of the
  poke bar's and reversal bar's high, for a short; mirrored for a long).
- **Target**: 2R from entry (baseline), with a 1R/1.5R/2R/3R sweep.
- A poke must clear the level by ≥ 0.02% to count — screens out bars
  that merely tick the level by a cent.

The detector is a pure function: a signal emitted at reversal bar `r`
reads only `bars[:r+1]`. There is no intrabar look-ahead and nothing is
fit to the data — the detector has no tuned thresholds.

## Data & execution

- 5-minute regular-session bars from the `public/analogs` corpus —
  2,948 sessions, 88 liquid US equities/ETFs, 2025-02 → 2026-05.
- The **prior trading day** is resolved from the corpus' own sorted
  date list: a session has a usable prior-day high/low only when the
  same symbol also traded the immediately preceding calendar date in
  the corpus. 2,716 sessions qualify.
- Corpus sessions up to ~2025-06 store prices in nano-dollars (×1e9);
  sessions from 2025-10 store plain dollars. The loader detects the
  scale per session — without this the engine produces nonsense.
- Each signal is simulated forward bar-by-bar on 5-min bars. First of
  {stop, target} hit wins; a bar straddling both is scored STOPPED
  (conservative). No fill by session close → exit at market.
- Costs: $0.005/share commission, 2 bps entry slippage, 4 bps stop
  slippage — identical to `backtest_spike.py` / `backtest_tfo.py`.
- Results in R-multiples (R = entry − stop). Bootstrap 95% CI on
  expectancy. The last 40% of dates (from 2025-10-07) are held out of
  filter selection as an out-of-sample check.

## Pre-registered filter grid

Ten filters, each scored on its own at the 2R target, all declared
before the run: first-attempt vs repeat attempts, morning vs afternoon
entry, failed-high (short) vs failed-low (long), intraday breakout vs
gap-open, strong reversal bar, EMA20 alignment, small overshoot. Plus
a profit-target management sweep (1R / 1.5R / 2R / 3R) on the strongest
filter.

## Result — a net loser; no filter reaches profit

1,758 reversals simulated across 2,716 prior-day pairs.

- **Baseline (all reversals)**: expectancy **−0.122R**, profit factor
  0.83, win rate 37.8%. Only 29% reach the full 2R target. A clear
  net loser after costs.
- **Strongest filter — first attempt only**: −0.029R, profit factor
  0.95. Skipping repeat pokes at the same level (a Brooks-consistent
  idea) lifts the setup to roughly **breakeven** — but the 95% CI
  ([−0.116, +0.062]) straddles zero, so it is not a positive edge.
- **Every other filter is a loser** — repeat attempts (−0.220R) and
  afternoon entries (−0.199R) are the worst cohorts.
- **Profit-target sweep**: no target multiple turns the first-attempt
  cohort positive — 1R −0.059R, 1.5R −0.062R, 2R −0.029R, 3R −0.052R.
- **Out-of-sample**: the first-attempt cohort is −0.016R in-sample and
  −0.048R out-of-sample — negative in both, CIs cross zero. The
  marginal first-attempt improvement does not replicate.

Verdict: the prior-day-extremes failed-breakout reversal, traded
mechanically on liquid US equities/ETFs in 2025-26, has **no tradeable
edge**. The one lever that helps — taking only the first attempt at a
level — lifts it from a −0.12R loser to roughly breakeven, not into
profit. The page headlines the honest baseline; the improved rule was
not adopted because it does not clear zero in- or out-of-sample. This
is consistent with the repo's other faithfully-backtested setups
(spike, TFO, the Brooks catalog) — all nulls.

## Reproduce

```
python3 scripts/ml/prior_day_extremes_detector_test.py   # detector unit tests
python3 scripts/ml/backtest_prior_day_extremes.py        # full backtest
```

Outputs: `artifacts/backtest/prior_day_extremes_report.json` and the
study page's `public/prior-day-extremes/examples.json`.
