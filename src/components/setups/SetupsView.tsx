"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  HeroSetupTape,
  type FeaturedSetup,
} from "@/components/landing/HeroSetupTape"
import { fetchLiveSetup } from "@/components/setups/liveCandidateAdapter"

interface LiveParams {
  ticker: string
  fireTs: number
  pattern: string
  direction: "long" | "short"
}

/**
 * Client wrapper for /setups. If URL params point at a live candidate
 * (ticker / t / pattern / direction), mounts <LiveTape> which fetches
 * and renders the one-card animation. Otherwise falls through to the
 * hand-crafted hero reel.
 *
 * LiveTape is keyed on the composite of params so a navigation between
 * two candidates remounts the subtree — state is reset by React rather
 * than by setState inside an effect (which Next 16's react-hooks rule
 * forbids).
 */
export function SetupsView() {
  const params = useSearchParams()
  const ticker = params.get("ticker")
  const fireTsRaw = params.get("t")
  const pattern = params.get("pattern")
  const directionRaw = params.get("direction")
  const direction: "long" | "short" | null =
    directionRaw === "long" || directionRaw === "short" ? directionRaw : null

  const live: LiveParams | null =
    ticker && fireTsRaw && pattern && direction
      ? { ticker, fireTs: Number(fireTsRaw), pattern, direction }
      : null

  if (!live) return <HeroSetupTape />

  return (
    <LiveTape
      key={`${live.ticker}-${live.fireTs}-${live.pattern}-${live.direction}`}
      live={live}
    />
  )
}

function LiveTape({ live }: { live: LiveParams }) {
  const [setup, setSetup] = useState<FeaturedSetup | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchLiveSetup(live)
      .then((s) => {
        if (cancelled) return
        if (!s) {
          setError(
            `Couldn't load the setup for ${live.ticker}. The candidate may not be backfilled yet — try Deep dive instead.`,
          )
        } else {
          setSetup(s)
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [live])

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center text-sm text-sub">
        <p className="text-red mb-3">{error}</p>
        <Link
          href={`/symbol/${encodeURIComponent(live.ticker)}?t=${live.fireTs}&pattern=${live.pattern}&direction=${live.direction}`}
          className="text-teal hover:underline"
        >
          Deep dive on {live.ticker} →
        </Link>
      </div>
    )
  }

  if (!setup) {
    return (
      <div className="flex h-[calc(100dvh-var(--nav-h))] items-center justify-center text-xs text-sub">
        Loading {live.ticker} {live.pattern.toUpperCase()} setup…
      </div>
    )
  }

  return <HeroSetupTape setups={[setup]} />
}
