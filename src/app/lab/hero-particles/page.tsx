import type { Metadata } from "next"
import { HeroParticleLab } from "@/components/lab/HeroParticleLab"

export const metadata: Metadata = {
  title: "Hero Particle Lab — AI Edge",
  robots: { index: false, follow: false },
}

export default function HeroParticleLabPage() {
  return <HeroParticleLab />
}
