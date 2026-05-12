import type { Metadata } from "next"
import { TradingViewTerminal } from "@/components/charts/TradingViewTerminal"

export const metadata: Metadata = {
  title: "Chart | AI Edge",
  description: "Live Databento chart terminal",
}

export default function ChartPage() {
  return <TradingViewTerminal />
}
