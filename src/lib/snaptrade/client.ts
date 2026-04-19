import { Snaptrade } from 'snaptrade-typescript-sdk'

/**
 * Shared SnapTrade SDK client for server-side route handlers.
 *
 * Reads SNAPTRADE_CLIENT_ID + SNAPTRADE_CONSUMER_KEY from Vercel env (or
 * local .env.local). Throws at construction time if either is missing so
 * misconfiguration surfaces on the first /api/snaptrade/* request rather
 * than silently returning 500s from SDK calls.
 */
export function createSnaptradeClient(): Snaptrade {
  const clientId = process.env.SNAPTRADE_CLIENT_ID
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY

  if (!clientId || !consumerKey) {
    throw new Error(
      'SnapTrade client requires SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY'
    )
  }

  return new Snaptrade({ clientId, consumerKey })
}
