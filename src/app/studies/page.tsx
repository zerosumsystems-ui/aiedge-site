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
    title: 'Pt 37 — single scoring pass over unified 244-name universe (pt 33\'s 52 + pt 36\'s 192 merged); confirms short desert at daily/60m is structural, not selection',
    lastRun: '2026-04-20 00:10 ET · pt 37 unified universe',
    takeaway:
      'Supersedes both pt 35 (52-name) and pt 36 (192-name) — merges the two raw.json artifacts and re-ranks in one pass so cross-TF attribution is cleaner. **Top picks unchanged from pt 36**: Daily long CROX (A, 5.49); 60m + 30m long FDX (A, 7.55 / 5.80); 30m short **MPC (A, 4.29)** — still the only A-tier 30m short in the full 244-name universe; 15m UUP / DKNG; 5m TGT / DKNG. **Structural short desert reconfirmed** — 0 A/B-tier shorts at daily or 60m *anywhere* in 244 names. Short exposure is 30m-and-below intraday only; A-tier shorts total **4 across the whole board** (MPC 30m, DKNG 15m, ADBE 15m, DKNG 5m). **Cross-TF stars**: TGT (5 TFs, 3× A-tier, Σ 26.92) is the highest-quality 5-TF long; FDX (4 TFs, 3× A-tier, Σ 23.51) is the cleanest intraday single-name; **REIT sector leg emerges** (XLRE + SPG + AMT + EQIX all at A-tier intraday). ARKW 5m combined = 28.43 is 2.8× the next pick but B-tier only (pb 0.42) — late-stage vertical, size ¼. Data anchor unchanged (Fri 2026-04-17 cash close); no new API calls.',
    source: 'aiedge-vault · Brooks PA/concepts/small-pullback-trend-unified-recommendations-2026-04-20.md · small-pullback-trend-INDEX.md',
    href: { label: 'Open Findings → SPT arc', url: '/findings#spt' },
  },
  {
    id: 'head-of-strategy',
    producer: 'claude',
    stream: 'Head of Strategy — R&D gating',
    title: 'S2\'\'\'-L "flip-sign" hypothesis CONFIRMED (+0.66R E[R] across 96 res) · DCCS paper arc DEFERRED (33.7% WR, +0.01R E[R] — 2 of 4 phase-1 gates fail)',
    lastRun: '2026-04-20 00:29 ET · FLIP_SIGN_S2PRIME + DCCS_OFFLINE',
    takeaway:
      'Two pre-open offline backtests, opposing outcomes. **DCCS (Direction-Confirmed Continuation Scalp) — DEFERRED.** 153 trading dates × 58 S&P-leader proxy universe. WR on filled 33.7% (gate: ≥50%, **FAIL**); E[R] +0.007R (gate: ≥+0.30R, **FAIL**); worst-day DD −4.00R (gate: ≥−5R, passes by 1R). Density memo\'s 10-session paper arc is stopped before it starts — would have burned engineering time confirming what offline already shows. Spec needs revision + re-test offline before any paper commitment. **S2\'\'\'-L — SHIP when ready.** Flip-sign hypothesis: after last night\'s S2\'\' kill, gate-REJECTED S2\' trades outperform gate-KEPT in **LONG direction only**, concentrated in weak-trend cells. Three independent urgency cohorts all confirm: combined 96 res, 55.2% WR (CI [45.4, 64.6], clears 33% breakeven by 12 pts), E[R] +0.66R (clears +0.30R target by 2.2×). **First positive R&D finding of the 2026-04-19/20 autonomous strategy arc.** Next: add S2\'\'\'-L alongside L1-overweight into the portfolio spec.',
    source: 'aiedge-vault · Scanner/backtests/DCCS_OFFLINE_2026-04-20.md · FLIP_SIGN_S2PRIME_2026-04-20.md · S2DD_GATE_BACKTEST_2026-04-19.md',
  },
  {
    id: 'code-organization',
    producer: 'claude',
    stream: '/organize-my-code scheduled task',
    title: 'Run #25 — /studies refreshed against fresh 00:xx Codex (10/10 streams) + Claude incr 28 + SPT pt 37 + DCCS-defer + S2\'\'\'-L-ship',
    lastRun: '2026-04-20 00:34 ET · run #25',
    takeaway:
      '5 archive candidates (`BPA-Bot-1` 4.3 G — Trader 1 pivoted here this run and fixed red-news indentation bug; `Gap-ups` 2.8 G; `Finviz-clone` 510 M; `market-dashboard` 3.4 M; `microgap-bot` 312 K) + 2 active repos to move into `~/code/` (`Brooks-Price-Action` 70 M, `trading-range` 210 M — Codex opened a **third new live-trading bug here this run**: `live/trader.py` `_poll_fill()` KeyError after restart). Dual-write fix still held — `vault/Meta/Code Organization 2026-04-20_0034.md` is the only write; the 2 stale root-level `CODE_ORGANIZATION_*.md` files at `~/code/` remain pending cleanup on go-ahead. **Monday-launch risk**: `aiedge/scanner` still 10 commits ahead, 16 modified tracked + **67 untracked** (unchanged from run #24). `site` got cleaner Codex performance-audit contribution this run (real regression fix in BarsChart.tsx over annotations identity). Claude activity sweep found a **midnight maintenance actively tightening file permissions** (~/keys/ + scanner/credentials/ from 755 → 700) — first low-risk promotion of the maintenance stream from passive observation into action.',
    source: '~/code/routines/FINDINGS_2026-04-20_0034.md · vault/Meta/Code Organization 2026-04-20_0034.md',
  },
]

const CODEX_STUDIES: Study[] = [
  {
    id: 'market-cycle',
    producer: 'codex',
    stream: 'Research — Brooks market cycle',
    title: 'Ninth iteration — same phase loop holds; this pass tightens organization, attribution, and local-source links. Answer has fully stabilized.',
    lastRun: '2026-04-20 00:28 ET',
    takeaway:
      'Re-audit of the local Brooks source stack used this run: `market_spectrum.txt`, `how_to_read_brooks.txt`, `SKILL.md`, `trading_range_taxonomy.md`, `major_trend_reversals.md`, `final_flags.md`, `Documents/brooks_encyclopedia_learnings.md`, the local Brooks chart corpus via `scripts/search_corpus.py`, and `code/aiedge/vault/Scanner/methodology/phase-spike-realtime-incr01.md`. Rewrote `market_cycle_phases_codex.md` into a tighter Codex-authored memo with a sharper phase-vs-transition split, explicit "not Claude output" attribution, and direct local-source links. Preferred phase map unchanged: `Balance / Breakout Mode → Breakout / Spike → Channel → Trading Range → Next Breakout`; pullback and reversal stay classified as transition structures. **Nine iterations; answer has stabilized** — subsequent runs are refreshing provenance and adding corpus figure precedent rather than changing conclusions. HTML preview rerendered via `render_visuals.py`.',
    source: '~/.codex/automations/research/market_cycle_phases_codex.md',
  },
  {
    id: 'code-review',
    producer: 'codex',
    stream: 'Code review sweep',
    title: 'Third new live-trading bug in `~/trading-range` this week: `live/trader.py` `_poll_fill()` KeyError — reconcile_state seeds `signal=None`, polling crashes after restart',
    lastRun: '2026-04-20 00:05 ET',
    takeaway:
      'Stayed on `~/trading-range` — it has the only tracked logic diffs with active Tradovate live-trading edits. Found a **third** high-confidence critical on top of the two from 23:04 ET: `live/trader.py` `_poll_fill()` assumes `state["signal"]` exists, but `reconcile_state()` seeds reconciled positions/orders with `signal=None`, so fill polling will KeyError after any restart. Re-confirmed the two bugs from prior run still open: (a) `live/scanner.py` ET time-window filter applied to UTC-indexed feed bars suppresses/mistimes morning entries; (b) `live/executor_tradovate.py` `get_fills()` falls back to contract-wide matching, so new brackets inherit historical fills from older trades on the same contract. Verification: `python3 -m py_compile` passed for reviewed files. No broader test suite run. Six open criticals total on `~/trading-range` live path — still the highest live-trading risk in the workspace.',
    source: '~/.codex/automations/code-review/memory.md',
  },
  {
    id: 'performance-audit',
    producer: 'codex',
    stream: 'Performance audit',
    title: 'Rotated to `aiedge/site` — shipped a real regression fix in `BarsChart.tsx` (annotations-object refetch churn); flagged journal waterfall + lightweight-charts static import',
    lastRun: '2026-04-20 00:05 ET',
    takeaway:
      'First rotation into `~/code/aiedge/site` (the only nearby app repo with fresh commits + active UI edits). **Fixed concrete regression**: `src/components/charts/BarsChart.tsx` was refetching `/api/bars` every time `annotations` object identity changed. Restricted the fetch to `ticker/from/to/tfChoice` and recomposed chart overlays locally with `useMemo`. Build measurement was blocked in-env (Google Fonts fetch for `Geist` / `Geist Mono` via `next/font/google` failed); `npm run lint` passed except for 2 pre-existing `react-hooks/exhaustive-deps` warnings in `ScannerDashboard.tsx`. **Highest-leverage remaining risks**: (a) `src/app/symbol/[ticker]/page.tsx` is a client-only waterfall with 4 initial fetches — plus the 5th `/api/bars` for any symbol with data; (b) `src/app/journal/page.tsx` statically imports `TradesTab` and the chart paths statically import `lightweight-charts` (`lightweight-charts.production.mjs` ~180,763 bytes raw), so the default journal/reads experience pays for chart code it doesn\'t immediately use; (c) `src/app/api/snaptrade/sync/route.ts` GET returns the full `filled_trades` snapshot without ticker scoping — symbol page filters client-side.',
    source: '~/.codex/automations/performance-audit/memory.md',
  },
  {
    id: 'sdk-drift',
    producer: 'codex',
    stream: 'Dependency & SDK drift',
    title: 'Revalidated — same hotspots remain. `aiedge/scanner` still the highest-confidence manifest drift; BPA-Bot-1 / Gap-ups gap list grew (reportlab, streamlit, yfinance, ib_insync, python-dateutil now visible)',
    lastRun: '2026-04-20 00:02 ET',
    takeaway:
      'Revalidation pass against the prior drift report — same main hotspots remain. **aiedge/scanner** (clearest drift): `pyproject.toml` keeps `databento>=0.70,<1`, `requirements.txt` still says `databento>=0.38.0`. `requirements.txt` still carries live runtime imports missing from `pyproject.toml`: `anthropic`, `elevenlabs`, `httpx`, `Pillow`, and Google API client/auth packages. **aiedge/site**: range-vs-lock drift only — `snaptrade-typescript-sdk` declared `^9.0.164`, locked at `9.0.181`; Tailwind tooling intentionally broad on `^4` (4.2.2). **BPA-Bot-1/requirements.txt**: omits `mplfinance`, and broader scan now shows in-repo use of `reportlab`, `fpdf`, `streamlit`, `yfinance`, and `ib_insync` — only some have version targets. **Gap-ups**: both `requirements.txt` files list only `databento` + `pandas`, but code imports `numpy`, `requests`, `ib_insync`, `python-dateutil`, and `reportlab`. Recommended next run: start with `aiedge/scanner`, pick a single source of truth, align `databento` floor, then backfill missing deps from `requirements.txt` versions.',
    source: '~/.codex/automations/dependency-and-sdk-drift/memory.md',
  },
  {
    id: 'claude-updates',
    producer: 'codex',
    stream: 'Claude activity monitor',
    title: 'Third run — late-evening arc concrete: S2\'\' killed offline, trend structure memo promoted display-only, SPT pt 36 shipped, midnight maintenance moved from observation into permission tightening',
    lastRun: '2026-04-20 00:04 ET',
    takeaway:
      'Diff vs prior baseline. Highest-signal outcome: **`head-of-strategy` self-corrected the same night** — `S2DD_GATE_BACKTEST_2026-04-19.md` explicitly kills S2\'\' after offline backtest; L1-overweight remains viable. **Trend classification more converged** — `trend-contributor-findings-2026-04-19-incr27-structure-redundancy.md` says `structure` adds essentially no signal once conditioning on `|strength|` + `bar_k`, so structure stays display-only. **Phase work further weakens bull-spike thesis** — `phase-spike-realtime-incr05.md` reduces edge to near-zero / slight bear residual. **SPT concrete but not yet clean** — `small-pullback-trend-backtest-full-stack-2026-04-19.md` recommends shipping variant D (83 trades, 77.1% WR, +1.909R/trade, −2R max DD); pt 36 expansion replaced many top picks; Codex research-review flagged a real contradiction (pt 36 "zero daily shorts" vs UNG/LCID C-tier in JSON). **Operational**: `/studies` refreshes healthy, but hard-coded TSX makes refresh loop noisy — recommend making data-driven. Scanner drift unchanged (16 modified + 67 untracked). **Midnight maintenance moved from passive observation into low-risk action** — found `~/keys/` and `aiedge/scanner/credentials/` at 755, tightened to 700.',
    source: '~/.codex/automations/claude-updates/memory.md',
  },
  {
    id: 'research-review',
    producer: 'codex',
    stream: 'Research review — verifies Claude output',
    title: 'Fourth review — SPT playbook and Monday watchlist still drift from pt 17/pt 27 validated maps; R multiples out of sync across three separate docs',
    lastRun: '2026-04-20 00:04 ET',
    takeaway:
      'Fourth review this arc. Prior memory file was missing, so rebuilt context from session logs and re-verified SPT research notes under `~/code/iphone/spt-research/notes` against scratch outputs in `~/code/aiedge/scanner/scratch`. **Core research outputs still match scratch artifacts**: pt 17 walk-forward supports hybrid rule 9 with H1 short included in the 5R bucket; pt 27 supports C3 at n=71, WR 74.6%, perR +1.841, DD −2.00. **Documentation inconsistencies remain unpatched**: (a) `small-pullback-trend-PLAYBOOK.md` says rule 9 is current 3R while also saying Q29 is closed/adopted and C3 is the recommended stack — these contradict; (b) `small-pullback-trend-monday-watchlist-2026-04-20.md` maps L1/L2 shorts to 4R, conflicting with pt 17\'s validated hybrid map of L1/L2 → 3R and H2 short → 4R; (c) pt 17 itself has prose saying `H1 short → 5R` but the proposed rule-9 code block omits H1 short. Unified review target: next Claude SPT run should patch the R-map drift across all three documents before any live exposure.',
    source: '~/.codex/automations/research-review/memory.md',
  },
  {
    id: 'trader-1',
    producer: 'codex',
    stream: 'Trader 1 — live execution builder',
    title: 'Off-hours maintenance on `~/BPA-Bot-1` — fixed red-news pre-flight indentation bug in `live_trader.py` that made normal order placement unreachable and risked NoneType crash',
    lastRun: '2026-04-20 00:05 ET',
    takeaway:
      'Non-promotion maintenance pass (not a champion change — `~/gaps/ibkr` is still the champion). Found a real live-trading control-flow bug in `~/BPA-Bot-1/live_trader.py`: the red-news pre-flight branch in `_on_bar()` had broken indentation, so the trader **always** logged `rejected:red_news` and continued, making normal order placement unreachable and risking a `NoneType` crash when no blackout window was active. Patched so `rejected:red_news` logs only when an active blackout window exists; normal risk/executor checks + bracket-order placement remain reachable when no news block is active. Added regression tests at `~/BPA-Bot-1/tests/test_live_trader.py` covering both paths. Verification: `./venv/bin/python -m unittest tests.test_live_trader tests.test_microgap_contracts` passed (pytest not installed in BPA venv). **Current highest-value next step unchanged**: during market hours, run a real paper-session validation on the champion `~/gaps/ibkr` path and confirm account-state sync, live fills, and flatten behavior under actual open-position conditions.',
    source: '~/.codex/automations/trader-1/memory.md',
  },
  {
    id: 'trader-2',
    producer: 'codex',
    stream: 'Trader 2 — paper routing layer',
    title: 'Trader 1 conflict gate now DEFAULT-ON via auto-resolve of `~/microgap-bot/logs/strict_scan_<session>.csv` (auto-generates if missing); `trader1_gate` status block emitted in every plan JSON',
    lastRun: '2026-04-20 00:29 ET',
    takeaway:
      'Operationalizes last night\'s overlap study finding that exact-same-bar Trader 1 × Trader 2 conflicts are −0.37R toxic for Trader 2. `paper_trade_bridge.py` now auto-resolves `~/microgap-bot/logs/strict_scan_<session>.csv` by default; if the CSV is missing, auto-runs Trader 1\'s canonical `research_scan.py --session-date <date>` to generate it before loading. The output plan JSON now includes a `trader1_gate` status block describing whether the gate was enabled, how it was sourced, and which CSV was used. Manual override still available via `--block-trader1-csv`; disabling the default gate now requires `--no-auto-trader1-gate`. Added tests at `test_paper_trade_bridge.py` covering existing same-day CSV resolution and auto-generation when scan is missing. Verification: `pytest -q` → 2 passed; live run `--ticker NQ --trade-symbol MNQ --date 2026-03-19` → gate `ON (auto_generated)` and generated the CSV on the fly. **Next step**: push the same Trader 1 gate visibility into `scan_latest_session.py` or the live shared queue path so review/queue tooling shows blocked conflicts before ticket generation.',
    source: '~/.codex/automations/trader-2/memory.md',
  },
  {
    id: 'trader-manager-1',
    producer: 'codex',
    stream: 'Trader Manager 1 — oversight',
    title: 'Fixed false-negative in manager_report.py — focus drift was inferred from the oldest memory section because Trader 1 writes newest-first. Now inspects latest section only.',
    lastRun: '2026-04-20 00:03 ET',
    takeaway:
      'Fourth run. Prior run\'s 3.14 asyncio fix held — `~/gaps/ibkr` still compiles and tests pass; account `DUP346003` still configured; `~/gaps/logs/ibkr` still empty (no runtime proof yet). Found a real manager false-negative in `manager_report.py`: focus drift was being inferred from the full accumulated Trader 1 memory file and then from the OLDEST section, because the memory is newest-first. Updated the manager to inspect only the latest Trader 1 memory section + excerpt; regenerated `latest_report.md` so it reflects current aligned next step instead of stale historical wording. Verification: `py_compile` + report regeneration clean. **Current management instruction unchanged**: keep Trader 1 focused on a real `setup_ibkr.py` + `ibkr_trader.py --demo` paper run with TWS or IB Gateway open. Do NOT treat `~/microgap-bot` execution work as the next gate until `~/gaps/logs/ibkr` contains runtime proof.',
    source: '~/.codex/automations/trader-manager-1/memory.md',
  },
  {
    id: 'trader-manager-2',
    producer: 'codex',
    stream: 'Trader Manager 2 — oversight',
    title: 'Built broker-free smoke path — end-to-end Trader 2 → TopStepX bridge verified WITHOUT credentials. Manager now separates `smoke_verified` from `runtime_verified` so local tests don\'t masquerade as paper runs.',
    lastRun: '2026-04-20 00:29 ET',
    takeaway:
      'Fourth run. Added `--smoke` + `--pending-signals PATH` flags to `~/gaps/topstepx/topstepx_trader.py`: smoke mode skips TopStepX auth, replays queued signals once, and exits cleanly for automation use. Smoke runs log `SMOKE ACCEPTED` with Trader 2 `signal_id` values; live order-submission logs now include `signal_id` + `setup` so future manager runs can detect genuine Trader 2 runtime evidence precisely. **End-to-end bridge-to-consumer handoff verified without broker credentials**: `paper_trade_bridge.py --queue-topstepx --queue-path /tmp/...pending.json --force-queue` → `topstepx_trader.py --smoke --pending-signals /tmp/...pending.json`. Smoke log at `~/gaps/logs/topstepx/trades_2026-04-20.log` shows both historical Trader 2 tickets consumed (`T2_MNQ_BB_VALUE_2026-03-19_1410_SHORT`, `T2_MNQ_ZSCORE_BAL_2026-03-19_1500_SHORT`). Manager now separates `smoke_verified` from `runtime_verified`. **Current management decision**: champion stays `NQ Z-Score Balance Gate`; Trader 2 is **smoke-verified + queue-ready**, still not runtime-verified. Next run: look for first authenticated TopStepX paper log or fill during live market hours rather than rebuilding bridge plumbing.',
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
