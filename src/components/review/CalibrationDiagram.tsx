'use client'

import { useEffect, useState } from 'react'

interface CalibrationBin {
  bin_mid: number
  bin_lo: number
  bin_hi: number
  predicted: number
  empirical: number
  count: number
}

interface CalibrationPayload {
  generated: string
  n_train: number
  n_test: number
  n_test_scored: number
  train_date_range: [string, string]
  test_date_range: [string, string]
  coverage: {
    exact: number
    regime_plus_align: number
    regime: number
    setup: number
    default: number
  }
  bins: CalibrationBin[]
  brier: number
  ece: number
  overall_hit_rate: number
}

// SVG layout (viewBox units — scales responsively)
const W = 360
const H = 240
const PAD_L = 36
const PAD_R = 12
const PAD_T = 28
const PAD_B = 30

function binColor(predicted: number, empirical: number): string {
  const gap = Math.abs(predicted - empirical)
  if (gap < 0.05) return 'fill-teal/70'
  if (gap < 0.15) return 'fill-yellow/70'
  return 'fill-orange/70'
}

function formatPct(v: number): string {
  return `${Math.round(v * 100)}%`
}

export function CalibrationDiagram() {
  const [data, setData] = useState<CalibrationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/calibration.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<CalibrationPayload>
      })
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'unknown error'),
      )
  }, [])

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text mb-2">Calibration</h2>
        <p className="text-red text-xs">Failed to load: {error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-surface border border-border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-text mb-3">Calibration</h2>
        <div className="skeleton h-48" />
      </div>
    )
  }

  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const x = (p: number) => PAD_L + p * plotW
  const y = (p: number) => PAD_T + (1 - p) * plotH

  // Bar width = fraction of one 0.1-wide bin, with a small gap
  const binSpan = 0.1
  const barFrac = 0.78
  const barHalf = (binSpan * barFrac) / 2

  // Warning if ECE or Brier is rough
  const eceAlert = data.ece > 0.15
  const brierAlert = data.brier > 0.25

  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-text">
          Calibration
          <span className="text-sub font-normal ml-2 text-[11px]">
            priors predicted vs empirical, time-split 60/40
          </span>
        </h2>
      </div>

      {/* Metrics strip */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sub uppercase tracking-wide">Brier</span>
          <span
            className={`font-semibold tabular-nums ${
              brierAlert ? 'text-red' : 'text-text'
            }`}
          >
            {data.brier.toFixed(3)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sub uppercase tracking-wide">ECE</span>
          <span
            className={`font-semibold tabular-nums ${
              eceAlert ? 'text-red' : 'text-text'
            }`}
          >
            {data.ece.toFixed(3)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sub uppercase tracking-wide">Hit rate</span>
          <span className="font-semibold tabular-nums text-text">
            {formatPct(data.overall_hit_rate)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sub uppercase tracking-wide">Test n</span>
          <span className="font-semibold tabular-nums text-text">
            {data.n_test_scored.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Diagram */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Calibration reliability diagram"
      >
        {/* Gridlines + y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(g)}
              y2={y(g)}
              className="stroke-border/40"
              strokeWidth={0.5}
            />
            <text
              x={PAD_L - 6}
              y={y(g) + 3}
              textAnchor="end"
              className="fill-sub text-[9px] tabular-nums"
            >
              {formatPct(g)}
            </text>
          </g>
        ))}

        {/* x-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <text
            key={g}
            x={x(g)}
            y={H - PAD_B + 12}
            textAnchor="middle"
            className="fill-sub text-[9px] tabular-nums"
          >
            {formatPct(g)}
          </text>
        ))}

        {/* Axis labels */}
        <text
          x={PAD_L + plotW / 2}
          y={H - 4}
          textAnchor="middle"
          className="fill-sub text-[10px] uppercase tracking-wide"
        >
          Predicted p(win)
        </text>
        <text
          x={8}
          y={PAD_T + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 8, ${PAD_T + plotH / 2})`}
          className="fill-sub text-[10px] uppercase tracking-wide"
        >
          Empirical
        </text>

        {/* Diagonal reference */}
        <line
          x1={x(0)}
          y1={y(0)}
          x2={x(1)}
          y2={y(1)}
          className="stroke-sub/50"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Bars */}
        {data.bins.map((b) => {
          const bx = x(b.bin_mid - barHalf)
          const bw = x(b.bin_mid + barHalf) - bx
          const by = y(b.empirical)
          const bh = y(0) - by
          return (
            <g key={b.bin_mid}>
              <rect
                x={bx}
                y={by}
                width={bw}
                height={bh}
                className={binColor(b.predicted, b.empirical)}
              >
                <title>
                  {`bin ${formatPct(b.bin_lo)}–${formatPct(b.bin_hi)}
predicted: ${formatPct(b.predicted)}
empirical: ${formatPct(b.empirical)}
n = ${b.count}`}
                </title>
              </rect>
              {/* Sample count above bar */}
              <text
                x={x(b.bin_mid)}
                y={by - 3}
                textAnchor="middle"
                className="fill-sub text-[8px] tabular-nums"
              >
                {b.count}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mt-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-teal" />
          <span className="text-sub">gap &lt; 5pp</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow" />
          <span className="text-sub">5–15pp</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange" />
          <span className="text-sub">&gt; 15pp</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-sub">
            train {data.train_date_range[0]}…{data.train_date_range[1]} ·
            test {data.test_date_range[0]}…{data.test_date_range[1]}
          </span>
        </div>
      </div>
    </div>
  )
}
