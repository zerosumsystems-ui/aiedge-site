# First-EMA-Touch — Backtest Methodology

A clean, no-look-ahead rebuild of the `/ema-touches` study's backtest.
The original engine and export script are Mac-only — only the finished
`public/ema-touches/examples.json` ever shipped — so its numbers could
not be audited. This rebuild is in-repo, auditable, and was run against
the full bar cache in the cloud.

Engine: `scripts/ml/backtest_ema_touch.py`. Detector:
`scripts/ml/ema_touch_detector.py`. Data layer: `scripts/ml/bars_store.py`.
Outputs: `artifacts/backtest/ema_touch_report_2024.json` and
`ema_touch_report_2025.json`.

Every methodology choice below was pre-registered in the detector and
engine source *before* the backtest was run. Nothing is tuned to the
equity curve.

---

## 1. The setup

The first pullback into the 10 or 20 EMA after a small trend — the
setup the `/ema-touches` gallery showcases. A session opens, price puts
in a small with-trend leg, then pulls back and, for the **first** time,
a bar's range reaches the EMA. That first-touch bar is the signal; the
trade is with-trend (a pullback to the EMA in an uptrend is a long).

Mechanically (`ema_touch_detector.py`, all thresholds fixed up front):

- **Trend** — ≥ 3 consecutive bars closed on the trend side of the EMA,
  the EMA sloped that way, and price extended ≥ 1.5 × ATR away from the
  EMA ("a small trend", not noise around the average).
- **Touch** — the first later bar whose low (long) / high (short)
  reaches the EMA and that did not close decisively through it (a
  ≤ 0.25 × ATR poke is allowed; pullbacks routinely overshoot intrabar).
- **One signal per session** — the first qualifying touch in either
  direction. That "first" is the whole premise of the study.

Six variants are tested, each an (EMA period, stop rule, target rule):
`ema20_1r`, `ema20_2r`, `ema10_1r`, `ema10_2r`, `ema20_mm` (measured
move = the trend leg's height) and `ema20_atr2r` (a 1 × ATR stop, 2R
target).

## 2. Data

- **Source** — Databento 1-minute RTH bars (the same per-ticker-month
  parquet files `scripts/build/render_full_sessions.py` reads).
  Detection runs on 5-minute bars resampled from them; the fill
  simulation runs on the 1-minute bars.
- **Bar store** — the cloud container is ephemeral and the repo cannot
  hold a multi-GB cache, so the parquet files live in a Cloudflare R2
  bucket; `bars_store.py` pulls the ticker/months it needs on demand
  (`R2_*` env vars). A populated local `~/data/databento/` short-circuits
  the round trip — same code path.
- **Universe** — 36 liquid US names: 24 mega-cap single stocks + 12
  index/sector/leveraged ETFs.
- **Window** — 2024 (in-sample, the year the original study reported)
  and 2025 (a genuine out-of-sample year). 7,056 and 7,000 sessions
  loaded respectively.

## 3. Detection & EMA seeding — no hindsight

A fire at bar *i* uses only `bars[:i + 1]` and the EMA value at *i* —
both of which a trader knows once bar *i* has closed. The detector was
unit-tested for this (`ema_touch_detector_test.py`).

The EMA is **seeded with the prior trading day's continuous RTH closes**
(recursive `ewm(adjust=False)`), matching how `render_full_sessions.py`
seeds the chart EMA. On the first session of a month the seed is empty
and the EMA warms up from the open.

## 4. Execution simulation

Pre-registered; identical cost model to `backtest_spike.py` /
`backtest_tfo.py`.

- **Entry** — the **close of the touch bar**. That is the price a
  trader acts on once the touch bar has printed.
- **Stop** — 1 tick beyond the touch bar's extreme (for `ema20_atr2r`,
  1 × ATR beyond it).
- **Target** — an R-multiple of risk, or the measured move.
- **Intrabar path** — the touch bar's own range is **never** used to
  score the trade. The fill simulation walks 1-minute bars strictly
  **at or after** the touch bar's 5-minute close. First of {stop,
  target} hit wins; a 1-minute bar straddling both is scored **stopped**
  (conservative); an unresolved trade exits at the last bar's close.
- **Costs** — $0.005/share commission round-trip, 2 bps entry slippage,
  4 bps stop slippage, 0 bps on the resting-limit target.

This is the single most important difference from the original engine.
The shipped `examples.json` enters on the touch bar and shows ~40 % of
trades exiting on that **same** 5-minute bar — i.e. the touch bar's own
high/low decided the trade. That is intrabar look-ahead, and it inflates
the win rate. This engine removes the ambiguity by construction.

## 5. The minimum-risk filter

A first-EMA-touch with only a couple of ticks of risk is not a real
trade — slippage and commission alone swamp the R, and the resulting
R-multiple is meaningless. A setup is kept only if its risk is at least
**5 ticks AND 15 bps of the entry price**; otherwise it is dropped and
counted under `filtered_untradable`, not scored.

This filter removes the bulk of raw touches — roughly 75 % of sessions
for the 1-tick-stop EMA20 variants. The original study counted these
few-tick setups, which is the main reason its trade count (n ≈ 19,600)
dwarfs this rebuild's.

## 6. Bias guards

Baked into the report so the verdict cannot be cherry-picked:

- **Every variant is reported** — no best-of-N spotlight. The original
  study headlined `ema20_1r` (its best of four).
- **A stocks-only cut** — index / sector / leveraged ETFs fire
  correlated, non-independent trades, so a pooled 95 % CI over a
  mixed universe is too tight.
- **A by-day cluster-robust expectancy** — each session date collapses
  to one observation, so a day with many correlated same-session
  trades counts once.

## 7. Result — NULL (a net loser)

The first-EMA-touch setup, honestly backtested, **has no tradeable
edge. Every variant loses money, after costs, in both years.**

Pooled across all six variants:

| Window | n | win | expectancy | 95 % CI | profit factor | total |
|---|---|---|---|---|---|---|
| 2024 (in-sample) | 15,461 | 38.5 % | **−0.153 R** | [−0.176, −0.130] | 0.80 | −2,367 R |
| 2025 (out-of-sample) | 12,958 | 36.7 % | **−0.202 R** | [−0.228, −0.177] | 0.74 | −2,617 R |

Per variant, expectancy lands between −0.12 R and −0.24 R; every
profit factor is below 1.0; every 95 % CI sits entirely below zero.
The one CI that so much as touches zero is `ema20_mm` on the 2024
stocks-only cut (−0.086 R, CI [−0.219, +0.045]) — still negative at
the point estimate. In-sample and out-of-sample agree, so this is not a
single-regime fluke; it is simply not an edge.

**Against the shipped study.** `public/ema-touches/examples.json`
reports a pooled +0.084 R and headlines an "EMA20 1R stock sweep" at
59 % wins / +0.186 R / profit factor 1.47. The clean rebuild of that
exact variant, on the exact same in-sample year, is **−0.196 R**
(−0.201 R stocks-only). A swing of nearly 0.4 R per trade — with no
change to the setup definition, only the removal of intrabar
look-ahead and the untradable few-tick touches — is the measure of the
bias. The published verdict is an artifact and should not be trusted.

This is consistent with the sibling studies: the Brooks opening-spike
backtest is a null, and the TFO backtest is breakeven-at-best. A
mechanical first-EMA-touch entry on liquid US equities belongs in the
same column.

## 8. Reproduce

```
python3 scripts/ml/ema_touch_detector_test.py    # detector unit tests
python3 scripts/ml/backtest_ema_touch_test.py    # engine-invariant tests
python3 scripts/ml/backtest_ema_touch.py --start 2024-01-01 --end 2024-12-31 \
    --out artifacts/backtest/ema_touch_report_2024.json
python3 scripts/ml/backtest_ema_touch.py --start 2025-01-01 --end 2025-12-31 \
    --out artifacts/backtest/ema_touch_report_2025.json
```

The backtest needs the 1-minute bar cache — either a populated local
`~/data/databento/` or the four `R2_*` environment variables (see
`.env.local.example`).
