'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Bar, ChartAnnotations, ChartData, ChartTimeframe } from '@/lib/types'
import { LightweightChart } from './LightweightChart'

export type TfChoice = 'auto' | ChartTimeframe

export const TF_PILLS: { key: TfChoice; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: '5min', label: '5m' },
  { key: '15min', label: '15m' },
  { key: '1h', label: '1h' },
  { key: 'daily', label: 'D' },
  { key: 'weekly', label: 'W' },
]

interface Props {
  ticker: string
  from: string
  to: string
  annotations?: ChartAnnotations
  height?: number
  label?: string
}

export function BarsChart({ ticker, from, to, annotations, height = 340, label }: Props) {
  const [tfChoice, setTfChoice] = useState<TfChoice>('auto')
  const [bars, setBars] = useState<Bar[] | null>(null)
  const [effectiveTf, setEffectiveTf] = useState<ChartTimeframe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settledTf, setSettledTf] = useState<TfChoice | null>(null)

  useEffect(() => {
    const qs = new URLSearchParams({ ticker, from, to, tf: tfChoice })
    let cancelled = false

    fetch(`/api/bars?${qs}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? `bars fetch ${r.status}`)
        return data as {
          bars: Bar[]
          timeframe: ChartTimeframe
          effectiveTimeframe: ChartTimeframe
        }
      })
      .then((data) => {
        if (cancelled) return
        setBars(data.bars)
        setEffectiveTf(data.effectiveTimeframe)
        setError(null)
        setSettledTf(tfChoice)
      })
      .catch((err) => {
        if (cancelled) return
        setBars(null)
        setEffectiveTf(null)
        setError(err instanceof Error ? err.message : String(err))
        setSettledTf(tfChoice)
      })

    return () => {
      cancelled = true
    }
  }, [ticker, from, to, tfChoice])

  const chart = useMemo<ChartData | null>(() => {
    if (!bars || !effectiveTf) return null
    return { bars, timeframe: effectiveTf, annotations }
  }, [bars, effectiveTf, annotations])

  const isLoading = settledTf !== tfChoice

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-sub">
          {label ?? `Chart · ${ticker}`}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-bg rounded p-0.5 border border-border">
            {TF_PILLS.map((pill) => {
              const active =
                tfChoice === pill.key ||
                (tfChoice === 'auto' && pill.key !== 'auto' && effectiveTf === pill.key)
              return (
                <button
                  key={pill.key}
                  onClick={() => setTfChoice(pill.key)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors tabular-nums ${
                    active ? 'bg-teal/20 text-teal' : 'text-sub hover:text-text'
                  }`}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>
          <span className="text-[10px] text-gray">Databento</span>
        </div>
      </div>

      {isLoading ? (
        <div className="skeleton w-full rounded" style={{ height }} />
      ) : error || !chart || chart.bars.length === 0 ? (
        <div className="text-center py-8 text-sub text-xs bg-surface border border-border rounded-lg">
          {error ? `Chart unavailable: ${error}` : 'No bars returned for this range.'}
        </div>
      ) : (
        <LightweightChart chart={chart} height={height} />
      )}
    </div>
  )
}
