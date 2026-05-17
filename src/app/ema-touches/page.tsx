import type { Metadata } from 'next'
import { EmaTouchesView } from '@/components/ema-touches/EmaTouchesView'

export const metadata: Metadata = {
  title: 'EMA Touches - AI Edge',
  description: 'Study gallery of first EMA-touch pullback trades in the AI Edge study-card format.',
}

export default function EmaTouchesPage() {
  return <EmaTouchesView />
}
