"use client"

/**
 * Hero Effect Lab — a NON-SHIPPED preview gallery.
 *
 * Each tile is a self-contained, looping mini-demo of a candidate
 * visual treatment for the home-page hero. Pure CSS / SVG / DOM — no
 * WebGL, no new deps — so every tile is cheap and reviewable.
 *
 * This route exists so Will can eyeball the motion of each option
 * before we commit one to the real HeroSetupTape. Delete this file +
 * src/app/lab when an effect is chosen.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"

/* ---------- shared mini-chart data ---------------------------------- */

interface OHLC {
  o: number
  h: number
  l: number
  c: number
}

// A 12-bar intraday story: drift down to a low (the pivot / LOD at
// index 3), three bull confirming bars, fire at index 6, continuation.
const CANDLES: OHLC[] = [
  { o: 100.0, h: 100.4, l: 99.2, c: 99.4 },
  { o: 99.4, h: 99.6, l: 98.4, c: 98.6 },
  { o: 98.6, h: 98.8, l: 97.7, c: 97.9 },
  { o: 97.9, h: 98.1, l: 97.4, c: 97.6 },
  { o: 97.6, h: 98.5, l: 97.5, c: 98.4 },
  { o: 98.4, h: 99.3, l: 98.3, c: 99.1 },
  { o: 99.1, h: 100.2, l: 99.0, c: 100.0 },
  { o: 100.0, h: 100.7, l: 99.7, c: 100.5 },
  { o: 100.5, h: 101.3, l: 100.3, c: 101.1 },
  { o: 101.1, h: 101.4, l: 100.6, c: 100.9 },
  { o: 100.9, h: 101.8, l: 100.8, c: 101.7 },
  { o: 101.7, h: 102.4, l: 101.5, c: 102.3 },
]
const PIVOT_IDX = 3
const FIRE_IDX = 6

function priceScale(candles: OHLC[]) {
  const hi = Math.max(...candles.map((c) => c.h))
  const lo = Math.min(...candles.map((c) => c.l))
  const pad = (hi - lo) * 0.12
  const top = hi + pad
  const span = hi - lo + pad * 2
  // y as a 0..100 percentage from the top of the plot area.
  return (price: number) => ((top - price) / span) * 100
}

/* ---------- a looping tick hook ------------------------------------- */

function useCycle(ms: number): number {
  const [k, setK] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setK((x) => x + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return k
}

/* ---------- presentational mini candlestick set --------------------- */

function MiniCandles({
  candles = CANDLES,
  wrapStyle,
  bodyStyle,
}: {
  candles?: OHLC[]
  /** Per-index style on the candle wrapper (animation hooks). */
  wrapStyle?: (i: number) => CSSProperties | undefined
  /** Per-index style on the candle body (highlight hooks). */
  bodyStyle?: (i: number) => CSSProperties | undefined
}) {
  const y = priceScale(candles)
  const n = candles.length
  const colW = 100 / n

  return (
    <>
      {candles.map((c, i) => {
        const up = c.c >= c.o
        const color = up ? "var(--teal)" : "var(--red)"
        const bodyTop = y(Math.max(c.o, c.c))
        const bodyBot = y(Math.min(c.o, c.c))
        const wickTop = y(c.h)
        const wickBot = y(c.l)
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{ left: `${i * colW}%`, width: `${colW}%`, ...wrapStyle?.(i) }}
          >
            <div
              className="absolute"
              style={{
                left: "calc(50% - 1px)",
                width: 2,
                top: `${wickTop}%`,
                height: `${wickBot - wickTop}%`,
                background: color,
                opacity: 0.85,
              }}
            />
            <div
              className="absolute rounded-[1px]"
              style={{
                left: "19%",
                width: "62%",
                top: `${bodyTop}%`,
                height: `${Math.max(bodyBot - bodyTop, 1.6)}%`,
                background: color,
                ...bodyStyle?.(i),
              }}
            />
          </div>
        )
      })}
    </>
  )
}

/* ===================================================================
 * 1. CANDLE EXTRUDE REVEAL
 * Each candle drops in from +Z space with a blur trail.
 * ================================================================= */

function ExtrudeReveal() {
  const cycle = useCycle(4600)
  return (
    <div
      className="absolute inset-0"
      style={{ perspective: "780px", perspectiveOrigin: "50% 38%" }}
    >
      <div
        key={cycle}
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
      >
        <MiniCandles
          wrapStyle={(i) => ({
            animation: `lab-drop 0.52s ${i * 0.085}s both cubic-bezier(0.18,0.72,0.2,1)`,
          })}
        />
      </div>
    </div>
  )
}

/* ===================================================================
 * 2. DATA-STREAM PARTICLES INTO THE CHART
 * Particles fly in from the right and "land" on the last candle,
 * which pulses on each arrival.
 * ================================================================= */

const STREAM_PARTICLES = Array.from({ length: 11 }, (_, i) => ({
  dy: (Math.sin(i * 2.7) * 0.5 + 0.5) * 120 - 60,
  delay: (i / 11) * 2.4,
  size: 2 + (i % 3),
}))

function StreamParticles() {
  const y = priceScale(CANDLES)
  const n = CANDLES.length
  const last = CANDLES[n - 1]
  const lastCx = ((n - 1 + 0.5) / n) * 100
  const lastCy = y(last.c)

  return (
    <div className="absolute inset-0">
      <MiniCandles
        bodyStyle={(i) =>
          i === n - 1
            ? { animation: "lab-pulse 2.4s ease-in-out infinite" }
            : undefined
        }
      />
      <div
        className="absolute"
        style={{ left: `${lastCx}%`, top: `${lastCy}%`, width: 0, height: 0 }}
      >
        {STREAM_PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={
              {
                left: 0,
                top: 0,
                width: p.size,
                height: p.size,
                background: "var(--teal)",
                boxShadow: "0 0 7px var(--teal)",
                "--lab-dy": `${p.dy}px`,
                animation: `lab-stream 2.4s ${p.delay}s linear infinite`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}

/* ===================================================================
 * 3. GLOWING PRICE-TRACE DRAW-ON
 * An SVG close-line draws itself on, led by a glowing comet head.
 * ================================================================= */

function PriceTrace() {
  const W = 320
  const H = 188
  const y = priceScale(CANDLES)
  const n = CANDLES.length
  const pts = CANDLES.map((c, i) => {
    const x = ((i + 0.5) / n) * W
    const yy = (y(c.c) / 100) * H
    return `${x.toFixed(1)} ${yy.toFixed(1)}`
  })
  const d = `M ${pts[0]} L ${pts.slice(1).join(" L ")}`

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="lab-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="lab-trace" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--teal)" stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* faint full track */}
      <path
        d={d}
        fill="none"
        stroke="var(--teal)"
        strokeOpacity="0.14"
        strokeWidth="1.5"
      />
      {/* draw-on trace */}
      <path
        d={d}
        fill="none"
        stroke="url(#lab-trace)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
      >
        <animate
          attributeName="stroke-dashoffset"
          values="1;0;0"
          keyTimes="0;0.75;1"
          dur="3.4s"
          repeatCount="indefinite"
        />
      </path>
      {/* comet head */}
      <circle r="3.6" fill="var(--teal)" filter="url(#lab-glow)">
        <animateMotion
          path={d}
          keyPoints="0;1;1"
          keyTimes="0;0.75;1"
          calcMode="linear"
          dur="3.4s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0;1;1;0;0"
          keyTimes="0;0.06;0.72;0.8;1"
          dur="3.4s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}

/* ===================================================================
 * 4. PATTERN-DETECTION SCAN SWEEP
 * A scan line sweeps the chart; corner brackets snap around the
 * pivot and fire bars as it passes.
 * ================================================================= */

function CornerBox({
  idx,
  label,
  color,
  animName,
}: {
  idx: number
  label: string
  color: string
  animName: string
}) {
  const n = CANDLES.length
  const colW = 100 / n
  const cx = (idx + 0.5) * colW
  const corner = (pos: CSSProperties): CSSProperties => ({
    position: "absolute",
    width: 9,
    height: 9,
    borderColor: color,
    ...pos,
  })
  return (
    <div
      className="absolute top-0 bottom-0"
      style={{
        left: `${cx - colW * 0.62}%`,
        width: `${colW * 1.24}%`,
        animation: `${animName} 4s linear infinite`,
      }}
    >
      <div style={corner({ top: 6, left: 0, borderTop: "2px solid", borderLeft: "2px solid" })} />
      <div style={corner({ top: 6, right: 0, borderTop: "2px solid", borderRight: "2px solid" })} />
      <div style={corner({ bottom: 6, left: 0, borderBottom: "2px solid", borderLeft: "2px solid" })} />
      <div style={corner({ bottom: 6, right: 0, borderBottom: "2px solid", borderRight: "2px solid" })} />
      <span
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[8px] font-semibold tracking-[0.12em]"
        style={{ top: -4, color }}
      >
        {label}
      </span>
    </div>
  )
}

function ScanDetect() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <MiniCandles />
      <CornerBox
        idx={PIVOT_IDX}
        label="LOD"
        color="#43c5e8"
        animName="lab-box-pivot"
      />
      <CornerBox
        idx={FIRE_IDX}
        label="FIRE"
        color="var(--yellow)"
        animName="lab-box-fire"
      />
      {/* scan bar */}
      <div
        className="absolute inset-y-0"
        style={{
          width: 2,
          left: "-4%",
          background:
            "linear-gradient(180deg, transparent, var(--teal), transparent)",
          boxShadow: "0 0 14px 3px rgba(0,200,150,0.6)",
          animation: "lab-scan 4s linear infinite",
        }}
      />
    </div>
  )
}

/* ===================================================================
 * 5. DEPTH-OF-FIELD PARALLAX
 * Three Z-layers shift against the cursor; background + foreground
 * carry a slight blur for real depth-of-field.
 * ================================================================= */

function Parallax() {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState({ x: 0, y: 0 })

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden"
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        setP({
          x: ((e.clientX - r.left) / r.width - 0.5) * 2,
          y: ((e.clientY - r.top) / r.height - 0.5) * 2,
        })
      }}
      onMouseLeave={() => setP({ x: 0, y: 0 })}
    >
      {/* far layer — grid, blurred */}
      <div
        className="absolute inset-[-12%]"
        style={{
          transform: `translate(${p.x * -7}px, ${p.y * -7}px)`,
          transition: "transform 0.18s ease-out",
          filter: "blur(1.4px)",
          backgroundImage:
            "linear-gradient(rgba(0,200,150,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,150,0.16) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
          opacity: 0.5,
        }}
      />
      {/* mid layer — the chart */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${p.x * 15}px, ${p.y * 15}px)`,
          transition: "transform 0.18s ease-out",
        }}
      >
        <MiniCandles />
      </div>
      {/* near layer — floating score badge */}
      <div
        className="absolute right-3 top-3"
        style={{
          transform: `translate(${p.x * 30}px, ${p.y * 30}px)`,
          transition: "transform 0.16s ease-out",
        }}
      >
        <div className="glass-chip rounded-md px-2 py-1 font-mono text-[10px] leading-tight">
          <div className="text-sub">MODEL</div>
          <div className="text-[15px] font-semibold text-teal">71%</div>
        </div>
      </div>
      <div className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.14em] text-sub">
        move cursor ↗
      </div>
    </div>
  )
}

/* ===================================================================
 * 6. NUMBER-SCRAMBLE TICKER
 * Prices + model score settle digit-by-digit on each cycle.
 * ================================================================= */

function Scramble({
  value,
  trigger,
  className,
}: {
  value: string
  trigger: number
  className?: string
}) {
  const [disp, setDisp] = useState(value)
  useEffect(() => {
    let frame = 0
    const total = 24
    const id = window.setInterval(() => {
      frame++
      const locked = Math.floor((frame / total) * value.length)
      let s = ""
      for (let i = 0; i < value.length; i++) {
        const ch = value[i]
        if (i < locked || !/[0-9]/.test(ch)) s += ch
        else s += "0123456789"[Math.floor(Math.random() * 10)]
      }
      setDisp(s)
      if (frame >= total) {
        setDisp(value)
        window.clearInterval(id)
      }
    }, 42)
    return () => window.clearInterval(id)
  }, [value, trigger])
  return <span className={className}>{disp}</span>
}

function NumberScramble() {
  const cycle = useCycle(3600)
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-6 font-mono">
      <div>
        <div className="text-[9px] uppercase tracking-[0.16em] text-sub">
          AAPL · last
        </div>
        <Scramble
          value="102.34"
          trigger={cycle}
          className="text-[34px] font-semibold leading-none text-text tabular-nums"
        />
      </div>
      <div className="flex gap-6">
        <div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-sub">
            model
          </div>
          <Scramble
            value="71"
            trigger={cycle}
            className="text-[20px] font-semibold text-teal tabular-nums"
          />
          <span className="text-[20px] font-semibold text-teal">%</span>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-sub">
            net
          </div>
          <span className="text-[20px] font-semibold text-teal">+</span>
          <Scramble
            value="1.84"
            trigger={cycle}
            className="text-[20px] font-semibold text-teal tabular-nums"
          />
          <span className="text-[20px] font-semibold text-teal">%</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- gallery shell ------------------------------------------- */

interface Effect {
  n: number
  title: string
  desc: string
  effort: "low" | "medium"
  pairs: string
  render: ReactNode
}

const EFFECTS: Effect[] = [
  {
    n: 1,
    title: "Candle extrude reveal",
    desc: "Each bar drops in from depth with a blur trail — the chart prints itself into 3D space.",
    effort: "medium",
    pairs: "core treatment",
    render: <ExtrudeReveal />,
  },
  {
    n: 2,
    title: "Data-stream particles",
    desc: "Particles fly in from the live edge and land on the newest candle as it prints.",
    effort: "medium",
    pairs: "ties the backdrop to the chart",
    render: <StreamParticles />,
  },
  {
    n: 3,
    title: "Glowing price-trace",
    desc: "A close-line draws itself on, led by a glowing comet head with a fading tail.",
    effort: "low",
    pairs: "good on its own or under candles",
    render: <PriceTrace />,
  },
  {
    n: 4,
    title: "Pattern-detection scan",
    desc: "A scan line sweeps the tape; corner brackets snap around the pivot + fire bars.",
    effort: "medium",
    pairs: "shows the model 'seeing' the setup",
    render: <ScanDetect />,
  },
  {
    n: 5,
    title: "Depth-of-field parallax",
    desc: "Grid, chart and badge on separate Z-layers shift against the cursor.",
    effort: "low",
    pairs: "layers under any other effect",
    render: <Parallax />,
  },
  {
    n: 6,
    title: "Number-scramble ticker",
    desc: "Prices and model score settle digit-by-digit — Westworld type-assembly vocabulary.",
    effort: "low",
    pairs: "accents the reveal panel",
    render: <NumberScramble />,
  },
]

export function HeroEffectLab() {
  return (
    <div className="min-h-[100dvh] bg-bg px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-teal">
          internal · not shipped
        </div>
        <h1 className="text-[26px] font-extrabold tracking-tight text-text sm:text-[32px]">
          Hero Effect Lab
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-sub">
          Live previews of candidate visual treatments for the home-page
          hero. Each tile loops on its own. Pure CSS / SVG — no WebGL, no
          new dependencies. Pick what you like and I&apos;ll wire it into
          the real chart reel.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EFFECTS.map((fx) => (
            <div
              key={fx.n}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="relative h-[210px] w-full overflow-hidden bg-[#0d0d0d]">
                {fx.render}
              </div>
              <div className="border-t border-border p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[14px] font-semibold text-text">
                    {fx.n}. {fx.title}
                  </h2>
                  <span
                    className={[
                      "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]",
                      fx.effort === "low"
                        ? "bg-teal/15 text-teal"
                        : "bg-yellow/15 text-yellow",
                    ].join(" ")}
                  >
                    {fx.effort} effort
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-sub">
                  {fx.desc}
                </p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-gray">
                  {fx.pairs}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes lab-drop {
          from {
            transform: translateZ(280px) translateY(-26px);
            opacity: 0;
            filter: blur(3px);
          }
          to {
            transform: translateZ(0) translateY(0);
            opacity: 1;
            filter: blur(0);
          }
        }
        @keyframes lab-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(0, 200, 150, 0);
          }
          50% {
            box-shadow: 0 0 12px 3px rgba(0, 200, 150, 0.7);
          }
        }
        @keyframes lab-stream {
          0% {
            transform: translate(120px, var(--lab-dy));
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          85% {
            opacity: 1;
          }
          100% {
            transform: translate(0, 0);
            opacity: 0;
          }
        }
        @keyframes lab-scan {
          0% {
            left: -4%;
          }
          100% {
            left: 104%;
          }
        }
        /* pivot bar sits at ~29% across — brackets flash as scan passes */
        @keyframes lab-box-pivot {
          0%,
          26% {
            opacity: 0;
            transform: scale(0.82);
          }
          31% {
            opacity: 1;
            transform: scale(1);
          }
          90% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1);
          }
        }
        /* fire bar sits at ~54% across */
        @keyframes lab-box-fire {
          0%,
          51% {
            opacity: 0;
            transform: scale(0.82);
          }
          56% {
            opacity: 1;
            transform: scale(1);
          }
          90% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .lab-static * {
            animation-duration: 0.001s !important;
          }
        }
      `}</style>
    </div>
  )
}
