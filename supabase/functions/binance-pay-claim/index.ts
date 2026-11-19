// Cross-site Binance payment claim endpoint (Ahsan, 2026-11-11).
// Other platforms sharing the same Binance Pay ID call this BEFORE crediting
// a wallet: the first claim wins, every later claim (any site) is rejected.
// Protected by a shared token (X-Claim-Token header) — never expose it.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-claim-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function tokenOk(got: string, expected: string): boolean {
  if (!got || !expected || got.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

const ID_RE = /^[A-Za-z0-9_\-]{1,128}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const expected = Deno.env.get('BINANCE_CLAIM_TOKEN') || ''
    const got = req.headers.get('x-claim-token') || ''
    if (!tokenOk(got, expected)) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const txnId = body?.transaction_id != null ? String(body.transaction_id).trim() : null
    const orderId = body?.order_id != null ? String(body.order_id).trim() : null
    const site = String(body?.site || 'unknown').slice(0, 40)
    const reference = body?.reference != null ? String(body.reference).slice(0, 120) : null
    if (!txnId && !orderId) return json({ error: 'transaction_id or order_id required' }, 400)
    if ((txnId && !ID_RE.test(txnId)) || (orderId && !ID_RE.test(orderId))) {
      return json({ error: 'Invalid ID format' }, 400)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const or = [
      txnId ? `matched_transaction_id.eq.${txnId}` : null,
      orderId ? `matched_order_id.eq.${orderId}` : null,
    ].filter(Boolean).join(',')

    const { data: existing } = await admin.from('binance_payment_claims')
      .select('site, created_at').or(or).limit(1)
    if (existing && existing.length > 0) {
      return json({ claimed: false, site: existing[0].site, claimed_at: existing[0].created_at })
    }

    const { error } = await admin.from('binance_payment_claims').insert({
      matched_transaction_id: txnId,
      matched_order_id: orderId,
      site,
      reference,
    })
    if (error) {
      // Race: another site claimed between check and insert — it wins.
      if (String(error.code) === '23505') {
        const { data: again } = await admin.from('binance_payment_claims')
          .select('site, created_at').or(or).limit(1)
        return json({ claimed: false, site: again?.[0]?.site ?? 'unknown', claimed_at: again?.[0]?.created_at ?? null })
      }
      console.error('binance-pay-claim insert failed', error.message)
      return json({ error: 'Claim failed' }, 500)
    }
    return json({ claimed: true })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status,
  })
}
