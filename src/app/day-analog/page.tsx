import type { Metadata } from 'next'
import { DayAnalogView } from '@/components/day-analog/DayAnalogView'

export const metadata: Metadata = {
  title: 'Day Analog — AI Edge',
  description:
    'For a chosen trading session, the five past sessions whose 78-bar intraday shape is closest by RMSE on %-from-open.',
}

export default function DayAnalogPage() {
  return <DayAnalogView />
}
