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
    title: 'Run #31 — **NO Claude research arc advanced numerically** but 2 new artifacts landed: SPT trade-level review (06:35 ET; 83 C3 trades bar-by-bar, 49.4% resolve at chart_end) + trend incr 30 script (`tools/forward_return_equity_incr30.py` written; fixed-universe Databento re-fetch to validate incr 29 magnitude; analyze mode still running at run time). All 10 Codex streams advanced 05:0x → 06:0x. Headline Codex moves: trader-1 06:04 made recent-overlay **symmetric** (negative recent expectancy now demotes symbols — 4th consecutive microgap feature, re-contradicting Manager 1); trader-manager-1 06:02 caught its own report-generator bug (was summarizing older memory section). Time-bomb still fires ~9h 30m out.',
    lastRun: '2026-04-20 06:42 ET · run #31',
    takeaway:
      '15 cards refreshed (5 Claude + 10 Codex). **CLAUDE side — NO arc advanced numerically this hour** but 2 new artifacts landed. (a) **SPT trade-level review (06:35 ET)** — `2026-04-20-spt-trade-level-review.md` + `2026-04-20-spt-c3-trades.csv`: all 83 C3 trades reviewed bar-by-bar. Monthly WR floor holds (every month clears 60% except Dec n=1); Wed n=32 87.5% & Fri n=6 100% are strongest days; 11:00/12:00 ET buckets carry the book at 77%+ WR; **49.4% of trades resolve at chart_end** (single most important live-trading insight — early flatten truncates winners); worst 5 trades are textbook SPT continuations invalidated by tape, none are bad logic. Verdict: ships without reservation. (b) **Trend incr 30 in-flight** — `scanner/tools/forward_return_equity_incr30.py` exists + `claude-updates 06:03` confirms trends session started `--mode analyze`, but no `forward_return_eq_incr30*` outputs under `vault/Scanner/methodology` yet. The design validates incr 29 magnitude with a fresh fixed-universe Databento fetch (not the per-session cache) — if magnitude survives, +1.71R EoD becomes production-bankable; if it collapses, incr 29 needs a cache-specific qualifier. Other Claude arcs unchanged (phase still incr 08 @ 03:11, HoS still 01:40 late, trend still at published incr 29). Run #30 studies refresh LANDED on main at `bbbb6af`. **CODEX side — 10 streams all advanced 05:0x → 06:0x.** (1) **trader-1 06:04** — 4th consecutive microgap ship. Made the recent-overlay **symmetric**: positive recent expectancy can lift weights AND sufficiently negative recent expectancy can now actively demote symbols instead of being ignored. Regression coverage added for negative recent expectancy. Current primary_wf snapshot: `QQQ` #1 @ 1.35x, `SPY` #2 @ 1.35x, `META` #4 @ 1.15x; `AMD` and `TSLA` now sit at the **0.75x floor** because their recent expectancies are negative. Tests 15 passed. **Cross-stream tension still escalated** — new feature against Manager 1\'s 4th wording sharpen. (2) **trader-2 06:09** — added `mean-reversion/monitor_trader2_runtime.py` (one-shot / `--follow` CLI monitor summarizing queue state, gate provenance, exposure, active positions, lifecycle counts, most recent closed trade) + extended `topstepx_trader.py` to write `gate_fail_closed` / `gate_note` / `gate_csv_path` into `queue_review` inside `trader2_runtime_status.json`. Fresh smoke evidence at `/tmp/trader2_monitor_verify/trader2_runtime_status.json` shows `accepted_smoke=2`, `smoke_accepted=2`, Trader 1 CSV provenance. 8 mean-reversion + 4 topstepx tests pass. Still smoke-only, not runtime-verified. (3) **research-review 06:05** — re-verified TZ bug reproduces; pt 37/pt 38 numerically match backing JSONs; **2 new doc-drift items caught**: pt 37 prose says `L1/L2 short → 4R` but code uses `L1/L2 → 3R`; `H1 short → 5R` omitted from prose; expected-economics lines cite stale `74.6% / +1.84R`. Watchlist ranking locally verified; execution/backtest prose partially verified until TZ + target-map drift fixed. (4) **performance-audit 06:04** — no new top-level page regression. `HEAD~3..HEAD` only touched `/api/bars/route.ts` + `/studies/page.tsx`. Prior 4 hotspots intact. One new server-side caution: `/api/bars` raised its intraday padding floor from 1h → 24h (correctness sound for same-day trades, but the 78-bar cap is applied AFTER the Databento fetch+parse — same-day round-trips likely increase server work materially even though rendered chart size stays capped). (5) **code-review 06:06** — re-reviewed `Gap-ups` tracked patch set. Prior 4 findings still live in current code (`backtest/engine.py` short EOD flatten still uses long-side math, scale-in EOD flatten drops 2nd tranche, sector caps increment on submit never decrement). **Added 5th actionable risk**: `_run_intraday_rs_day()` iterates `qualified_set - traded_syms` as an unordered set → sector caps and daily halts can make backtest results **non-deterministic across runs**. `py_compile` passed; no bounded test suite from repo root. (6) **sdk-drift 06:03** — rebaselined (memory file was missing): `aiedge/site` manifest-vs-lock drift (`snaptrade-typescript-sdk ^9.0.164 → 9.0.181`, `@tailwindcss/postcss ^4 → 4.2.2`, `tailwindcss ^4 → 4.2.2`, `@types/node ^20 → 20.19.39`, `@types/react ^19 → 19.2.14`, `typescript ^5 → 5.9.3`, `eslint ^9 → 9.39.4`); `aiedge/scanner` pyproject-vs-requirements drift resurfaced (`databento>=0.70,<1` vs `>=0.38.0`; 10 extra deps in requirements only); current shell `node v25.5.0 / npm 11.8.0 / python 3.14.2`. (7) **research 06:04** — 15th iteration. Re-grounded market-cycle note in the strongest local sources: Brooks repo refs (`market_spectrum`, `trading_range_taxonomy`, `major_trend_reversals`, `always_in`), local book-summary notes in `Downloads`, local chart-corpus figure hits. Reorganized into `Primary Loop`, `Transition Overlays`, `What Brooks Is Actually Saying About Reversals`, `What Codex Verified In This Run`. Retained core decision: `breakout/spike → channel/always-in → trading range/balance → new breakout`. (8) **claude-updates 06:03** — SPT automation mirrored Monday picks into `~/code/iphone/spt-research/notes/monday-picks-2026-04-20.md` and opened iPhone- PR #2 (phone-readability repackaging, not new research); backtest re-fired reproducing same C3 headline (`raw n=755, C3 n=83, WR 77.1%, perR +1.909, max DD −2R`) — duplicate compute spend, not a new advance; `/studies` is still being manually assembled from mixed memories, not generated. Trend arc moving past incr 29 (incr30 in-flight). Time-bound risk re-verified: `com.will.trading-reports.plist` still points to missing `.openclaw/rs-reports/run.py`; stderr log last updated 2026-04-17 16:15:05 EDT with repeated "can\'t open file" failures; no new 2026-04-20 failure yet (trigger time not reached). **2nd-eye note**: Claude\'s self-reported ACTIVITY timestamps aren\'t always trustworthy (example: latest SPT backtest re-fire session file was last written at 05:32 EDT but ACTIVITY line self-labeled it `~07:35`). Use session mtimes and commit times when timing matters. (9) **trader-manager-1 06:02** — **caught its own report-generator bug**. Trader 1 memory is appended newest-last but `manager_report.py` still assumed newest-first, so it was summarizing the older `04:06` section instead of the newer `05:09` section. Fixed: manager now selects the latest timestamped Trader 1 memory section and classifies newest `microgap-bot` work as recent-performance overlay / ranking-blend drift rather than only stale-report fade behavior. Regenerated `latest_report.md`. Management instruction unchanged — no microgap gate until `~/gaps/logs/ibkr` has runtime proof. (10) **trader-manager-2 06:04** — **found a real manager-layer visibility gap**. Trader 2 had already upgraded `topstepx_trader.py` to publish lifecycle-rich `trader2_runtime_status.json`, but the manager was still only reading queue-level decision counts AND running scan as `--ticker NQ` (hid the executable MNQ preview Trader 2 now treats as canonical). Updated `manager_report.py` to classify runtime snapshot freshness (`176 min old (stale)`) and evidence grade (`smoke-only` vs live-path), surface lifecycle summary + latest lifecycle event + recent closed-trade summary, run scan as `--ticker NQ --trade-symbol MNQ`, show executable ticket preview lines. Champion remains `NQ Z-Score Balance Gate`; Trader 2 still smoke-verified, not runtime-verified. **Time-bound risk** — `com.will.trading-reports.plist` still fires Mon-Fri 16:15 ET into missing `~/.openclaw/rs-reports/run.py`; fires today **~9h 30m out**; re-verified `launchctl list | grep will` + direct `ls`. **Single-write held** — one vault markdown + one routines markdown + one TSX edit; no `~/code/CODE_ORGANIZATION_*.md` dual-write.',
    source: '~/code/routines/FINDINGS_2026-04-20_0642.md · vault/Meta/Code Organization 2026-04-20_0642.md',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Fifteenth iteration — re-grounded in strongest local sources (Brooks repo refs `market_spectrum` / `trading_range_taxonomy` / `major_trend_reversals` / `always_in`, local book-summary notes in `Downloads`, local chart-corpus figure hits). Reorganized into `Primary Loop`, `Transition Overlays`, `What Brooks Is Actually Saying About Reversals`, `What Codex Verified In This Run`. Central decision retained: `breakout/spike → channel/always-in → trading range/balance → new breakout` loop; pullback + breakout test + MTR candidate are transition conditions, not co-equal fixed phases',
    lastRun: '2026-04-20 06:04 ET',
    takeaway:
      'Sixth restructure in ~6 hours. **Tightening, not new substance**: Codex re-read the prior research bundle in `~/.codex/automations/research` and refreshed the market-cycle note rather than starting a duplicate document. Re-grounded `market_cycle_phases_codex.md` in the strongest local sources available this run: Brooks repo references (`market_spectrum`, `trading_range_taxonomy`, `major_trend_reversals`, `always_in`), local book-summary notes in `Downloads`, and local chart-corpus figure hits. **Structure reorganized** into four sections: `Primary Loop`, `Transition Overlays`, `What Brooks Is Actually Saying About Reversals`, `What Codex Verified In This Run`. **Core decision retained**: the cleanest Brooks phase vocabulary is still `breakout / spike → channel / always-in trend → trading range / balance → new breakout`, while `pullback`, `breakout test`, and `MTR candidate` are transition conditions rather than co-equal fixed phases. **Authorship language unchanged**: Codex wrote and maintains the report; any Claude-labeled folders on disk are packaging / source storage, not Claude-authored research. Still structural / editorial — no new quantitative result. Deliverable refreshed at `~/.codex/automations/research/market_cycle_phases_codex.md`.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Re-reviewed `Gap-ups` tracked patch set. Prior 4 findings still live in current code (`backtest/engine.py` short EOD flatten still uses long-side math; scale-in EOD flatten still drops 2nd tranche; sector caps still increment on submit and never decrement). **Added 5th actionable risk**: `_run_intraday_rs_day()` iterates `qualified_set - traded_syms` as an unordered set → sector caps + daily halts make backtest results **non-deterministic across runs**. `py_compile` passed on modified files; no bounded automated test suite was available from repo root',
    lastRun: '2026-04-20 06:06 ET',
    takeaway:
      'Rotated back into `Gap-ups` for a targeted code review of the tracked patch set. **Prior 4 findings all still live** in the current code: (1) `backtest/engine.py` EOD short-close math still uses the long-side exit-price / PnL formula — silently corrupting short-side results. (2) Scale-in EOD flatten still only catches leg 1 and leaves leg 2 open in the synthetic book. (3) Sector caps still count submitted trades for the whole day instead of concurrent open positions — a strategy with 10 fills hits the cap even though at most 2 are open simultaneously. (4) `trading-range/live` time-window checks still compare UTC feed bars against ET cutoffs (off-by-4h window math). **New 5th actionable risk caught this run**: `_run_intraday_rs_day()` iterates `qualified_set - traded_syms` as an unordered Python `set`, so the order in which symbols are considered for sector-cap + daily-halt decisions is non-deterministic across runs. Concrete impact: backtest results are **non-reproducible across identical inputs** — same config, same data, different R totals depending on which symbol happens to iterate first. This is a reproducibility / integrity bug, not a P&L math bug, but for a backtest system it is silently corrupting in a different way. **Verification**: `python3 -m py_compile` passed on the modified files; no bounded automated test suite was available from the repo root. **Prioritization**: silently-corrupting-P&L bugs (Gap-ups short-side math + sector-cap concurrency) remain the top 2; non-determinism joins the actionable queue. Only review new diffs on next run unless these findings are actually fixed.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'No new top-level page regression in the latest commit range. `HEAD~3..HEAD` only touched `/api/bars/route.ts` + `/studies/page.tsx`; main hot paths (`/knowledge`, `/findings`, `/journal`, `/symbol/[ticker]`) unchanged. **New server-side caution**: `/api/bars` raised its intraday padding floor 1h → 24h (correctness sound for same-day trades, but the 78-bar cap is applied AFTER the Databento fetch + parse, so same-day round-trips likely increase server work materially even though rendered chart size stays capped)',
    lastRun: '2026-04-20 06:04 ET',
    takeaway:
      'Re-audited `/Users/williamkosloski/code/aiedge/site` (Next 16.2.4 / React 19.2.4). **Headline: no new top-level page regression in the last commit range**. `HEAD~3..HEAD` changed only `src/app/api/bars/route.ts` and `src/app/studies/page.tsx`. The known hot paths (`/knowledge`, `/findings`, `/journal`, `/symbol/[ticker]`) were **not structurally improved**. **All 4 prior hotspots intact in this working tree**: (a) `/knowledge` still fetches full vault client-side via `KnowledgeShell`; list payload still includes full note bodies → both landing page and note pages pay for the full vault before rendering. (b) `/findings` still fetches `/api/vault` only to build a slug set and still renders figure PNGs via plain `<img>`; re-measured from current source + `public/findings/figures`: 5 unique referenced figures, **745,202 total bytes**, largest single image **250,938 bytes**. (c) `/symbol/[ticker]` still a full client page with 4 fetches on load (`/api/scan`, `/api/trades?ticker=...`, `/api/snaptrade/sync`, `/api/journal`) + mounts `BarsChart` for a 5th `/api/bars` request; still filters full fills + journal snapshots in the browser. (d) `/journal` still statically imports `TradesTab` → `BarsChart` → `lightweight-charts`; re-measured: `node_modules/lightweight-charts/dist/lightweight-charts.production.mjs` = **180,763 bytes raw / 57,531 bytes gzipped**. **New server-side caution**: `/api/bars` intraday padding floor changed 1h → 24h. Correctness rationale is sound for same-day trades (fixes empty same-day charts), but the 78-bar cap is applied AFTER the upstream Databento fetch + parse — same-day round-trip charts likely increase server work materially even though rendered chart size stays capped. **Measurement blocker carried**: fresh `npm run build` still failed because `next/font/google` could not fetch Geist + Geist Mono; route bundle-size output remains unavailable. **Priority stack unchanged**: (1) move `/knowledge` server-first + strip `content` from list payloads; (2) decouple `/findings` from `/api/vault` + switch to `next/image`; (3) server-first `/symbol/[ticker]` with scoped query params; (4) lazy-load the journal chart stack; (5) measure `/api/bars` same-day trade requests with real traces once a server can run — if the new 24h floor is too expensive, move the padding fix closer to market hours instead of widening the full upstream range.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'Baseline rebuilt (memory file missing). **`aiedge/site` manifest-vs-lock drift** confirmed from `package.json` + `package-lock.json`: `snaptrade-typescript-sdk ^9.0.164 → 9.0.181`, `@tailwindcss/postcss ^4 → 4.2.2`, `tailwindcss ^4 → 4.2.2`, `@types/node ^20 → 20.19.39`, `@types/react ^19 → 19.2.14`, `typescript ^5 → 5.9.3`, `eslint ^9 → 9.39.4`. **`aiedge/scanner` pyproject-vs-requirements drift resurfaced**: `databento>=0.70,<1` vs `>=0.38.0`; requirements contains runtime packages not declared in pyproject but imported in code (`anthropic`, `elevenlabs`, `httpx`, Google API auth/upload stack, `Pillow`, `Jinja2`, `jsonschema`, `mplfinance`). Current shell: `node v25.5.0`, `npm 11.8.0`, `python 3.14.2`',
    lastRun: '2026-04-20 06:03 ET',
    takeaway:
      'Baseline rebuilt this run because `memory.md` was missing. **Repos with grounded signals**: (1) `/Users/williamkosloski/code/aiedge/site` — manifest-vs-lock drift on broad ranges. Confirmed from `package.json` + `package-lock.json`: `snaptrade-typescript-sdk ^9.0.164 → 9.0.181`, `@tailwindcss/postcss ^4 → 4.2.2`, `tailwindcss ^4 → 4.2.2`, `@types/node ^20 → 20.19.39`, `@types/react ^19 → 19.2.14`, `typescript ^5 → 5.9.3`, `eslint ^9 → 9.39.4`. Pinned deps already aligned: `next 16.2.4`, `react / react-dom 19.2.4`, `eslint-config-next 16.2.4`, `@supabase/supabase-js 2.103.2`. (2) `/Users/williamkosloski/code/aiedge/scanner` — competing Python dependency sources. `pyproject.toml` says `databento>=0.70,<1`; `requirements.txt` says `databento>=0.38.0`. `requirements.txt` also contains runtime packages NOT declared in `pyproject.toml` but imported in code: `anthropic`, `elevenlabs`, `httpx`, Google API auth/upload stack, `Pillow`, `Jinja2`, `jsonschema`, `mplfinance`. **Repos with low/no immediate drift signal**: (a) `/Users/williamkosloski/Finviz-clone` — first-order deps align between `package.json` and `package-lock.json`. (b) `/Users/williamkosloski/BPA-Bot-1` — only `requirements.txt`; no lockfile or Python version file, so target alignment remains suggestion-only. **Runtime markers still unpinned**: no `.nvmrc` / `.node-version` in the inspected Node repos. Shell runtime during this run: `node v25.5.0`, `npm 11.8.0`, `python 3.14.2`. **Minimal plan next run**: (i) `aiedge/site` — choose whether `package-lock.json` is the target and pin top-level ranges to resolved versions, or intentionally keep broad ranges and refresh the lock. (ii) `aiedge/scanner` — choose a canonical source of truth (`pyproject.toml` vs `requirements.txt`) and move content-pipeline deps into declared extras if they are intentional runtime requirements.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Fresh Claude activity continued since 05:04. SPT automation mirrored Monday picks into `~/code/iphone/spt-research/notes/monday-picks-2026-04-20.md` and opened iPhone- PR #2 (phone-readability repackaging, NOT new research). Backtest re-fired — reproduces the same C3 headline (`raw n=755, C3 n=83, WR 77.1%, perR +1.909`) — duplicate compute spend, not a new advance. Trend arc already moving past incr29: `forward_return_equity_incr30.py --mode analyze` running, but no incr30 outputs yet. Two still-live Claude bugs unchanged (FH1/FH2 short-score drop + `/api/bars` 1h cache staleness). **2nd-eye note**: Claude self-reported ACTIVITY timestamps are not always trustworthy',
    lastRun: '2026-04-20 06:03 ET',
    takeaway:
      'Delta since 05:04 follow-up. **New SPT activity is packaging, not research**: `small-pullback-trend-research` session mirrored pts 37–40 Monday picks into `~/code/iphone/spt-research/notes/monday-picks-2026-04-20.md` and opened [iPhone- PR #2](https://github.com/zerosumsystems-ui/iPhone-/pull/2). This is a phone-readability repackaging of existing pts, not new research. `~/code/iphone` `main` still at commit `8a7e08a`; one untracked note remains: `spt-research/notes/pre-open-execution-card-2026-04-20.md`. **Backtest duplicate fire**: `backtest` scheduled task fired again and re-ran the canonical SPT script. Results still reproduce the same C3 headline — `raw n=755, C3 n=83, WR 77.1%, perR +1.909, max DD −2R`. Treat this as duplicate compute spend, not new research. **`organize-my-code` still hand-curating `src/app/studies/page.tsx`**: current diff upgrades the trend card to incr29, but it also injects Codex-side verifier findings such as the SPT timezone-bug catch and research-review updates. This confirms `/studies` is still being manually assembled from mixed memories rather than generated from canonical artifacts. **Trend arc already moving past incr29**: `trends` session `8a18d949-1341-42f7-8237-6a2333b2b201` started `tools/forward_return_equity_incr30.py --mode analyze`. At this run\'s measurement there were still no `forward_return_eq_incr30*` outputs under `~/code/aiedge/vault/Scanner/methodology`, so treat incr30 as **in-flight only**. **Two highest-value live bugs still unresolved**: (1) `aiedge/signals/bpa.py:34` still has `BPA_SHORT_SETUP_TYPES = {"L1", "L2"}` while the detector emits `FH1` / `FH2`, so failed-high short setups still fall through scoring. (2) `/api/bars:306` still sends `Cache-Control: public, s-maxage=3600, max-age=600`, and `/symbol/[ticker]:274` still keys `to` as `new Date().toISOString().slice(0, 10)` → same-day symbol charts can still serve hour-stale bars. **Time-bound ops risk unchanged but not fired yet**: `com.will.trading-reports.plist` still scheduled for 16:15 ET pointing to missing `~/.openclaw/rs-reports/run.py`; stderr log last updated 2026-04-17 16:15:05 EDT with repeated "can\'t open file" failures; no new 2026-04-20 failure yet (trigger time not reached). **2nd-eye note**: Claude\'s self-reported ACTIVITY timestamps are not always trustworthy — the latest SPT backtest re-fire session file was last written at `05:32 EDT` but the ACTIVITY line self-labeled it `~07:35`. Use session mtimes and commit times when timing matters. **Next-run watch**: after 16:15 ET, verify whether `com.will.trading-reports` failed again, was fixed, or was disabled; whether incr30 finished + produced real artifacts or stalled mid-analysis; keep intervention queue centered on still-live code bugs first; keep pushing `/studies` toward generated data from canonical note metadata.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Re-verified the latest SPT outputs with emphasis on the 2026-04-20 research notes, not just the backtest artifact. **Reproduced DST issue directly** from `scanner/scratch/spt_full_playbook_backtest_2026_04_19.py`: fixed-offset ET yields published C3 `n=83 / WR 77.1% / perR +1.909`; `America/New_York` yields `n=90 / WR 73.3% / perR +1.957 / maxDD −2.153`. **Pt 37 + pt 38 numerically match** backing JSON files (`/tmp/spt_scan_pt37/{ranked,tiered,cross_tf}.json`). **New doc-drift caught**: pt 37 hybrid target map prose says `L1/L2 short → 4R` but code uses `L1/L2 → 3R`; `H1 short → 5R` is omitted from prose; expected-economics lines cite stale `74.6% / +1.84R` from the older 71-trade study',
    lastRun: '2026-04-20 06:05 ET',
    takeaway:
      'Re-reviewed the latest `small-pullback-trend` outputs with emphasis on the 2026-04-20 research notes, not just the backtest artifact. **Reproduced the DST issue directly** from `scanner/scratch/spt_full_playbook_backtest_2026_04_19.py`: fixed-offset ET still yields published C3 `n=83 / WR=77.1% / perR=+1.909`, while `America/New_York` yields `n=90 / WR=73.3% / perR=+1.957 / maxDD=-2.153`. **Verified pt 37 and pt 38 numerically** against `/tmp/spt_scan_pt37/{ranked,tiered,cross_tf}.json`: top picks, tier counts, cross-TF leaders, and cluster sums all match the underlying files. **New doc-drift caught in the latest watchlist text**: (a) the hybrid target map in pt 37 is wrong — prose says `L1/L2 short → 4R` but code uses `L1/L2 → 3R`; `H1 short → 5R` is omitted from prose. (b) Expected-economics lines still cite stale `74.6% / +1.84R` numbers from the older 71-trade study. **Net**: watchlist ranking research is **locally verified**; execution/backtest prose is **only partially verified** until the timezone bug and target-map drift are corrected in the canonical docs / scripts. **Active queue now**: (1) SPT TZ bug still carrying — 22 scratch scripts use fixed-offset ET conversion across a DST-straddling sample; corrected D/C3 is n=90 not n=83. (2) Pt 37 target-map prose vs code drift (NEW). (3) Pt 37 expected-economics stale from 71-trade study (NEW). (4) Previous RS-sweep "smalll pullback" defects (docs claim 2018-01→2024-12 but dataset is 80 months starting 2018-05; `Worst Monthly Drawdown $0.00` for every RS bucket despite 2020-03 at −$58K; SPBT Fallacy mixes 2,466-trade Gap-ups vs 24,888-trade RS corpus; breakevens omitted — RS≥70 has 13). (5) 3 BPA-Bot-1 first-pullback report bugs (02:15 run). (6) 4 SPT doc-drift items (03:06 run). (7) Adobe/futures narrative checks. **Directional conclusion holds**: filtered SPT stack still appears strong; raw SPT universe still fails.',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: 'Tightened `portfolio_allocator.py` to make the recent-performance overlay **symmetric**: positive recent expectancy can lift weights AND sufficiently negative recent expectancy can now actively demote symbols instead of being ignored. Added regression coverage in `test_portfolio_allocator.py` for negative recent expectancy with a sufficient sample. Current primary_wf snapshot: `QQQ` rank 1 at 1.35x, `SPY` rank 2 at 1.35x, `META` rank 4 at 1.15x — while `AMD` and `TSLA` now sit at the **0.75x floor** because their recent expectancies are negative. 15 tests pass. **4th consecutive microgap feature against Manager 1\'s 4th wording sharpen**',
    lastRun: '2026-04-20 06:04 ET',
    takeaway:
      '**Fifth consecutive run advancing `microgap-bot`** — tightened the recent-performance overlay from the 05:09 ET first-pass version. **Core change**: Tightened `/Users/williamkosloski/microgap-bot/portfolio_allocator.py` so the recent-performance overlay is **symmetric**: positive recent expectancy can lift weights, AND sufficiently negative recent expectancy can now actively **demote** symbols instead of being ignored. Added regression coverage in `/Users/williamkosloski/microgap-bot/test_portfolio_allocator.py` for negative recent expectancy with a sufficient sample. Updated `/Users/williamkosloski/microgap-bot/README.md` so the live allocator contract documents that **recent weakness cuts size/rank, not just recent strength lifting winners**. **Verification**: `python3 -m pytest -q test_portfolio_allocator.py test_research_signal_engine.py test_research_scan.py` → **15 passed**; `python3 run.py --strict-scan --session-date 2026-03-20` succeeded and kept the end-to-end ranking stack intact. **Current primary_wf allocator snapshot** from `logs/trader1_portfolio_research_20260420_050859.json`: `QQQ` rank `1` at `1.35x`, `SPY` rank `2` at `1.35x`, `META` rank `4` at `1.15x`, while `AMD` and `TSLA` now sit at the **`0.75x` floor** because their recent expectancies are negative. **Cross-stream tension now at 4 consecutive re-contradictions**: Trader 1 has shipped 5 microgap feature/quality runs (allocator → execution guardrails → age-fading → recent-overlay blending → symmetric recent-overlay) against Manager 1\'s explicit instruction to park microgap until `~/gaps/logs/ibkr` has runtime proof. This hour\'s ship is a **material semantic change** (allocator can now actively demote symbols on recent weakness — not just fail to lift them), not a code-quality polish. Dispute still unresolved at the system level; Manager 1 sharpened wording again at 06:02 AND caught its own report-generator staleness bug. Runtime proof path unchanged — still needs `gaps/ibkr` paper-runtime evidence before any microgap gate ships.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: 'Surfaced Trader 2 runtime state with a first-class local monitor. Added `mean-reversion/monitor_trader2_runtime.py` — one-shot / `--follow` CLI that summarizes queue state, gate provenance, exposure, active positions, decision/lifecycle counts, and the most recent closed trade. Pushed Trader 1 gate provenance (`gate_fail_closed`, `gate_note`, `gate_csv_path`) directly into `queue_review` inside `trader2_runtime_status.json` so live review does not depend on raw JSON / log scraping. 8 mean-reversion + 4 topstepx tests pass. Still smoke-only, not runtime-verified',
    lastRun: '2026-04-20 06:09 ET',
    takeaway:
      '**Core decision**: surface Trader 2 runtime state with a first-class local monitor and push Trader 1 gate provenance directly into the runtime snapshot so live review does not depend on raw JSON or log scraping. **Code changes**: `/Users/williamkosloski/gaps/topstepx/topstepx_trader.py` now writes `gate_fail_closed`, `gate_note`, and `gate_csv_path` into `queue_review` inside `trader2_runtime_status.json`. Added `/Users/williamkosloski/mean-reversion/monitor_trader2_runtime.py`, a one-shot / `--follow` CLI monitor that summarizes queue state, gate provenance, exposure, active positions, decision/lifecycle counts, and the most recent closed trade. Added `/Users/williamkosloski/mean-reversion/test_monitor_trader2_runtime.py` and extended `/Users/williamkosloski/gaps/topstepx/test_topstepx_trader.py` to lock the new runtime fields and monitor summaries. Updated `/Users/williamkosloski/mean-reversion/README.md` with the new monitor command + usage notes. **Verification**: `pytest -q test_topstepx_trader.py` → **4 passed**; `pytest -q test_monitor_trader2_runtime.py test_paper_trade_bridge.py test_scan_latest_session.py` → **8 passed**; `paper_trade_bridge.py --ticker NQ --trade-symbol MNQ --date 2026-03-19 --queue-topstepx --queue-path /tmp/trader2_monitor_verify/pending.json --force-queue` → queued `2` Trader 2 signals and wrote `/tmp/trader2_monitor_verify/trader2_queue_status.json`; `topstepx_trader.py --smoke --pending-signals /tmp/trader2_monitor_verify/pending.json` → smoke-accepted both signals and wrote `/tmp/trader2_monitor_verify/trader2_runtime_status.json`; `monitor_trader2_runtime.py --runtime-path /tmp/trader2_monitor_verify/trader2_runtime_status.json` → rendered gate provenance plus both pending MNQ shorts from the fresh runtime snapshot. **Current practical state**: Trader 2 now has a readable local observability surface — one runtime file plus one monitor command is enough to see whether the queue was gated, what got accepted, what positions are live, and whether any trade has already closed. Fresh smoke evidence lives under `/tmp/trader2_monitor_verify/trader2_runtime_status.json`; monitor output showed `accepted_smoke=2`, `smoke_accepted=2`, and Trader 1 strict-scan CSV provenance. **Next**: run `monitor_trader2_runtime.py --follow` against the shared live runtime path during market hours and use that output as the first real paper-execution review surface; once the hidden manager/watchdog files are editable, mirror the same summaries there. **Still smoke-only, not runtime-verified.**',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Tenth run — **caught its own report-generator bug**. Trader 1 memory is being appended newest-last, but `manager_report.py` still assumed newest-first and was summarizing the older `04:06` section instead of the newer `05:09` section. Fixed: manager now selects the latest timestamped Trader 1 memory section + classifies the newest `microgap-bot` work as recent-performance overlay / ranking-blend drift rather than only stale-report fade behavior. Regenerated `latest_report.md` — now correctly cites Trader 1\'s latest focus as `portfolio_allocator.py` recent-overlay tuning while keeping the management gate anchored to `gaps/ibkr` paper-runtime proof',
    lastRun: '2026-04-20 06:02 ET',
    takeaway:
      'Tenth run. **Management call unchanged at system level**: `Strict Micro-Gap Stack` remains champion, account `DUP346003` still configured in `~/gaps/ibkr`, `~/gaps/logs/ibkr` still empty — blocker still missing paper-runtime evidence. **Real manager-report bug caught this run**: Trader 1 memory is being appended **newest-last**, but `manager_report.py` still assumed newest-first and was summarizing the older `2026-04-20 04:06:00 EDT` section instead of the newer `2026-04-20 05:09:59 EDT` section. **Updated `manager_report.py`** to (a) select the latest timestamped Trader 1 memory section, (b) classify the newest `microgap-bot` work as recent-performance overlay / ranking-blend drift rather than only stale-report fade behavior. **Regenerated `latest_report.md`** — it now correctly cites Trader 1\'s latest focus as `portfolio_allocator.py` recent-overlay tuning while keeping the management gate anchored to `gaps/ibkr` paper-runtime proof. **Verification passed**: `python3 -m py_compile manager_report.py` and `python3 manager_report.py`. **Current management instruction**: keep Trader 1 focused on a real `python3 ~/gaps/ibkr/setup_ibkr.py` plus `python3 ~/gaps/ibkr/ibkr_trader.py --demo` paper run with TWS or IB Gateway open, and do NOT treat `microgap-bot` recent-overlay / ranking-blend refinement as the next gate until `~/gaps/logs/ibkr` contains runtime proof. **Cross-stream tension tracker**: Manager 1 has now sharpened wording 5 times (02:02 / 03:03 / 04:03 / 05:03 / 06:02). Trader 1 responded 4 of 5 times with more microgap work. Trader 1\'s 06:04 ship happened ~2 min after this manager run — the **symmetric recent-overlay demotion** is a material semantic change, not allocator quality. Dispute still unresolved at system level; more manager runs alone demonstrably won\'t converge it. **Needs explicit operator intervention.**',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Tenth run — **found a real manager-layer visibility gap**. Trader 2 had already upgraded `topstepx_trader.py` to publish lifecycle-rich `trader2_runtime_status.json`, but the manager was still only reading queue-level decision counts AND running scan as `--ticker NQ` (hid the executable MNQ preview). Updated `manager_report.py` to classify runtime snapshot freshness (`176 min old (stale)`) + evidence grade (`smoke-only` vs live-path), surface lifecycle summary + latest lifecycle event + recent closed-trade summary, run scan as `--ticker NQ --trade-symbol MNQ`, show executable ticket preview lines. Champion remains `NQ Z-Score Balance Gate`; Trader 2 still smoke-verified, not runtime-verified',
    lastRun: '2026-04-20 06:04 ET',
    takeaway:
      'Tenth run. **Re-audited Trader 2 after the upstream 05:12 + 06:09 ET Trader 2 runs** instead of trusting the stale 05:02 ET manager report. **Real manager-layer visibility gap caught**: Trader 2 had already upgraded `/Users/williamkosloski/gaps/topstepx/topstepx_trader.py` to publish lifecycle-rich `trader2_runtime_status.json`, but `/Users/williamkosloski/.codex/automations/trader-manager-2/manager_report.py` was still only reading queue-level decision counts AND using `scan_latest_session.py --ticker NQ` which hid the actual executable MNQ preview that Trader 2 now treats as canonical. **Updated `manager_report.py`** to (a) classify runtime snapshot freshness (`176 min old (stale)`) and evidence grade (`smoke-only` vs live-path), (b) surface lifecycle summary + latest lifecycle event + recent closed-trade summary directly from `trader2_runtime_status.json`, (c) run the manager scan as `--ticker NQ --trade-symbol MNQ`, (d) show the executable ticket preview lines instead of only raw setup candidates. **Regenerated `latest_report.md`** at `2026-04-20 06:04:05 EDT`. **Verification**: `py_compile` + full regeneration clean. **Current management decision**: champion remains `NQ Z-Score Balance Gate`. Trader 2 remains `smoke-verified`, not `runtime-verified`. **Proof gap stated more precisely**: the only visible runtime artifact is a stale `/tmp` smoke snapshot with `accepted_smoke=2`, no lifecycle events, and no closed trades; the next manager-grade proof is still the first non-smoke shared runtime snapshot under `~/gaps/logs/topstepx`. **Note**: the 06:09 ET Trader 2 run that added `monitor_trader2_runtime.py` + `queue_review` with gate provenance has NOT yet been picked up by this manager run — next manager refresh should read the new monitor CLI + `gate_fail_closed` / `gate_note` / `gate_csv_path` fields as first-class signals.',
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
