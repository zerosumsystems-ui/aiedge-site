import { HomePage } from "@/components/landing/HomePage"

export const metadata = {
  title: "Home — AI Edge",
  description:
    "Live TFO detection, ML-rated setup probabilities, and chart-level analysis. Scanner runs continuously during RTH; every fire is scored and surfaced the moment the bar closes.",
}

export default function HomeRoute() {
  return <HomePage />
}
