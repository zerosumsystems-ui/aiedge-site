import Link from 'next/link'

export const metadata = {
  title: 'State Layers | AI Edge',
  description:
    'Brooks Trading Factory state layers with examples, fields, source status, and replay focus.',
}

type SourceStatus =
  | 'raw-book-backed'
  | 'local book-derived'
  | 'implementation-derived'
  | 'operating-model-only'

type StateLayer = {
  id: string
  name: string
  shortName: string
  stage: string
  status: SourceStatus
  job: string
  fields: string[]
  example: {
    setup: string
    read: string
    action: string
  }
  caution: string
}

const stateLayers: StateLayer[] = [
  {
    id: 'always-in',
    name: 'Always In Bias State',
    shortName: 'Always In',
    stage: 'Direction',
    status: 'local book-derived',
    job: 'Records who owns the market before a setup label is allowed to matter.',
    fields: ['always_in_state', 'always_in_strength', 'always_in_mode', 'state_alignment'],
    example: {
      setup: 'Trend-from-open first pullback',
      read: '5M remains Always In long; 1M pullback is shallow and does not flip control.',
      action: 'Review long continuation before countertrend reversal ideas.',
    },
    caution: 'Do not turn forced-choice bias into automatic entry permission.',
  },
  {
    id: 'signal-context-gate',
    name: 'Signal Context Gate',
    shortName: 'Signal Gate',
    stage: 'Evidence',
    status: 'local book-derived',
    job: 'Separates attractive bar shapes from signals that actually have context and follow-through.',
    fields: ['shape_score', 'context_score', 'entry_bar_score', 'follow_through_score', 'signal_block_reason'],
    example: {
      setup: 'Opening breakout pullback',
      read: 'Signal bar is clean, but entry bar cannot close beyond the prior high.',
      action: 'Mark as failed proof instead of accepted breakout continuation.',
    },
    caution: 'A pretty signal bar is not enough when context or entry-bar proof is missing.',
  },
  {
    id: 'leg-count',
    name: 'Leg Count And Second Entry',
    shortName: 'Leg Count',
    stage: 'Maturity',
    status: 'local book-derived',
    job: 'Tracks whether the market is on a first attempt, second entry, failed second entry, wedge, or TBTL clock.',
    fields: ['attempt_number', 'legs_completed_since_spike', 'last_failed_entry_side', 'tbtl_clock_remaining'],
    example: {
      setup: 'Failed H2 after a spike',
      read: 'First pullback entry failed; the next attempt is aging toward wedge or failed-failure context.',
      action: 'Require attempt count in the journal before assigning setup quality.',
    },
    caution: 'A setup label without attempt number is incomplete.',
  },
  {
    id: 'decision-record',
    name: 'Candidate Decision Record',
    shortName: 'Decision',
    stage: 'Review',
    status: 'operating-model-only',
    job: 'Keeps gray-zone decisions auditable instead of hiding them as intuition.',
    fields: ['setup_name', 'exception_flags', 'confidence_band', 'trade_class', 'skip_reason'],
    example: {
      setup: 'Middle-of-range stop entry',
      read: 'Setup exists, but range position and overlap force confidence into gray band.',
      action: 'Record no-trade reason and revisit in rejected-winner review.',
    },
    caution: 'Exception tracking is workflow evidence, not a new source of trading edge.',
  },
  {
    id: 'level-acceptance',
    name: 'Support/Resistance Acceptance Test',
    shortName: 'Level Test',
    stage: 'Location',
    status: 'raw-book-backed',
    job: 'Treats a level as a test that must be accepted or rejected after contact.',
    fields: ['level_id', 'tested_level_type', 'retest_result', 'trapped_side', 'post_test_follow_through'],
    example: {
      setup: 'Breakout retest of opening range high',
      read: 'Price tests the breakout point, holds above it, and traps sellers below the level.',
      action: 'Upgrade continuation review only after the post-test follow-through bar.',
    },
    caution: 'A level touch is evidence gathering, not a trigger.',
  },
  {
    id: 'range-gravity',
    name: 'Range Gravity',
    shortName: 'Range',
    stage: 'Regime',
    status: 'raw-book-backed',
    job: 'Flags when the market still behaves like a range even after a breakout attempt.',
    fields: ['range_gravity_state', 'range_position', 'breakout_conversion_score', 'first_breakout_result'],
    example: {
      setup: 'Breakout above range middle',
      read: 'Breakout lacks follow-through and returns to overlap inside the prior range.',
      action: 'Downgrade to range behavior and block hopeful swing assumptions.',
    },
    caution: 'Do not trade the middle as if it were an edge.',
  },
  {
    id: 'channel-pressure',
    name: 'Channel Pressure And Pullback Depth',
    shortName: 'Channel',
    stage: 'Regime',
    status: 'local book-derived',
    job: 'Describes whether a pullback is healthy trend behavior or channel pressure is decaying.',
    fields: ['channel_pressure_state', 'pullback_depth_class', 'pullback_duration_bars', 'channel_break_status'],
    example: {
      setup: 'Bull channel pullback',
      read: 'Pullback is deep, slow, and breaks the channel instead of forming a shallow test.',
      action: 'Move from continuation assumption to proof-required review.',
    },
    caution: 'A channel line break is not automatically a reversal.',
  },
  {
    id: 'order-fill',
    name: 'Order Fill And Missed Target Pressure',
    shortName: 'Order Fill',
    stage: 'Management',
    status: 'raw-book-backed',
    job: 'Checks whether price moved far enough to pay traders who entered, or disappointed them.',
    fields: ['order_fill_pressure_state', 'target_type', 'target_fill_status', 'missed_target_trap'],
    example: {
      setup: 'Small winner that misses target by one tick',
      read: 'Scalpers were almost paid, then price reverses to breakeven.',
      action: 'Tag disappointment pressure before judging the original entry.',
    },
    caution: 'Missed target pressure is context evidence, not a standalone fade.',
  },
  {
    id: 'gap-continuity',
    name: 'Gap Continuity And Gap Closure',
    shortName: 'Gap',
    stage: 'Momentum',
    status: 'implementation-derived',
    job: 'Tracks whether gaps are supporting continuation or closing into disappointment.',
    fields: ['gap_type', 'gap_direction', 'gap_midpoint', 'gap_continuity_state', 'body_gap_closure_count'],
    example: {
      setup: 'Opening continuation after stacked body gaps',
      read: 'Repeated gaps stay open and pullbacks cannot close midpoint pressure.',
      action: 'Treat as momentum evidence that still needs trader-equation review.',
    },
    caution: 'A gap or gap close is not automatic entry logic.',
  },
  {
    id: 'climax-resolution',
    name: 'Climax Resolution',
    shortName: 'Climax',
    stage: 'Transition',
    status: 'local book-derived',
    job: 'Separates early spike continuation from late exhaustion and unresolved climax behavior.',
    fields: ['climax_resolution_state', 'climax_phase', 'climax_shape', 'exhaustion_context'],
    example: {
      setup: 'Late third push after measured move',
      read: 'Price accelerates into target, then fails to continue after the pullback.',
      action: 'Require resolution before buying another late breakout.',
    },
    caution: 'Do not turn climax labels into automatic fade rules.',
  },
  {
    id: 'breakout-mode',
    name: 'Breakout Mode And Range Middle',
    shortName: 'Breakout Mode',
    stage: 'Compression',
    status: 'raw-book-backed',
    job: 'Marks compression where both sides are waiting for a clear failed breakout or accepted breakout.',
    fields: ['compression_type', 'breakout_mode_state', 'first_breakout_direction', 'failed_failure_result'],
    example: {
      setup: 'Tight early trading range',
      read: 'First breakout fails, then the failed failure produces stronger follow-through.',
      action: 'Review after the sequence resolves, not on the first poke.',
    },
    caution: 'Breakout mode is a wait state until evidence resolves.',
  },
  {
    id: 'timeframe-authority',
    name: 'Fractal Timeframe Authority',
    shortName: 'Timeframes',
    stage: 'Context',
    status: 'raw-book-backed',
    job: 'Decides which timeframe owns context and which timeframe is only providing entry detail.',
    fields: ['context_tf', 'execution_tf', 'trigger_tf', 'tf_regime_by_frame', 'timeframe_authority_state'],
    example: {
      setup: '1M reversal inside 15M bull pullback',
      read: 'Lower-timeframe reversal is only a pullback in the higher-timeframe trend.',
      action: 'Downgrade countertrend expectation unless higher-timeframe damage appears.',
    },
    caution: 'Do not average conflicting timeframes into vague confluence.',
  },
  {
    id: 'reversal-proof',
    name: 'Minor Vs Major Reversal Proof State',
    shortName: 'Reversal Proof',
    stage: 'Transition',
    status: 'local book-derived',
    job: 'Prevents first countertrend signals from being promoted into major reversal ideas too early.',
    fields: ['reversal_proof_state', 'prior_trend_damage', 'old_extreme_test_type', 'second_reversal_quality'],
    example: {
      setup: 'Double bottom after sell climax',
      read: 'Trendline break occurred, old low was tested, second reversal has strong follow-through.',
      action: 'Classify as major-reversal candidate for replay, not live rule approval.',
    },
    caution: 'Most first reversals are minor, range-forming, or failed.',
  },
  {
    id: 'stop-pressure',
    name: 'Stop Pressure And Breakeven Test',
    shortName: 'Stop Pressure',
    stage: 'Pressure',
    status: 'raw-book-backed',
    job: 'Shows whose protective stop, breakeven price, or failed-entry price is being tested.',
    fields: ['stop_pressure_zone', 'breakeven_test_state', 'scalper_profit_before_pullback', 'stop_distance_mode'],
    example: {
      setup: 'Breakout pullback to entry breakeven',
      read: 'Breakout traders were not paid before the pullback and breakeven breaks quickly.',
      action: 'Downgrade accepted breakout and tag trapped-trader risk.',
    },
    caution: 'Stop clusters matter only with regime, location, follow-through, and trader-equation support.',
  },
]

const statusStyles: Record<SourceStatus, string> = {
  'raw-book-backed': 'border-teal/30 bg-teal/10 text-teal',
  'local book-derived': 'border-blue/30 bg-blue/10 text-blue',
  'implementation-derived': 'border-yellow/30 bg-yellow/10 text-yellow',
  'operating-model-only': 'border-sub/30 bg-sub/10 text-sub',
}

const stageOrder = ['Context', 'Regime', 'Direction', 'Location', 'Compression', 'Maturity', 'Evidence', 'Transition', 'Momentum', 'Pressure', 'Management', 'Review']

export default function StateLayersPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-wider text-teal">Brooks factory state stack</p>
            <h1 className="mt-1 text-2xl font-semibold text-text">State Layers</h1>
            <p className="mt-2 text-sm leading-relaxed text-text/75">
              Each layer turns a Brooks research finding into a read-only review field. The goal is to make
              scanner cards, replay notes, dashboards, and journals explain why a setup is allowed, blocked,
              downgraded, or still unresolved.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-sub">
            <div>Research only</div>
            <div>No live-rule authority</div>
          </div>
        </div>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="State layers" value={stateLayers.length.toString()} detail="in current review stack" />
          <Metric label="Newest layer" value="Stop pressure" detail="breakeven and forced-exit tests" />
          <Metric label="Replay focus" value="40 examples" detail="opening first pullback review set" />
          <Metric label="Publish surface" value="llms.txt" detail="GitHub AI-readable handoff" />
        </section>
      </header>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-sub">Decision flow</p>
            <h2 className="mt-1 text-lg font-semibold text-text">A setup label enters late</h2>
          </div>
          <Link
            href="https://github.com/zerosumsystems-ui/brooks-trading-factory-knowledge/blob/master/llms.txt"
            className="rounded border border-teal/30 bg-teal/10 px-3 py-1.5 text-xs font-medium text-teal hover:bg-teal/15"
          >
            GitHub knowledge pack
          </Link>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {['Context owns direction', 'Location creates edge', 'Proof confirms or blocks', 'Replay decides promotion'].map((step, index) => (
            <div key={step} className="rounded border border-border bg-bg p-3">
              <div className="text-[10px] uppercase tracking-wider text-sub">Step {index + 1}</div>
              <div className="mt-1 text-sm font-semibold text-text">{step}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <aside className="rounded-lg border border-border bg-surface p-3 xl:sticky xl:top-[calc(var(--nav-h)+1rem)] xl:self-start">
          <p className="text-[10px] uppercase tracking-wider text-sub">Layer index</p>
          <div className="mt-3 grid gap-1">
            {stageOrder.map((stage) => {
              const count = stateLayers.filter((layer) => layer.stage === stage).length
              if (!count) return null
              return (
                <a
                  key={stage}
                  href={`#${stage.toLowerCase().replaceAll(' ', '-')}`}
                  className="flex items-center justify-between rounded px-2 py-1.5 text-xs text-sub hover:bg-bg hover:text-text"
                >
                  <span>{stage}</span>
                  <span className="tabular-nums">{count}</span>
                </a>
              )
            })}
          </div>
        </aside>

        <div className="space-y-4">
          {stageOrder.map((stage) => {
            const layers = stateLayers.filter((layer) => layer.stage === stage)
            if (!layers.length) return null
            return (
              <section key={stage} id={stage.toLowerCase().replaceAll(' ', '-')} className="space-y-3 scroll-mt-20">
                <h2 className="text-sm font-semibold text-text">{stage}</h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {layers.map((layer) => (
                    <LayerCard key={layer.id} layer={layer} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="text-[10px] uppercase tracking-wider text-sub">{label}</div>
      <div className="mt-1 text-lg font-semibold text-text tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-text/60">{detail}</div>
    </div>
  )
}

function LayerCard({ layer }: { layer: StateLayer }) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-sub">{layer.shortName}</div>
          <h3 className="mt-1 text-base font-semibold text-text">{layer.name}</h3>
        </div>
        <span className={`rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${statusStyles[layer.status]}`}>
          {layer.status}
        </span>
      </header>

      <p className="mt-3 text-sm leading-relaxed text-text/75">{layer.job}</p>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-sub">Fields</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {layer.fields.map((field) => (
            <code key={field} className="rounded border border-border bg-bg px-1.5 py-1 text-[11px] text-text/80">
              {field}
            </code>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded border border-border bg-bg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-text">{layer.example.setup}</div>
          <div className="text-[10px] uppercase tracking-wider text-sub">Example</div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text/70">{layer.example.read}</p>
        <p className="mt-2 text-xs leading-relaxed text-teal">{layer.example.action}</p>
      </div>

      <div className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-text/60">
        {layer.caution}
      </div>
    </article>
  )
}
