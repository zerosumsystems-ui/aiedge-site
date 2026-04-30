import type { DailySnapshot, ScanPayload, ScanResult } from '@/lib/types'
import { buildRegularSessionChart } from '@/lib/opening-features'

export function normalizeScanResultSession(result: ScanResult): ScanResult {
  if (!result.chart?.bars?.length) return result
  const chart = buildRegularSessionChart(result.chart)
  return chart ? { ...result, chart } : result
}

export function normalizeScanPayloadSession(payload: ScanPayload): ScanPayload {
  return {
    ...payload,
    results: payload.results.map(normalizeScanResultSession),
  }
}

export function normalizeDailySnapshotSession(snapshot: DailySnapshot): DailySnapshot {
  return {
    ...snapshot,
    payload: normalizeScanPayloadSession(snapshot.payload),
  }
}
