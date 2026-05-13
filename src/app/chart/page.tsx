import type { Metadata } from "next"
import { ChartClient } from "./ChartClient"

export const metadata: Metadata = {
  title: "Chart | AI Edge",
  description: "Live Databento chart terminal",
}

export default function ChartPage() {
  return <ChartClient />
}
