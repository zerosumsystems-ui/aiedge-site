import type { Metadata } from "next"
import { HeroReelLab } from "@/components/lab/HeroReelLab"

export const metadata: Metadata = {
  title: "Hero Reel Lab — AI Edge",
  robots: { index: false, follow: false },
}

export default function HeroReelLabPage() {
  return <HeroReelLab />
}
