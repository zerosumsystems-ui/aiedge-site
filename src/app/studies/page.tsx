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
    title: 'Auto backtest replicates C3 ship-grade (77.1% / +1.91R / DD −2R, n=83) on Pattern Lab; pt 40 adds Monday fallback ladder + ET action clock; pre-open pt 39 highest long FDX, highest short DKNG',
    lastRun: '2026-04-20 03:40 ET · auto-backtest + pt 40 fallback',
    takeaway:
      'Overnight SPT arc kept advancing. **(1) `backtest` scheduled task** ran the full PLAYBOOK policy stack end-to-end against the current Pattern Lab DB (759 raw detections, 8.1 months, 327 symbols). **Results exactly replicate pt 37/38**: raw SPT universe FAILS (WR 42.1%, perR +0.34R, DD −32.66R); default 3R (B) SHIPS at WR 64.1% / perR +1.16R; hybrid R-target (C) SHIPS at +1.46R; **C3 reco SHIPS at WR 77.1% / perR +1.91R / DD −2R on n=83**, every walk-forward third positive. Long side +1.95R, short side +1.84R. **Every acceptance gate clears with daylight** — cleanest mechanical edge in the entire research arc and now confirmed by an independent automated rerun. **(2) Pt 40 Monday fallback + ET clock** — operational note at 03:35 ET: if an A-tier signal doesn\'t fire by 10:30 ET, drop to B-tier; if none by 12:00 ET, shift to next-day-follow-through mode. **(3) Pt 39 pre-open one-pager** (02:18 ET): FDX standalone highest-conviction long, DKNG standalone highest-conviction short for today\'s session. **Residual doc drift** (Codex research-review 03:06): README + PLAYBOOK + Monday watchlist + pre-open card still reference old pt 27 headlines (+1.84R) and old L1/L2 short → 4R mapping; the validated pt 17 map is L1/L2 → 3R, H2-short → 4R, H1-short → 5R. Cleanup queued.',
    source: 'aiedge-vault · Scanner/backtests/2026-04-20-spt-full-playbook.md · Brooks PA/concepts/small-pullback-trend-monday-fallback-and-clock-2026-04-20.md · small-pullback-trend-pre-open-one-pager-2026-04-20.md',
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
    title: 'Run #29 — all 10 Codex streams advanced 03:0x → 04:0x; trader-1 added allocator age-fading (7d start / 45d cliff); trader-2 added full lifecycle events + closed-trade retention; performance-audit flagged `/knowledge` + `/findings` pulling the full vault snapshot client-side (250 KB PNGs via plain `<img>`); research-review pivoted to an RS-sweep `smalll pullback` bundle with 3 hard report defects. aiedge-journal-tab materially SHIPPED at commit `31c3325`.',
    lastRun: '2026-04-20 04:43 ET · run #29',
    takeaway:
      '15 cards unchanged (5 Claude + 10 Codex). All 10 Codex memories advanced 03:0x → 04:0x ET. **CLAUDE side** — no new research arc advances since run #28 (phase still at incr 08 @ 03:11, SPT still at pt 40 + auto-backtest @ 03:37, trend still at incr 28 @ 00:22, HoS still at 01:40 late). **But `aiedge-journal-tab` materially shipped**: commit `31c3325 feat(journal): always-on symbol chart + shared BarsChart + audit-note coverage` on main; follow-up `b49d92a fix(bars): 24h intraday pad so same-day trade charts aren\'t empty` + merge commit. Run #28 refresh `b851e23` also landed. **CODEX side — 5 substantive, 5 structural**: (1) **trader-1 04:06** added **age-aware fading** for portfolio research overlays in `microgap-bot/portfolio_allocator.py` — `PORTFOLIO_REPORT_FADE_START_DAYS=7`, `PORTFOLIO_REPORT_MAX_AGE_DAYS=45`; fresh reports keep full symbol overweighting, aging reports blend weights back toward 1.00x, too-old reports fall back to neutral sizing; live bot + strict scan log allocator source/age/recency; 12 tests pass. (2) **trader-2 04:06** extended `trader2_runtime_status.json` with **full lifecycle events** (`entry_submitted` / `smoke_accepted` / `entry_filled` / `exit_orders_placed` / `trail_stop_moved` / `stop_filled` / `target_filled` / `flatten_requested`) + `recent_closed_trades` retention; closed trades keep realized P&L, exit reason, setup, gate provenance even after position removal; 4 + 6 tests pass. (3) **performance-audit 04:05** switched to `/knowledge` + `/findings`: `VaultNote` includes raw `content`, `KnowledgeShell` fetches `/api/vault`, both `/knowledge` and `/knowledge/[...slug]` render from full `notes[]` in the browser; `/findings` is a client page that pulls `/api/vault` just to build a slug set + renders 250,938-byte PNGs via plain `<img>`. (4) **research-review 04:08** pivoted to an RS-sweep "smalll pullback" bundle under `~/.gemini/antigravity/brain/` — verified RS>=70 directional split real (longs 19,261 / +$875,775; shorts 5,627 / +$1,296,517) but **3 hard defects**: docs claim 2018-01→2024-12 but dataset is 80 months starting 2018-05; `in_depth_stats_report.md` reports `Worst Monthly Drawdown: $0.00` for every RS bucket despite raw RS>=70 worst month 2020-03 at `−$58,300` and max monthly DD `$84,795`; `key_findings_summary.md` mixes incompatible studies in the `SPBT Fallacy` claim (cites `−$38,640` from a 2,466-trade Gap-ups sweep vs the 24,888-trade RS corpus). (5) **code-review 04:06** re-rotated Gap-ups + trading-range: Gap-ups EOD short-close math inverted; Gap-ups EOD flatten ignores open 2nd tranche after scale-in; Gap-ups sector caps count submitted (not concurrent) trades; trading-range live time-window checks compare UTC feed bars vs ET cutoffs. **Structural** (5): `sdk-drift 04:03` enumerated full `aiedge/scanner` pyproject-vs-requirements drift (databento / matplotlib / pyyaml mismatches + 10 extra deps in requirements); `research 04:06` 13th iteration rewrote market-cycle note from direct Brooks book extracts instead of secondary summaries; `trader-manager-1 04:03` sharpened to distinguish execution-guardrail work from generic research drift; `trader-manager-2 04:04` now prefers the shared live queue path (`~/gaps/logs/topstepx`) for Trader 2\'s runtime snapshot, falling back to `/tmp` only as smoke-only evidence; `claude-updates 04:04` flagged two still-live Claude bugs — `aiedge/signals/bpa.py:34` `BPA_SHORT_SETUP_TYPES = {"L1","L2"}` drops FH1/FH2 shorts from scoring, and `/api/bars:303` ships `Cache-Control: public, s-maxage=3600` + symbol page keys `to` as a date string = hour-stale intraday bars. **Cross-stream tension** — Trader 1 at 04:06 did NOT re-contradict Manager 1 (this run was allocator *quality* not new gate expansion); dispute holds but did not escalate. **Time-bound risk still open**: `com.will.trading-reports.plist` still fires at 16:15 ET today (~11h 30m out) into missing `~/.openclaw/rs-reports/run.py`; re-verified by launchctl + direct `ls` this run. No dual-write; single vault write held.',
    source: '~/code/routines/FINDINGS_2026-04-20_0443.md · vault/Meta/Code Organization 2026-04-20_0443.md',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Thirteenth iteration — rewrote market-cycle note from direct local Brooks book extracts (spectrum, spike-and-channel, pullbacks converting trends to ranges, tight trading ranges, MTR, `always_in`) instead of secondary summaries; authorship language sharpened — Codex wrote it, Claude-labeled folders on disk are packaging only',
    lastRun: '2026-04-20 04:06 ET',
    takeaway:
      'Fourth restructure of the Brooks market-cycle note in 4 hours. **This iteration finally anchors every conclusion in the exact local Brooks source chain**: `market_spectrum.txt`, `always_in.txt`, `trading_range_taxonomy.md`, `major_trend_reversals.md` under `~/code/aiedge/brooks-source/extracted/`, plus `~/code/aiedge/scanner/aiedge/context/daytype.py` and the `trading-range` project code. Previous iterations leaned on secondary summaries; this one cites direct book extracts for the spectrum, spike-and-channel, pullbacks-converting-trends-to-ranges, tight trading ranges, and major trend reversal sections. **Authorship language sharpened** — the note now explicitly clarifies Codex wrote and maintains it, while noting that any Claude-labeled folders on disk are just packaging / storage for source material, not Claude-authored research. **Vocabulary retained** from iterations 10/11/12: `breakout / spike → channel → trading range → new breakout`, with the fuller operational loop `breakout → trend → pullback → range → breakout test → resumption or MTR candidate`. Still structural / editorial — no new substantive framing or quantitative result. Deliverable refreshed at `~/.codex/automations/research/market_cycle_phases_codex.md`.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Re-rotated to `~/Gap-ups` + `~/trading-range`; sharpened to 4 confirmed main risks: Gap-ups EOD short-close math inverted + EOD flatten ignores open 2nd tranche after scale-in + sector caps count submitted (not concurrent) trades; trading-range live time-window checks compare UTC feed bars vs ET cutoffs',
    lastRun: '2026-04-20 04:06 ET',
    takeaway:
      'Tightened the active-diff review after 03:04\'s sweep. **Re-verified and consolidated to 4 main risks** across the two highest-signal repos: (1) **`Gap-ups` EOD short-close math is still inverted** — backtest force-closes remaining short trades at EOD using the long-side exit-price / PnL formula, silently corrupting short-side results. (2) **`Gap-ups` EOD flatten ignores an open second tranche after scale-in** — if the strategy scaled in, the EOD flatten only catches the first leg and leaves the second tranche open in the synthetic book. (3) **`Gap-ups` sector caps count submitted trades for the whole day instead of concurrent open positions** — the cap is structurally wrong; a strategy with 10 fills throughout the day hits the cap even though at most 2 are open simultaneously. (4) **`trading-range/live` time-window checks compare UTC feed bars against ET cutoffs** — off-by-4h window math can admit or reject trades in the wrong window. **Prioritization**: only review new diffs on next run unless these 4 findings are actually fixed. This run merged the pre-existing `trading-range` cutoff-on-detection + `contractId` fill-mixing findings from 03:04 into the same active queue — queue is still the same 7 items across Gap-ups, trading-range, BPA-Bot-1, gaps/topstepx, and mean-reversion, with Gap-ups short-side math + Gap-ups sector-cap concurrency being the silently-corrupting-P&L bugs.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'New top finding — `/knowledge` routes fetch the full vault snapshot client-side (`VaultNote` includes raw `content`; `KnowledgeShell` hits `/api/vault`); `/findings` is a client page that pulls `/api/vault` just to build a slug set + renders 250 KB PNGs via plain `<img>` tags',
    lastRun: '2026-04-20 04:05 ET',
    takeaway:
      'Re-audited `/Users/williamkosloski/code/aiedge/site` (Next 16.2.4 / React 19.2.4). **New highest-leverage finding**: Knowledge routes still fetch the full vault snapshot **client-side**. `VaultNote` includes raw `content`, `KnowledgeShell` fetches `/api/vault`, and both `/knowledge` and `/knowledge/[...slug]` render from the full `notes[]` array in the browser — the whole vault payload ships to every visitor. **Additional new finding**: `/findings` is a client page that fetches `/api/vault` only to build a slug set, and it renders large PNGs with plain `<img>` tags — **largest measured figure asset is 250,938 bytes**, unoptimized. **Reconfirmed prior hotspots**: (a) `/symbol/[ticker]` is still a client page firing 4 data fetches plus the always-on `/api/bars` chart fetch (5th request); it also pulls the full `filled_trades` snapshot and filters by ticker in the browser. (b) `/journal` still statically imports `TradesTab` → `BarsChart` → `lightweight-charts.production.mjs` (**raw file size 180,763 bytes**), so the default entries view pays for chart code before the Trades tab is opened. **Measurement blocker**: `npm run build` could not complete in this restricted environment because `next/font/google` failed to fetch Geist + Geist Mono; route bundle-size output unavailable, so bundle claims remain grounded in source/import measurements rather than final build artifacts. **Highest-leverage fixes**: server-render the knowledge routes + strip `content` from the client-side `VaultNote` payload; switch `<img>` tags on `/findings` to `next/image`; server-first `/symbol/[ticker]` scoped to one ticker; dynamic import of chart stack from Journal.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'Full re-baseline of `aiedge/scanner` manifest drift — `pyproject.toml` vs `requirements.txt` diverge on databento (>=0.70,<1 vs >=0.38.0), matplotlib (>=3.7 vs >=3.8.0), pyyaml (>=6.0 vs >=6.0.1); requirements carries 10 extra runtime/tooling deps not in pyproject (anthropic, elevenlabs, httpx, Pillow, google-api-python-client, google-auth-oauthlib, google-auth-httplib2, jsonschema, Jinja2, mplfinance)',
    lastRun: '2026-04-20 04:03 ET',
    takeaway:
      'Re-baselined dependency/SDK drift across local repos under `/Users/williamkosloski`. **Headline concrete drift: `aiedge/scanner`** — `pyproject.toml` and `requirements.txt` describe two different Python environments. **Key overlap mismatches**: `databento>=0.70,<1` (pyproject) vs `databento>=0.38.0` (requirements); `matplotlib>=3.7` vs `>=3.8.0`; `pyyaml>=6.0` vs `>=6.0.1`. **requirements.txt also carries 10 extra runtime/tooling dependencies not present in pyproject.toml**: `anthropic`, `elevenlabs`, `httpx`, `Pillow`, `google-api-python-client`, `google-auth-oauthlib`, `google-auth-httplib2`, `jsonschema`, `Jinja2`, `mplfinance`. Per the scanner migration docs, `pyproject.toml` is the packaged source of truth — that\'s the target to align. **Also in-scope but previously captured**: `aiedge/site` (Next 16.2.4 / React 19.2.4) remains internally aligned; `Finviz-clone` remains aligned on Next ^16.1.6 / React ^19.2.4; `Downloads/tradescope` still unlocked (React ^18.3.1 / Vite ^6.0.7, no lockfile); `market-dashboard` still has only `private=true` in package.json despite using native fetch against Polygon; `BPA-Bot-1` active reqs extend archived with `ib_insync>=0.9.86,<1.0` + `tomli` for <3.11; `Gap-ups` still has two identical `requirements.txt` files; `trading-range/live` remains fully unpinned. **Stock_screener_pro** continues to be dropped out of scope.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Big delta — `aiedge-journal-tab` MATERIALLY SHIPPED at commit `31c3325` (shared `BarsChart` + always-on `/symbol/[ticker]` chart + `TradesTab` refactor); `trends` incr29 has DUPLICATE scripts (`forward_return_equity_incr29.py` AND `forward_return_incr29.py`), still no artifact; 2 still-live Claude bugs flagged — `BPA_SHORT_SETUP_TYPES = {L1,L2}` drops FH1/FH2 shorts + `/api/bars` 1-hour cache makes intraday bars stale',
    lastRun: '2026-04-20 04:04 ET',
    takeaway:
      'Delta scan since 03:05 follow-up. **Shipped Claude work** between ~03:06 and 04:02 ET. `aiedge-journal-tab` is **materially shipped**: commit `31c3325 feat(journal): always-on symbol chart + shared BarsChart + audit-note coverage` added the shared `BarsChart` component, made `/symbol/[ticker]` always render a chart, and refactored `TradesTab`; follow-up commit `b49d92a fix(bars): 24h intraday pad so same-day trade charts aren\'t empty` + merge commit `8b97349` also landed. Remaining Claude follow-up: rerun `scripts/sync_trades.py` with `SYNC_SECRET` to backfill more audit-note ticker chips. `backtest` independently reaffirmed SPT C3 stack as the current strongest Claude result: **77.1% WR, +1.91R/trade, max DD −2R on n=83 over ~8.1 months** — reconfirmed, not a weaker rerun. `phases` incr 08 sharpened the read: spike labels still zero-edge in dominant trending phases, but a small `trading_range` subset shows a real bear-spike fade pocket; Claude still recommends no scanner promotion (n is thin). `small-pullback-trend-research` published pt 40 with Monday fallback ladder + ET action clock; primary picks remain FDX long / DKNG short. `organize-my-code` ran #28 on branch `claude/studies-run-26-refresh` at `7a20d59`, with uncommitted studies/page.tsx delta for 03:xx findings. **`trends` is the messiest arc**: two different incr29 scripts exist and differ — `forward_return_equity_incr29.py` AND `forward_return_incr29.py` — no corresponding `incr29` methodology output under `vault/Scanner/methodology`; treat as incomplete / not publishable. **Two still-live Claude bugs verified in live tree**: (1) `aiedge/signals/bpa.py:34` still has `BPA_SHORT_SETUP_TYPES = {"L1", "L2"}` — detector-fired `FH1`/`FH2` shorts still fall through scoring. (2) `/api/bars:303` still ships `Cache-Control: public, s-maxage=3600` and the symbol page still keys `to` as a date string in `page.tsx:274`, so intraday symbol charts can still serve hour-stale bars. **Extreme memory pressure** still logged by Claude\'s own maintenance run (~14.5 MB free, load avg ~120) — low-yield background Claude sweeps are a resource tradeoff. **`com.will.trading-reports` still broken**: plist still points to missing `~/.openclaw/rs-reports/run.py`, Mon-Fri 16:15 ET, fires today. Next-run watch: whether uncommitted `/studies` delta committed/merged/abandoned; whether `incr29` resolves; highest-value intervention queue is the FH1/FH2 short-score drop + intraday bars cache staleness.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Pivoted to an RS-sweep `smalll pullback` bundle under `~/.gemini/antigravity/brain/` — verified directional split real (RS>=70 longs 19,261 / +$875 K; shorts 5,627 / +$1.30 M) but 3 hard report defects: dataset date range mislabeled (80 mo starting 2018-05, not 84 from 2018-01); `Worst Monthly Drawdown $0.00` for every RS bucket despite 2020-03 at −$58 K; `SPBT Fallacy` mixes 2,466-trade Gap-ups sweep vs 24,888-trade RS corpus',
    lastRun: '2026-04-20 04:08 ET',
    takeaway:
      'Rotated off the SPT arc to a separate "smalll pullback" RS-sweep research bundle under `~/.gemini/antigravity/brain/2711c2b8-d8c9-4839-a6d3-7ed77e993fb6`, re-verified against local raw outputs + executable scratch scripts. **Verified as correct from source**: RS sweep headline totals by threshold match the raw monthly JSONs in `~/.gemini/antigravity/scratch/results/monthly/rs_*`; RS>=70 directional split is real (longs **19,261 / +$875,775.06**, shorts **5,627 / +$1,296,516.66**); ATR sandbox appendix reproduces exactly when rerun sequentially from `test_atr_setups.py` (trend pullback 4,871 / +$10,518; fade low 4,377 / +$31,326); SPY benchmark math reproduces but **only from the first available bar on 2018-05-01**, not January 2018. **Report defects carried forward**: (1) Docs say `2018-01 to 2024-12`, but the monthly RS dataset is only **80 months starting 2018-05**. (2) `in_depth_stats_report.md` reports `Worst Monthly Drawdown: $0.00` for every RS bucket; raw RS>=70 monthly files show worst month 2020-03 at **−$58,300.52** with max monthly drawdown **$84,795.99**. (3) `key_findings_summary.md` mixes incompatible studies when it claims the `SPBT Fallacy`: the cited `−$38,640.60` comes from `~/Gap-ups/results/sweep_spbt.json` with only **2,466 trades** and a different setup universe, not the **24,888-trade** monthly RS sweep. (4) Minor reporting drift — breakeven trades omitted from inline win/loss counts (RS>=70 has 13 breakevens). **Active queue now**: 3 BPA-Bot-1 first-pullback report bugs (02:15 run) + 4 SPT doc-drift items (03:06 run) + 3 RS-sweep defects (this run) + the earlier Adobe / futures narrative checks — still all documentation / reporting defects, not code bugs. Run time ~16 min.',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: 'Added age-aware fading for portfolio research overlays in `microgap-bot/portfolio_allocator.py` — `PORTFOLIO_REPORT_FADE_START_DAYS=7` / `PORTFOLIO_REPORT_MAX_AGE_DAYS=45`; fresh reports keep full symbol overweighting, aging reports blend weights back toward 1.00x, too-old reports fall back to neutral sizing; 12 tests pass',
    lastRun: '2026-04-20 04:06 ET',
    takeaway:
      'Third consecutive run advancing `microgap-bot` (allocator → guardrails → age-fading). **Core risk identified this run**: the allocator was loading portfolio research reports of arbitrary age without distinguishing "fresh reco" from "six-week-stale reco"; a stale research overlay could keep applying outsized symbol weights long after the underlying signal decayed. **Code changes in `/Users/williamkosloski/microgap-bot/portfolio_allocator.py`**: two new config knobs — `PORTFOLIO_REPORT_FADE_START_DAYS=7` and `PORTFOLIO_REPORT_MAX_AGE_DAYS=45`; fresh reports (< 7 days) keep full symbol overweighting; aging reports (7–45 days) **linearly blend weights back toward `1.00x`**; too-old reports (> 45 days) fall back to neutral sizing and ranks. Live bot + strict scan now log allocator source / age / recency instead of only printing the raw report path. `README.md` updated to document the stale-report fade behavior. **Verification**: `python3 -m pytest -q test_portfolio_allocator.py test_research_signal_engine.py test_research_scan.py` → **12 passed**. **Cross-stream tension update**: this run did NOT re-contradict Manager 1 — it was a quality fix on the already-shipped allocator rather than a new gate expansion. Dispute with Manager 1 (microgap-bot should not be the next gate until IBKR paper proof) holds at the system level but did not escalate this run. **Next direction**: analyze simultaneous-signal timestamps from the strict research dataset and tune bucket/heat limits from observed cluster frequency instead of current pragmatic defaults.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: 'Extended `trader2_runtime_status.json` with full lifecycle events (`entry_submitted` / `smoke_accepted` / `entry_filled` / `exit_orders_placed` / `trail_stop_moved` / `stop_filled` / `target_filled` / `flatten_requested`) + `recent_closed_trades` retention — closed trades keep realized P&L, exit reason, setup, gate provenance even after position removal; 4 + 6 tests pass',
    lastRun: '2026-04-20 04:06 ET',
    takeaway:
      'Closed the main observability gap left from 03:07\'s runtime-status ship. **Core decision**: keep Trader 2 fill / exit lifecycle history in `trader2_runtime_status.json`, not just queue admission and open-position state. **Code changes in `gaps/topstepx/topstepx_trader.py`**: `OpenPosition` now stores richer metadata (`setup`, source / gate provenance, timestamps) so runtime snapshots can describe actual trade lifecycle. Added lifecycle recording helpers for `entry_submitted`, `smoke_accepted`, `entry_filled`, `exit_orders_placed`, `trail_stop_moved`, `stop_filled`, `target_filled`, `flatten_requested`. `write_trader2_runtime_status()` now emits `recent_lifecycle_events`, `lifecycle_summary`, and `recent_closed_trades` alongside the existing queue-review and decision summaries. **Closed trades retained after the live position is removed**, preserving realized P&L, exit reason, setup, and Trader 1 gate provenance. `mean-reversion/README.md` documents that the runtime snapshot now includes fill/exit lifecycle + closed-trade history. Extended `test_topstepx_trader.py` with a regression that walks a live Trader 2 order through entry submission → entry fill → exit-order placement → target fill. **Verification**: `pytest test_topstepx_trader.py` → **4 passed**; `pytest test_paper_trade_bridge.py test_scan_latest_session.py` → **6 passed**. **Practical state**: `trader2_runtime_status.json` now tells the full short-horizon Trader 2 story — what was queued, what was accepted, whether it filled, what exit logic was placed, and how the most recent closed trades resolved. Manager / watchdog consumers no longer need log scraping to answer "did Trader 2 actually fill?" or "was that realized P&L from a target or a stop?" **Next**: consume `trader2_runtime_status.json` from a manager / watchdog layer or add a small local monitor that surfaces the richer snapshot continuously.',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Eighth run — sharpened `manager_report.py` again to distinguish `microgap-bot` execution-guardrail work (`order_manager` / portfolio heat / correlation buckets) from generic portfolio research drift, and to prefer a representative latest-memory excerpt when the newest Trader 1 note mentions those exact terms; management instruction unchanged — no microgap-bot gate until `~/gaps/logs/ibkr` has runtime proof',
    lastRun: '2026-04-20 04:03 ET',
    takeaway:
      'Eighth run. **Management call unchanged at system level**: `Strict Micro-Gap Stack` remains champion, account `DUP346003` still configured in `~/gaps/ibkr`, `~/gaps/logs/ibkr` still empty — blocker still missing paper-runtime evidence. **Found a sharper wording gap after Trader 1\'s 03:06 memory update**: newest memory is not just `microgap-bot` research drift, it is **concrete execution hardening in `microgap-bot/order_manager.py`** with portfolio heat and correlation caps before the champion IBKR path has runtime proof. **Updated `manager_report.py`** so it (a) distinguishes `microgap-bot` execution-guardrail work from generic portfolio research drift, (b) prefers a more representative latest-memory excerpt when the newest Trader 1 note mentions `order_manager`, execution guardrails, portfolio heat, or correlation buckets. **Regenerated `latest_report.md`** — now explicitly says Trader 1 is hardening `microgap-bot` execution controls before `gaps/ibkr` has produced any paper-runtime evidence. **Verification passed**: `py_compile` + full regeneration clean. **Current management instruction**: keep Trader 1 focused on a real `python3 ~/gaps/ibkr/setup_ibkr.py` plus `python3 ~/gaps/ibkr/ibkr_trader.py --demo` paper run with TWS or IB Gateway open, and do not treat `microgap-bot` execution guardrails as the next gate until `~/gaps/logs/ibkr` contains runtime proof. **Cross-stream tension update**: Trader 1\'s 04:06 run was allocator age-fading (quality, not new gate expansion) and did not re-contradict this manager instruction, so the dispute held without escalating. Still requires explicit operator intervention at the system level; more manager runs alone won\'t converge it.',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Eighth run — manager now loads Trader 2\'s normalized runtime snapshot, preferring the shared live queue path under `~/gaps/logs/topstepx` and falling back to `/tmp/trader2_runtime_status.json` only when no live snapshot exists; first manager-grade proof explicitly defined as the same snapshot appearing beside the shared live queue with non-smoke decision events',
    lastRun: '2026-04-20 04:04 ET',
    takeaway:
      'Eighth run. Re-audited Trader 2 for anything new since the 03:04 manager run. **Management call itself did not change**: `~/gaps/logs/topstepx` still has only smoke evidence and no live `pending.json`, `trader2_queue_status.json`, or `trader2_runtime_status.json`; freshest Trader 2 upstream artifacts are still the 03:07 smoke-verification outputs in `/tmp`, not authenticated market-hours TopStepX execution. **Closed a new manager-visibility gap in `manager_report.py`**: the report now **loads Trader 2\'s normalized runtime snapshot directly**, preferring the shared live queue path under `~/gaps/logs/topstepx` and falling back to `/tmp/trader2_runtime_status.json` only when no live snapshot exists. The regenerated `latest_report.md` now surfaces snapshot path, timestamp, smoke/live mode, health state, queue category, headline, and decision summary. **Immediate next step now explicit**: treat `/tmp` snapshots as smoke-only evidence; the **first manager-grade proof is the same runtime snapshot appearing beside the shared live queue with non-smoke decision events**. **Verification**: `py_compile` + full regeneration clean. **Current management decision**: Champion remains `NQ Z-Score Balance Gate` (OOS PF 1.80, expectancy +0.5089R). Trader 2 is `smoke-verified`, `queue-ready`, manager-visible through the normalized runtime snapshot, but **still not `runtime-verified`** — gating proof is still the first authenticated TopStepX paper execution during live market hours.',
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
