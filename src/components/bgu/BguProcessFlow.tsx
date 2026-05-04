interface Props {
  className?: string
}

interface Step {
  num: string
  title: string
  detail: string
  accent: 'teal' | 'yellow' | 'red' | 'sub'
}

const STEPS: Step[] = [
  {
    num: '1',
    title: 'Detect setup',
    detail: 'Stock closes +15% intraday, top 20% of day, vol = highest in 60d, > 200 SMA, new 50d high',
    accent: 'teal',
  },
  {
    num: '2',
    title: 'Wait for next session',
    detail: "Don't chase intraday. Wait for the next day's regular session to open.",
    accent: 'sub',
  },
  {
    num: '3',
    title: 'Enter at next-day close',
    detail: 'Buy at the close of the bar AFTER the signal day. (3:55-4:00 PM ET market order.)',
    accent: 'teal',
  },
  {
    num: '4',
    title: 'Place stop at gap-day low',
    detail: 'Hard stop at the LOW of the signal/gap day. If price breaches it, exit.',
    accent: 'red',
  },
  {
    num: '5',
    title: 'Hold up to 40 trading days',
    detail: 'No profit target — let the trend run. Time-stop at day 40.',
    accent: 'yellow',
  },
  {
    num: '6',
    title: 'Exit',
    detail: 'Either: stop fills at gap-day low, OR time exit at day 40 close.',
    accent: 'sub',
  },
]

const ACCENTS: Record<Step['accent'], { ring: string; num: string; arrow: string }> = {
  teal: { ring: 'ring-teal/30', num: 'text-teal bg-teal/10 ring-teal/40', arrow: 'text-teal/60' },
  yellow: { ring: 'ring-yellow/30', num: 'text-yellow bg-yellow/10 ring-yellow/40', arrow: 'text-yellow/60' },
  red: { ring: 'ring-red/30', num: 'text-red bg-red/10 ring-red/40', arrow: 'text-red/60' },
  sub: { ring: 'ring-border', num: 'text-sub bg-bg ring-border', arrow: 'text-sub/40' },
}

export function BguProcessFlow({ className = '' }: Props) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-4 ${className}`}>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-sub mb-4">
        Trade Process
      </h2>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STEPS.map((step, i) => {
          const a = ACCENTS[step.accent]
          return (
            <li
              key={step.num}
              className={`relative rounded-lg border border-border bg-bg p-3 ring-1 ${a.ring}`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`shrink-0 w-6 h-6 rounded-full ring-1 flex items-center justify-center text-xs font-bold tabular-nums ${a.num}`}
                >
                  {step.num}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold tracking-tight">{step.title}</div>
                  <p className="mt-1 text-[11px] leading-snug text-sub">{step.detail}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`hidden xl:block absolute -right-2 top-1/2 -translate-y-1/2 text-lg ${a.arrow}`}
                >
                  ›
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
