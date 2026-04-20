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
      'Negative result — `structure` carries no incremental signal once you condition on `|strength| ≥ 0.15`: the bar-k gate IS a spike filter in disguise',
    lastRun: '2026-04-19 23:13 ET · incr 27',
    takeaway:
      'Follow-up closes the second incr-25 open item — does the `structure` label (spike / channel / transition / noise) carry predictive value *on top of* the (bar-k, |strength|) pair we already plan to ship? **No.** The +15 pp channel-vs-spike survival gap on equities (and +9 pp on ES) that the bucket chart showed is a **composition artifact**. Once we condition on `|strength| ≥ 0.15`, adding a `structure ≠ spike` filter buys only **+1.3 pp** survival on equities and **+0.2 pp** on ES. The `structure ≠ spike` filter and a hard `k ≥ 15` cutoff are **statistically interchangeable** — 100% of spike-labelled directional observations on both populations happen at bars 10-14, so the two rules select ≈ the same rows. **Practical implication**: ship the incr-23 recommendation (`|strength| ≥ 0.15` AND bar ≥ 20) with strength + bar-k only; leave `structure` as a display-only label on the dashboard. Saves us from bolting a redundant input onto the live gate. No production code change. Tests still 602/905 green.',
    source: 'aiedge-vault · Scanner/methodology/trend-contributor-findings-2026-04-19-incr27-structure-redundancy.md',
    href: { label: 'Open Findings → Trend arc', url: '/findings#trend' },
  },
  {
    id: 'spt-research',
    producer: 'claude',
    stream: 'Brooks PA — small-pullback-trend (SPT)',
    title: 'Pt 36 expands the universe to 194 names and replaces the top pick on every timeframe: CROX, FDX, UUP, TGT, MPC, DKNG take over',
    lastRun: '2026-04-19 22:51 ET · pt 36 (expanded universe) · 23:07 ET · pt 36 Monday watchlist',
    takeaway:
      'Retires the "a cleaner SPT outside this list could outrank anything here" caveat that pts 33-35 carried. 194-name expansion (sector leaders, style ETFs, REITs, fintech, transports, biotech, EM/country ETFs) scanned with the same tier gates; data anchor unchanged (Fri 2026-04-17 cash close). **Every single-pick slot replaced**: Daily long CROX (A, 5.49) over AMD (A, 4.00); 60m long **FDX (A, 7.55)** over MRK (B, 4.91) — 2× combined + tier upgrade; 30m long FDX (A, 5.80); 15m long UUP (A, 7.20) over WMT (B, 4.78); 5m long TGT (A, 10.04) over WMT (B, 10.44). **First A-tier 30m short anywhere in the whole arc**: MPC (A, 4.29), refiner, energy-pullback leg; 15m/5m shorts go DKNG (A) over ADBE. **Real-estate emerges as a previously-invisible sector leg** (SPG joins the cross-TF star board). Pt 36 Monday watchlist (pt 36 universe) supersedes the pt 33-based watchlist that was shipped earlier today. **Codex research-review caught one contradiction this run**: "zero daily shorts at any tier" is wrong — `summary.json` contains 2 daily C-tier shorts (UNG, LCID). Patch pending.',
    source: 'aiedge-vault · Brooks PA/concepts/small-pullback-trend-expanded-universe-2026-04-19.md · small-pullback-trend-monday-watchlist-pt36-2026-04-20.md',
    href: { label: 'Open Findings → SPT arc', url: '/findings#spt' },
  },
  {
    id: 'code-organization',
    producer: 'claude',
    stream: '/organize-my-code scheduled task',
    title: 'Run #24 — /studies refreshed against every fresh 23:xx Codex memory + Claude incr 27 + SPT pt 36. Scanner Monday-launch risk up again: untracked now 67.',
    lastRun: '2026-04-19 23:37 ET · run #24',
    takeaway:
      '5 archive candidates (`BPA-Bot-1` 4.3 G, `Gap-ups` 2.8 G, `Finviz-clone` 510 M, `market-dashboard` 3.4 M, `microgap-bot` 312 K — grew from 284 K as Trader 1 pivoted to IBKR and added FTMO risk-sync tests) and 2 active repos to move into `~/code/` (`Brooks-Price-Action` 70 M, `trading-range` 210 M — Codex opened **2 new live-trading bugs here this run**). Also: `mean-reversion` 22 M now hosts Trader 2\'s real paper-routing bridge and the Trader 1 overlap study. `~/keys/*.env` mode 600 (re-verified). Organizational state unchanged since 04-18 — all moves still gated on explicit go-ahead per management contract. **Dual-write fix held again** — `vault/Meta/Code Organization 2026-04-19_2331.md` is the only write; the existing 2 stale root-level `CODE_ORGANIZATION_*.md` files at `~/code/` are still pending cleanup on go-ahead. **Monday-launch risk up**: `aiedge/scanner` `main` still 10 commits ahead, 16 modified + **67 untracked files** (was 65 in run #23 — +2 SPT pt 36 scratch outputs). `site` is cleanest of the working trees (3 modified + 1 untracked, 0 commits ahead).',
    source: '~/code/routines/FINDINGS_2026-04-19_*.md (22 runs today) · vault/Meta/Code Organization 2026-04-19_2331.md',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Eighth iteration — phase loop unchanged, refresh adds a `Local Book Figure Checks` section with figure images for Trends 21.1, Trends 22.1, and Reversals 3.1',
    lastRun: '2026-04-19 23:04 ET',
    takeaway:
      'Re-audit of the local Brooks source stack plus the on-disk chart corpus in `~/Brooks-Price-Action` via `scripts/search_corpus.py`. Preferred phase map stays `Balance / Breakout Mode → Breakout / Spike → Channel → Trading Range → Next Breakout`; pullback and reversal still classified as transition structures, not stable phases. This pass adds clickable local figure references (Trends 21.1, Trends 22.1, Reversals 3.1) for visual precedent. Attribution remains explicit: research conducted by Codex, not Claude. Eight iterations on the same question — the answer has stabilized; subsequent runs are refreshing provenance + adding corpus figures rather than changing the conclusion.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Rotated back to `~/trading-range` live-trading — 2 new bugs found this run: UTC-vs-ET time-window mismatch in `live/scanner.py`; contractId-based fill filter in `live/executor_tradovate.py`',
    lastRun: '2026-04-19 23:04 ET',
    takeaway:
      'Prior memory was missing, so this run re-read the active live-trading diff in `~/trading-range`. **Two fresh criticals** surfaced on top of the four still-open from prior runs: (a) `live/scanner.py` applies ET time-window checks to feed timestamps that are still UTC — valid morning setups get rejected; (b) `live/executor_tradovate.py` filters bracket fills by `contractId`, so later orders on the same symbol pick up stale fills from older trades. Verification: `python3 -m py_compile` passed for touched files. Rotation pattern continues — Codex is cycling review targets across market-dashboard / Finviz-clone / trading-range / Gap-ups / BPA-Bot-1 rather than closing on any single repo. Operational rhythm observation, not a bug.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'Re-audit of market-dashboard — sustained +9,614 B raw / +3,662 B gzip since ee841fa; screener fan-out (22 Polygon calls per filter) + resize refetch still the dominant costs',
    lastRun: '2026-04-19 23:02 ET',
    takeaway:
      'Tracked `HEAD` still `0dd4c4b` — no new committed performance regression since the previous run. Re-measured `index.html` at **28,588 B raw / 7,892 B gzip**, versus **18,974 / 4,230 at `ee841fa`** (sustained +9,614 raw, +3,662 gzip). The dominant live cost is unchanged screener fan-out: one filter/apply path still becomes **22 upstream Polygon calls** because `api/screener.js` does one full-market snapshot and `api/candles.js` fans out to up to 21 aggregate fetches. Resize regression still live: `window.addEventListener(\'resize\', loadCharts)` still triggers fresh SPY/QQQ fetches on every resize burst. Inline `SEED` block in `index.html` measured at 2,612 B (meaningful HTML-weight contributor). Untracked `market-dashboard.html` at 29,645 B raw / 8,250 B gzip — watch-item only if promoted. Next evidence gap: a real browser Performance trace on Screener after caching/debounce changes.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'Finviz-clone now internally aligned; `aiedge/site` mostly aligned (snaptrade lock-drift to 9.0.181); scanner pyproject-vs-requirements drift and BPA-Bot-1/Gap-ups underdeclared imports still open',
    lastRun: '2026-04-19 23:04 ET',
    takeaway:
      'Workspace-wide drift rescan. **Finviz-clone**: internally aligned — `package.json` ranges match `package-lock.json` resolved versions. **aiedge/site**: mostly aligned, but `snaptrade-typescript-sdk` declared `^9.0.164` and currently resolves to `9.0.181`; Tailwind tooling intentionally floating on `^4` (resolves to `4.2.2`). **aiedge/scanner** (clearest drift): `pyproject.toml` says `databento>=0.70,<1` while `requirements.txt` still says `databento>=0.38.0`; `requirements.txt` also includes content-pipeline deps (`anthropic`, `elevenlabs`, `httpx`, Google API libs, `Pillow`, `Jinja2`, `jsonschema`) that are actively imported but absent from `pyproject.toml`. **BPA-Bot-1/requirements.txt** omits `mplfinance` even though `daily_rs_rankings.py` imports it. **Gap-ups/requirements.txt** only lists `databento` and `pandas` but repo code imports `numpy` and `requests`. Suggested next run: align `aiedge/scanner` around one source of truth first, then patch the BPA-Bot-1 / Gap-ups manifests, then decide whether to pin `snaptrade-typescript-sdk` to the currently-locked `9.0.181`.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Second run — research promoted into concrete outputs: backtest recommends SPT variant D, SPT pt 36 shipped (194-name expansion), phases incr 04 rejected bull-spike edge as cache artifact',
    lastRun: '2026-04-19 23:02 ET',
    takeaway:
      'Diff pass over the prior baseline. **Research → concrete outputs**: the previously in-flight tasks resolved — `backtest` completed and recommended shipping SPT variant D; `small-pullback-trend-research` completed **pt 36 with 194-name universe expansion**; `phases` completed **incr 04 and rejected the apparent bull-spike edge as a cache/drift artifact**. **Strategy moves to proposal mode**: head-of-strategy produced an R&D memo for **S3a Direction-Confirmed Continuation Scalp (DCCS)**, explicitly aimed at higher daily trade density with a 10-paper-session gate before any live use. **Overnight layer more operational**: trends finished incr 26, sent the newsletter, concluded ES needs stricter post-bar-30 direction thresholds; iPhone repo got a new pre-open execution card for Mon 2026-04-20 with no-trade/closeout rules + Adobe catalyst risk overlays. **aiedge site maintenance stayed read-only + healthy** (journal + trades tabs validated, symbol-chart always-render noted as non-blocking). **Repo drift slightly worse in scanner**: still ahead 10, 16 modified tracked files, now 67 untracked files (81 total status lines). A new `maintenence` sweep started 23:01 and was still in progress at capture; one datapoint — `scanner/logs/` at **358 MB**, reinforcing log-retention cleanup as a worthwhile future task.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Reviewed Claude\'s SPT pt 36 end-to-end — cross-TF winners real (CROX/FDX/MPC/DKNG); caught contradiction: "zero daily shorts at any tier" is wrong — UNG + LCID are C-tier daily shorts',
    lastRun: '2026-04-19 23:05 ET',
    takeaway:
      'Third review this evening, now against Claude\'s fresh pt 36 output. Wrote `~/.codex/automations/research-review/spt-research-review-2026-04-20.md`. **Verified still holds**: pt 36\'s main expansion winners are supported by `/tmp/spt_scan_pt36/summary.json` and `/tmp/spt_scan_pt36/cross_tf.json` — CROX/FDX/MPC/DKNG and the TGT/FDX/XLRE/SPG cross-TF leadership are real. **New material contradiction**: pt 36\'s expanded-universe note says "zero daily shorts at any tier" in the comparison table, but `summary.json` actually contains **two daily C-tier shorts — UNG and LCID**. **Unresolved operational issue**: `~/code/iphone/spt-research/README.md` still points readers to pt 34 and the pt 33-based Monday watchlist as the starting document, even though pt 36 now supersedes the queue. **Unresolved doc mismatch**: pt 35\'s WMT cross-TF row still prints `—/—/—/B/B` while the preserved `/tmp/spt_scan_combined/ranked.json` records `C/C/C/B/B`. External-card check: Adobe\'s April 21 investor session is real; the Sunday-evening "futures up" narrative in the iphone-repo pre-open card is not (public coverage has S&P/Nasdaq down 0.7-0.9% on renewed Iran tension).',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: 'Took manager feedback — pivoted to `~/gaps/ibkr` (the actual champion) and fixed an FTMO risk-enforcement gap: kill switch now syncs live IB account state on every loop iteration',
    lastRun: '2026-04-19 23:04 ET',
    takeaway:
      '**Direct response to manager-1\'s "path drift" callout** from the prior run. Shifted from `~/microgap-bot` to the IBKR execution stack under `~/gaps/ibkr`. Found a real FTMO risk-enforcement gap in `ibkr_trader.py`: the trader was not syncing live IB account state during the main loop — open unrealized loss and restart-state equity weren\'t feeding the kill switch, and the drawdown rule was being measured from an in-process equity peak instead of the configured `$100K` FTMO starting balance used elsewhere in the stack. Added `IBKRTrader.sync_account_state()` using IB summary tags (`RealizedPnL`, `UnrealizedPnL`, `NetLiquidation`, `DailyPnL` as fallback); syncs on connect and on every loop iteration before evaluating the kill switch. Added regression tests at `~/gaps/ibkr/test_ibkr_risk.py` covering realized/unrealized/net-liq sync, DailyPnL fallback, and kill-switch activation on drawdown. Verification: `pytest -q` + `py_compile` green; official IBKR API docs checked during the run to confirm tag choices. Remaining gap: run a real IBKR paper session with `signal_bridge.py` + `ibkr_trader.py` during market hours.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: 'Trader 1 × Trader 2 overlap study: daily P&L correlation ≈ 0; exact same-bar conflicts rare (3%) but toxic (−0.37R vs +0.37R away). Added `--block-trader1-csv` gate to the paper bridge.',
    lastRun: '2026-04-19 23:13 ET',
    takeaway:
      'Two runs stacked this hour. At 22:07 ET built the real paper-routing layer in `~/mean-reversion/paper_trade_bridge.py` (ZSCORE_BAL + BB_VALUE → no-hindsight tickets, next-bar-open entry, signal-bar stop, fixed 3R targets), plus hardened `~/gaps/topstepx/topstepx_trader.py`. At 23:13 ET built `run_trader1_overlap_study.py` comparing Trader 2\'s NQ overlays against Trader 1\'s canonical QQQ strict micro-gap scan over the OOS window `2024-03-12 → 2026-03-19`. **Key findings**: daily P&L correlation ≈ **−0.0038** (zero); Trader 2 still profits on Trader 1 active days (`589/810` trades, expectancy `+0.3344R`); exact same-bar conflicts are rare (`24/810`, 3.0%) **but toxic for Trader 2** (expectancy `−0.3722R` vs `+0.3737R` away from those bars). `ZSCORE_BAL` especially weak inside the 30-minute conflict neighborhood (`−0.0650R`). Extended the paper bridge with `--block-trader1-csv PATH` + `--block-window-minutes N` (default 0 = exact same entry bar). Verified on a historical conflict session (2024-03-27): baseline 3 actionable tickets; with block gate 1 ticket. Next step: wire Trader 1\'s live strict-feed output into Trader 2 so the conflict gate works without offline CSV replay.',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Fixed Python 3.14 asyncio bootstrap across all four `~/gaps/ibkr` entry points; Trader 1\'s blocker is now external runtime proof, not a startup crash',
    lastRun: '2026-04-19 23:03 ET',
    takeaway:
      'Third run. Found a concrete Trader 1 code blocker: under Python 3.14, `~/gaps/ibkr/ibkr_trader.py` crashed on import because `eventkit` expected an active asyncio loop before `ib_insync` loaded. Patched the 3.14 bootstrap in `ibkr_trader.py`, `ibkr_monitor.py`, `auto_trader.py`, and `setup_ibkr.py` by initializing an event loop before importing `ib_insync`. Verification: `pytest -q test_ibkr_risk.py`, `py_compile` on all `*.py` under both `~/gaps/ibkr` and `~/microgap-bot`, plus the previously-failing CLI `--help` checks now pass. Regenerated `latest_report.md`; updated `manager_report.py` to record the fix. Secondary finding: `~/microgap-bot/research_scan.py` is code-healthy but cached market data only covers through `2026-03-20`; added a staleness warning + tests. **Current instruction**: Trader 1\'s blocker is now external runtime proof in `~/gaps/logs/ibkr`, not 3.14 startup — next run should focus on a real paper-mode `setup_ibkr.py` / `ibkr_trader.py --demo` execution with TWS or IB Gateway open. Trader 1 received the message: the same-hour trader-1 run shipped the FTMO risk-sync fix on the now-unblocked ibkr stack.',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Corrected stale detection logic — Trader 2 is `queue-ready`, not `research-only`. Report now classifies across `research_ready / scan_ready / paper_bridge_present / queue_ready / runtime_verified`.',
    lastRun: '2026-04-19 23:03 ET',
    takeaway:
      'Third run. Fixed stale manager logic in `manager_report.py` — the old detection missed Trader 2\'s real paper path because it looked for generic filenames like `paper_trader.py` instead of `~/mean-reversion/paper_trade_bridge.py`. Report now classifies Trader 2 across five stages: `research_ready`, `scan_ready`, `paper_bridge_present`, `queue_ready`, `runtime_verified`. Revalidated the current handoff locally: `paper_trade_bridge.py --ticker NQ --trade-symbol MNQ` still produces two actionable tickets on session `2026-03-19`; the `--queue-topstepx --force-queue` path wrote two queue items to a test file, confirming queue serialization works without touching the live shared queue. Still no live runtime evidence: `~/gaps/logs/topstepx` does not exist, so Trader 2 hasn\'t produced a shared pending file or TopStepX trader log in the live paper path yet. **Corrected management decision**: champion stays `NQ Z-Score Balance Gate`; Trader 2 is **queue-ready, not research-only**; remaining blocker is first runtime-verified paper execution during market hours, not rebuilding the bridge or adapting the IBKR stock trader.',
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
