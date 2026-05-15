# Brooks Opening-Spike — Backtest Methodology

A walk-forward-style backtest of Al Brooks' spike-phase setup, built
**faithfully from the primary source** (Brooks, *Trading Price Action:
Trends/Reversals/Trading Ranges*, chapters mined verbatim). Tests
Brooks' explicit claim that a strong spike reaches a measured move
≈ its own height "at least 60 percent" of the time.

Engine: `scripts/ml/backtest_spike.py`. Detector: `scripts/ml/spike_detector.py`.

## The setup — verbatim Brooks

- **Spike** (Trends ch. 43): "a series of trend bars with large bodies,
  very little overlap between adjacent bars, and small tails." Encoded:
  ≥3 consecutive same-direction bars, body ≥ 50% of range, close in the
  top/bottom 25%, each bar's pullback into the prior bar ≤ 25% of the
  prior bar's range.
- **Entry**: "buy the close of the bar that made them believe the trend
  has begun" — the close of the 3rd consecutive spike bar.
- **Stop**: "one tick below the low of the spike."
- **Target**: the measured move — "the number of points from the open
  of the first bar of the spike to the close of the final bar of the
  spike, added to the close of that final bar."
- **Brooks' claim**: "a strong breakout has at least a 60 percent
  chance of reaching a measured move approximately equal to the size
  of the spike."

Nothing tuned. The thresholds were pre-registered in `spike_detector.py`
before any backtest was run.

## Data & execution

- Detection on 5-min RTH bars; fill simulation on 1-minute bars (reuses
  the 2,266-session cache from the TFO backtest — no new fetch).
- 49 liquid US equities/ETFs, Dec 2024 → May 2026.
- Entry/stop/target as above. Walk 1-min bars forward; first of
  {stop, target} hit wins; a 1-min bar straddling both is scored
  STOPPED (conservative). Time stop = session close, market exit.
- Costs: $0.005/share commission, 2 bps entry slippage, 4 bps stop
  slippage — identical to `backtest_tfo.py`.
- Results in R-multiples (R = entry−stop). Bootstrap 95% CI on
  expectancy. Segmented opening-vs-intraday, by direction, by month.
- "Opening spike" = the spike's first bar is within the first 6 RTH
  5-min bars (Brooks' trend-from-the-open zone).

## Result — NULL

1,795 spikes simulated across 2,266 sessions.

- **Brooks' 60% claim is refuted.** Realized measured-move hit rate is
  **36%**, not 60% — a wide miss for liquid US equities, 2024-26.
- **All spikes**: expectancy −0.085R, profit factor 0.81 — a loser.
- **Intraday spikes**: −0.140R, pf 0.71 — clearly negative.
- **Opening spikes**: aggregate +0.044R, pf 1.13 — *looks* positive,
  but the 95% CI is [−0.023, +0.110] (crosses zero) and the by-month
  breakdown is **7 positive months vs 11 negative** — the positive
  aggregate is carried by ~4 strong months (Mar–May 2025, Jan/Apr
  2026). Not a robust edge; consistent with variance.

Verdict: the spike / trend-from-the-open family, traded mechanically on
liquid large-caps in this era, has **no tradeable edge**. Brooks'
published probabilities do not replicate. This is the third rigorous
null in the family (after the TFO backtest and the vault's incr01-08
spike-phase research).

## Reproduce

```
python3 scripts/ml/spike_detector_test.py     # detector unit tests
python3 scripts/ml/backtest_spike.py          # full backtest (uses 1m cache)
```

Outputs: `artifacts/backtest/spike_backtest_report.json`.
