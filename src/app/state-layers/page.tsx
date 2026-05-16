import Link from 'next/link'
import { StateLayerChart, type ExampleChart } from '@/components/state-layers/StateLayerChart'

export const metadata = {
  title: 'State Layers | AI Edge',
  description:
    'Brooks Trading Factory state layers with real chart examples from this week, fields, source status, and Codex review packets.',
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
  packet: { date: string; file: string }
  example: {
    source: string
    setup: string
    read: string
    action: string
    chart: ExampleChart
  }
  caution: string
}

const PACKET_BASE =
  'https://github.com/zerosumsystems-ui/brooks-trading-factory-knowledge/blob/master/packets/'

const stateLayers: StateLayer[] = [
  {
    id: 'always-in',
    name: 'Always In Bias State',
    shortName: 'Always In',
    stage: 'Direction',
    status: 'local book-derived',
    job: 'Records who owns the market before a setup label is allowed to matter.',
    fields: ['always_in_state', 'always_in_strength', 'always_in_mode', 'state_alignment'],
    packet: { date: '2026-04-29', file: '2026-04-29-1303-always-in-state.md' },
    example: {
      source: 'QCOM · May 12 · 5m',
      setup: 'QCOM opening bear drive',
      read: 'A one-bar bounce off the open fails; the third bar sells through it and every close after stays lower — 5M Always In short.',
      action: 'Review short-continuation entries; treat bounces as exits, not reversals.',
      chart: {
        highlight: { index: 3, label: 'Sellers reassert' },
        bars: [
          { o: 229.66, h: 230, l: 222.54, c: 223.22 },
          { o: 223.3, h: 226.34, l: 222.4, c: 226.24 },
          { o: 226.63, h: 227.9, l: 225.53, c: 226.12 },
          { o: 225.97, h: 226.3, l: 222.08, c: 223.51 },
          { o: 223.41, h: 224.61, l: 222.62, c: 223.72 },
          { o: 223.59, h: 223.64, l: 220.9, c: 221.2 },
          { o: 221.19, h: 222.63, l: 220.66, c: 220.67 },
          { o: 220.75, h: 220.94, l: 219.44, c: 219.58 },
          { o: 219.6, h: 221.12, l: 219.02, c: 220.86 },
          { o: 220.7, h: 220.78, l: 218, c: 220.57 },
          { o: 220.68, h: 220.74, l: 217.89, c: 218 },
          { o: 217.99, h: 218.11, l: 215.5, c: 215.54 },
          { o: 215.66, h: 216.09, l: 214.61, c: 215.96 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-1402-signal-context-gate.md' },
    example: {
      source: 'MRVL · May 13 · 5m',
      setup: 'MRVL opening spike',
      read: 'The spike bar tags the session high, but the next bar pokes higher and closes straight back inside it.',
      action: 'Mark as failed proof, not an accepted breakout continuation.',
      chart: {
        highlight: { index: 5, label: 'Entry bar fails' },
        bars: [
          { o: 169.32, h: 172.91, l: 169.02, c: 172.31 },
          { o: 172.06, h: 172.42, l: 169.81, c: 172.41 },
          { o: 172.42, h: 178.78, l: 172.42, c: 178.16 },
          { o: 178.09, h: 179.44, l: 173.5, c: 176.31 },
          { o: 176.52, h: 182.01, l: 175.28, c: 181.71 },
          { o: 181.8, h: 182.29, l: 178.34, c: 179.1 },
          { o: 179.16, h: 179.51, l: 177.3, c: 178.71 },
          { o: 178.8, h: 179.81, l: 176.11, c: 177.32 },
          { o: 177.53, h: 179.13, l: 177.22, c: 177.22 },
          { o: 176.9, h: 178.26, l: 176.29, c: 177.97 },
          { o: 178.31, h: 179.82, l: 178.31, c: 179.76 },
          { o: 179.74, h: 180.58, l: 178.72, c: 179 },
          { o: 178.86, h: 180.26, l: 178.79, c: 180.24 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-1618-leg-count-second-entry.md' },
    example: {
      source: 'NVDA · May 13 · 5m',
      setup: 'NVDA first pullback after the open',
      read: 'The first bounce off the low rolls over and fails; the second attempt is the one that holds and grinds up.',
      action: 'Log the attempt number before grading the setup.',
      chart: {
        highlight: { index: 7, label: 'Failed first attempt' },
        bars: [
          { o: 224.91, h: 226.86, l: 224.22, c: 226.81 },
          { o: 226.82, h: 227.14, l: 225.22, c: 225.77 },
          { o: 225.79, h: 225.79, l: 224.41, c: 224.57 },
          { o: 224.54, h: 224.8, l: 221.87, c: 222.56 },
          { o: 222.55, h: 224.13, l: 221.6, c: 224.05 },
          { o: 224.04, h: 224.59, l: 223.32, c: 224.08 },
          { o: 224.11, h: 224.22, l: 223.18, c: 223.59 },
          { o: 223.58, h: 223.96, l: 223.07, c: 223.33 },
          { o: 223.3, h: 224.27, l: 223.16, c: 224.06 },
          { o: 224.02, h: 224.84, l: 223.6, c: 224 },
          { o: 224.07, h: 225.17, l: 223.88, c: 224.66 },
          { o: 224.7, h: 225.03, l: 224.34, c: 224.46 },
          { o: 224.44, h: 224.83, l: 223.7, c: 224.62 },
          { o: 224.56, h: 225.08, l: 224.2, c: 224.38 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-1702-gray-zone-exceptions.md' },
    example: {
      source: 'MU · May 13 · 5m',
      setup: 'MU mid-range stop entry',
      read: 'Bars overlap heavily around the range middle with no clean edge — a genuine gray-zone candidate.',
      action: 'Record the no-trade reason and revisit in rejected-winner review.',
      chart: {
        level: { price: 792.8, label: 'Range middle' },
        highlight: { index: 7, label: 'Overlap, no edge' },
        bars: [
          { o: 788.25, h: 795.47, l: 787.56, c: 795.04 },
          { o: 794.81, h: 795.87, l: 792.5, c: 795.54 },
          { o: 795.4, h: 798, l: 794.89, c: 797.41 },
          { o: 797.37, h: 797.62, l: 794.37, c: 796.13 },
          { o: 796, h: 796.53, l: 793, c: 793.93 },
          { o: 793.9, h: 794.52, l: 790.8, c: 793.42 },
          { o: 793.3, h: 796.5, l: 792.01, c: 794.99 },
          { o: 795.08, h: 796.68, l: 792.02, c: 792.3 },
          { o: 792.33, h: 795.72, l: 792.33, c: 794.7 },
          { o: 794.79, h: 795.02, l: 792.88, c: 793.84 },
          { o: 793.82, h: 797.33, l: 793, c: 795.15 },
          { o: 795.22, h: 795.84, l: 792.19, c: 792.55 },
          { o: 792.48, h: 794.65, l: 792.41, c: 793.7 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-1802-level-acceptance.md' },
    example: {
      source: 'SPY · May 13 · 5m',
      setup: 'SPY breakout retest',
      read: 'Price coils against a level for several bars, then a bull bar closes above it and the next bars hold the breakout.',
      action: 'Upgrade continuation review only after the post-test follow-through bar.',
      chart: {
        level: { price: 741.85, label: 'Tested level' },
        highlight: { index: 8, label: 'Breakout accepted' },
        bars: [
          { o: 740.75, h: 740.85, l: 740.5, c: 740.68 },
          { o: 740.69, h: 741.84, l: 740.66, c: 741.62 },
          { o: 741.67, h: 741.95, l: 741.3, c: 741.72 },
          { o: 741.73, h: 741.86, l: 741.4, c: 741.73 },
          { o: 741.73, h: 741.86, l: 741.63, c: 741.72 },
          { o: 741.76, h: 741.83, l: 741.62, c: 741.62 },
          { o: 741.62, h: 741.76, l: 741.46, c: 741.53 },
          { o: 741.56, h: 741.84, l: 741.53, c: 741.84 },
          { o: 741.86, h: 742.28, l: 741.86, c: 742.06 },
          { o: 742.13, h: 742.55, l: 742.13, c: 742.41 },
          { o: 742.42, h: 742.87, l: 742.42, c: 742.72 },
          { o: 742.74, h: 742.89, l: 742.56, c: 742.67 },
          { o: 742.61, h: 742.75, l: 742.4, c: 742.49 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-1902-range-gravity-channel-pressure.md' },
    example: {
      source: 'MU · May 15 · 5m',
      setup: 'MU breakout attempt',
      read: 'An early push higher cannot hold — price falls straight back into the prior overlap before the real move.',
      action: 'Treat the first poke as range behavior and wait for acceptance.',
      chart: {
        level: { price: 735, label: 'Range middle' },
        highlight: { index: 7, label: 'Breakout falls back' },
        bars: [
          { o: 732.36, h: 732.38, l: 730.47, c: 731.04 },
          { o: 730.95, h: 734.2, l: 730.55, c: 732.86 },
          { o: 732.86, h: 734.39, l: 732.42, c: 733.85 },
          { o: 734.5, h: 736.73, l: 733.72, c: 736.19 },
          { o: 736.21, h: 736.32, l: 733.71, c: 734.46 },
          { o: 734.67, h: 736.21, l: 733.43, c: 736.21 },
          { o: 736.4, h: 737.62, l: 734.9, c: 736.3 },
          { o: 736.35, h: 737.2, l: 733.5, c: 733.74 },
          { o: 734.32, h: 736.52, l: 734.15, c: 736 },
          { o: 735.58, h: 737.29, l: 734.9, c: 736.68 },
          { o: 736.75, h: 739.56, l: 736.75, c: 737.98 },
          { o: 738.03, h: 739, l: 737.37, c: 738.98 },
          { o: 738.95, h: 738.95, l: 736.62, c: 737.06 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-1902-range-gravity-channel-pressure.md' },
    example: {
      source: 'COHR · May 11 · 5m',
      setup: 'COHR bull channel pullback',
      read: 'A steady bull channel runs, then a two-bar pullback digs deeper than the earlier shallow tests.',
      action: 'Move from continuation assumption to proof-required review.',
      chart: {
        highlight: { index: 12, label: 'Deep pullback' },
        bars: [
          { o: 353.89, h: 357.68, l: 351.14, c: 357.34 },
          { o: 357.09, h: 360.09, l: 355.56, c: 358.79 },
          { o: 358.56, h: 359.08, l: 355.59, c: 356.11 },
          { o: 356.09, h: 357.37, l: 354.18, c: 354.33 },
          { o: 354.25, h: 357.86, l: 354.25, c: 357.86 },
          { o: 357.54, h: 361.76, l: 357.4, c: 361.76 },
          { o: 361.86, h: 365.32, l: 360.6, c: 365.32 },
          { o: 365.43, h: 366.04, l: 361.94, c: 363.81 },
          { o: 363.87, h: 374.78, l: 363.53, c: 374.45 },
          { o: 374.28, h: 380.32, l: 374, c: 379.56 },
          { o: 379.96, h: 383.56, l: 378.67, c: 382.99 },
          { o: 381.82, h: 381.82, l: 378.32, c: 379.39 },
          { o: 379.09, h: 379.09, l: 376, c: 376.63 },
          { o: 376.88, h: 378.98, l: 373.29, c: 378.68 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-2136-order-fill-missed-target.md' },
    example: {
      source: 'META · May 14 · 5m',
      setup: 'META push into target',
      read: 'Price stretches to within a tick of the prior high, then reverses hard before paying the late entries.',
      action: 'Tag the missed-target disappointment before judging the original entry.',
      chart: {
        level: { price: 623.2, label: 'Missed target' },
        highlight: { index: 9, label: 'Tags target, reverses' },
        bars: [
          { o: 617.37, h: 617.74, l: 615.41, c: 617.63 },
          { o: 617.73, h: 617.91, l: 615.54, c: 616.81 },
          { o: 616.87, h: 619.41, l: 616.4, c: 616.82 },
          { o: 616.62, h: 618.82, l: 616.23, c: 617.65 },
          { o: 617.46, h: 622.61, l: 617.46, c: 622.55 },
          { o: 622.61, h: 622.99, l: 620.25, c: 621.58 },
          { o: 621.78, h: 622.6, l: 619.95, c: 620.64 },
          { o: 620.65, h: 621.46, l: 620.07, c: 620.38 },
          { o: 620.17, h: 622.89, l: 619.97, c: 622.87 },
          { o: 622.82, h: 623.14, l: 621.12, c: 621.96 },
          { o: 622.16, h: 622.28, l: 620, c: 620.64 },
          { o: 620.73, h: 621.08, l: 618, c: 618.44 },
          { o: 618.48, h: 620.44, l: 618, c: 620.18 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-2201-gap-continuity.md' },
    example: {
      source: 'F · May 13 · 5m',
      setup: 'F opening continuation',
      read: 'Higher closes stack bar after bar; the one pullback cannot close the gap and momentum resumes.',
      action: 'Treat as momentum evidence that still needs trader-equation review.',
      chart: {
        highlight: { index: 6, label: 'Pullback holds the gap' },
        bars: [
          { o: 12.48, h: 12.54, l: 12.47, c: 12.52 },
          { o: 12.52, h: 12.63, l: 12.52, c: 12.62 },
          { o: 12.62, h: 12.63, l: 12.59, c: 12.6 },
          { o: 12.6, h: 12.75, l: 12.6, c: 12.72 },
          { o: 12.72, h: 12.77, l: 12.71, c: 12.72 },
          { o: 12.71, h: 12.77, l: 12.7, c: 12.7 },
          { o: 12.71, h: 12.76, l: 12.64, c: 12.64 },
          { o: 12.64, h: 12.72, l: 12.61, c: 12.72 },
          { o: 12.73, h: 12.76, l: 12.71, c: 12.74 },
          { o: 12.73, h: 12.84, l: 12.73, c: 12.84 },
          { o: 12.84, h: 12.88, l: 12.82, c: 12.83 },
          { o: 12.83, h: 12.92, l: 12.83, c: 12.92 },
          { o: 12.93, h: 12.99, l: 12.91, c: 12.99 },
          { o: 12.99, h: 13.03, l: 12.97, c: 13 },
        ],
      },
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
    packet: { date: '2026-04-29', file: '2026-04-29-2301-climax-resolution.md' },
    example: {
      source: 'CRCL · May 11 · 5m',
      setup: 'CRCL late third push',
      read: 'The move accelerates into a new high, then the final bar prints the high and closes weak.',
      action: 'Require resolution before buying another late breakout.',
      chart: {
        highlight: { index: 13, label: 'Climax push, weak close' },
        bars: [
          { o: 127.89, h: 128.57, l: 127.1, c: 128.32 },
          { o: 128.5, h: 128.5, l: 126.27, c: 126.56 },
          { o: 126.81, h: 126.89, l: 125.63, c: 126.67 },
          { o: 126.77, h: 127.65, l: 125.31, c: 127.64 },
          { o: 127.71, h: 128.76, l: 127.39, c: 127.67 },
          { o: 128.06, h: 128.3, l: 127.63, c: 128.3 },
          { o: 128.45, h: 130.08, l: 128.42, c: 129.86 },
          { o: 129.96, h: 130.88, l: 129.96, c: 130.75 },
          { o: 130.74, h: 131.09, l: 130.17, c: 130.27 },
          { o: 130.29, h: 131.54, l: 130.25, c: 131.49 },
          { o: 131.54, h: 132.5, l: 131.34, c: 132.42 },
          { o: 132.47, h: 132.8, l: 131.7, c: 132.2 },
          { o: 132.18, h: 133, l: 132.16, c: 132.4 },
          { o: 132.5, h: 133.22, l: 132.4, c: 132.58 },
        ],
      },
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
    packet: { date: '2026-04-30', file: '2026-04-30-0002-breakout-mode-range-middle.md' },
    example: {
      source: 'XLF · May 12 · 5m',
      setup: 'XLF tight compression',
      read: 'Inside a 20-cent range, the first poke above the top fails back before a later breakout finally holds.',
      action: 'Review after the sequence resolves, not on the first poke.',
      chart: {
        level: { price: 51.13, label: 'Range top' },
        highlight: { index: 3, label: 'First breakout fails' },
        bars: [
          { o: 51.06, h: 51.1, l: 51.02, c: 51.02 },
          { o: 51.03, h: 51.06, l: 50.98, c: 50.98 },
          { o: 50.97, h: 51.04, l: 50.97, c: 51.03 },
          { o: 51.03, h: 51.12, l: 51.03, c: 51.12 },
          { o: 51.13, h: 51.13, l: 51.02, c: 51.06 },
          { o: 51.06, h: 51.09, l: 51, c: 51.05 },
          { o: 51.05, h: 51.13, l: 51.05, c: 51.12 },
          { o: 51.11, h: 51.12, l: 51.07, c: 51.1 },
          { o: 51.1, h: 51.1, l: 51.02, c: 51.02 },
          { o: 51.02, h: 51.16, l: 51.02, c: 51.13 },
          { o: 51.13, h: 51.16, l: 51.11, c: 51.16 },
          { o: 51.15, h: 51.17, l: 51.13, c: 51.14 },
          { o: 51.14, h: 51.15, l: 51.1, c: 51.13 },
          { o: 51.14, h: 51.18, l: 51.13, c: 51.18 },
        ],
      },
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
    packet: { date: '2026-05-01', file: '2026-05-01-2149-fractal-timeframe-authority.md' },
    example: {
      source: 'TSM · May 14 · 5m',
      setup: 'TSM trend-from-open',
      read: 'A one-bar dip looks like a reversal up close, but it is only a pullback inside the higher-timeframe bull trend.',
      action: 'Downgrade countertrend expectation unless higher-timeframe damage appears.',
      chart: {
        highlight: { index: 5, label: 'Lower-TF dip only' },
        bars: [
          { o: 402.88, h: 405.2, l: 402.17, c: 404.64 },
          { o: 404.75, h: 408.32, l: 404.5, c: 408.32 },
          { o: 408.36, h: 409.53, l: 407.41, c: 407.97 },
          { o: 408.06, h: 412.4, l: 407.85, c: 412.32 },
          { o: 412.25, h: 413.5, l: 410.68, c: 412.32 },
          { o: 412.35, h: 414.26, l: 410.81, c: 411.06 },
          { o: 411.12, h: 414.06, l: 411.12, c: 413.88 },
          { o: 414, h: 414.5, l: 412.63, c: 413.54 },
          { o: 413.36, h: 417.48, l: 413.17, c: 416.65 },
          { o: 416.84, h: 417.77, l: 416, c: 417.32 },
          { o: 417.32, h: 419.64, l: 417.13, c: 417.49 },
          { o: 417.63, h: 418.42, l: 416.87, c: 417.38 },
          { o: 417.45, h: 419.17, l: 417, c: 419.17 },
          { o: 419.16, h: 421.9, l: 418.96, c: 421.37 },
        ],
      },
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
    packet: { date: '2026-05-16', file: '2026-05-16-1301-reversal-proof-state.md' },
    example: {
      source: 'AMZN · May 14 · 5m',
      setup: 'AMZN double bottom',
      read: 'A sharp drop bottoms, then a second low tests the same price — a double bottom with no strong second reversal yet.',
      action: 'Classify as a minor-reversal candidate for replay, not a live signal.',
      chart: {
        level: { price: 267.25, label: 'Double-bottom low' },
        highlight: { index: 8, label: 'Second low' },
        bars: [
          { o: 268.28, h: 268.74, l: 268.01, c: 268.71 },
          { o: 268.6, h: 268.98, l: 268.5, c: 268.62 },
          { o: 268.61, h: 268.63, l: 267.57, c: 267.72 },
          { o: 267.74, h: 267.84, l: 267.25, c: 267.26 },
          { o: 267.24, h: 267.8, l: 267.15, c: 267.75 },
          { o: 267.71, h: 267.75, l: 267.36, c: 267.38 },
          { o: 267.42, h: 267.62, l: 267.22, c: 267.39 },
          { o: 267.36, h: 267.77, l: 267.33, c: 267.58 },
          { o: 267.55, h: 267.62, l: 267.25, c: 267.35 },
          { o: 267.35, h: 267.7, l: 267.03, c: 267.65 },
          { o: 267.61, h: 267.92, l: 267.57, c: 267.71 },
          { o: 267.7, h: 267.85, l: 267.39, c: 267.73 },
          { o: 267.78, h: 267.91, l: 267.61, c: 267.68 },
          { o: 267.68, h: 268.06, l: 267.6, c: 267.67 },
        ],
      },
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
    packet: { date: '2026-05-16', file: '2026-05-16-1402-stop-pressure-breakeven.md' },
    example: {
      source: 'MSFT · May 15 · 5m',
      setup: 'MSFT breakout pullback',
      read: 'After the thrust higher, the pullback grinds back to the breakout price and sits on breakout-trader breakevens.',
      action: 'Downgrade the accepted breakout and tag trapped-trader risk.',
      chart: {
        level: { price: 424, label: 'Breakout / breakeven' },
        highlight: { index: 10, label: 'Breakeven test' },
        bars: [
          { o: 416.39, h: 419, l: 416.28, c: 418.13 },
          { o: 418.13, h: 419.05, l: 418, c: 418.47 },
          { o: 418.61, h: 420.81, l: 418.61, c: 420.6 },
          { o: 420.59, h: 422.82, l: 420.36, c: 421.73 },
          { o: 421.73, h: 424, l: 421.6, c: 423.98 },
          { o: 423.99, h: 424.12, l: 421.8, c: 422.16 },
          { o: 422.18, h: 425.75, l: 422, c: 425.68 },
          { o: 425.73, h: 426.25, l: 424.33, c: 424.45 },
          { o: 424.5, h: 424.66, l: 423.55, c: 424.59 },
          { o: 424.5, h: 424.88, l: 424.02, c: 424.36 },
          { o: 424.43, h: 425.04, l: 422.76, c: 423.18 },
          { o: 423.24, h: 424.12, l: 423.09, c: 424.07 },
          { o: 424.18, h: 424.73, l: 423.79, c: 424.02 },
          { o: 424.04, h: 424.41, l: 423.22, c: 423.38 },
        ],
      },
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatPacketDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`
}

export default function StateLayersPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-wider text-teal">Brooks factory state stack</p>
            <h1 className="mt-1 text-2xl font-semibold text-text">State Layers</h1>
            <p className="mt-2 text-sm leading-relaxed text-text/75">
              Each layer turns a Brooks research finding into a read-only review field. Every card pairs the
              layer with a real 5-minute session from this week and links the Codex review packet that
              defined it — so scanner cards, replay notes, dashboards, and journals can explain why a setup is
              allowed, blocked, downgraded, or still unresolved.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-sub">
            <div>Research only</div>
            <div>No live-rule authority</div>
          </div>
        </div>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="State layers" value={stateLayers.length.toString()} detail="in current review stack" />
          <Metric label="Newest layers" value="2 this week" detail="reversal proof · stop pressure" />
          <Metric label="Example data" value="May 11–15" detail="real 5-minute sessions this week" />
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
  const packetIsNew = layer.packet.date >= '2026-05-11'
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
          <div className="font-mono text-[10px] uppercase tracking-wider text-sub">{layer.example.source}</div>
        </div>
        <StateLayerChart chart={layer.example.chart} />
        <p className="mt-2 text-xs leading-relaxed text-text/70">{layer.example.read}</p>
        <p className="mt-2 text-xs leading-relaxed text-teal">{layer.example.action}</p>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs leading-relaxed text-text/60">{layer.caution}</p>
        <a
          href={`${PACKET_BASE}${layer.packet.file}`}
          className="mt-2 inline-flex items-center gap-2 text-[11px] text-sub hover:text-teal"
        >
          <span>Codex packet · {formatPacketDate(layer.packet.date)}</span>
          {packetIsNew ? (
            <span className="rounded border border-teal/30 bg-teal/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-teal">
              new this week
            </span>
          ) : null}
        </a>
      </div>
    </article>
  )
}
