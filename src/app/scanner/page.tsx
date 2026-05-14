import { Suspense } from "react"
import { ScannerCandidatesList } from "@/components/scanner/ScannerCandidatesList"

export const metadata = {
  title: "Scanner | AI Edge",
  description: "Live + recent setup candidates surfaced by the AIedge scanner.",
}

export default function ScannerPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100dvh-var(--nav-h))] items-center justify-center text-xs text-sub">
        Loading scanner…
      </div>
    }>
      <ScannerCandidatesList />
    </Suspense>
  )
}
