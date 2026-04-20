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
    title: 'Run #27 — stable checkpoint. All 10 Codex streams advanced to 02:02-02:15 ET (3 substantive: trader-1 portfolio allocator shipped, research-review found 3 BPA-Bot-1 first-pullback report bugs, trader-manager-1 flagged "don\'t symbol-weight until IBKR paper"). Claude arcs unchanged since 01:40 ET',
    lastRun: '2026-04-20 02:39 ET · run #27',
    takeaway:
      '15 cards unchanged (5 Claude + 10 Codex). All 10 Codex memory files advanced to 02:02-02:15 ET vs prior 01:02-01:08 ET. **Three substantive new Codex signals this run**: (1) **trader-1 02:06** shipped `portfolio_allocator.py` into `~/microgap-bot` — research-backed portfolio ranking + risk weighting replaces flat per-symbol sizing; 10 tests pass; strict-scan CSV now includes `portfolio_rank`/`portfolio_weight`/`portfolio_risk_budget_usd` columns. (2) **research-review 02:15** rotated off SPT to **BPA-Bot-1 first-pullback research** and re-ran backtest (1488 signals / 1485 trades; Swing 3:1 best by P&L at +$641.63 / 36.4% WR / PF 1.66); found **3 real report bugs**: `generate_first_pullback_report.py` hardcodes strategy table+narrative+pie-chart counts (drift risk), max DD computed in ticker-grouped order not global chronological (invalidates cross-ticker comparisons), Fixed-point `r_multiple` uses original signal risk instead of fixed stop distance (Avg R not comparable). (3) **trader-manager-1 02:02** updated `manager_report.py` to derive Trader 1 memory context dynamically and describe microgap-bot drift as research/portfolio work — **current instruction: do not let Trader 1 spend cycles on symbol weighting until IBKR paper validation is done**. **CROSS-STREAM TENSION**: Trader 1 went ahead and shipped portfolio allocator at 02:06; Trader Manager 1 said "not yet" at 02:02. Manager will surface this in next run. **Claude arcs unchanged since 01:40 ET** — no new increments on trend (incr 28), SPT (pt 38), phase (incr 07), or HoS. **Time-bound risk still open**: `com.will.trading-reports` plist still points at missing `~/.openclaw/rs-reports/run.py`; fires 16:15 ET today (~13h out). Re-verified by Codex claude-updates 02:05. Dual-write fix held — this file (`Code Organization 2026-04-20_0239.md`) is the only vault write. Two stale pre-fix duplicates still at `~/code/` root (safe-to-delete on go-ahead).',
    source: '~/code/routines/FINDINGS_2026-04-20_0239.md · vault/Meta/Code Organization 2026-04-20_0239.md',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Eleventh iteration — reworked market-cycle note into cleaner Codex-authored structure with phase map + local figure anchors + explicit Brooks state-machine framing; validated against 4 new Brooks source files',
    lastRun: '2026-04-20 02:05 ET',
    takeaway:
      'Second pass in the same session following 01:03 iteration. **Reworked the market-cycle note into a cleaner Codex-authored structure** with a phase map, local figure anchors, and an explicit Brooks state-machine framing. **Validated conclusions against 4 local Brooks source files**: `market_spectrum.txt`, `always_in.txt`, `trading_range_taxonomy.md`, `major_trend_reversals.md`. Added direct links to local Mac mini materials — Brooks chart corpus, local study notes, `~/trading-range` project. **Decision retained** from iteration 10: Brooks is best modeled as `breakout → trend → pullback → range → breakout test → resumption or MTR`, not as a fixed ritual stage list. Spectrum framing from earlier iteration still holds. Deliverable refreshed at `~/.codex/automations/research/market_cycle_phases_codex.md`. Eleventh iteration in this arc; increment is structural clarity, not new substantive framing.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Targeted review of new `scan_latest_session.py` wrapper — no new bugs; tests + live CLI both pass. Residual: Trader 1 gate fail-open behavior in paper bridge persists',
    lastRun: '2026-04-20 02:05 ET',
    takeaway:
      'Follow-up scoped to code changed since last run — reviewed the newly-touched `~/mean-reversion/scan_latest_session.py` wrapper and `test_scan_latest_session.py`. **No new findings** in the delta. **Verification**: `pytest /Users/williamkosloski/mean-reversion/test_scan_latest_session.py` passed; `python3 /Users/williamkosloski/mean-reversion/scan_latest_session.py --ticker NQ --trade-symbol MNQ` ran successfully against local data. **Residual risk carried from 01:05**: the scanner still inherits the previously-logged **fail-open Trader 1 gate behavior** from `paper_trade_bridge.py` when the strict-scan CSV cannot be loaded/generated. That bug was not touched this run; the 3 findings from 01:05 (BPA-Bot-1 eager ib_insync import / gaps/topstepx partial-fill misclass / mean-reversion fail-open) remain the active queue. Keep the 01:05 findings list as the canonical code-review open set — this run is a clean-delta confirmation only.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'Re-audit of `~/market-dashboard` — no new commit after `0dd4c4b`, so no additional regression. Deepened evidence: 10,721 B inline CSS + 11,103 B inline JS; serial-fetch movers + resize-refetch still intact',
    lastRun: '2026-04-20 02:04 ET',
    takeaway:
      'Re-audit, not fresh target. **No new commit landed after `0dd4c4b` since last run**, so there is no additional regression since the 01:03 baseline. **Deepened evidence on current hotspots**: `index.html` remains 28,588 B, now broken down as **10,721 B inline CSS + 11,103 B inline JS** (~77% of the file). `refreshAll()` still issues 6 app requests + 6 upstream Polygon requests. First screener load still issues 2 app requests + up to 22 upstream Polygon requests. `window.addEventListener("resize", loadCharts)` **still refetches SPY and QQQ on every resize event**, and `loadCharts()` does those fetches serially. `loadMovers()` **still fetches gainers and losers sequentially instead of in parallel**. **Highest-leverage fixes unchanged**: server-side caching for snapshot/aggregate responses; replace screener candle fan-out with cached/batched data or lazy-load only visible cards; stop network refetch on resize (redraw from cache + debounce); split inline CSS/JS into cacheable static assets. **Evidence gap remains**: no live latency/waterfall measurements available in restricted environment — next run should capture deployed endpoint timings or Lighthouse traces. Run time: ~9 min.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'Full rescan — `Finviz-clone` only JS repo with matching `package.json`/`package-lock.json` pair. Highest JS drift: `tradescope`, `stock_screener_pro/frontend`, `market-dashboard` (missing lockfiles). Python: `trading-range/live` fully unpinned',
    lastRun: '2026-04-20 02:02 ET',
    takeaway:
      'Full rescan of git repos under `~/` for dependency manifests, lockfiles, SDK pins. **JS landscape**: `Finviz-clone` is the **only JS repo with a matching `package.json`/`package-lock.json` pair** — its declared Next 16.1.6 / React 19.2.4 stack is mirrored in the lockfile. **Highest JS drift risk**: `tradescope`, `stock_screener_pro/frontend`, and `market-dashboard` all have `package.json` files but **no lockfiles** or explicit Node/`packageManager` pin. `market-dashboard` is especially under-specified — `package.json` only has `private=true` while serverless API code relies on modern fetch semantics. **Python landscape**: mostly from duplicate or weakly-pinned requirements — BPA-Bot-1 archive requirements lag the active file; Gap-ups has **duplicated identical `requirements.txt` files**; `trading-range/live` is **fully unpinned**; `stock_screener_pro/backend` pins packages but only loosely pins Python via `python:3.11-slim`. **Recommended minimal plan**: (1) add lockfiles + runtime pins to the JS repos first; (2) consolidate duplicate Python manifests second; (3) only then decide whether to align shared library majors across Vite apps. This run\'s rescan is broader than 01:05\'s delta — treat this as the canonical drift map.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Fifth run — new baseline scan. Claude research summary: SPT C3 ship-grade, DCCS dead, phase-spike demoted, ES trend gate hold-horizon-specific. Re-verified `com.will.trading-reports` still broken',
    lastRun: '2026-04-20 02:05 ET',
    takeaway:
      'New baseline after earlier diff runs. **Heavy overnight scheduled-task usage in aiedge** — `maintenence`, `organize-my-code`, `phases`, `trends`, `head-of-strategy`, `management`, `sync-vault-to-prod`, `aiedge-trades-tab`, `aiedge-self-review-tab`, `backtest`, `aiedge-journal-tab`. **Claude research currently says**: SPT C3 stack is strong and ship-grade; S2\'\'\'-L / Friday-filter / partial-runner work is the main strategy refinement track; DCCS remains dead; phase-spike work weakened materially after causal checks (do not promote); ES trend gate useful for 25-100 min holds, not EOD. **Both Claude code-org and Codex analysis converged** on making `/studies` data-driven from a canonical generated source instead of repeatedly editing `src/app/studies/page.tsx`. **Maintenance/management sweeps appear overscheduled and low-yield** — logs explicitly suggest gating or reducing frequency. **CRITICAL time-bound re-verification**: `~/Library/LaunchAgents/com.will.trading-reports.plist` **still points to `~/.openclaw/rs-reports/run.py` which does not exist**; plist is set to run Mon-Fri 16:15 ET. Fires today (2026-04-20) in ~13h. **Repo state**: `aiedge/site` modified studies/symbol/trades + untracked `BarsChart.tsx`; `aiedge/scanner` ahead 10, many modified/untracked research tools + scratch; `aiedge/vault` many new untracked research/ops notes. **Next run focus**: check whether `com.will.trading-reports` was fixed, retired, or allowed to fail after 16:15 ET window; diff newest Claude project JSONLs; watch whether `/studies` moves toward generated data.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Rotated to BPA-Bot-1 first-pullback research — re-ran backtest (1,488 signals / 1,485 trades); found 3 real report bugs: hardcoded strategy table, ticker-grouped max DD, fixed-point r_multiple uses wrong risk denominator',
    lastRun: '2026-04-20 02:15 ET',
    takeaway:
      'Sixth review this arc; first rotation off SPT. Scope: **BPA first-pullback research under `~/BPA-Bot-1`**; re-ran `python3 -m research.backtests.backtest_first_pullback_strategies`. **Current reproduced result on bundled Databento data**: 1,488 signals, 1,485 filled trades. **Reproduced headline strategy stats**: `Swing 3:1` best by total P&L at **+$641.63, 36.4% WR, PF 1.66**; `Fixed $1/$2` best by PF at **PF 1.77, +$465.22, Avg R +1.237**; `Scalp 1:1` at 58.1% WR, PF 1.45, +$280.41. **3 verified research/report bugs**: (1) `generate_first_pullback_report.py` **hardcodes strategy table values, narrative findings, and pie-chart counts** — the PDF can drift from the live backtest and is internally inconsistent on current data; (2) `backtest_first_pullback_strategies.py` **computes max drawdown in ticker-grouped trade order instead of global chronological order** — invalidates cross-ticker DD comparisons; (3) **fixed-point strategy `r_multiple` uses the original signal risk instead of the fixed stop distance** — so `Avg R`/`Median R` are not comparable to the fixed-point risk model. **Verification gap**: no dedicated automated regression tests for the first-pullback detector; existing `research/tests` coverage is mostly exploratory scripts + a general engine contract check.',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: 'Shipped `portfolio_allocator.py` — research-backed portfolio ranking + risk weighting replaces flat per-symbol sizing; wired into strict-live `run.py` and strict-scan CSV; 10 tests pass',
    lastRun: '2026-04-20 02:06 ET',
    takeaway:
      'Follow-on to 01:07\'s next-step recommendation. **Implemented the next Trader 1 layer** in `~/microgap-bot`: research-backed portfolio ranking and risk weighting instead of flat per-symbol sizing. **Added `portfolio_allocator.py`** — auto-loads latest `trader1_portfolio_research_*.json`, ranks symbols by `primary_wf` holdout expectancy, shrinks weights by sample size, clips to conservative range, falls back to neutral if no report exists. **Wired into `run.py` strict-live mode** so simultaneous signals are ranked globally across symbols before order placement; per-trade dollar risk now follows symbol weight. **Extended `order_manager.py`** so strict-live orders can override default `RISK_PER_TRADE_USD` with a setup-specific risk budget. **Extended `research_scan.py` and strict-scan CSV** to surface `portfolio_rank`, `portfolio_weight`, `portfolio_risk_budget_usd`, `portfolio_expectancy_r`, `portfolio_holdout_trades`. Added `test_portfolio_allocator.py`. **Validation**: 10 tests pass. Strict scan on `2026-03-20` — allocator loaded `logs/trader1_portfolio_research_20260420_010717.json`; ranked live weights SPY, QQQ, TQQQ, TSLA, AMD, …; the QQQ setup was annotated with rank 2 and risk budget **$675.00**. **⚠ Cross-stream tension**: Trader Manager 1 at 02:02 ET said "do not let Trader 1 spend cycles on symbol weighting until IBKR paper validation is done" — Trader 1 shipped the allocator 4 min later. Manager will re-surface on next run.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: 'Runtime-only marker at 02:09 ET — no code changes this cycle. 01:07 pre-queue review surface stands as the current state (Trader 1 Gate + Execution Summary + actionable ticket rows in `scan_latest_session.py`)',
    lastRun: '2026-04-20 02:09 ET',
    takeaway:
      'Heartbeat run — memory.md received a runtime timestamp but **no new code changes were recorded**. **Current state stands from 01:07**: `scan_latest_session.py` is the canonical pre-queue review surface. Accepts `--trade-symbol`, `--rr`, `--risk-usd`, `--block-trader1-csv`, `--no-auto-trader1-gate`, `--block-window-minutes`. Scan output prints `Trader 1 Gate` section + `Execution Summary` + executable ticket rows + blocked/skipped reasons via the paper-bridge helper flow. `test_scan_latest_session.py` covers blocked + actionable previews. Last validation: `pytest -q` → 4 passed; live run `--ticker NQ --trade-symbol MNQ --date 2026-03-19` → Trader 1 gate `ON (auto_csv)`, preview shows **2 actionable MNQ tickets, 0 skipped**; output matches `paper_trade_bridge.py`. **Queued next step (unchanged)**: push the same metadata into the live shared queue / TopStepX consumer logs so downstream tooling can explain why Trader 2 signals were skipped without needing the scan script.',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Sixth run — flagged manager-report accuracy gap after Trader 1\'s 01:07 pivot: generator still hardcoded IBKR-paper context. Manager now derives Trader 1 memory context dynamically; describes microgap-bot drift as research/portfolio work',
    lastRun: '2026-04-20 02:02 ET',
    takeaway:
      'Sixth run. **Management call unchanged at the system level**: `Strict Micro-Gap Stack` remains the champion, account `DUP346003` still configured in `~/gaps/ibkr`, `~/gaps/logs/ibkr` still empty — blocker remains missing paper-runtime evidence. **Found a concrete manager-report accuracy gap after Trader 1\'s 01:07 memory update**: the generator still hardcoded that Trader 1 memory pointed at IBKR paper execution, even though the newest memory section had pivoted toward `microgap-bot` portfolio research. **Updated `manager_report.py`** to derive the Trader 1 memory context dynamically and to describe `microgap-bot` drift as research or portfolio work rather than execution work. Regenerated `latest_report.md` — now explicitly says Trader 1 memory is pointing toward `microgap-bot` research / portfolio refinement while management keeps the next gate anchored to IBKR paper validation. Verification: `py_compile` + report regeneration clean. **Current management instruction**: **do not let Trader 1 spend the next cycle on symbol weighting or portfolio refinement until `setup_ibkr.py` + `ibkr_trader.py --demo` produce runtime evidence in `~/gaps/logs/ibkr`**. *(Note: Trader 1 02:06 shipped the portfolio allocator 4 min after this instruction was written. Cross-stream tension — Manager will re-surface next run.)*',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Sixth run — heartbeat only (memory refreshed 02:02 ET, no new content section). Champion call stands: `NQ Z-Score Balance Gate`, OOS PF 1.80, expectancy +0.5089R; still smoke-verified, not runtime-verified',
    lastRun: '2026-04-20 02:02 ET',
    takeaway:
      'Heartbeat run. Memory file refreshed 02:02 ET but **no new content section appended past 23:03 ET 04-19** — management call stands. **Current state from last substantive run**: champion stays **`NQ Z-Score Balance Gate`** with **OOS PF 1.80** and **expectancy +0.5089R**. Latest scan still shows **2026-03-19 candidates**: `15:00 SHORT PASS` for `ZSCORE_BAL` and `14:10 SHORT PASS` for `BB_VALUE`. **Trader 2 remains `smoke-verified` but not `runtime-verified`** — `~/gaps/logs/topstepx/trades_2026-04-20.log` only contains `SMOKE ACCEPTED` lines for `T2_MNQ_BB_VALUE_2026-03-19_1410_SHORT` and `T2_MNQ_ZSCORE_BAL_2026-03-19_1500_SHORT`; no `Entry order submitted`, `ENTRY FILLED`, `STOP FILLED`, or `TARGET FILLED` lines exist anywhere under `~/gaps/logs/topstepx`. **Management instruction unchanged**: do not reopen bridge build-out work; the next meaningful proof is the first authenticated TopStepX paper run during live market hours.',
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
