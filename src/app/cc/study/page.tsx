import type { Metadata } from 'next'
import { GapUpFtStudy } from '@/components/breakouts/GapUpFtStudy'
import { getGapUpFtLargeSample } from '@/lib/gap-up-ft-study'
import { getGapUpFtSetupCharts } from '@/lib/gap-up-ft-setup-charts'

export const metadata: Metadata = {
  title: 'gap up + ft setup charts | AI Edge',
}

export default async function CcStudyPage() {
  const [setups, largeSample] = await Promise.all([
    getGapUpFtSetupCharts(),
    getGapUpFtLargeSample(),
  ])
  return <GapUpFtStudy setups={setups} largeSample={largeSample} />
}
