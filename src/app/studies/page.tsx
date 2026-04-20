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
      'The incr-25 live gate does NOT travel to ES: ES baseline direction-survival is 70.3% vs 78% on equities, forcing a tighter ES-only schedule',
    lastRun: '2026-04-19 22:1X ET · incr 26',
    takeaway:
      'Follow-up answers one of the two "needs Will\'s nod" items from incr 25 — does the proposed equity-derived live direction-survival gate travel to ES futures? **No, not unchanged.** On 101 ES.c.0 RTH sessions (≈5 months Databento GLBX.MDP3, 4 887 directional observations), ES baseline is **70.3% vs 78% on equities**. Applying the incr-25 schedule to an ES live gate would miss the 90% target at every late-session cell. ES-calibrated p90 thresholds: bars 10-14 **0.20** (thin n=43, treat bar 15 as the real start); 15-29 **0.30**; 30-39 **0.30** (equity was 0.20, ΔES +0.10); 40-59 **0.20** (equity 0.15, Δ +0.05); 60-78 **0.15** (equity 0.10, Δ +0.05). The front half of the session agrees with equities; the gap opens from bar 30 onwards — exactly the hand-off zone incr 25 marked as "moderate 0.15-0.20 clears 90% on equities." On ES that cell only reaches ~85%. **No production code change** — still proposal, now with an instrument-specific schedule ready to ship when Will approves. Tests: 602/905 still green.',
    source: 'aiedge-vault · Scanner/methodology/trend-contributor-findings-2026-04-19-incr26-es-direction-survival.md',
    href: { label: 'Open Findings → Trend arc', url: '/findings#trend' },
  },
  {
    id: 'spt-research',
    producer: 'claude',
    stream: 'Brooks PA — small-pullback-trend (SPT)',
    title: 'Pt 35 fuses pt 33 magnitude × pt 34 quality into one per-TF rank: WMT and MRK dominate cross-TF longs; ADBE is the lone A-tier short anywhere',
    lastRun: '2026-04-19 21:0X ET · pt 35 (operational deliverable)',
    takeaway:
      'Operational consolidation. Combined score = |net_R| × extreme_closeness × max(0, 1 − pullback_pct). One top long + one top short per timeframe: Daily AMD long (4.00, A-tier, +6.65R/pb 0.38) and no clean short anywhere on daily; 60m DIA long (3.54, B), 60m no clean short; 30m MRK long (4.91, B) vs ADBE short (0.47, C); 15m WMT long (4.78, B) vs ADBE short (3.12, **A**); 5m WMT long (10.44, B) vs ADBE short (3.54, B). **Cross-TF stars** (Σ combined across TFs): longs led by WMT (5 TFs, Σ 17.65 — structural Friday vertical), MRK (4 TFs uniform B-grade, Σ 14.41), UNH (5/Σ 11.66), DIS (5/Σ 11.43), DIA (3/Σ 9.91), AVGO (5 TFs with daily A, Σ 9.32). **ADBE is the only A-tier short anywhere in the scan**, then CRM (B/B at 15m+5m) and ORCL (B/C at 15m+5m). Codex research-review verified: pt 34 narrative directionally correct, but Monday watchlist and the iphone repo SPT notes still promote invalidated names (CVX/ORCL/GE/COST) and have count mismatches (daily C-tier 8 vs 12, 30m B-tier 9 listed but 8). Pt 35 supersedes those.',
    source: 'aiedge-vault · Brooks PA/concepts/small-pullback-trend-recommendations-by-timeframe-2026-04-19.md',
    href: { label: 'Open Findings → SPT arc', url: '/findings#spt' },
  },
  {
    id: 'code-organization',
    producer: 'claude',
    stream: '/organize-my-code scheduled task',
    title: 'Scope extended again: /studies now surfaces 4 newer Codex streams (trader-1, trader-2, both managers). Monday-launch risk on scanner worsens: untracked files now 65.',
    lastRun: '2026-04-19 22:31 ET · run #23',
    takeaway:
      '5 archive candidates (`BPA-Bot-1` 4.3 G, `Gap-ups` 2.8 G, `Finviz-clone` 510 M, `market-dashboard` 3.4 M, `microgap-bot` 284 K — grew since run #22 as Trader 1 shipped strict-live into it) and 2 active repos to move into `~/code/` (`Brooks-Price-Action` 70 M, `trading-range` 210 M). `~/keys/*.env` mode 600 (re-verified). Organizational state unchanged since 04-18 — all moves still gated on explicit go-ahead per management contract. **Dual-write fix held again** — `vault/Meta/Code Organization 2026-04-19_2231.md` is the only write. **Scope expansion this run**: /studies now includes 4 new Codex automation streams (`trader-1`, `trader-2`, `trader-manager-1`, `trader-manager-2`) — 10 Codex + 3 Claude = 13 cards total, up from 9. **Monday-launch risk worsens**: `aiedge/scanner` `main` still 10 commits ahead of origin, now 16 modified + **65 untracked files** (was 61 in run #22 — +4 SPT scratch outputs). Codex `claude-updates` 22:05 ET first run baselined from Claude artifacts; `market-dashboard` performance + fan-out issues still open per `performance-audit` 22:04 ET.',
    source: '~/code/routines/FINDINGS_2026-04-19_*.md (21 runs today)',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Phase loop tightened to `Balance / Breakout Mode → Breakout / Spike → Channel → Trading Range → Next Breakout`; now line-anchored into local Brooks extracts and aiedge phase research',
    lastRun: '2026-04-19 21:04 ET',
    takeaway:
      'Seventh iteration. This pass anchors every claim with line-anchored links into local Brooks chapter extracts under `~/code/aiedge/brooks-source/`, the `Brooks-Price-Action` reference bundle, and the new aiedge phase note at `vault/Scanner/methodology/phase-spike-realtime-incr01.md`. Preferred phase map updated to `Balance / Breakout Mode → Breakout / Spike → Channel → Trading Range → Next Breakout` (front-loaded as the answer). Pullback and reversal still explicitly classified as transition processes, not stable phases. Added local chart precedent links for Trends figures 21.1 and 22.1. Attribution wording remains explicit: research conducted by Codex, not Claude.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Scope re-rotated to `~/market-dashboard` + staged lockfile in `~/Finviz-clone`; prior trading-range / Gap-ups / BPA-Bot-1 / market-dashboard bugs still open.',
    lastRun: '2026-04-19 22:03 ET',
    takeaway:
      'This pass re-focused on active changes in `~/market-dashboard` and the staged lockfile change in `~/Finviz-clone`. The four previously opened `~/trading-range` live-trading criticals remain unresolved — (1) `live/executor_tradovate.py` fills mixed by `contractId`; (2) `live/scanner.py` off-by-one cutoff-bar inclusion; (3) `first_trigger_bar` vs mutable `trigger_bar` narrowed-gap hindsight; (4) `run_today_microgaps.py` still computes off `trigger_bar`. Earlier-pass `market-dashboard` bugs also still open (hardcoded FMP API key, no upstream error checks, screener hang on <3 candles, filter/reset desync, resize refetch). Codex is rotating review targets each run rather than closing on any single repo — an operational rhythm observation, not a bug.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'Re-audit of market-dashboard — tracked HEAD still `0dd4c4b`, no new committed regression. Resize-refetch + 22-call screener fan-out remain the highest-leverage unsolved issues.',
    lastRun: '2026-04-19 22:04 ET',
    takeaway:
      'Re-audited `~/market-dashboard` against the prior memory as baseline. **No new code-level performance regression** since the previous pass: `index.html` is still 28 588 B raw / 7 877 B gzip and screener/API files are unchanged from previously audited state. Highest-leverage issue remains the screener fan-out: one filter/apply path still becomes 22 upstream Polygon calls (`/api/screener` does one full-market snapshot; `/api/candles` fans out to up to 21 per-ticker aggregates). The resize regression also persists: `window.addEventListener(\'resize\', loadCharts)` still causes fresh `/api/aggs` fetches for SPY and QQQ on every resize event. Recommended next fixes (unchanged): short-lived shared snapshot/candle caching on the server, lazy-load or cap screener mini-charts, debounce resize to redraw from cached data only, then capture a browser trace to validate TTI improvement.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'Rescan confirms: `aiedge/scanner` manifest-to-manifest drift (`pyproject.toml` vs `requirements.txt`) persists; Gap-ups + trading-range still underdeclare; Finviz-clone trails Next baseline',
    lastRun: '2026-04-19 22:04 ET',
    takeaway:
      'Refresh of the prior baseline. **Video-pipeline gap closed** — `~/code/aiedge/scanner` now tracks both `pyproject.toml` and `requirements.txt` (it absorbed video-pipeline). New issue exposed: `aiedge/scanner` has manifest-to-manifest drift — `pyproject.toml` declares `databento>=0.70,<1` / `matplotlib>=3.7`, while `requirements.txt` carries `databento>=0.38.0` / `matplotlib>=3.8.0` plus pipeline-only SDKs (`anthropic`, `elevenlabs`, `httpx`, Google upload packages, `Pillow`, `Jinja2`). `Gap-ups` still tracks only `requirements.txt` with `databento>=0.40.0` / `pandas>=2.0.0` while code also imports `numpy` and `reportlab`. `trading-range` still tracks only `live/requirements.txt` with unversioned `requests` / `websocket-client` / `pandas` / `numpy`, while code also imports `databento`, `pytz`, `matplotlib`, `mpl_finance`. `BPA-Bot-1` remains the cleanest bounded baseline. `Finviz-clone` internally aligned but trails the newer Next baseline used by `aiedge/site` (`^16.1.6` vs `16.2.4`). Suggested next focus: normalize `Gap-ups` and `trading-range` manifests; decide whether `aiedge/scanner/pyproject.toml` is the authoritative runtime manifest with extras, or keep `requirements.txt` as the umbrella.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'First-run baseline — prior memory was missing; snapshot captures the current trend-incr-25/26 + SPT-pt-35 state and flags operational hygiene as the top unresolved risk',
    lastRun: '2026-04-19 22:05 ET',
    takeaway:
      'Baseline run. Prior memory was missing, so this pass establishes ground-truth from the current Claude artifacts rather than tracking deltas. Snapshot: trend arc at **incr 25 (equities live-gate proposal)** / **incr 26 (ES-calibrated ES-specific thresholds)**; SPT at **pt 35 (per-TF combined rank, WMT/MRK cross-TF longs, ADBE only A-tier short anywhere)**; head-of-strategy’s long-biased Monday queue still canonical. Operational hygiene risks unchanged from prior days — broken `trading-reports` launchd path, dirty `aiedge/scanner` checkout — still rank above any new research memo. The Sub-5m Feasibility Scan (~3.5× signal density at 1m bars) remains in "density observed, edge not proven" status; treat as a gated sprint needing threshold recalibration, friction model, full backtest, and paper-trade before it replaces the futures path.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Re-verified iphone-repo SPT notes against pt 33/34 raw JSONs; Monday watchlist in the iphone repo still promotes invalidated names — pt 35 (Claude) consolidates and supersedes',
    lastRun: '2026-04-19 22:10 ET',
    takeaway:
      'Fresh review against `/tmp/spt_scan/raw.json` (pt 33) and `/tmp/spt_scan_pt34/tiered.json` (pt 34). **Verified still holds:** pt 34 tier narrative directionally correct; ADBE the only A-tier short; no daily or 60m short passes pt 34 gates. **Operational inconsistency unchanged:** `~/code/iphone/spt-research/notes/small-pullback-trend-monday-watchlist-2026-04-20.md` stale vs pt 34/35, still promoting CVX/ORCL/GE/COST. **Doc mismatches in pt 34 itself unchanged:** daily C-tier long count written as 8 vs preserved 12; 30m B-tier says 9 but lists 8 (omits AVGO). Minor: `head-of-strategy-2026-04-19-late.md` drops ORCL citing wrong TF/value. Pt 35 (Claude, prior run cycle) consolidates pt 33+34 into a per-TF rank and supersedes the stale iphone Monday watchlist — next step is propagating pt 35 into the iphone repo copy.',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: 'Shipped opt-in `--strict-live` runtime in `~/microgap-bot`: polls Alpaca 1-min bars, resamples 5m, completed-bar triggers only, next-bar-open bracket via market parent',
    lastRun: '2026-04-19 22:09 ET',
    takeaway:
      'Advanced `~/microgap-bot` from research-only strict scanning toward live execution parity with the canonical no-hindsight spec at `~/gaps/NO_HINDSIGHT_SPEC.md`. Refactored `research_signal_engine.py` into two layers: `plan_qualifying_setups(...)` emits canonical live plans with signal-time-only fields; `scan_qualifying_setups(...)` still adds retrospective outcomes for research CSVs. New opt-in live runtime `python run.py --strict-live` — polls Alpaca 1-min bars, resamples to 5-min, detects completed-bar triggers only, submits next-bar-open bracket orders via a market parent. `order_manager.py` now supports `entry_order_type=\'market\'` with stronger duplicate keys using `trigger_time`. Verification: `python3 -m unittest test_research_signal_engine.py` passes; `py_compile` clean across the module; strict scan still stable at 2 QQQ setups for session `2026-03-20`. **Note**: Trader Manager 1 has flagged this work as path-drift — the current champion is `Strict Micro-Gap Stack` in `~/gaps/ibkr`, not microgap-bot.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: 'Added paper-routing bridge in `~/mean-reversion/paper_trade_bridge.py`: ZSCORE_BAL + BB_VALUE → no-hindsight tickets (next-bar-open entry, signal-bar stop, 3R targets); hardened TopStepX shared stack',
    lastRun: '2026-04-19 22:07 ET',
    takeaway:
      'Built a real paper-routing layer for mean-reversion signals. `paper_trade_bridge.py` converts `ZSCORE_BAL` and `BB_VALUE` signals into no-hindsight trade tickets with next-bar-open entry, signal-bar stop, and fixed `3R` targets. Writes session plans to `results/trader2_paper_plan_2026-03-19.{json,csv}`. Can optionally append fresh signals to the shared TopStepX pending queue. Hardened `~/gaps/topstepx/topstepx_trader.py`: returns `0` contracts when one contract already exceeds configured risk budget; accepts any symbol present in `INSTRUMENTS`, not just `ACTIVE_SYMBOLS`. Verification: `py_compile` clean on both files; `python3 paper_trade_bridge.py --ticker NQ --trade-symbol MNQ` produced two actionable tickets on session `2026-03-19`; `--queue-topstepx --force-queue` wrote two queue items. New README section documents the workflow with an MNQ execution example.',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Flagged Trader 1 for execution-path drift: microgap-bot is not the current champion — `Strict Micro-Gap Stack` in `~/gaps/ibkr` is; runtime proof in `~/gaps/logs/ibkr` still missing',
    lastRun: '2026-04-19 22:02 ET',
    takeaway:
      'Second run. Re-read Trader 1\'s latest report, memory, `~/gaps/TASKS.md`, and the `~/gaps/ibkr` paper-trading stack. Prior management call holds: **`Strict Micro-Gap Stack` remains the champion**; `~/gaps/ibkr` is configured for account `DUP346003`; still no runtime evidence under `~/gaps/logs/ibkr`. **Found new focus drift** in Trader 1\'s memory: the next-step wording has moved toward implementing execution inside `~/microgap-bot`, which is not the current champion path. Updated the manager report generator (`manager_report.py`) to flag execution-path drift and regenerated `latest_report.md`. Current management instruction: **prove paper runtime in `~/gaps/ibkr` before building any second live-execution path in `~/microgap-bot`**.',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Fixed nightly-council Reminders flood in `~/gaps`: preflight + batched create + duplicate-skip + exit-2-when-unavailable, wrapped so weekends degrade cleanly',
    lastRun: '2026-04-19 22:04 ET',
    takeaway:
      'First-phase work addressed the concrete failure in `~/gaps/output/nightly.log` — repeated `osascript` / Apple Reminders connection errors on 2026-04-19. Updated `~/gaps/sync_reminders.py` to preflight Reminders once, use a single batched create path instead of one `osascript` call per task, skip duplicate reminder names, and return exit code `2` when Reminders is unavailable. Wrapped in `run_nightly_council.sh` to capture reminder-sync output and log a single "reminders unavailable — skipped sync" line instead of flooding the nightly log. Verified with `sync_reminders.py` exit 2 with one clear message; `bash -n` on the wrapper; `py_compile` on the Python; full `run_nightly_council.sh` end-to-end. Second-phase work created the Trader 2 manager mandate at `~/.codex/automations/trader-manager-2/SYSTEM.md`. Current outcome: nightly council completes successfully on weekends, writes the briefing, and degrades cleanly when macOS Reminders automation is unavailable.',
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
          this Mac mini. Claude Code runs the aiedge scanner research arcs and the{' '}
          <code className="bg-bg/60 rounded px-1.5 py-0.5 text-text/80">/organize-my-code</code>{' '}
          scheduled task. Codex runs parallel audits — market-structure research,
          cross-repo code review, performance, SDK drift, activity monitoring, and
          research verification. This page is read-only; rule changes still require
          explicit sign-off.
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
