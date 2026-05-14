import { Suspense } from "react"
import { HeroSetupTape } from "@/components/landing/HeroSetupTape"
import { SetupsView } from "@/components/setups/SetupsView"

export const metadata = {
  title: "Setups | AI Edge",
  description: "Animated walk-through of recent scanner setups.",
}

/**
 * /setups dispatches on URL params:
 *
 *   /setups                      → hand-crafted hero reel (default)
 *   /setups?ticker=...&t=...&pattern=...&direction=...
 *                                → fetch that live candidate + its
 *                                  session bars, render a one-card tape
 *                                  animation around the fire bar, with
 *                                  a deep-dive link to the chart view.
 *
 * The client wrapper handles the URL-param read + fetch since
 * useSearchParams requires client.
 */
export default function SetupsPage() {
  return (
    <Suspense fallback={<HeroSetupTape />}>
      <SetupsView />
    </Suspense>
  )
}
