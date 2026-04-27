import Image from 'next/image'

export const metadata = {
  title: 'Analogs v2 — DTW vs Cosine | AI Edge',
  description: 'Side-by-side comparison of the existing DTW analog matcher and the new cosine baseline (Phase 1 of the v2 plan).',
}

export default function AnalogsV2Page() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Hero — title + one big stat. Nothing else above the fold. */}
      <div>
        <h1 className="text-lg font-bold text-text">Analogs v2</h1>
        <p className="text-xs text-sub mt-0.5">
          Replacing the DTW chart-matcher with a faster system. Phase 1: cosine baseline.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 space-y-4">
        <div>
          <div className="text-[10px] text-sub uppercase tracking-wider">Gate result</div>
          <div className="text-4xl font-bold text-teal mt-1 tabular-nums">55%</div>
          <div className="text-xs text-text/85 mt-1">
            Cosine matches DTW on outcome direction agreement (54%) — gate
            passed. But direction agreement is a coarse metric. The interesting
            story is below.
          </div>
        </div>

        <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wider">
              Win rate · T0 EOD &gt; 0.5 ATR
            </div>
            <div className="text-2xl font-bold text-teal mt-0.5 tabular-nums">
              43% <span className="text-[10px] text-sub font-normal">v2</span>
            </div>
            <div className="text-[11px] text-sub mt-0.5">vs 37% DTW (+6pp)</div>
          </div>
          <div>
            <div className="text-[10px] text-sub uppercase tracking-wider">
              Mean MFE / MAE ratio
            </div>
            <div className="text-2xl font-bold text-teal mt-0.5 tabular-nums">
              6.0× <span className="text-[10px] text-sub font-normal">v2</span>
            </div>
            <div className="text-[11px] text-sub mt-0.5">vs 4.2× DTW (+44%)</div>
          </div>
        </div>
        <div className="text-xs text-text/85 leading-relaxed">
          v2 finds analogs with <strong className="text-text">+44% better
          risk-reward</strong> and a <strong className="text-text">6pp higher
          win rate</strong> on meaningful moves. The headline 55% hid the
          actual edge — direction agreement only checks up/down/flat, not
          magnitude or trade quality.
        </div>
      </div>

      {/* Everything else — accordion. Compact. */}
      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        <Drawer label="The numbers in detail">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="v2 alignment" value="55%" highlight />
            <Stat label="DTW alignment" value="54%" />
            <Stat label="Top-5 overlap" value="19%" />
          </div>
          <p className="text-xs text-text/80 leading-relaxed">
            <strong className="text-text">Outcome alignment</strong> = fraction
            of top-5 historical analogs whose intraday direction matched the
            query&apos;s. Pure-noise = 33% (three directions).
          </p>
          <p className="text-xs text-text/80 leading-relaxed">
            <strong className="text-text">Overlap</strong> = of the 5 picks
            from each method, how many are shared. 19% means the two methods
            find <em>genuinely different</em> analogs — useful when we
            ensemble them later.
          </p>

          <details className="group/sub mt-2">
            <summary className="text-xs text-teal cursor-pointer hover:text-teal/80 inline-flex items-center gap-1 list-none">
              <span className="group-open/sub:rotate-90 transition-transform inline-block">›</span>
              <span>9 deeper metrics we&apos;re tracking</span>
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <MetricRow
                name="Win rate · T0 EOD > 0.5 ATR"
                why="fraction of top-5 with a meaningful intraday move"
                value="43% v2  ·  37% DTW"
                status="computed"
              />
              <MetricRow
                name="Mean MFE / MAE ratio"
                why="risk-reward of the historical setups"
                value="6.0× v2  ·  4.2× DTW"
                status="computed"
              />
              <MetricRow
                name="Cross-ticker diversity"
                why="entropy of ticker spread in top-5 — guards against same-name bias"
                value="0.79 v2  ·  0.81 DTW"
                status="computed"
              />
              <MetricRow
                name="KL divergence vs base rate"
                why="how much being in top-K shifts the outcome distribution"
                value="0.21 v2  ·  0.26 DTW"
                status="computed"
              />
              <MetricRow
                name="IQR width of top-5 T+5"
                why="dispersion of the forward-path fan — narrower = more confident"
                value="4.4% v2  ·  DTW pending"
                status="partial"
              />
              <MetricRow
                name="Information coefficient"
                why="rank correlation between similarity and realized outcome"
                status="needs labels"
              />
              <MetricRow
                name="Brooks bar-type agreement"
                why="overlap of bar-type sequences across top-K"
                status="phase 1.5b — in progress"
              />
              <MetricRow
                name="Cycle-phase conditioning"
                why="re-run all metrics conditioned on bull/bear/range"
                status="phase 1.5c"
              />
              <MetricRow
                name="Mutual information"
                why="non-linear dependence between features and outcome"
                status="research"
              />
            </div>
          </details>
        </Drawer>

        <Drawer label="How the new system works">
          <p className="text-xs text-text/85 leading-relaxed">
            Each 6-bar shape becomes a 42-number fingerprint (7 numbers per
            bar describing body, wicks, gap, distance from EMA20, and bar
            size). Search uses cosine similarity over a 32 MB faiss index
            covering 193,295 historical windows.
          </p>
          <details className="group/sub">
            <summary className="text-xs text-teal cursor-pointer hover:text-teal/80 inline-flex items-center gap-1 list-none">
              <span className="group-open/sub:rotate-90 transition-transform inline-block">›</span>
              <span>The 7 channels per bar</span>
            </summary>
            <ul className="mt-2 list-disc pl-5 space-y-0.5 text-xs text-text/80">
              <li><code className="text-teal/80 font-mono text-[11px]">close_z</code> — z-score of close within window</li>
              <li><code className="text-teal/80 font-mono text-[11px]">body_frac</code> — body / total bar range</li>
              <li><code className="text-teal/80 font-mono text-[11px]">upper_wick_frac</code>, <code className="text-teal/80 font-mono text-[11px]">lower_wick_frac</code></li>
              <li><code className="text-teal/80 font-mono text-[11px]">bar_atr</code> — bar size in ATR units</li>
              <li><code className="text-teal/80 font-mono text-[11px]">ema20_dist_atr</code> — distance from EMA20 in ATR units</li>
              <li><code className="text-teal/80 font-mono text-[11px]">gap_atr</code> — gap from prior bar in ATR units</li>
            </ul>
            <p className="text-xs text-text/70 mt-2 italic">
              Volume and Brooks bar-type are intentionally omitted from this
              v1 — corpus shape doesn&apos;t carry them yet.
            </p>
          </details>
        </Drawer>

        <Drawer label="6 sample queries (charts)">
          <p className="text-xs text-sub">
            Each block: query chart on top, DTW top-5 in the middle row,
            cosine top-5 below. Random sample, seed 42.
          </p>
          <div className="bg-bg border border-border rounded overflow-x-auto">
            <Image
              src="/analogs-v2/compare.png"
              alt="Comparison chart: query vs DTW top-5 vs cosine v2 top-5 across 6 random queries."
              width={1600}
              height={2700}
              className="w-full h-auto min-w-[640px]"
              unoptimized
            />
          </div>
        </Drawer>

        <Drawer label="What's next">
          <ul className="list-disc pl-5 space-y-1 text-xs text-text/85">
            <li>Visual blind-eval — Will picks 30 hand-picked queries and ranks each method&apos;s top-5.</li>
            <li>Backfill Brooks bar-type + volume into the corpus.</li>
            <li>Phase 2 — supervised contrastive 1D-CNN on the 5090.</li>
            <li>Phase 3 — XGBoost reranker scoring (query, candidate) pairs.</li>
            <li>Phase 4 — replace single-match UI with a forward-path fan.</li>
          </ul>
        </Drawer>
      </div>
    </div>
  )
}

function Drawer({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <details className="group">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none hover:bg-surface-hover transition-colors">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="text-xs text-sub group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3">{children}</div>
    </details>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="bg-bg border border-border rounded p-2.5">
      <div className="text-[10px] text-sub uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold mt-0.5 tabular-nums ${highlight ? 'text-teal' : 'text-text'}`}>
        {value}
      </div>
    </div>
  )
}

function MetricRow({
  name,
  why,
  value,
  status,
}: {
  name: string
  why: string
  value?: string
  status:
    | 'computed'
    | 'partial'
    | 'needs labels'
    | 'phase 1.5b — in progress'
    | 'phase 1.5c'
    | 'research'
}) {
  const statusColor = {
    'computed': 'text-teal',
    'partial': 'text-yellow',
    'needs labels': 'text-yellow',
    'phase 1.5b — in progress': 'text-orange',
    'phase 1.5c': 'text-orange',
    'research': 'text-sub',
  }[status]
  return (
    <div className="bg-bg border border-border rounded p-2.5 space-y-0.5">
      <div className="text-xs font-medium text-text">{name}</div>
      <div className="text-[11px] text-text/65 leading-snug">{why}</div>
      {value && (
        <div className="text-[11px] font-mono text-text/85 tabular-nums">{value}</div>
      )}
      <div className={`text-[9px] uppercase tracking-wider ${statusColor}`}>{status}</div>
    </div>
  )
}
