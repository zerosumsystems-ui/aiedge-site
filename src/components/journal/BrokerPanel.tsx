'use client'

import { useCallback, useEffect, useState } from 'react'

interface SnapAccount {
  id: string
  name: string
  number: string
  institution: string
}

interface BrokerStatus {
  connected: boolean
  status: 'registered' | 'connected' | 'disconnected' | 'error'
  accounts: SnapAccount[]
  lastSync: string | null
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  const days = Math.floor(diff / 86_400_000)
  return `${days}d ago`
}

export function BrokerPanel() {
  const [status, setStatus] = useState<BrokerStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/snaptrade/status')
      if (!r.ok) throw new Error(`status ${r.status}`)
      const data = (await r.json()) as BrokerStatus
      setStatus(data)
    } catch (err) {
      console.error('[broker] refresh failed:', err)
      setStatus({ connected: false, status: 'error', accounts: [], lastSync: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const onConnect = async () => {
    setConnecting(true)
    setMessage(null)
    try {
      const r = await fetch('/api/snaptrade/register', { method: 'POST' })
      const data = await r.json()
      if (!r.ok || !data.redirectURI) {
        throw new Error(data.error ?? 'register failed')
      }
      window.location.href = data.redirectURI as string
    } catch (err) {
      setConnecting(false)
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Failed to start broker connection',
      })
    }
  }

  const onSyncNow = async () => {
    setSyncing(true)
    setMessage(null)
    try {
      const r = await fetch('/api/snaptrade/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'sync failed')
      setMessage({
        kind: 'ok',
        text: `Synced ${data.fillsFetched ?? 0} fills from ${data.accounts ?? 0} account(s)`,
      })
      await refreshStatus()
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Sync failed',
      })
    } finally {
      setSyncing(false)
    }
  }

  const onDisconnect = async () => {
    if (!confirm('Disconnect broker? This removes SnapTrade access. Existing fills stay in the snapshot.')) {
      return
    }
    setMessage(null)
    try {
      const r = await fetch('/api/snaptrade/disconnect', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? 'disconnect failed')
      setMessage({ kind: 'ok', text: 'Broker disconnected' })
      await refreshStatus()
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Disconnect failed',
      })
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-20 w-full" />
      </div>
    )
  }

  const connected = status?.connected ?? false

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  connected ? 'bg-teal' : 'bg-gray'
                }`}
              />
              <h2 className="text-sm font-semibold text-text">
                {connected ? 'Broker connected' : 'No broker connected'}
              </h2>
            </div>
            <p className="text-xs text-sub">
              Fills from connected Fidelity accounts are auto-logged via SnapTrade.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray uppercase tracking-wide">Last sync</div>
            <div className="text-xs text-sub">{relativeTime(status?.lastSync ?? null)}</div>
          </div>
        </div>

        {connected && status && status.accounts.length > 0 && (
          <div className="border-t border-border pt-3 mb-3">
            <div className="text-[10px] text-gray uppercase tracking-wide mb-1.5">Accounts</div>
            <ul className="space-y-1">
              {status.accounts.map((a) => (
                <li key={a.id} className="text-xs text-sub flex items-baseline gap-2">
                  <span className="font-medium text-text">{a.institution}</span>
                  {a.number && <span className="text-gray">· {a.number}</span>}
                  {a.name && <span className="text-gray">· {a.name}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!connected && (
            <button
              onClick={onConnect}
              disabled={connecting}
              className="px-3 py-1.5 rounded bg-teal text-[#001d20] text-xs font-semibold hover:bg-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {connecting ? 'Starting…' : 'Connect Fidelity'}
            </button>
          )}
          {connected && (
            <>
              <button
                onClick={onSyncNow}
                disabled={syncing}
                className="px-3 py-1.5 rounded bg-teal text-[#001d20] text-xs font-semibold hover:bg-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                onClick={onConnect}
                disabled={connecting}
                className="px-3 py-1.5 rounded border border-border text-xs font-medium text-sub hover:text-text hover:bg-surface disabled:opacity-50 transition-colors"
              >
                {connecting ? 'Opening…' : 'Add another broker'}
              </button>
              <button
                onClick={onDisconnect}
                className="px-3 py-1.5 rounded border border-border text-xs font-medium text-sub hover:text-red-400 hover:border-red-400/50 transition-colors"
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {message && (
          <div
            className={`mt-3 text-xs ${
              message.kind === 'ok' ? 'text-teal' : 'text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      <div className="text-[11px] text-gray leading-relaxed">
        Nightly cron (Phase 2) will auto-refresh fills at ~18:15 ET Mon–Fri. Use <em>Sync now</em> for
        same-day verification. Pre-trade Brooks pairing + per-setup R-multiple stats ship in Phase 2.
      </div>
    </div>
  )
}
