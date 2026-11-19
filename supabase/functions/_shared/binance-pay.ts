// Binance Pay verification core — server-side only (edge functions).
// The API key is read-only (Enable Reading). Keys live in the functions env,
// never in the browser bundle.

const API_BASE = 'https://api.binance.com'

export function binanceConfigured(): boolean {
  return !!(Deno.env.get('BINANCE_API_KEY') || '').trim() &&
    !!(Deno.env.get('BINANCE_API_SECRET') || '').trim()
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export type BinancePayTxn = {
  transactionId?: string
  orderId?: string
  merchantTradeNo?: string
  amount?: string | number
  currency?: string
  orderType?: string
  transactionTime?: number
}

// Signed read of recent Pay transactions (incoming + outgoing).
export async function fetchRecentPayTransactions(
  limit = 100,
): Promise<{ ok: boolean; txns: BinancePayTxn[]; error?: string }> {
  const apiKey = (Deno.env.get('BINANCE_API_KEY') || '').trim()
  const secret = (Deno.env.get('BINANCE_API_SECRET') || '').trim()
  if (!apiKey || !secret) return { ok: false, txns: [], error: 'Binance API is not configured' }
  const qs = `limit=${limit}&timestamp=${Date.now()}&recvWindow=10000`
  const signature = await hmacSha256Hex(secret, qs)
  let res: Response
  try {
    res = await fetch(`${API_BASE}/sapi/v1/pay/transactions?${qs}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    })
  } catch (e) {
    return { ok: false, txns: [], error: `Binance API unreachable: ${String((e as Error).message || e)}` }
  }
  const text = await res.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {}
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!res.ok || String(data?.code) !== '000000') {
    return { ok: false, txns: [], error: `Binance API error: ${data?.msg || data?.message || `HTTP ${res.status}`}` }
  }
  return { ok: true, txns: Array.isArray(data?.data) ? data.data : [] }
}

export function txnMatchesId(t: BinancePayTxn, id: string): boolean {
  const want = id.trim().toLowerCase()
  return [t.transactionId, t.orderId, t.merchantTradeNo]
    .some((v) => String(v ?? '').trim().toLowerCase() === want)
}

// A payment counts only when: ID matches, currency is USDT, amount is a
// positive incoming payment, and amount >= expected * 0.99.
export function findMatchingTransaction(
  txns: BinancePayTxn[],
  id: string,
  expectedUsdt: number,
): { match: BinancePayTxn | null; wrongCurrency: boolean; lowAmount: number | null } {
  let wrongCurrency = false
  let lowAmount: number | null = null
  for (const t of txns) {
    if (!txnMatchesId(t, id)) continue
    if (String(t.currency || '').toUpperCase() !== 'USDT') { wrongCurrency = true; continue }
    const amt = Number(t.amount)
    if (!Number.isFinite(amt) || amt <= 0) continue // outgoing/refund entries are not payments
    if (amt < expectedUsdt * 0.99) { lowAmount = amt; continue }
    return { match: t, wrongCurrency: false, lowAmount: null }
  }
  return { match: null, wrongCurrency, lowAmount }
}

export function isValidTxnId(id: string): boolean {
  return /^[A-Za-z0-9_\-]{6,64}$/.test(id.trim())
}
