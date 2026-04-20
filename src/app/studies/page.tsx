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
      'Live direction trustworthiness is time-aware: bar k × |strength| 2-D grid yields a four-row candidate gate for 90%+ survival',
    lastRun: '2026-04-19 21:0X ET · incr 25',
    takeaway:
      'Incr 23 distilled one headline: "at bar 20, |strength| ≥ 0.15 → 93% direction survival." Incr 25 re-reads the same 9 425-row trajectory at 2-D resolution (bar-bin × strength-bin) and shows that headline averaged over later bars where the signal was already crisp — at the strict k=20 bar in isolation it is only 81%. The 2-D grid surfaces a clean time-aware candidate gate: bars 10-29 need |strength| ≥ 0.30 (n=118, 98.3% survival); 30-39 need ≥ 0.20 (n=290, 97.2%); 40-59 need ≥ 0.15 (n=726, 95.9%); 60-78 need ≥ 0.10 (n=1 117, 98.4%). Everything else sits between 45-79%, barely above the 78% baseline of "if it said a direction it was probably right." Operator implication: bar 30 is the aggregator’s handoff point — below k=30 you need ≥ 0.30 to escape baseline; from k=30 a moderate 0.15-0.20 already clears 90%. **No production change** — proposal needs Will’s nod before any front-end gate ships. 602/905 still green.',
    source: 'aiedge-vault · Scanner/methodology/trend-contributor-findings-2026-04-19-incr25-direction-survival.md',
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
    title: '~7.6 GB of stale repos still reclaimable; dual-write fix continues to hold; codex re-confirms Monday-launch risk on dirty scanner checkout',
    lastRun: '2026-04-19 21:37 ET · run #22',
    takeaway:
      '5 archive candidates (`BPA-Bot-1` 4.3 G, `Gap-ups` 2.8 G, `Finviz-clone` 451 M, `market-dashboard` 3.4 M, `microgap-bot` 188 K) and 2 active repos to move into `~/code/` (`Brooks-Price-Action` 70 M, `trading-range` 210 M). `~/keys/*.env` mode 600 (verified again). Organizational state unchanged since 04-18 — all moves gated on explicit go-ahead per management contract. **Dual-write fix held again this run** — `vault/Meta/Code Organization 2026-04-19_2137.md` is the only write; nothing landed at `~/code/CODE_ORGANIZATION_*.md`. 18 stale root-level duplicates remain (combined ~170 KB), all content already preserved in `vault/Meta/Code Organization 2026-04-19_*.md`, safe-to-delete on go-ahead. Monday-launch risk unchanged: `aiedge/scanner` `main` is still 10 commits ahead of origin with 16 modified + 55 untracked files. Codex `claude-updates` 21:04 ET adds: backtest re-run reaffirms `live-simple` 59.8% WR / +0.79R, dashboard shortlist 71.4% / +1.14R, full C3 77.1% / +1.91R; sub-5m feasibility scan suggests ~3.5× signal density at 1m bars (density only, not edge proof).',
    source: '~/code/routines/FINDINGS_2026-04-19_*.md (19 runs today)',
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
    title: 'Four fresh live-trading bugs in `~/trading-range`: contractId mixing, off-by-one cutoff bar, `first_trigger_bar`/`trigger_bar` mismatch, hindsight scan',
    lastRun: '2026-04-19 21:06 ET',
    takeaway:
      'Scope shifted again — now reviewing `~/trading-range` with quick syntax checks across `trading-range`, `Gap-ups`, and `BPA-Bot-1`. Four `trading-range` findings, all live-trading critical: (1) `live/executor_tradovate.py` filters fills by `contractId`, which mixes previous fills on the same symbol into the current bracket and can mis-mark entries/exits. (2) `live/scanner.py` includes the bar exactly at each configured cutoff (`11:30`, `12:30`, etc.), while the research scanners exclude that bar — live trading can take out-of-window setups. (3) `live/scanner.py` switched entry timing to `first_trigger_bar`, but the stacked-count helper still measures against the mutable `trigger_bar`, so narrowed gaps can qualify using future information. (4) `run_today_microgaps.py` still computes time/ATR/stacking/entry off `trigger_bar`, so its "confirmed no-hindsight" output is not actually using the no-lookahead bar definition. Earlier-pass `market-dashboard` bugs (hardcoded FMP API key, no upstream error checks, screener hang on <3 candles, filter/reset desync, resize refetch) and `Gap-ups`, `BPA-Bot-1` bugs still open.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'No new regressions vs prior baseline; market-dashboard `index.html` still 28 588 B / 7 877 B gzip, screener still fans out to 22 Polygon calls, resize still unthrottled',
    lastRun: '2026-04-19 21:06 ET',
    takeaway:
      'Re-audited `~/market-dashboard` against the prior memory as baseline. **No new code-level performance regression** since the previous pass: `index.html` is still 28 588 B raw / 7 877 B gzip and screener/API files are unchanged from previously audited state. Highest-leverage issue remains the screener fan-out: one filter/apply path still becomes 22 upstream Polygon calls (`/api/screener` does one full-market snapshot; `/api/candles` fans out to up to 21 per-ticker aggregates). The resize regression also persists: `window.addEventListener(\'resize\', loadCharts)` still causes fresh `/api/aggs` fetches for SPY and QQQ on every resize event. Recommended next fixes (unchanged): short-lived shared snapshot/candle caching on the server, lazy-load or cap screener mini-charts, debounce resize to redraw from cached data only, then capture a browser trace to validate TTI improvement.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: '`aiedge/scanner` now has manifest-to-manifest drift (`pyproject.toml` vs `requirements.txt`); Gap-ups + trading-range still underdeclare; video-pipeline gap closed',
    lastRun: '2026-04-19 21:03 ET',
    takeaway:
      'Refresh of the prior baseline. **Video-pipeline gap closed** — `~/code/aiedge/scanner` now tracks both `pyproject.toml` and `requirements.txt` (it absorbed video-pipeline). New issue exposed: `aiedge/scanner` has manifest-to-manifest drift — `pyproject.toml` declares `databento>=0.70,<1` / `matplotlib>=3.7`, while `requirements.txt` carries `databento>=0.38.0` / `matplotlib>=3.8.0` plus pipeline-only SDKs (`anthropic`, `elevenlabs`, `httpx`, Google upload packages, `Pillow`, `Jinja2`). `Gap-ups` still tracks only `requirements.txt` with `databento>=0.40.0` / `pandas>=2.0.0` while code also imports `numpy` and `reportlab`. `trading-range` still tracks only `live/requirements.txt` with unversioned `requests` / `websocket-client` / `pandas` / `numpy`, while code also imports `databento`, `pytz`, `matplotlib`, `mpl_finance`. `BPA-Bot-1` remains the cleanest bounded baseline. `Finviz-clone` internally aligned but trails the newer Next baseline used by `aiedge/site` (`^16.1.6` vs `16.2.4`). Suggested next focus: normalize `Gap-ups` and `trading-range` manifests; decide whether `aiedge/scanner/pyproject.toml` is the authoritative runtime manifest with extras, or keep `requirements.txt` as the umbrella.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Strategy stack stronger tonight (trends incr 24, SPT pt 34, backtest reaffirmed); a tempting new "1m solves throughput" narrative needs four gated proofs before replacing the futures path',
    lastRun: '2026-04-19 21:04 ET',
    takeaway:
      'New Claude work since prior cutoff: `trends` advanced to incr 24 (only 8.3% of structure flips are intended spike→channel; direction stays the trustworthy live signal, structure does not); SPT pt 34 quality grading shipped; `head-of-strategy` issued a heavily long-biased late-Monday queue with **ADBE as the only A-tier short, CRM as the only other**; `backtest` re-ran the 8-month trend + SPT stack and confirmed the strong filtered numbers (`live-simple` **59.8% WR / +0.79R**; dashboard shortlist **71.4% / +1.14R**; full C3 **77.1% / +1.91R**); `head-of-strategy` also produced **Sub-5m Feasibility Scan 2026-04-19** showing ~3.5× signal density at 1-minute bars vs 5-minute, reopening 10-15 trades/day on equities — **density only, not edge proof**. In-flight: a fresh `maintenence` run started 21:01 ET (verifying a possibly exposed Node port and a weekend cron pattern), and a fresh `backtest` run started 21:03 ET (validating today\'s trend/SPT slice is current). Codex second-eye read: the live Monday queue is concentrated in a bullish breadth thesis — regime confirmation now matters more than symbol selection; if the open is not actually broad-risk-on, the queue should shrink fast. The old bottleneck persists: solid memos, no ship/test/defer board. Treat the 1m scanner as a gated sprint with four required proofs (threshold recalibration, friction model, full backtest, paper-trade) — do not let the density memo replace the futures path on its own. Operational hygiene risks (broken `trading-reports` launchd path, dirty scanner checkout) still rank above any new research memo.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Pt 34 tier narrative directionally correct, but iphone repo SPT notes still promote invalidated names (CVX/ORCL/GE/COST); doc count mismatches in pt 34 itself',
    lastRun: '2026-04-19 21:04 ET',
    takeaway:
      'Reviewed `~/code/iphone/spt-research` outputs against `/tmp/spt_scan/raw.json` (pt 33) and `/tmp/spt_scan_pt34/tiered.json` (pt 34). **Verified:** pt 34 tier narrative is directionally correct; ADBE is the only A-tier short; no daily or 60m short passes the pt 34 gates. **Operational inconsistency:** `~/code/iphone/spt-research/notes/small-pullback-trend-monday-watchlist-2026-04-20.md` is stale relative to pt 34 and still promotes invalidated names like CVX, ORCL, GE, and COST. **Doc mismatches:** daily C-tier long count is written as 8 in the README/pt 34 summary but the preserved graded output shows 12; pt 34\'s 30m B-tier section says 9 names but only lists 8 (omits AVGO). Minor: `head-of-strategy-2026-04-19-late.md` drops ORCL for the right reason but cites the wrong timeframe/value (`30m pb 0.83`; preserved raw scan shows `30m pb 1.52` and `5m pb 0.83`). Pt 35 (Claude, this run cycle) consolidates pt 33+34 into a clean per-TF rank — supersedes the stale Monday watchlist.',
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
