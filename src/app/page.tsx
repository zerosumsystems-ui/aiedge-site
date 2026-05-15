import { HomePage } from "@/components/landing/HomePage"

export const metadata = {
  title: "AI Edge — live trading-setup scanner",
  description:
    "Live TFO detection, ML-rated setup probabilities, and chart-level analysis. Scanner runs continuously during RTH; every fire is scored and surfaced the moment the bar closes.",
}

export default function Home() {
  return <HomePage />
}
