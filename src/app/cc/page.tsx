import type { Metadata } from 'next'
import { CleanWeeklyBreakouts } from '@/components/breakouts/CleanWeeklyBreakouts'
import { getCleanWeeklyBreakouts } from '@/lib/weekly-breakouts'

export const metadata: Metadata = {
  title: 'gap up + ft setups | AI Edge',
}

export default async function CcPage() {
  const payload = await getCleanWeeklyBreakouts()
  return <CleanWeeklyBreakouts payload={payload} mode="cc" />
}
