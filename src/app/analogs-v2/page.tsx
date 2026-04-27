import Image from 'next/image'

export const metadata = {
  title: 'Analogs v2 — DTW vs Cosine | AI Edge',
  description: 'Side-by-side comparison of the existing DTW analog matcher and the new cosine baseline (Phase 1 of the v2 plan).',
}

export default function AnalogsV2Page() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text">Analogs v2 — DTW vs Cosine Baseline</h1>
        <p className="text-xs text-sub mt-0.5">
          Phase 1 of the analog scanner v2 plan. 30-query random eval, k = 5.
        </p>
      </div>

      {/* Explanation room */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text">What is this?</h2>
        <p className="text-xs text-text/85 leading-relaxed">
          The analog scanner ranks the corpus of historical 6-bar opening windows
          by similarity to the current query. The current production system uses
          multi-dimensional DTW (Dynamic Time Warping). The plan is to replace it
          with a two-stage retrieval system; this page visualizes the first
          milestone — a cosine-similarity baseline — against the existing DTW.
        </p>
        <p className="text-xs text-text/85 leading-relaxed">
          For each query (top of each block, full-width), the system returns the
          top-5 most-similar historical windows. The middle row is what DTW
          returns; the bottom row is what the v2 cosine baseline returns. Each
          panel labels the ticker, date, similarity score, and the historical
          intraday outcome direction (<span className="text-teal">up</span>,{' '}
          <span className="text-red">down</span>, or flat).
        </p>
      </section>

      {/* Methodology */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text">How the cosine baseline works</h2>
        <p className="text-xs text-text/85 leading-relaxed">
          Each 6-bar shape becomes a 42-dimensional feature vector — 7 channels per
          bar, L2-normalized. The channels: z-score of close, body fraction,
          upper-wick fraction, lower-wick fraction, bar size in ATR units, distance
          from EMA20 in ATR units, and gap from prior bar in ATR units. Volume and
          Brooks bar-type are intentionally omitted from this v1 (the corpus shape
          doesn&apos;t carry them; future work).
        </p>
        <p className="text-xs text-text/85 leading-relaxed">
          Search uses faiss <code className="text-teal/80 font-mono text-[11px]">IndexFlatIP</code>{' '}
          over 193,295 6-bar entries (32 MB index). Cosine similarity is exact —
          no quantization or approximate search at this scale.
        </p>
      </section>

      {/* Stats */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text">Gate result — passes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-bg border border-border rounded p-3">
            <div className="text-[10px] text-sub uppercase tracking-wider">Overlap @ 5</div>
            <div className="text-2xl font-bold text-text mt-1 tabular-nums">19%</div>
            <div className="text-[10px] text-sub mt-0.5">29 of 150 results shared</div>
          </div>
          <div className="bg-bg border border-border rounded p-3">
            <div className="text-[10px] text-sub uppercase tracking-wider">DTW outcome-align</div>
            <div className="text-2xl font-bold text-text mt-1 tabular-nums">54%</div>
            <div className="text-[10px] text-sub mt-0.5">top-5 share query direction</div>
          </div>
          <div className="bg-bg border border-border rounded p-3">
            <div className="text-[10px] text-sub uppercase tracking-wider">v2 outcome-align</div>
            <div className="text-2xl font-bold text-teal mt-1 tabular-nums">55%</div>
            <div className="text-[10px] text-sub mt-0.5">+1pp vs DTW — gate met</div>
          </div>
        </div>
        <p className="text-xs text-text/85 leading-relaxed">
          The plan requires cosine to <em>beat or match</em> DTW on this kind of
          test before moving to Phase 2 (the supervised contrastive CNN). 55% vs 54%
          matches the gate. The 19% overlap is interesting: the two methods find
          substantially different sets of analogs but with comparable predictive
          value, which is useful diversification for the eventual Stage 2 reranker.
        </p>
      </section>

      {/* The image */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text">
          6 sample queries — query / DTW top-5 / cosine top-5
        </h2>
        <p className="text-xs text-sub">
          Random sample, seed 42. Hand-picked queries (and a real visual blind eval)
          are the next step.
        </p>
        <div className="bg-bg border border-border rounded overflow-hidden">
          <Image
            src="/analogs-v2/compare.png"
            alt="Side-by-side comparison: query vs DTW top-5 vs cosine v2 top-5 across 6 random queries."
            width={1600}
            height={2700}
            className="w-full h-auto"
            unoptimized
          />
        </div>
      </section>

      {/* What's next */}
      <section className="bg-surface border border-border rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-semibold text-text">What&apos;s next</h2>
        <ul className="list-disc pl-5 space-y-1 text-xs text-text/85">
          <li>
            <strong>Visual blind eval.</strong> Will picks 30 hand-picked queries
            and ranks the top-5 from each method by visual quality. The
            outcome-alignment metric is a proxy; the visual eval is the gold standard.
          </li>
          <li>
            <strong>Bar-type + volume features.</strong> Backfill the corpus shape
            with Brooks bar-type categoricals and rolling volume z-score so the
            feature vector grows from 42 → ~64 dimensions. Should improve recall.
          </li>
          <li>
            <strong>Phase 2 — supervised contrastive CNN.</strong> 1D-CNN encoder
            trained on the v2 outcome labels (T0..T+5), triplet loss + hard negative
            mining. Runs on the 5090. Replaces the cosine baseline as the Stage 1
            recall layer.
          </li>
          <li>
            <strong>Phase 3 — XGBoost reranker.</strong> Stage 2: scores
            (query, candidate) pairs by predicted P(aligned), P(EOD &gt; +1%),
            forward-path stats. Returns top-20.
          </li>
        </ul>
      </section>
    </div>
  )
}
