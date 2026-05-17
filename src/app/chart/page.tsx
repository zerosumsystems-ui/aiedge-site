import type { Metadata } from "next"
import { Suspense } from "react"
import { ChartClient } from "./ChartClient"

export const metadata: Metadata = {
  title: "Chart | AI Edge",
  description: "Live Databento chart terminal",
}

export default function ChartPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-bg text-xs font-semibold uppercase tracking-[0.2em] text-sub">
          Loading chart
        </div>
      }
    >
      <ChartClient />
    </Suspense>
  )
}
