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
      'Incr 29 equity forward-return — the ES EoD reversal is ES-specific. 120 equity RTH sessions / 58 symbols / 4,478 reads: edge ramps monotonically +0.40R (5b) → +0.77R (10b) → +1.63R (20b) → +1.71R (EoD) with 67–73% hit rate. Don\'t apply the incr 28 "suppress gate at k≥60" rule globally — it\'s actively harmful on equities.',
    lastRun: '2026-04-20 04:30 ET · incr 29',
    takeaway:
      'Incr 28 left an open question: is the ES hump-shape (+0.20R at 20b, **−0.10R at EoD**) universal or asset-specific? Incr 29 repeats the same analysis on **120 US equity RTH sessions / 58 symbols / 4,478 directional reads** from the scanner 1-min cache. **Answer: equities do NOT have the reversal.** Equity gate `|s| ≥ 0.15 AND k ≥ 20` (n=1,804 gated across 4,478): 5b +0.40R (60.1%) → 10b +0.77R (63.3%) → 20b +1.63R (73.2%) → **EoD +1.71R (67.0%)**. The stricter ES knob `|s| ≥ 0.20` on equities is even better (EoD +2.10R / 72.7%). **Strength gradient is monotonic** (0.05–0.10 +0.17R → 0.30–0.50 +0.66R at 66.1% hit). **Honest caveat**: equity absolute magnitudes are 8–10× ES because the 1-min cache is scanner-biased toward volatile sessions, not a representative universe. **The SHAPE (rising monotonically through EoD vs humping and reverting) is the portable finding**; the magnitude needs a Databento XNAS.ITCH re-fetch on a fixed symbol list before being production-bankable. **Practical implication**: any dashboard showing the live gate on BOTH asset classes needs an `asset_class` axis. ES wants 25–100 min holds; equities tolerate hold-to-close. Asset-class strength split from incr 26 (0.15 equity / 0.20 ES) stays; asset-class horizon guidance is NEW. Tests 602/905 still green; zero scanner production code changes.',
    source: 'aiedge-vault · Scanner/methodology/trend-contributor-findings-2026-04-20-incr29-equity-forward-return.md',
    href: { label: 'Open Findings → Trend arc', url: '/findings#trend' },
  },
  {
    id: 'spt-research',
    producer: 'claude',
    stream: 'Brooks PA — small-pullback-trend (SPT)',
    title: 'New trade-level companion (06:35 ET) — all 83 C3 trades reviewed bar-by-bar. WR cleared 60% every month except Dec-25 (1 trade, −1R). Best days Wed/Fri (87%+/100%). **Half of all trades resolve at chart_end, not target** — hold-to-resolution stays ship-critical; early flatten truncates both 5R winners and positive chart_end fills. Codex research-review 06:05 ET confirmed TZ bug reproduces + caught 2 new doc-drift items in pt 37 prose. Directional ship verdict holds.',
    lastRun: '2026-04-20 06:35 ET · trade-level review (+ 06:05 Codex re-verify)',
    takeaway:
      'New artifact this hour: **`2026-04-20-spt-trade-level-review.md` + `2026-04-20-spt-c3-trades.csv`** (same C3 population as the 03:37 full playbook, now viewed trade-by-trade). **Monthly WR floor holds**: Aug 60%, Sep 66.7%, Oct 66.7%, Nov 50%, Dec 0% (n=1, single −1R month), Jan 87.5%, Feb 75%, Mar 60%, Apr 94.1% (17 trades MTD, strongest month — **stack is working *better* as the book grows**). **Worst 5 trades** are all textbook SPT with-trend continuations invalidated by the tape (none are bad-logic trades). **Day-of-week**: Wed n=32 87.5% / Fri n=6 100% / Thu n=21 66.7% / Tue n=14 64.3% / Mon n=10 70% — every day clears the 60% floor. **Signal-hour**: 10:00 n=5 100% +3.64R, 11:00 n=27 77.8% +2.25R, 12:00 n=22 77.3% +2.05R, 13:00 n=29 72.4% +1.18R — 11:00/12:00 carry the book with cleanest WR×perR combo. **Exit-reason mix**: 49.4% resolve at chart_end (no target, no stop), 28.9% at target, 21.7% stop — the most important live-trading insight: **early flatten truncates winners**. **5 biggest winners** all longs on H1/H2 at +5R (urgency span 4–8, confirming urg ≥ 4 is the right floor). **Verdict: ships without reservation** (77.1% WR on full C3 / 67.9% deduped / +18–27 pts over Will\'s 40–50% WR floor / worst LOO-week subset still +1.61R/trade). **Codex research-review 06:05 re-verified**: TZ bug still reproduces (fixed-offset C3 n=83 WR 77.1% perR +1.909 vs America/New_York C3 n=90 WR 73.3% perR +1.957 DD −2.153); pt 37 + pt 38 numerically match backing JSON files; **new doc-drift caught** — pt 37 prose says `L1/L2 short → 4R` but code uses `L1/L2 → 3R`; `H1 short → 5R` omitted from prose; expected-economics lines still cite stale `74.6% / +1.84R` from older 71-trade study. Watchlist ranking locally verified; execution/backtest prose partially verified until TZ + target-map drift fixed.',
    source: 'aiedge-vault · Scanner/backtests/2026-04-20-spt-trade-level-review.md · ~/.codex/automations/research-review/memory.md 06:05',
    href: { label: 'Open Findings → SPT arc', url: '/findings#spt' },
  },
  {
    id: 'phase-research',
    producer: 'claude',
    stream: 'Scanner — phase-spike realtime',
    title: 'Incr 08 regime-stratified re-analysis — spike label is zero-edge in trending phases (83% of sample) but carries a large flipped-sign edge in trading_range phase: bear-spikes fade violently (−62 bps, n=7, t=−2.03)',
    lastRun: '2026-04-20 03:11 ET · incr 08',
    takeaway:
      'Same 277-event Pattern Lab pool as incr 07, now stratified along three axes available in `events.csv`: `cycle_phase`, `day_type`, and `|pre_drift_w5|` band sweep. No new data pulled. **Headline:** the spike label carries **zero residual edge in bull_channel (n=145, bull_spike raw +6.7 → resid −0.7) and bear_channel (n=76, bear_spike raw +6.0 → resid +2.9)** — the two dominant phases that hold 83% of the event pool. But in the minority **trading_range** bucket (n=22 combined): **bear-spikes fade violently** (n=7, direction-adjusted −62.4 bps at H=10, t=−2.03) while **bull-spikes continue** (n=15, +27.3 bps). This is the opposite sign pair from what a "spikes fade in flat sessions" heuristic predicts — bear-fade is the large, statistically visible pocket. Band-sweep reconciles the incr 06 (9-day BPA, bear-fade +16.9 bps) vs incr 07 (7-month Pattern Lab) divergence as phase-composition: incr 06 was mostly trading-range days. **Net read after three prior negative replications (incr 05/06/07)**: keep the spike label demoted in trending phases but **open a new research branch on bear-spike fade specifically inside `trading_range` phase** — n is thin but the t-stat is real. Still read-only, no scanner change.',
    source: 'aiedge-vault · Scanner/methodology/phase_spike_realtime_incr08.md · phase_spike_realtime_incr07.md',
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
    title: 'Run #32 — **NO Claude research arc advanced numerically** this hour. Trend incr 30 analyze is **STALLED** mid-"Computing per-session ATRs" at 08:00 ET (`/tmp/incr30.log` frozen on 8-symbol × 48-session slice; no `incr30*` methodology artifact). Only Claude ship this hour is **sync-vault-to-prod at ~07:48 ET** — 212 notes synced to `aiedge.trade/api/vault`; history files returned "No history files found". Cross-stream tension **cooled materially**: Manager 1 did NOT sharpen a 6th veto; Trader 1\'s 6th microgap ship shifted tone from gate-feature → **system orchestration** (`run_trader1_system.py` + strict-scan session fix). New blocker: stale Databento cache (newest fully covered session = 2026-02-27, 52 days old). Trader 2 codified **shared-path smoke** at `~/gaps/logs/topstepx/trader2_runtime_status.json`. Time-bomb still fires ~8h 15m out.',
    lastRun: '2026-04-20 07:56 ET · run #32',
    takeaway:
      '15 cards refreshed (5 Claude + 10 Codex). **CLAUDE side — NO arc advanced numerically this hour.** (a) **Trend incr 30 is STALLED**: `scanner/tools/forward_return_equity_incr30.py` exists + analyze mode started, but `/tmp/incr30.log` has been frozen since 08:00 ET on the line `Computing per-session ATRs and progressive trajectories...` (last 3 lines show `total rows: 79,680 symbols: 8`, `accepted sessions: 48 distinct symbols: 8`, `sessions/symbol: min=6 median=6 max=6`). No `forward_return_eq_incr30*` outputs under `vault/Scanner/methodology` — trend arc still at published incr 29 as of this run. (b) **sync-vault-to-prod landed at ~07:48 ET**: Claude grep\'d `~/.zshrc`, extracted `SYNC_SECRET`, ran site sync inline → **212 notes synced** to `https://www.aiedge.trade/api/vault`; history sync returned "No history files found". Second-eye ops concern: secret-handling path is brittle (scrapes shell config + inlines secret into command). (c) Other Claude arcs unchanged (phase still incr 08 @ 03:11, HoS still 01:40 late, SPT still at 06:35 trade-level review). Run #31 studies refresh LANDED on main at `dc46e28`. **CODEX side — all 10 streams advanced 07-08:0x.** (1) **trader-1 08:08** — 6th consecutive microgap run but **different in kind**: built `run_trader1_system.py` (orchestration runner that refreshes research, runs strict scan, emits briefings); patched `run_portfolio_research.py` for programmatic calls; **fixed `research_scan.py` session selection** so it prefers the most recent fully covered cached session and reports cache coverage explicitly. 22 tests passed. Latest briefing at `logs/trader1_system_briefing_20260420_080741.md`. **NEW BLOCKER**: Databento cache is very stale — newest fully covered session is `2026-02-27` (52 days old); system can summarize posture but cannot produce current-session audit output until cache is backfilled. This run is a **system-runner / cache-quality step**, not new gate logic — cross-stream tension cooled from 5 consecutive gate-feature ships to 1 system/cache ship. (2) **trader-manager-1 08:03–08:06** — reconstructed automation context because prior memory + local `automation.toml` were ABSENT. Confirmed allocator posture (primary_wf: QQQ 1.35x, SPY 1.35x, TQQQ 1.24x, META 1.15x; IWM 0.80x; AMD/TSLA/CRM 0.75x floor; SQQQ 1.00x neutral, holdout trades below 20-trade threshold). Reran `run.py --strict-scan`: latest cached session = **2026-03-20 (31 days stale)**; only QQQ had data, produced 1 target-winning setup. Manager 1 did NOT sharpen a 6th "don\'t treat X as the next gate" veto — this is the **first run in 5 hours without a new sharpened veto**. Dispute is cooling, not escalating. (3) **trader-2 08:05** — made shared-path execution evidence **canonical**. `topstepx_trader.py` now mirrors `trader2_runtime_status.json` to `~/gaps/logs/topstepx/trader2_runtime_status.json` even when consumer runs from an alternate replay/smoke queue path. Monitor classifies evidence as `live-path` / `shared-path-smoke` / `queue-local-live` / smoke fallback. Council report no longer falsely says shared runtime "missing" when shared file exists but is smoke-only. 12 mean-reversion + 5 topstepx + 2 council tests pass. Canonical shared runtime now exists at `~/gaps/logs/topstepx/trader2_runtime_status.json` with `shared-path-smoke` classification, `accepted_smoke=2` on MNQ (`BB_VALUE`, `ZSCORE_BAL`). (4) **trader-manager-2 08:04** — patched `manager_report.py` to resolve runtime snapshots through `monitor_trader2_runtime.resolve_runtime_path()` instead of hardcoding stale `/tmp/trader2_runtime_status.json`. Added `test_manager_report.py` (9 tests pass combined). Report now correctly points at `/tmp/trader2_monitor_verify/trader2_runtime_status.json` with richer lifecycle summary. (5) **performance-audit 08:06** — re-quantified `/knowledge` payload: **full vault 2,380,577 B raw / 755,178 B gzip vs metadata-only 67,093 B raw / 7,901 B gzip** (~30× raw / ~95× gzip compression potential). `/findings` figure total now **860,712 bytes** (up from 745,202 measured at 06:04 — new figure added). Other 3 hotspots intact. New caution on `b49d92a` 24h intraday-pad still not proven as regression; needs runtime traces. (6) **code-review 08:05** — same 5 Gap-ups + trading-range findings still live; no new findings this hour. Re-ran `py_compile` on modified tracked Python in trading-range, Gap-ups, BPA-Bot-1 — all pass. (7) **dependency-and-sdk-drift 08:03** — **pivoted focus**: no longer re-auditing `aiedge/site` / `scanner`; now inspecting `.openclaw`, `trading-range/live`, `Finviz-clone`, `BPA-Bot-1`, `Gap-ups`, `stock_screener_pro`. Found shared Python drift: `.openclaw/stock_screener` + `python_indicators` use loose minimums while `stock_screener_pro/backend` pins newer exact versions (polygon-api-client >=1.12.0 vs ==1.13.4; pandas >=2.0.0/>=1.5.0 vs ==2.1.3; numpy >=1.24.0 vs ==1.26.2; pytest >=7.0.0 vs ==7.4.3). `trading-range/live` fully unpinned. JS reproducibility gap: `stock_screener_pro/frontend` + `Downloads/tradescope` have package.json only. Finviz-clone aligned and establishes Node floor via next@16.1.6 engines.node >=20.9.0. (8) **research 07:03 + 08:05** — 16th/17th iterations of `market_cycle_phases_codex.md`. **New this hour**: added the missing bridge from Al Brooks books to local Mac mini research by tying directly to `~/code/iphone/trend-classification/notes/trend-state-canonical-spec.md` and SPT transfer-taxonomy notes. Structure: `Executive Answer`, `Canonical Phase Map`, `Transition Overlays`, `Reversals Are A Branch`, `What Local Mac Mini Research Adds`. Core decision retained: `breakout/spike → channel/always-in trend → trading range/balance → new breakout`. (9) **research-review 08:06** — re-reviewed exported "smalll pullback" bundle at `~/.gemini/antigravity/brain/2711c2b8-d8c9-4839-a6d3-7ed77e993fb6/`. **3 prior report defects still stale** in exported markdown (date range `2018-01 to 2024-12` wrong, `Worst Monthly Drawdown $0.00` wrong, SPBT Fallacy mixes two studies). Numerically recomputed all 5 RS buckets from monthly JSON corpus — tables match (RS70=24,888 / $2,172K; RS60=25,985 / $1,916K; RS50=26,550 / $1,918K; RS40=26,793 / $1,957K; RS30=26,943 / $2,007K). Corpus coverage confirmed: 80 monthly files `2018-05` → `2024-12`. RS>=70 setup_breakdown aggregates reproduce exactly. Minor: RS>=70 inline counts omit 13 breakevens. (10) **claude-updates 08:05** — flagged that Claude is spending more effort on orchestration + repackaging than on shipping known live bugs. Two still-live Claude bugs unchanged: (i) `aiedge/signals/bpa.py:34` `BPA_SHORT_SETUP_TYPES = {"L1","L2"}` drops FH1/FH2 shorts; (ii) `/api/bars:306` s-maxage=3600 + `/symbol/[ticker]:274` `to` as date string → hour-stale intraday bars. Second-eye take: until incr30 finishes with a clear artifact, better move is to pause research churn and land scanner/site fixes first. **Time-bound risk** — `com.will.trading-reports.plist` still fires Mon-Fri 16:15 ET into missing `~/.openclaw/rs-reports/run.py`; fires today **~8h 15m out**; re-verified `launchctl list | grep will` + direct `ls`. **Single-write held** — one vault markdown + one routines markdown + one TSX edit; no `~/code/CODE_ORGANIZATION_*.md` dual-write.',
    source: '~/code/routines/FINDINGS_2026-04-20_0756.md · vault/Meta/Code Organization 2026-04-20_0756.md',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Seventeenth iteration — **new this hour**: added the missing bridge from Al Brooks books to local Mac mini research by tying directly to `~/code/iphone/trend-classification/notes/trend-state-canonical-spec.md` and `~/code/iphone/spt-research/notes/small-pullback-trend-brooks-transfer-taxonomy-2026-04-19.md`. Reorganized into `Executive Answer`, `Canonical Phase Map`, `Transition Overlays`, `Reversals Are A Branch`, `What Local Mac Mini Research Adds`. Re-rendered HTML preview so the automation bundle stays in sync. Central decision sharpened: Brooks phase vocabulary is `breakout/spike → channel/always-in trend → trading range/balance → new breakout` with local implementation names `bull_spike`, `bear_spike`, `bull_channel`, `bear_channel`, `trading_range`',
    lastRun: '2026-04-20 08:05 ET',
    takeaway:
      'Eighth restructure in ~8 hours. **New substantive addition this hour**: Codex re-read the existing automation memory and refreshed the same note instead of creating another duplicate, and then added the missing bridge from Al Brooks reference books to the local Mac mini research. The bridge ties the conclusion directly to `/Users/williamkosloski/code/iphone/trend-classification/notes/trend-state-canonical-spec.md` and `/Users/williamkosloski/code/iphone/spt-research/notes/small-pullback-trend-brooks-transfer-taxonomy-2026-04-19.md`. **Structure reorganized** into five sections: `Executive Answer`, `Canonical Phase Map`, `Transition Overlays`, `Reversals Are A Branch`, `What Local Mac Mini Research Adds`. The 08:05 run also strengthened the local source chain with `brooks_encyclopedia_learnings.md`, `DAYTYPE_SPEC.md`, `brooks_score.py`, `range_day_detector_v3.py`, `build_playbook.py`, and `brooks_playbook.html`, plus a `Two-Layer Model` framing. **Central decision sharpened**: the cleanest Brooks phase vocabulary for this stack is `breakout / spike → channel / always-in trend → trading range / balance → new breakout`, with local implementation names `bull_spike`, `bear_spike`, `bull_channel`, `bear_channel`, `trading_range`. Pullback, breakout test, climax, final flag, and MTR candidate are treated as transition overlays, not co-equal fixed phases. **Authorship language unchanged**: Codex wrote and maintains the report; any Claude-labeled folders on disk are packaging / source storage, not Claude-authored research. **HTML preview re-rendered** after the markdown refresh so the automation bundle stays in sync. Deliverable refreshed at `~/.codex/automations/research/market_cycle_phases_codex.md`.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Re-reviewed tracked diffs in `trading-range`, `Gap-ups`, `BPA-Bot-1`. **Same 5 findings still live** — no new bugs this hour. Top 3 in `trading-range/live`: (1) `trader.py:_poll_fill()` dereferences `signal["side"]` but reconciled positions/orders store `signal=None` → startup reconciliation crashes on next poll; (2) `scanner.py` per-instrument time-window filtering compares UTC feed timestamps against ET cutoffs → wrong session bars; (3) `executor_tradovate.py:get_fills()` filters by `contractId` only → historical fills from older brackets get mistaken for current trade. `Gap-ups`: short market orders apply slippage in wrong direction + EOD liquidation uses long-side math. `py_compile` passed on all modified tracked Python',
    lastRun: '2026-04-20 08:05 ET',
    takeaway:
      'Rotation back to review tracked diffs across `/Users/williamkosloski/trading-range`, `/Users/williamkosloski/Gap-ups`, and a syntax check across modified Python in those repos plus `/Users/williamkosloski/BPA-Bot-1`. **No new findings this hour** — the same 5 silently-corrupting bugs from the 06:06 pass are still present in current code. **trading-range/live (3 bugs)**: (1) `trader.py:_poll_fill()` dereferences `signal["side"]`, but reconciled positions/orders store `signal=None`, so startup reconciliation crashes on the next poll. (2) `scanner.py` per-instrument time-window filtering compares UTC feed timestamps against ET cutoffs → blocks or triggers the wrong session bars. (3) `executor_tradovate.py:get_fills()` filters by `contractId` only, so historical fills from older brackets on the same contract can be mistaken for the current trade. **Gap-ups (2 bugs)**: (4) `trade/trade_manager.py` short market orders apply slippage in the long direction, *improving* short entries instead of worsening them. (5) `backtest/engine.py` end-of-day liquidation uses long-side slippage/P&L math for all trades → short EOD exits mispriced and misreported. **Verification**: `python3 -m py_compile` passed on all modified tracked Python files checked; full test suites were not run from repo roots. **Prioritization unchanged**: silently-corrupting-P&L bugs (Gap-ups short-side math, trading-range executor fill matching) remain the top priority. The non-determinism bug from 06:06 (unordered `qualified_set - traded_syms`) is not explicitly re-listed this hour but remains in the queue until actually fixed. **Next run**: review new diffs only unless any of these findings are actually fixed in-tree.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'No new top-level regression; `31c3325..HEAD` only changed `/api/bars/route.ts` + `/studies/page.tsx`. **New quantified measurement this hour**: `/knowledge` full vault payload = **2,380,577 B raw / 755,178 B gzip** vs metadata-only = **67,093 B raw / 7,901 B gzip** (∼30× raw / ∼95× gzip compression potential from a `?slug=` server-first migration). `/findings` figure bytes re-measured: **860,712 total raw** (up from 745,202 at 06:04 — new figure added), largest single 250,938 B. Other 3 hotspots (`/symbol/[ticker]` 5 fetches, `/journal` static lightweight-charts 180,763 B) intact. 24h `/api/bars` pad still unproven as regression — needs runtime traces',
    lastRun: '2026-04-20 08:06 ET',
    takeaway:
      'Re-audited `/Users/williamkosloski/code/aiedge/site` (Next 16.2.4 / React 19.2.4). **Headline: no new top-level page regression since the prior pass**; `31c3325..HEAD` changed only `src/app/api/bars/route.ts` and `src/app/studies/page.tsx`. **All 4 prior hotspots intact**: (1) `/knowledge` still fetches the full vault client-side through `src/components/knowledge/KnowledgeShell.tsx` even though `src/app/api/vault/route.ts` already supports `?slug=`. **Re-measured from local vault corpus this run**: 212 notes, ~2,380,577 B raw / ~755,178 B gzip for full payload vs ~67,093 B raw / ~7,901 B gzip for metadata-only payload. This is the first concrete gzip figure — a `?slug=` server-first migration collapses ~95× on the wire. (2) `/findings` still fetches `/api/vault` only to build a slug set and still uses plain `<img>` for figures. **Current referenced figure bytes** from `public/findings/figures`: **860,712 B total raw** (up from 745,202 at 06:04), largest single figure **250,938 B**. The delta confirms a new figure was added between runs. (3) `/symbol/[ticker]` still a full client page loading `/api/scan`, `/api/trades?ticker=...`, `/api/snaptrade/sync`, `/api/journal`, then mounts `BarsChart` for a 5th `/api/bars` request. Payload sizes not measured this run. (4) `/journal` still statically imports `TradesTab` → `BarsChart` → `lightweight-charts`; chart library size remains **180,763 B raw / 57,531 B gzip**. **New caution, not yet proven as regression**: `b49d92a` widened `/api/bars` intraday padding floor from 1h → 24h. Correctness fix is clear, but extra Databento fetch/parse work happens before the 78-bar cap, so server cost may have grown. Needs runtime traces before calling it a real regression. **Measurement blocker carried**: fresh `npm run build` still failed because `next/font/google` could not fetch Geist + Geist Mono; route bundle-size output remains unavailable. **Priority stack**: (1) split vault metadata vs note content and move `/knowledge` server-first (highest-leverage fix: ~95× gzip reduction); (2) decouple `/findings` from `/api/vault` + lazy/optimize figures; (3) make `/symbol/[ticker]` fetch scoped server-side data; (4) lazy-load journal chart stack; (5) gather real `/api/bars` traces before changing the 24h pad.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: '**Pivoted focus** — no longer re-auditing `aiedge/site` / `aiedge/scanner`; now scanning `.openclaw`, `trading-range/live`, `Finviz-clone`, `BPA-Bot-1`, `Gap-ups`, `stock_screener_pro`. **Shared `.openclaw` Python drift** confirmed: `stock_screener` + `python_indicators` use loose minimums while `stock_screener_pro/backend` pins newer exact versions (polygon-api-client >=1.12.0 vs ==1.13.4; pandas >=2.0.0/>=1.5.0 vs ==2.1.3; numpy >=1.24.0 vs ==1.26.2; pytest >=7.0.0 vs ==7.4.3). `trading-range/live` fully unpinned (requests, websocket-client, pandas, numpy). JS reproducibility gap: `stock_screener_pro/frontend` + `Downloads/tradescope` have package.json only. Finviz-clone aligned and establishes **Node floor via next@16.1.6 engines.node >=20.9.0**. Optional cross-repo: `BPA-Bot-1 databento>=0.26.0` vs `Gap-ups databento>=0.40.0`',
    lastRun: '2026-04-20 08:03 ET',
    takeaway:
      'Scan pivoted off `aiedge/site`/`scanner` into broader home-directory repos this hour. **Concrete drift found**: (1) `.openclaw` workspace has shared Python package version drift — `stock_screener` and `python_indicators` use loose minimums (pandas >=2.0.0 / >=1.5.0, numpy >=1.24.0, pytest >=7.0.0) while `stock_screener_pro/backend` pins newer exact versions (polygon-api-client ==1.13.4, pandas ==2.1.3, numpy ==1.26.2, pytest ==7.4.3). (2) `trading-range/live` requirements are fully unpinned (requests, websocket-client, pandas, numpy) — no target state is reproducible. (3) JS repos inconsistent on reproducibility: `Finviz-clone` has `package-lock.json` and locks Next 16.1.6 / React 19.2.4, while `stock_screener_pro/frontend` and `Downloads/tradescope` have `package.json` only and no lockfile or Node version file. (4) `Finviz-clone` establishes a concrete Node floor from the repo: `next@16.1.6` requires `node >=20.9.0` in `package-lock.json`. (5) Optional cross-repo drift: `BPA-Bot-1 databento>=0.26.0,<1.0` vs `Gap-ups databento>=0.40.0`. **Minimal alignment plan**: (i) treat `stock_screener_pro/backend` exact pins as the current target for shared `.openclaw` Python libraries unless maintainers want a lower compatibility floor; (ii) add lockfiles and a pinned Node version to JS repos before changing library versions; (iii) pin or compile `trading-range/live` requirements before any SDK/package upgrade discussion; (iv) leave `Finviz-clone` package versions alone — manifest and lockfile are already aligned. **market-dashboard** only has `{"private": true}` in package.json — nothing actionable. **`aiedge/site` + `aiedge/scanner` drift from prior pass is still present** but not re-verified this hour because scan scope moved.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Delta since 07:03. **Sync-vault-to-prod landed at ~07:48 ET** — Claude grep\'d `~/.zshrc`, extracted `SYNC_SECRET`, ran sync inline → **212 notes synced** to `aiedge.trade/api/vault`; history files returned "No history files found". **Brittle secret path**: scrapes shell config + inlines secret into command. **Trend incr30 STALLED**: Claude killed earlier duplicates and relaunched `forward_return_equity_incr30.py --mode analyze`, but `/tmp/incr30.log` has been stopped at `Computing per-session ATRs and progressive trajectories...` with NO `forward_return_eq_incr30*`, `trend-contributor-findings-*incr30*`, PDF, or iPhone-mirror artifacts. Treat as in-flight / potentially stalled. **organize-my-code run #32 framing started in todos**; backtest session in document-reading mode, not yet justified. 2 live Claude bugs still unfixed (bpa.py:34 + /api/bars:306)',
    lastRun: '2026-04-20 08:05 ET',
    takeaway:
      'Delta since 07:03 follow-up. **Only one Claude task produced a completed operational result this hour**: new completed session `sync-vault-to-prod` at ~07:48 ET. Claude grep\'d `~/.zshrc`, extracted `SYNC_SECRET`, then ran the site sync scripts inline — `212 notes synced` to `https://www.aiedge.trade/api/vault`; history sync again returned `No history files found`. **Second-eye ops concern**: the vault sync works, but the secret-handling path is brittle and now visibly depends on scraping shell config plus inlining the secret into the command. Should be replaced with a stable env-loading path before treating unattended sync as solved. **Trend arc has materially advanced from "planned incr30" to a live incr30 analyze run, but it is still not publishable truth**: Claude killed earlier duplicate runs and relaunched `forward_return_equity_incr30.py --mode analyze`; `/tmp/incr30.log` still stops at `Computing per-session ATRs and progressive trajectories...`; no `forward_return_eq_incr30*`, `trend-contributor-findings-*incr30*`, PDF, or iPhone-mirror artifacts exist yet under `vault/Scanner/methodology`. **Treat incr30 as in-flight / potentially stalled**, not as a new finding. **`organize-my-code`** has started a new run (#32 framing visible in Claude\'s todo list), but as of 08:05 ET it has not written a new `Code Organization YYYY-MM-DD_HHMM.md` note and `~/code/aiedge/site` is still clean. **`backtest`** has started a fresh session, but it is still in document-reading / inventory mode rather than producing a new artifact. Given the already-landed SPT outputs, treat this run as "not yet justified" until it emits a distinct new test or review. **Highest-value live code issues remain unchanged** and still deserve priority over more research packaging: (1) `aiedge/signals/bpa.py:34` still excludes detector-fired `FH1` / `FH2` shorts (`BPA_SHORT_SETUP_TYPES = {"L1","L2"}`); (2) `site/src/app/api/bars/route.ts:306` still caches bars for an hour, and `site/src/app/symbol/[ticker]/page.tsx:274` still keys `to` by date string only → same-day symbol charts can still serve stale intraday bars. **Time-bound launchd risk** still unchanged at 08:05 ET: `com.will.trading-reports` still scheduled for 16:15 ET on Monday-Friday and still points to missing `~/.openclaw/rs-reports/run.py`; stderr log has not advanced since 2026-04-17 because today\'s fire time has not happened yet. **Second-eye take**: Claude is currently spending more effort on orchestration and repackaging than on shipping the two known live bugs. Unless incr30 finishes with a clear artifact, the better move is to pause more backtest/research churn and land the scanner/site fixes first. For trend work, hold the line on "artifact or it didn\'t happen": no downstream decision should use incr30 until the note, JSON/CSV, figures, PDF, and iPhone README update actually exist.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Re-reviewed the "smalll pullback" RS-sweep bundle at `~/.gemini/antigravity/brain/2711c2b8-d8c9-4839-a6d3-7ed77e993fb6/`. **Same 3 prior report defects STILL STALE** — date range `2018-01 to 2024-12` wrong; `Worst Monthly Drawdown: $0.00` wrong for every bucket; SPBT Fallacy still embeds separate Gap-ups loss study into RS-sweep summary. **Numerically recomputed all 5 RS aggregates** from the 80-monthly-JSON corpus: tables match exactly (RS70=24,888 / $2,172,291.57; RS60=25,985 / $1,916,019.99; RS50=26,550 / $1,918,462.09; RS40=26,793 / $1,957,842.67; RS30=26,943 / $2,007,678.45). RS≥70 setup_breakdown also reproduces exactly. Corpus actually spans `2018-05` → `2024-12` (80 files), confirmed. Minor: RS≥70 inline counts still omit 13 `closed_breakeven` trades',
    lastRun: '2026-04-20 08:06 ET',
    takeaway:
      'Re-reviewed the same "smalll pullback" export to confirm whether the previously flagged RS-sweep defects were still present in the published markdown. **The exported docs are still stale**: (a) `rs_sweep_results.md` still says `Dates: 2018-01 to 2024-12`; actual corpus starts 2018-05. (b) `in_depth_stats_report.md` still prints `Worst Monthly Drawdown: $0.00` for every threshold; raw RS70 has 2020-03 at `total_pnl=−58,300.55`, `max_drawdown=84,795.99`. (c) `key_findings_summary.md` still embeds the separate SPBT loss study as if it were part of the RS>=70 sweep. **Recomputed all five RS aggregates from the monthly JSON corpus**: the table values in the export are numerically correct for trades and P&L — `RS70=24,888 / $2,172,291.57`, `RS60=25,985 / $1,916,019.99`, `RS50=26,550 / $1,918,462.09`, `RS40=26,793 / $1,957,842.67`, `RS30=26,943 / $2,007,678.45`. **Reconfirmed source coverage** is 80 monthly files from `2018-05.json` through `2024-12.json`; producer repo comments and result files still show the real start is `2018-05-01`, not January 2018. **Verified the RS>=70 setup breakdown table is grounded in the corpus** — aggregating `setup_breakdown` across the 80 monthly files reproduces the published per-setup totals and P&L exactly. **Minor wording defect still present**: the RS>=70 `82.1%` win-rate line lists only wins and losses, but the corpus includes 13 `closed_breakeven` trades, so the inline counts are incomplete even though the headline win rate is correct. **Not fully verified this run**: the separate ATR-pullback and gap-correlation markdowns; provenance for those sections was less direct than the RS monthly corpus, treat them as unverified unless specifically re-audited. **Active queue carries**: SPT TZ bug + 22 scratch scripts using fixed-offset ET; pt 37 target-map prose vs code drift; pt 37 expected-economics stale from 71-trade study; 3 RS-sweep export defects above; 3 BPA-Bot-1 first-pullback bugs; 4 SPT doc-drift items; Adobe/futures narrative checks. Directional conclusion holds: filtered SPT stack still appears strong; raw SPT universe still fails.',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: '**6th consecutive microgap run but DIFFERENT IN KIND** — shifted from gate-feature to system orchestration. Built `run_trader1_system.py` (refreshes research, runs strict scan, emits markdown/json briefings). Patched `run_portfolio_research.py` for programmatic calls. **Fixed `research_scan.py` session selection** so it prefers the most recent fully covered cached session instead of the first day with any single-symbol data; now reports cache coverage explicitly. 22 tests pass. Latest briefing: `logs/trader1_system_briefing_20260420_080741.md`. **NEW BLOCKER**: Databento cache is very stale — newest fully covered session = `2026-02-27` (52 days old); system can summarize posture but cannot produce current-session audit until cache is backfilled',
    lastRun: '2026-04-20 08:08 ET',
    takeaway:
      '**6th consecutive run advancing `microgap-bot`, but this hour is materially different in kind** — the work shifted from gate-feature expansion (allocator → execution guardrails → age-fading → recent-overlay → symmetric demotion) to **system orchestration and data-integrity fixing**. **Core changes**: (1) Built `/Users/williamkosloski/microgap-bot/run_trader1_system.py` — orchestration runner that refreshes research when needed, runs the strict scan, and emits markdown/json Trader 1 briefings. (2) Patched `/Users/williamkosloski/microgap-bot/run_portfolio_research.py` so it can be called programmatically by the system runner. (3) **Fixed `/Users/williamkosloski/microgap-bot/research_scan.py` session selection**: it now prefers the most recent fully covered cached session instead of the first day with any single-symbol data, and reports cache coverage explicitly. (4) Added regression tests in `/Users/williamkosloski/microgap-bot/test_trader1_system.py` and `/Users/williamkosloski/microgap-bot/test_research_scan.py`. **Verification**: full suite passed (`22 passed`). Ran the new system once; latest generated briefing is `/Users/williamkosloski/microgap-bot/logs/trader1_system_briefing_20260420_080741.md`. **NEW BLOCKER surfaced**: Databento cache is very stale. The newest fully covered session found was `2026-02-27` (52 days old), so the system can summarize posture reliably but **cannot produce current-session audit output until the cache is backfilled**. **Cross-stream tension cooled materially**: the 5 prior microgap runs were all gate-feature ships (each re-contradicting Manager 1 within minutes). This run is a **system-runner + cache-quality step**, not new gate logic — tonally closer to the allocator-quality age-fading run than to the symmetric-overlay semantic change. Trader 1 is, for the first time in 6 hours, doing work Manager 1 could reasonably classify as "infrastructure improvement" rather than "new gate expansion against the microgap veto". Still does NOT solve the underlying system-level dispute: `~/gaps/logs/ibkr` still has no runtime proof; runtime path unchanged.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: '**Codified shared-path execution evidence as canonical**. `topstepx_trader.py` now mirrors `trader2_runtime_status.json` into `~/gaps/logs/topstepx/trader2_runtime_status.json` EVEN when the consumer is pointed at an alternate replay/smoke queue path. Monitor now classifies evidence as `live-path` / `shared-path-smoke` / `queue-local-live` / smoke fallback. Council report no longer falsely says shared runtime "missing" when shared file exists but is smoke-only. Canonical shared runtime now exists with `evidence shared-path-smoke`, `accepted_smoke=2` on MNQ (`BB_VALUE`, `ZSCORE_BAL`), Trader 1 gate_mode `auto_csv` from `strict_scan_2026-03-19.csv`. **Still shared-smoke, not authenticated live-path proof** — local TopStepX credentials still blocked',
    lastRun: '2026-04-20 08:05 ET',
    takeaway:
      '**Core decision**: since a true authenticated paper run is blocked in this environment, make shared-path execution evidence **canonical and explicit** — always mirror Trader 2 runtime snapshots into `~/gaps/logs/topstepx/trader2_runtime_status.json`, distinguish shared-path smoke evidence from missing live evidence, and publish a fresh canonical shared smoke snapshot without touching the real shared `pending.json`. **Code changes**: (1) `gaps/topstepx/topstepx_trader.py` now mirrors `trader2_runtime_status.json` into the canonical shared TopStepX path even when the consumer is pointed at an alternate replay/smoke queue path; payload records queue-local vs shared runtime paths/roles. (2) `mean-reversion/monitor_trader2_runtime.py` now classifies runtime evidence as `live-path`, `shared-path-smoke`, `queue-local-live`, or plain smoke fallback; path-resolution note no longer assumes every shared snapshot is authenticated live proof. (3) `trader-2/strategy_council.py` now reports shared-path smoke snapshots explicitly instead of calling the live path "missing" when the canonical file exists but is smoke-only. (4) Updated `mean-reversion/README.md` to document the canonical shared runtime mirror and the shared-smoke vs live-path distinction. (5) Added regressions in `gaps/topstepx/test_topstepx_trader.py`, `mean-reversion/test_monitor_trader2_runtime.py`, and `trader-2/test_strategy_council.py`. **Verification**: `pytest -q test_topstepx_trader.py` → **5 passed**; `pytest -q test_monitor_trader2_runtime.py test_paper_trade_bridge.py test_scan_latest_session.py` → **12 passed**; `pytest -q test_strategy_council.py` → **2 passed**. `paper_trade_bridge.py ... --queue-path /tmp/trader2_shared_smoke/pending.json` queued 2 Trader 2 signals into isolated replay queue; `topstepx_trader.py --smoke` smoke-accepted both signals and wrote queue-local + **canonical shared runtime mirror** at `~/gaps/logs/topstepx/trader2_runtime_status.json`; `monitor_trader2_runtime.py` now reports `evidence shared-path-smoke` from the canonical shared runtime; `strategy_council.py` regenerated `latest_report.md` with new shared-smoke execution evidence line. **Current practical state**: Trader 2 now has a canonical shared runtime snapshot at `~/gaps/logs/topstepx/trader2_runtime_status.json` even when validation is run from isolated replay queue. Council report no longer falsely says shared runtime file is missing; it now says the shared file exists but is still smoke-only proof. Fresh canonical evidence shows `2` accepted smoke tickets on MNQ (`BB_VALUE`, `ZSCORE_BAL`) with Trader 1 gate mode `auto_csv` using `strict_scan_2026-03-19.csv`. **Next useful step**: replace shared-path smoke snapshot with authenticated TopStepX paper run once credentials/local live-path execution are available.',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Eleventh run — **reconstructed automation context from `microgap-bot` because prior memory + local `automation.toml` were ABSENT**. Confirmed allocator posture for `primary_wf`: Overweight QQQ/SPY @ 1.35x ($675), TQQQ 1.24x ($618), META 1.15x ($577). Underweight IWM 0.80x ($399), AMD/TSLA/CRM 0.75x ($375 floor). Neutral SQQQ 1.00x (holdout < 20-trade threshold). Reran `run.py --strict-scan` — latest cached session = **2026-03-20 (31 days stale)**; only QQQ had data, produced 1 target-winning setup. **Did NOT sharpen a 6th veto wording this hour** — first run in 5 hours without a new "don\'t treat X as the next gate" instruction. Main blocker now: local Databento cache is stale/incomplete',
    lastRun: '2026-04-20 08:06 ET',
    takeaway:
      'Eleventh run. **Manager memory + `automation.toml` were absent this run** — reconstructed automation context from `/Users/williamkosloski/microgap-bot` directly instead of from persisted manager state. **Allocator posture confirmed** from `/Users/williamkosloski/microgap-bot/logs/trader1_portfolio_research_20260420_050859.json`: (Overweight) QQQ 1.35x ($675), SPY 1.35x ($675), TQQQ 1.24x ($618.36), META 1.15x ($576.95); (Underweight) IWM 0.80x ($398.97), AMD 0.75x ($375), TSLA 0.75x ($375), CRM 0.75x ($375); (Neutral) SQQQ 1.00x ($500) because holdout trades remain below the 20-trade threshold. **Reran `python3 /Users/williamkosloski/microgap-bot/run.py --strict-scan`**. Strict-scan result: latest cached session found by the scanner is `2026-03-20`, now **31 days stale** relative to 2026-04-20. Only `QQQ` had cached data for that session inside the trader-1 universe; it produced 1 target-winning setup. Refreshed CSV at `/Users/williamkosloski/microgap-bot/logs/strict_scan_2026-03-20.csv`. **Main blocker for future runs**: local Databento cache for trader-1 symbols is stale/incomplete (most symbols only through `2026-02`, QQQ through `2026-03`), so same-day signal management is not currently possible from local data alone. **Cross-stream tension tracker**: Manager 1 has sharpened wording 5 times (02:02 / 03:03 / 04:03 / 05:03 / 06:02). **This run (11th) did NOT add a 6th sharpened "don\'t treat X as the next gate" instruction** — it\'s the first run in 5 hours without a new escalation. Trader 1\'s 08:08 ship was system orchestration + cache-coverage reporting, not new gate logic, so the dispute didn\'t re-contradict this hour. Underlying system-level issue (microgap-bot not canonical champion until `~/gaps/logs/ibkr` has runtime proof) remains unresolved; the new cache-staleness blocker is now an additional operational prerequisite for any future microgap audit.',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Eleventh run — patched `manager_report.py` so the manager resolves runtime snapshots through `monitor_trader2_runtime.resolve_runtime_path()` instead of hardcoding the stale root `/tmp/trader2_runtime_status.json`. Added `test_manager_report.py` to lock nested smoke-snapshot fallback behavior. Regenerated `latest_report.md` — now points at `/tmp/trader2_monitor_verify/trader2_runtime_status.json` and surfaces the richer lifecycle summary (`smoke_accepted=2`) instead of the older root-level smoke file. 9 tests pass combined. Decision unchanged: keep `NQ Z-Score Balance Gate` as Trader 2\'s champion, keep smoke-verified and runtime-verified separate, treat first live-path `~/gaps/logs/topstepx/trader2_runtime_status.json` as the remaining execution gate',
    lastRun: '2026-04-20 08:04 ET',
    takeaway:
      'Eleventh run. **Reconstructed Trader 2 context** from `~/mean-reversion` because automation memory was missing at run start (similar to trader-manager-1 this hour). Verified there is no shared live runtime snapshot at `~/gaps/logs/topstepx/trader2_runtime_status.json`; the only available snapshot was `/tmp/trader2_runtime_status.json`, generated at `2026-04-20T03:07:49-04:00`, and it was stale smoke output. **Code changes**: (1) Patched `/Users/williamkosloski/mean-reversion/monitor_trader2_runtime.py` so the monitor explicitly labels smoke fallback usage when the live snapshot is missing instead of silently implying live status. Added regression coverage in `/Users/williamkosloski/mean-reversion/test_monitor_trader2_runtime.py` for the fallback label and path resolution behavior. (2) Patched `/Users/williamkosloski/.codex/automations/trader-manager-2/manager_report.py` so the manager layer resolves runtime snapshots through `monitor_trader2_runtime.resolve_runtime_path()` instead of hardcoding the stale root `/tmp/trader2_runtime_status.json`. Added `/Users/williamkosloski/.codex/automations/trader-manager-2/test_manager_report.py` to lock the nested smoke-snapshot fallback behavior. **Regenerated** `/Users/williamkosloski/.codex/automations/trader-manager-2/latest_report.md` — it now points at `/tmp/trader2_monitor_verify/trader2_runtime_status.json` and surfaces the richer lifecycle summary (`smoke_accepted=2`) instead of the older root-level smoke file. **Verification**: `pytest -q test_monitor_trader2_runtime.py test_paper_trade_bridge.py` → **7 passed** (first patch); `pytest -q test_manager_report.py test_monitor_trader2_runtime.py test_paper_trade_bridge.py` → **9 passed** (second patch); `monitor_trader2_runtime.py` now prints `smoke fallback because live snapshot is missing`. **Current management decision**: champion remains `NQ Z-Score Balance Gate`. Trader 2 remains `smoke-verified`, not `runtime-verified`. **Proof gap**: the first live-path `~/gaps/logs/topstepx/trader2_runtime_status.json` is still the remaining execution gate. **Follow-up note**: the 08:05 ET Trader 2 run that made shared-path execution evidence canonical has NOT yet been picked up by this manager run — next manager refresh should read the new `shared-path-smoke` vs `live-path` classification (now that the canonical shared runtime at `~/gaps/logs/topstepx/trader2_runtime_status.json` actually exists as shared-smoke after the 08:05 mirror).',
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
