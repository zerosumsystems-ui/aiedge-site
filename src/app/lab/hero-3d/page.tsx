import type { Metadata } from "next"
import { Hero3DLab } from "@/components/lab/Hero3DLab"

export const metadata: Metadata = {
  title: "Hero 3D Lab — AI Edge",
  robots: { index: false, follow: false },
}

export default function Hero3DLabPage() {
  return <Hero3DLab />
}
