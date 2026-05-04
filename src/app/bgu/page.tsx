import type { Metadata } from 'next'
import { BuyableGapUpStudy } from '@/components/bgu/BuyableGapUpStudy'
import { getBuyableGapUp } from '@/lib/buyable-gap-up'

export const metadata: Metadata = {
  title: 'Buyable Gap-Up Study | AI Edge',
  description:
    'Backtest of stocks gapping up ≥15% intraday on highest-in-60d volume, breaking 50-day high. ' +
    'Entry next-day close, stop at gap-day low, 40-day time exit.',
}

export default async function BuyableGapUpPage() {
  const payload = await getBuyableGapUp()
  return <BuyableGapUpStudy payload={payload} />
}
