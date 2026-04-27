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
          <div className="text-[10px] text-sub uppercase tracking-wider">Headline</div>
          <div className="text-4xl font-bold text-teal mt-1 tabular-nums">46%</div>
          <div className="text-xs text-text/85 mt-1">
            v2-extended hits a 46% win rate at &gt;0.5-ATR moves — vs 37% for
            DTW (+9pp). Bar-type-aware features beat both DTW and the OHLC-only
            cosine baseline on the metrics that actually matter for trading.
          </div>
        </div>

        <div className="border-t border-border pt-4 overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-[10px] text-sub uppercase tracking-wider">
                <th className="text-left py-1.5 pr-3 font-medium">Metric</th>
                <th className="text-right py-1.5 pr-3 font-medium">DTW</th>
                <th className="text-right py-1.5 pr-3 font-medium">v1 cosine</th>
                <th className="text-right py-1.5 font-medium text-teal">v2 ext.</th>
              </tr>
            </thead>
            <tbody className="text-text/85">
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-3">Direction alignment</td>
                <td className="text-right py-1.5 pr-3">54%</td>
                <td className="text-right py-1.5 pr-3">55%</td>
                <td className="text-right py-1.5 text-teal/80">53%</td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-3">Win rate · &gt;0.5 ATR</td>
                <td className="text-right py-1.5 pr-3">37%</td>
                <td className="text-right py-1.5 pr-3">43%</td>
                <td className="text-right py-1.5 text-teal font-semibold">46%</td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-3">MFE / MAE ratio</td>
                <td className="text-right py-1.5 pr-3">4.2×</td>
                <td className="text-right py-1.5 pr-3 text-teal/80">6.0×</td>
                <td className="text-right py-1.5">5.3×</td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-3">IQR width · T+5 (lower=tighter)</td>
                <td className="text-right py-1.5 pr-3">n/a</td>
                <td className="text-right py-1.5 pr-3">4.4%</td>
                <td className="text-right py-1.5 text-teal font-semibold">4.2%</td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-3">Cross-ticker diversity</td>
                <td className="text-right py-1.5 pr-3">0.81</td>
                <td className="text-right py-1.5 pr-3">0.79</td>
                <td className="text-right py-1.5 text-teal font-semibold">0.85</td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-3">KL divergence vs base rate</td>
                <td className="text-right py-1.5 pr-3 text-teal/80">0.26</td>
                <td className="text-right py-1.5 pr-3">0.21</td>
                <td className="text-right py-1.5">0.13</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="text-xs text-text/75 leading-relaxed">
          n = 30 random queries, k = 5, seed 42. <strong className="text-text">v2 extended</strong> uses
          7 continuous channels + 7-class Brooks bar-type one-hot + inside/outside flags
          (96-d feature vector). v1 cosine is OHLC-only (42-d). DTW reads the v1 corpus,
          so its IQR T+5 isn&apos;t computable yet — easy fix.
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
