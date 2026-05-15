import type { Metadata } from "next"
import { HeroEffectLab } from "@/components/lab/HeroEffectLab"

export const metadata: Metadata = {
  title: "Hero Effect Lab — AI Edge",
  robots: { index: false, follow: false },
}

export default function HeroEffectsLabPage() {
  return <HeroEffectLab />
}
