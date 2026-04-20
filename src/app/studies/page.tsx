import Link from 'next/link'

type Producer = 'claude' | 'codex'

type Study = {
  id: string
  producer: Producer
  title: string
  stream: string
  lastRun: string
  takeaway: string
  source: string
  href?: { label: string; url: string }
}

const PRODUCER_LABEL: Record<Producer, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

const PRODUCER_CLASS: Record<Producer, string> = {
  claude: 'bg-teal/10 text-teal border-teal/30',
  codex: 'bg-yellow/10 text-yellow border-yellow/30',
}

const CLAUDE_STUDIES: Study[] = [
  {
    id: 'trend-classification',
    producer: 'claude',
    stream: 'Scanner — trend classification',
    title:
      'Forward-return validation — live gate produces +0.09R at 10-bar horizon (57.1% hit) vs +0.04R baseline on 968 gated reads · edge collapses to −0.10R at EoD',
    lastRun: '2026-04-20 00:22 ET · incr 28',
    takeaway:
      'Incr 28 promotes the trend arc from label persistence (incr 23/26/27) to **price validation on ES futures**. 101 RTH ES.c.0 sessions, 4,887 directional `compute_trend_state` observations, gate passes 968 (19.8%). **Edge curve is hump-shaped**: Δ gate−baseline +0.032R (5b) → +0.051R (10b) → +0.082R (20b) → −0.175R (EoD). The label stays correct to close, but PRICE mean-reverts by ≈ 90 min before close — **do not hold to EoD**. Within the gate, bar-k tapers monotonically (k=20-29 +0.19R; k=60-78 **−0.27R** anti-edge). Three independent confirmations of the incr 26 |s| threshold split: ES |s| ≥ 0.20 bucket is +0.16R while 0.15–0.20 is anti-edge (−0.07R). **Ship recommendation**: use gate for ~25–100 min holds with an optional k ≤ 50 inner filter and an explicit close-out rule before last 90 min of session. Tests still 602/905 green; no production code change yet.',
    source: 'aiedge-vault · Scanner/methodology/trend-contributor-findings-2026-04-20-incr28-forward-return.md',
    href: { label: 'Open Findings → Trend arc', url: '/findings#trend' },
  },
  {
    id: 'spt-research',
    producer: 'claude',
    stream: 'Brooks PA — small-pullback-trend (SPT)',
    title: 'Pt 38 desk digest + SPT_FULL_PLAYBOOK — C3 stack ships at 77.1% WR / +1.91R per trade / DD −2R; Monday clusters: REIT long leadership, FDX standalone, ARKW do-not-chase',
    lastRun: '2026-04-20 01:10 ET · SPT FULL PLAYBOOK + pt 38 cluster cut',
    takeaway:
      'Two new artifacts on top of pt 37. **(1) Full 11-rule playbook backtest**: C3 stack (rules 1-9 + hybrid R-target + rule 10 short-stop + rule 11 opp_tail filter) returns **77.1% WR, +1.91R/trade, max DD −2.00R** across 83 trades / 8 months / 48 symbols. Every acceptance gate clears with daylight; every walk-forward third positive; 35 of 36 leave-one-week-out perR ≥ +1.6R. Cleanest mechanical edge in the entire aiedge research arc. **(2) Pt 38 Monday desk digest** — re-cuts pt 37\'s 244-name cross-TF tier table by sector. Long side resolves into **4 thematic clusters**: REITs (XLRE/SPG/AMT/EQIX, Σ 73.5, 9 A-cells — single highest-quality theme), Semis (ADI/MRVL/ON/AVGO/INTC, Σ 64.3 but only 5 A-cells), Retail (TGT/URBN/CROX, Σ 55.7 with TGT carrying 3 A-cells), and ARKW outlier (Σ 33.4 but B-tier only, 5m near-vertical pb 0.42 — **DO NOT CHASE**). **FDX is the standalone best** — Σ 23.51, 3 A-cells, not in any cluster, so it doesn\'t compete with another book name for exposure budget. Short side: Software complex (ADBE/CRM/ORCL/TEAM/HUBS) + DKNG standalone (2 A-cells). Codex research-review flagged hybrid rule 9 R-map drift in unified-recommendations note (lines 117-120) — H1-short=5R, H2-short=4R, L1/L2=3R per pt 17.',
    source: 'aiedge-vault · Scanner/backtests/SPT_FULL_PLAYBOOK_2026-04-20.md · Brooks PA/concepts/small-pullback-trend-monday-desk-digest-2026-04-20.md',
    href: { label: 'Open Findings → SPT arc', url: '/findings#spt' },
  },
  {
    id: 'phase-research',
    producer: 'claude',
    stream: 'Scanner — phase-spike realtime',
    title: 'Incr 07 (Pattern Lab 7-month replication) — bull-spike fade replicates (−10.7 bps), bear-spike sign-flips (+13.8 → −21.8); spike label adds no incremental edge over session pre-drift',
    lastRun: '2026-04-20 01:40 ET · incr 07',
    takeaway:
      'Independent replication of the incr 06 fade test (which used 640 BPA-detector spike events from a 9-day databento cache) against Pattern Lab\'s `spike_channel` detections over 7 months (2025-09-05 → 2026-04-17, 277 causal-eligible events from 483 raw rows after `chart_json` truncation filter). **Bull-side fade replicates** (−10.7 bps vs −8.7 bps in incr 06, n=27 in flat-pre-drift bin). **Bear-side flips sign** (+13.8 → −21.8 bps, n=14). The bull raw quartile-rank correlation of +0.75 collapses to **+0.11 after OLS-residualising on `pre_drift_open`** — the apparent edge is essentially session pre-drift leakage, not a spike-label signal. **Headline: the spike label itself carries no incremental edge beyond what the session\'s already-visible pre-drift tells you.** Combined with incr 05 (apparent edge was lookahead artifact) and incr 06 (n=44/31 thin sample), the phase arc has now produced three negative replications in a row. **Recommendation: do not promote any phase-spike rule into the scanner.** Read-only; no production code change.',
    source: 'aiedge-vault · Scanner/methodology/phase_spike_realtime_incr07.md · phase_spike_realtime_incr06.md',
  },
  {
    id: 'head-of-strategy',
    producer: 'claude',
    stream: 'Head of Strategy — R&D gating',
    title: 'Late memo: Friday-skip filter + partial-runner template SHIP-GRADE; S2\'\'\'-L-Wide (urg 4 floor) REJECTED — keep urg 5; KEPT mid bar_k 30-47 trim queued for re-test',
    lastRun: '2026-04-20 01:40 ET · HoS late + FLIP_SIGN_WIDE',
    takeaway:
      'Two new offline tests on the existing 162-fire S2\' KEPT+REJ corpus, both shipping; one negative follow-up. **S2\'\'\'-L-Wide REJECTED (01:21 ET):** dropping urgency floor 5 → 4 distorts signal shape rather than diluting it. Urg 4-5 marginal slice n=15 has WR 46.7% / E[R] +0.40R headline, but bar_k sub-structure **inverts**: in the urg 5-7 core the edge lives early (bar_k≤29: WR 61.5% / +0.85R), in urg 4-5 the edge is absent early (WR 30% / −0.10R) and lives in a tiny late-session pocket (n=5 / +1.40R). Keep urg 5 floor. **HoS late memo (01:40 ET) ships two filters from 6 new stratifications.** (1) **Friday filter** — Fridays are a consistent drag (KEPT urg 5-7 Fridays 11.8% WR n=17 E[R] −0.65R; S2\'\'\'-L Fridays 28.6% n=7); skip-or-0.33×-size on Fridays lifts aggregate KEPT E[R] from ~+0.18R → ~+0.43R at 22% density cost. Single-line predicate, biggest WR lift per LOC. (2) **Partial-runner template** — MFE on S2\'\'\'-L wins (n=20) shows 25% reach ≥4R and 40% reach ≥3R; current 2R cap leaves real R on the table; partial 50% at 1R + trail rest past 2R lifts per-win E[R] by est +0.20-0.30R without changing fire density. (3) **KEPT mid bar_k 30-47 trim** queued as research lead — n=23 with WR 26.1% / E[R] −0.22R sits between healthy early (WR 60% / +0.80R) and late (WR 40% / +0.19R) shoulders, but needs fresh-corpus re-test before shipping. **Live stack is now 3 ship + 2 ship-eligible: S1 C3 + S2\' Tier-A + S2\'\'\'-L-baseline + Friday-filter + partial-runner; L1-overweight still queued.**',
    source: 'aiedge-vault · Meta/Head of Strategy 2026-04-20-late.md · Scanner/backtests/FLIP_SIGN_S2PRIME_WIDE_2026-04-20.md',
  },
  {
    id: 'code-organization',
    producer: 'claude',
    stream: '/organize-my-code scheduled task',
    title: 'Run #26 — /studies refreshed against fresh 01:0x Codex (10/10) + Claude SPT C3-ships + phase-incr07 negative replication + HoS-late ships Friday-filter + partial-runner',
    lastRun: '2026-04-20 01:33 ET · run #26',
    takeaway:
      'Schema growth: **15 cards** this run (5 Claude + 10 Codex) — added a 5th Claude card for the **phase-research arc** (incr 06 → incr 07 negative replication; spike label adds no incremental edge over session pre-drift across 3 increments now). All 10 Codex streams refreshed against ~01:00-01:08 ET memory.md timestamps. Open archive set unchanged: `BPA-Bot-1` 4.3 G (Codex code-review opened a new ib_insync eager-import bug here that breaks pytest collection); `Gap-ups` 2.8 G; `Finviz-clone` 510 M; `market-dashboard` 3.4 M (Codex performance-audit rotated here this run — index.html grew +50.7%, but the bigger problem is request fan-out: 22 upstream Polygon calls per screener visit); `microgap-bot` 336 K. Active-to-move set: `Brooks-Price-Action` 70 M, `trading-range` 210 M (still 6 open criticals), `mean-reversion` 22 M. **Codex `claude-updates` flagged a real operational bug**: `com.will.trading-reports` launchd job points at a missing `run.py` and is scheduled to fire at 16:15 ET today — needs gate or fix before then. **Both Codex `claude-updates` and last run\'s code-org explicitly recommended making `/studies` data-driven** instead of TSX edits per refresh; deferred pending Will sign-off (still inside management contract for now). Dual-write fix held — vault/Meta/Code Organization 2026-04-20_0133.md is the only write.',
    source: '~/code/routines/FINDINGS_2026-04-20_0133.md · vault/Meta/Code Organization 2026-04-20_0133.md',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Tenth iteration — reframes Brooks as a spectrum/state-machine model; ties balance/trend transitions to local `range_day_detector_v3.py` + `analyze_range_system.py`',
    lastRun: '2026-04-20 01:03 ET',
    takeaway:
      'Local-only research pass against the Brooks reference corpus + local Brooks notes + the local `~/trading-range` project. **Key reframe**: Brooks is a spectrum / state-machine model rather than a rigid named-stage cycle — phases blend continuously and transitions are themselves first-class objects, not just edges between named states. **Key bridge to local code**: tied Brooks balance/trend transitions to the existing `range_day_detector_v3.py` and `analyze_range_system.py` modules in `~/trading-range`. Re-rendered Codex-authored deliverable at `~/.codex/automations/research/market_cycle_phases_codex.md`. Tenth iteration in this arc; the named-phase loop from earlier iterations holds, but the spectrum framing gives a cleaner mapping to existing trading-range detection code.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Rotated to BPA-Bot-1 / mean-reversion / gaps — found 3 new bugs: BPA-Bot-1 eager `ib_insync` import breaks pytest collection; gaps/topstepx partial-fill misclass; mean-reversion paper bridge fails open',
    lastRun: '2026-04-20 01:05 ET',
    takeaway:
      'First rotation off `~/trading-range` (which still carries 6 open criticals, but no fresh edits this run). Three new high-confidence findings on the active stack: **(1) `~/BPA-Bot-1/live_trader.py` + `executor_factory.py` eagerly import `ib_executor` and `ib_insync`** — this breaks `pytest tests/test_live_trader.py` collection on any non-IB environment (collection itself errors with `eventkit`/`ib_insync` current-event-loop error). Test run cannot even reach the test bodies. Lazy-import behind the IB executor branch is the obvious fix. **(2) `~/gaps/topstepx/topstepx_trader.py`** treats any status containing `"fill"` as a full fill — partial-fill responses would trigger full-size exit-order placement, which would over-exit position. Real money risk if TopStepX returns partials. **(3) `~/mean-reversion/paper_trade_bridge.py` fails open when the Trader 1 strict-scan CSV cannot be loaded or generated** — would let conflicting Trader 2 tickets through the gate even when the gate is "ON". Should fail closed (block all Trader 2 fires) when the CSV is unavailable. Verification: mean-reversion test suite passed (`test_paper_trade_bridge.py`); BPA-Bot-1 test suite failed at import (the bug being reported).',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'Rotated to `~/market-dashboard` — index.html grew +50.7% (18,974 → 28,588 B), but bigger problem is request fan-out: 22 upstream Polygon calls per screener visit',
    lastRun: '2026-04-20 01:03 ET',
    takeaway:
      'Audited `~/market-dashboard` as the active performance target (no prior memory file, so this run establishes the baseline). **Frontend size delta in latest commit**: `index.html` grew from 18,974 → 28,588 bytes (+9,614 B, **+50.7%**). **Highest-leverage regression is request fan-out, not bundle size**: initial `refreshAll()` triggers 6 browser/API requests AND 6 upstream Polygon requests; first screener visit adds 2 more browser/API requests AND **up to 22 upstream Polygon requests** (`/api/screener` snapshot + `/api/candles` fan-out for 21 tickers). **Top fixes recommended**: (a) shared server-side caching for Polygon snapshot/aggregate responses; (b) collapse screener candle loading so it doesn\'t fan out 21 upstream calls per interaction; (c) stop refetching chart data on every resize — redraw from cached data instead; (d) parallelize movers fetches and split inline JS/CSS into cacheable assets. **Evidence gap**: could not collect live browser traces or API latency from this environment (external network access restricted) — next run should capture waterfall/Lighthouse or endpoint timings from a reachable deployment. Run time: ~10 min.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'Same hotspots — `aiedge/scanner` still the worst. `BPA-Bot-1` partially fixed (added `ib_insync`); new low-effort find: `Finviz-clone` + `aiedge/site` on Next 16 with no `.nvmrc` checked in',
    lastRun: '2026-04-20 01:05 ET',
    takeaway:
      'Revalidation against prior report. **aiedge/scanner** still clearest manifest split-brain: `pyproject.toml` keeps `databento>=0.70,<1` + small core deps; `requirements.txt` still says `databento>=0.38.0` and carries actively-imported runtime deps missing from `pyproject.toml` (`anthropic`, `elevenlabs`, `httpx`, `Pillow`, Google API/auth libs). **aiedge/site**: range-vs-lock drift only — `snaptrade-typescript-sdk` declared `^9.0.164`, locked at `9.0.181`. **BPA-Bot-1** improved versus prior — `requirements.txt` now includes `ib_insync>=0.9.86,<1.0`. Remaining clear gap: `mplfinance` (imported by `daily_rs_rankings.py`, no entry in `requirements.txt`). **Gap-ups** still has underdeclared Python deps — both `requirements.txt` files only list `databento>=0.40.0` + `pandas>=2.0.0`, while `run_live.py` and `data/databento_client.py` import at least `numpy`, `requests`, `ib_insync`. **New low-effort runtime alignment item**: `Finviz-clone` and `aiedge/site` both use Next 16 with lockfiles showing `next` requires Node `>=20.9.0`, but neither repo has `.nvmrc` / `.node-version` checked in. Next run: still start with `aiedge/scanner` → pick single source of truth, align `databento` floor, backfill missing deps; then `Gap-ups`; then JS runtime version files.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Fourth run — HoS promotes S2\'\'\'-L to live-eligible long filter; phase incr06 had lookahead in baseline (edge fades on causal); maintenance load avg hit 45.37 by 00:29 ET',
    lastRun: '2026-04-20 01:04 ET',
    takeaway:
      'Diff since 00:02 baseline. **Highest-signal positive**: `Head of Strategy 2026-04-20.md` promotes S2\'\'\'-L from idea to live-eligible long filter, sharpens with early-session concentration (`bar_k ≤ 29`) and a mid-range "Goldilocks" deficit window, kills the short-side mirror explicitly. **Highest-signal negative**: DCCS remains dead (`DCCS_OFFLINE_2026-04-20.md` failed both WR and expectancy gates offline) — should stay deferred until spec changes materially. **Phase work weakened further, not strengthened** — `phase_spike_realtime_incr06.md` shows incr 05 had lookahead in its drift baseline; once replaced with causal pre-drift inputs, the apparent spike edge fades and no scanner change should ship. **Trend converged another step** — incr 28 ES gate is useful for ~25-100 min holds but collapses by EoD, so the finding should stay hold-horizon-specific instead of being promoted as a general directional edge. **Operations got worse, not better**: `Maintenance Log 2026-04-20-0003.md` shows load average reached **45.37 by 00:29 ET**, `dashboardserver` is still down, and `com.will.trading-reports` still points at a missing `run.py` before its scheduled **16:15 ET fire today** — sweeps themselves are now clearly low-yield and should be gated or reduced. **Best next focus**: 1) fix or disable `com.will.trading-reports` before 16:15 EDT, 2) reduce/gate overnight `maintenence`/`management` runs, 3) add contradiction-check before research notes/cards publish, 4) move `/studies` to a canonical generated data source, 5) check whether the 01:03 ET `backtest` run produced a combined trend+SPT result worth promoting.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Fifth review — pt 37 unified-recs verified against scratch JSON (244-name claim, tier counts, short desert all hold); new R-map + expectancy-headline drift in lines 117-130 of unified note',
    lastRun: '2026-04-20 01:04 ET',
    takeaway:
      'Fifth review this arc. Re-ran `/tmp/spt_scan_pt37/unify.py` and verified the 2026-04-20 `small-pullback-trend-unified-recommendations-2026-04-20.md` against `/tmp/spt_scan_pt37/{ranked,tiered,cross_tf}.json`. **Verified as correct**: 244-name merged universe claim; per-timeframe top picks and tier-depth counts; structural conclusion that daily and 60m have zero A/B-tier shorts with short exposure concentrated 30m-and-below. **Local source grounding holds**: `scanner/aiedge/signals/components.py` and `scanner/aiedge/context/daytype.py` match the scoring methodology note; Brooks extracts in `brooks-source/extracted/trading-price-action-trends/57_trend-from-the-open-and-small-pullback-trends.md` and `...reversals/51_the-best-trades-putting-it-all-together.md` support the SPT framing. **New / confirmed doc drift in unified-recommendations note**: (a) **lines 117-120 misstate hybrid rule 9** — validated mapping from pt 17 is `5R if setup ∈ {H1,H2} else 3R`, capped at 4R for shorts → H1-short = 5R, H2-short = 4R, L1/L2 = 3R; (b) **lines 123 and 130 still use the older pt 27 C3 headline `+1.84R/trade`** — consolidated PLAYBOOK\'s later rerun reports C3 `n=83`, `perR=+1.909`, `DD=−2.00`. Treat the unified note\'s expectancy headline as historical unless refreshed.',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: 'Established `~/microgap-bot` as Trader 1 canonical (Trader 2 stays in `~/mean-reversion`); upgraded strict defaults to walk-forward primary profile — primary holdout 538 trades / +0.62R / PF 2.39',
    lastRun: '2026-04-20 01:07 ET',
    takeaway:
      'Establishes `~/microgap-bot` as the Trader 1 canonical system; `~/mean-reversion` stays as Trader 2 infrastructure. **Upgraded Trader 1 strict defaults** in `~/microgap-bot/config.py` to the walk-forward primary profile from `~/gaps/paper/`: ATR `0.7-1.2`, `stack ≥ 4`, session `10:30-15:55 ET`, minimum `R/ATR ≥ 0.20`, minimum realized risk `$0.20/share`, fixed `3R`. Added exact clock-window + minimum risk-dollar filtering in `research_signal_engine.py`; added reusable historical comparison runner `run_portfolio_research.py`; updated `README.md`. **Validation**: 8 tests pass; portfolio research holdout (start 2025-09-01) → **legacy strict** 1,920 trades / +0.3941R / PF 1.72 vs **primary WF** 538 trades / **+0.6248R** / **PF 2.39**. Best primary-holdout symbols by expectancy: `SPY`, `QQQ`, `TQQQ`, `TSLA`, `AMD`. Strict scan on `2026-03-20` returns 1 QQQ setup under stricter profile (down from looser prior scan). Artifacts at `~/microgap-bot/logs/trader1_portfolio_research_20260420_010717.{txt,json}`. **Likely next step**: use the research output to add symbol-level prioritization or capital weighting rather than narrowing the universe blindly — all 9 symbols stayed positive in the primary holdout sample.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: 'Pushed Trader 1 gate + execution feasibility into `scan_latest_session.py` — pre-queue review now shows `Trader 1 Gate` + `Execution Summary` + actionable ticket rows instead of raw setup list',
    lastRun: '2026-04-20 01:07 ET',
    takeaway:
      'Follow-up to last run\'s default-on Trader 1 gate. Made `scan_latest_session.py` the canonical pre-queue review surface by reusing the same Trader 1 strict-gate and execution-feasibility logic already enforced in `paper_trade_bridge.py`. **Code changes**: `scan_latest_session.py` now accepts `--trade-symbol`, `--rr`, `--risk-usd`, `--block-trader1-csv`, `--no-auto-trader1-gate`, `--block-window-minutes`. The scan output now prints a `Trader 1 Gate` section, an `Execution Summary`, executable ticket rows, and blocked/skipped reasons — using the paper-bridge helper flow instead of raw setup-only visibility. Added `test_scan_latest_session.py` covering both a Trader 1 blocked preview and an actionable preview. Updated `README.md` so scan command is documented as a pre-queue executable preview. **Verification**: `pytest -q` → 4 passed; live run `--ticker NQ --trade-symbol MNQ --date 2026-03-19` → Trader 1 gate `ON (auto_csv)`, preview shows **2 actionable MNQ tickets, 0 skipped**; output matches `paper_trade_bridge.py` (2 actionable, 0 skipped). **Next step**: push the same metadata into the live shared queue / TopStepX consumer logs so downstream tooling can explain why Trader 2 signals were skipped without needing the scan script.',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Fifth run — added manager freshness check; flags when Trader 1 memory is newer than the council report so stale council reports don\'t look authoritative',
    lastRun: '2026-04-20 01:02 ET',
    takeaway:
      'Fifth run. Champion call unchanged: `Strict Micro-Gap Stack` remains the champion, account `DUP346003` is still configured in `~/gaps/ibkr`, and `~/gaps/logs/ibkr` is still empty — blocker remains missing paper-runtime evidence. **Found a real manager blind spot**: Trader 1\'s memory is newer than Trader 1\'s council report, but the manager report did not explicitly call out that freshness gap and could let the stale report look authoritative. **Updated `manager_report.py`** to: (a) add a freshness note when Trader 1 memory is newer than the council report; (b) distinguish exploratory BPA or `microgap-bot` sidecar work from actual drift when the latest memory still keeps IBKR paper validation as the next gate. Regenerated `latest_report.md` — now states that Trader 1\'s memory is the authoritative status until the trader refreshes the council report. Verification: `py_compile` + report regeneration clean. **Current management instruction**: keep Trader 1 focused on a real `setup_ibkr.py` + `ibkr_trader.py --demo` paper run with TWS or IB Gateway open; treat Trader 1\'s latest memory as source of truth until next council report regenerates.',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Fifth run — refreshed Trader 2 inputs (regime gate + scan); champion stays `NQ Z-Score Balance Gate` (OOS PF 1.80, +0.51R E[R]); still smoke-verified, not runtime-verified',
    lastRun: '2026-04-20 01:04 ET',
    takeaway:
      'Refreshed Trader 2 management inputs instead of relying on cached report: re-ran `run_regime_gate_research.py`, `scan_latest_session.py --ticker NQ`, and `manager_report.py`. **Fresh artifact timestamps** at 01:03-01:04 ET: regime gate report and summary JSON regenerated; latest_report.md regenerated. **Current evidence did not change the management call**: champion stays **`NQ Z-Score Balance Gate`** with **OOS PF 1.80** and **expectancy +0.5089R**. Latest scan still shows **2026-03-19 candidates**: `15:00 SHORT PASS` for `ZSCORE_BAL` and `14:10 SHORT PASS` for `BB_VALUE`. **Trader 2 remains `smoke-verified` but not `runtime-verified`** — `~/gaps/logs/topstepx/trades_2026-04-20.log` only contains `SMOKE ACCEPTED` lines for `T2_MNQ_BB_VALUE_2026-03-19_1410_SHORT` and `T2_MNQ_ZSCORE_BAL_2026-03-19_1500_SHORT`; no `Entry order submitted`, `ENTRY FILLED`, `STOP FILLED`, or `TARGET FILLED` lines exist anywhere under `~/gaps/logs/topstepx`. **Management instruction unchanged**: do not reopen bridge build-out work; the next meaningful proof is the first authenticated TopStepX paper run during live market hours.',
    source: '~/.codex/automations/trader-manager-2/memory.md',
  },
]

function StudyCard({ study }: { study: Study }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 md:p-5">
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRODUCER_CLASS[study.producer]}`}
        >
          {PRODUCER_LABEL[study.producer]}
        </span>
        <span className="text-xs text-sub">{study.stream}</span>
        <span className="text-xs text-sub ml-auto">{study.lastRun}</span>
      </div>
      <h3 className="text-sm md:text-base font-semibold text-text mb-2 leading-snug">
        {study.title}
      </h3>
      <p className="text-xs md:text-sm text-text/80 leading-relaxed mb-3">
        {study.takeaway}
      </p>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <code className="text-[11px] text-sub bg-bg/60 rounded px-1.5 py-0.5 truncate max-w-full">
          {study.source}
        </code>
        {study.href && (
          <Link
            href={study.href.url}
            className="text-xs text-teal hover:text-teal/80 underline underline-offset-2 shrink-0"
          >
            {study.href.label} →
          </Link>
        )}
      </div>
    </div>
  )
}

const GROUPS: { heading: string; blurb: React.ReactNode; studies: Study[] }[] = [
  {
    heading: 'Claude Code',
    blurb: (
      <>
        Scheduled research inside the aiedge stack. Trend classification and SPT
        findings are also rendered as featured cards on the{' '}
        <Link href="/findings" className="text-teal underline underline-offset-2">
          Findings
        </Link>{' '}
        tab; the code-organization stream lives as markdown in the routines repo.
      </>
    ),
    studies: CLAUDE_STUDIES,
  },
  {
    heading: 'Codex',
    blurb: (
      <>
        Parallel audits running under the Codex CLI. Every stream keeps its own
        append-only <code className="bg-bg/60 rounded px-1.5 py-0.5 text-text/80">memory.md</code>{' '}
        at <code className="bg-bg/60 rounded px-1.5 py-0.5 text-text/80">~/.codex/automations/&lt;stream&gt;/</code>.
        These runs never touch the aiedge repos directly — they surface findings
        for review only.
      </>
    ),
    studies: CODEX_STUDIES,
  },
]

export const metadata = {
  title: 'Studies — AI Edge',
  description:
    'Unified index of autonomous research runs from Claude Code and Codex routines.',
}

export default function StudiesPage() {
  return (
    <article className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal mb-1">
          Research archive
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-text mb-2">Studies</h1>
        <p className="text-sm text-sub leading-relaxed max-w-2xl">
          Every finding produced by an autonomous routine, from both AI harnesses on
          this Mac mini. Claude Code runs the aiedge scanner research arcs, the
          head-of-strategy R&amp;D gate, and the{' '}
          <code className="bg-bg/60 rounded px-1.5 py-0.5 text-text/80">/organize-my-code</code>{' '}
          scheduled task. Codex runs parallel audits — market-structure research,
          cross-repo code review, performance, SDK drift, activity monitoring,
          research verification, and a trader/manager supervision split. This page
          is read-only; rule changes still require explicit sign-off.
        </p>
      </header>

      {GROUPS.map((group) => (
        <section key={group.heading} className="mb-10">
          <h2 className="text-xl md:text-2xl font-bold text-text mb-4 pb-2 border-b border-border">
            {group.heading}
          </h2>
          <p className="text-sm text-sub leading-relaxed mb-5 max-w-2xl">
            {group.blurb}
          </p>
          <div className="space-y-4">
            {group.studies.map((s) => (
              <StudyCard key={s.id} study={s} />
            ))}
          </div>
        </section>
      ))}

      <footer className="border-t border-border pt-6 text-xs text-sub space-y-2">
        <p>
          Full long-form notes live in the{' '}
          <Link href="/knowledge" className="text-teal underline underline-offset-2">
            Knowledge Base
          </Link>
          . Trend + SPT run-level detail stays on the{' '}
          <Link href="/findings" className="text-teal underline underline-offset-2">
            Findings
          </Link>{' '}
          tab.
        </p>
        <p>
          Codex memory files are local to this Mac mini and are not synced to the
          aiedge-vault — see the source paths on each card for the canonical copy.
        </p>
      </footer>
    </article>
  )
}
