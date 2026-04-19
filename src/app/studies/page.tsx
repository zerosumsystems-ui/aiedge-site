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
      'Live `TrendState.direction` rarely flips once formed — 63% of sessions have zero flips',
    lastRun: '2026-04-19 18:35 ET · incr 22',
    takeaway:
      'First real-time stability study of `compute_trend_state` across 300 RTH sessions × progressive bar calls (~20 000 calls, 468 s). 63.3% of directional sessions have ZERO up↔down flips end-to-end; mean 0.56, max 5. Median lock-in bar is 11 (essentially the opening); 70% lock in by bar 20, 93% by bar 40. At bar 10 the classifier is near-random (34/35/31 up/down/none); by bar 40 it is decisive (66/21/13). Live readings are safe to consume from ~bar 20 onward. No production change proposed — validates consumption, not yet wiring. Four prior threshold recommendations (incr 17–21) still pending Will\'s nod.',
    source: 'aiedge-vault · Scanner/methodology/trend-contributor-findings-2026-04-19-incr22-realtime-stability.md',
    href: { label: 'Open Findings → Trend arc', url: '/findings#trend' },
  },
  {
    id: 'spt-research',
    producer: 'claude',
    stream: 'Brooks PA — small-pullback-trend (SPT)',
    title: 'Monday-open watchlist built on pt 33 multi-timeframe SPT scan',
    lastRun: '2026-04-19 18:10 ET · pt 33 + watchlist',
    takeaway:
      'Pt 33 scanned 52 names × 5 timeframes (daily · 60m · 30m · 15m · 5m), ranked by pure magnitude (net_R, pullback shallowness, closeness). Daily longs: AVGO/AMD/AMZN/BAC/SPY; shorts: CVX. Cross-TF stars: MRK up on 4 timeframes; ORCL/ADBE/CRM short across software complex. The 04-20 watchlist adds PLAYBOOK entry frames — per-horizon entry window, signal required, 1R stop zone, hybrid rule-9 target, invalidation. Expected economics if clean fires present: n≈18/mo · WR 74.6% · +1.84R/trade · max DD −2R. Consumption-layer only, no new Brooks research.',
    source: 'aiedge-vault · Brooks PA/concepts/small-pullback-trend-{multi-tf-candidates-2026-04-19,monday-watchlist-2026-04-20}.md',
    href: { label: 'Open Findings → SPT arc', url: '/findings#spt' },
  },
  {
    id: 'code-organization',
    producer: 'claude',
    stream: '/organize-my-code scheduled task',
    title: '~7.6 GB of stale repos reclaimable, no moves executed yet',
    lastRun: '2026-04-19 18:37 ET · run #19',
    takeaway:
      '5 archive candidates (`BPA-Bot-1`, `Gap-ups`, `Finviz-clone`, `market-dashboard`, `microgap-bot`) and 2 active repos to move into `~/code/` (`Brooks-Price-Action`, `trading-range`). `~/keys/*.env` now mode 600. Organizational state unchanged since 04-18 — all moves gated on explicit go-ahead per management contract. Runs #18–19 used the scheduled-task cycle to ship and then refresh the /studies tab itself.',
    source: '~/code/routines/FINDINGS_2026-04-19_*.md (15 runs today)',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Brooks is a spectrum model; canonical loop is spike → channel → range → next breakout',
    lastRun: '2026-04-19 18:03 ET',
    takeaway:
      'Codex-authored memo from local Brooks extracts under `~/code/aiedge/brooks-source/` plus `~/Brooks-Price-Action/` skill references. Operational phase map: Balance · Breakout/Spike · Channel · Transition · Resolution. Pullback and reversal are transition states until the next breakout proves itself. Rendered with local Databento NQ examples for 2021-03-24, 2024-11-13, 2024-12-18.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Three live-trading bugs flagged in trading-range; pytest collection regressions in BPA-Bot-1',
    lastRun: '2026-04-19 18:04 ET',
    takeaway:
      '`live/scanner.py` applies ET open/close times directly to UTC-indexed bars (missed morning setups) and counts stacked gaps off the narrowed `trigger_bar` instead of `first_trigger_bar`. `live/trader.py` indexes `signal[…]` unconditionally while reconciled trades store `signal=None`. `live/executor_tradovate.py` filters fills by `contractId` — stale brackets misattributed. `BPA-Bot-1/test_confidence.py` calls `sys.exit(1)` during pytest collection.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'market-dashboard Screener fans out up to 21 Polygon requests per candle load',
    lastRun: '2026-04-19 18:04 ET',
    takeaway:
      'Dashboard initial refresh is 6 API requests (`indices`, `breadth`, 2× `movers`, 2× `aggs`). Screener tab adds 2 app requests, `/api/candles` fans out to ~21 Polygon requests, `/api/screener` re-fetches the full snapshot. `index.html` grew 18.9 KB → 28.6 KB at commit `0dd4c4b`. Highest-leverage fixes: consolidate snapshot endpoints, cache Polygon responses, batch or defer mini-charts.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'aiedge-scanner has a real internal version conflict on `databento`',
    lastRun: '2026-04-19 18:03 ET',
    takeaway:
      '`pyproject.toml` pins `databento>=0.70,<1` while `requirements.txt` still allows `>=0.38.0` and carries unrelated video/AI packages. Frontend split between `site` (next 16.2.4 / Tailwind 4.2.2) and `Finviz-clone` (next 16.1.6 / Tailwind 4.1.18) is a stack skew, not a lockfile bug. No `.nvmrc` / `.python-version` / `.tool-versions` anywhere — runtime targets undocumented.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'In the last 120 Claude sessions, 111 were scheduled tasks and 9 were manual',
    lastRun: '2026-04-19 18:03 ET',
    takeaway:
      'Active scheduled-task clusters: backtest, small-pullback-trend-research, aiedge-self-review-tab, maintenance, trends, accountant, organize-my-code, management, aiedge-trades-tab, aiedge-journal-tab. Staler tasks to watch: sync-vault-to-prod, scanner-post-fix-run, eod-scan-capture (last 2026-04-16); rd (2026-04-01); afternoon-momentum-scanner, daily-rs-rankings (2026-03-10).',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'SPT playbook numbers refreshed 101 → 103 baseline trades; dated snapshots tagged',
    lastRun: '2026-04-19 18:06 ET',
    takeaway:
      'Reran `spt_rule10_rule11_interaction`, `spt_climactic_exit`, `spt_first_ma_gap_exit`, `spt_next_session_followthrough` scratch scripts. April 19 directional conclusions hold; headline counts were stale. Marked dated note metrics as point-in-time snapshots, added current rerun verification numbers to the PLAYBOOK top matter, updated stale series-count references to 33 follow-up notes.',
    source: '~/.codex/automations/research-review/memory.md',
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
