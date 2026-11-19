import { createClient } from 'npm:@supabase/supabase-js@2'
import { notifyDepositDirect } from '../_shared/deposit-notification.ts'
import {
  binanceConfigured,
  fetchRecentPayTransactions,
  findMatchingTransaction,
  isValidTxnId,
} from '../_shared/binance-pay.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const MAX_INR = 540000
// Anti brute-force limits: nobody can keep guessing transaction IDs.
const MAX_SUBMITS_PER_HOUR = 10
const MAX_OPEN_REQUESTS = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (!binanceConfigured()) return json({ error: 'Binance Pay is not configured yet' }, 503)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userErr || !userData.user?.id) return json({ error: 'Unauthorized' }, 401)
    const userId = userData.user.id

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')

    if (action === 'config') {
      const { data: s } = await admin.from('binance_settings')
        .select('usdt_rate, pay_id, min_inr').eq('id', 1).maybeSingle()
      return json({
        usdt_rate: Number(s?.usdt_rate ?? 90),
        pay_id: s?.pay_id ?? '1183631033',
        min_inr: Number(s?.min_inr ?? 10),
      })
    }

    if (action === 'my') {
      const { data } = await admin.from('binance_deposits')
        .select('id, amount_inr, expected_usdt, binance_txn_id, status, admin_note, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
      return json({ deposits: data ?? [] })
    }

    if (action !== 'submit') return json({ error: 'Unknown action' }, 400)

    // ---- submit: amount + Binance Order/Transaction ID ----
    const amountInr = Math.round(Number(body?.amount_inr) * 100) / 100
    const txnId = String(body?.binance_txn_id || '').trim()
    const { data: settings } = await admin.from('binance_settings').select('*').eq('id', 1).maybeSingle()
    const minInr = Number(settings?.min_inr ?? 10)
    const rate = Number(settings?.usdt_rate ?? 90)
    if (!Number.isFinite(amountInr) || amountInr < minInr) return json({ error: `Minimum ₹${minInr}` }, 400)
    if (amountInr > MAX_INR) return json({ error: 'Maximum ₹5,40,000 per transaction' }, 400)
    if (!isValidTxnId(txnId)) return json({ error: 'Enter a valid Order ID / Transaction ID (6-64 letters or numbers)' }, 400)

    // Anti brute-force: limited submit attempts per user per hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await admin.from('binance_deposits')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo)
    if ((recentCount ?? 0) >= MAX_SUBMITS_PER_HOUR) {
      return json({ error: 'Too many attempts. Please try again after some time.' }, 429)
    }

    // One transaction ID can only ever be used once (unique index enforces it).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dep: any = null
    let isNew = false
    const { data: existing } = await admin.from('binance_deposits')
      .select('*').eq('binance_txn_id', txnId).maybeSingle()
    if (existing) {
      if (existing.user_id !== userId) {
        return json({ error: 'This Transaction ID has already been used' }, 409)
      }
      if (existing.credited) return json({ status: 'credited', already: true })
      if (existing.status === 'rejected') {
        return json({ error: 'This request was rejected. Please contact support.' }, 400)
      }
      dep = existing // same user re-checking a pending request → verify again below
    } else {
      // Anti brute-force: limited open review requests per user.
      const { count: openCount } = await admin.from('binance_deposits')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending_review')
      if ((openCount ?? 0) >= MAX_OPEN_REQUESTS) {
        return json({ error: 'You already have requests under review. Please wait for them to be processed.' }, 429)
      }
      const expectedUsdt = Math.round((amountInr / rate) * 10000) / 10000
      const { data: inserted, error: insErr } = await admin.from('binance_deposits')
        .insert({
          user_id: userId,
          amount_inr: amountInr,
          expected_usdt: expectedUsdt,
          usdt_rate: rate,
          binance_txn_id: txnId,
        })
        .select('*').single()
      if (insErr) {
        if (String(insErr.code) === '23505') {
          return json({ error: 'This Transaction ID has already been used' }, 409)
        }
        throw insErr
      }
      dep = inserted
      isNew = true
    }

    // Verify with Binance — server-side signed call only.
    const remote = await fetchRecentPayTransactions(100)
    if (!remote.ok) {
      await admin.from('binance_deposits').update({
        verify_detail: { reason: 'binance_api_error', message: remote.error },
        updated_at: new Date().toISOString(),
      }).eq('id', dep.id)
      if (isNew) await notifyReview(admin, userId, dep, txnId, 'Binance API error — manual check needed')
      return json({ status: 'pending_review', reason: 'binance_api_error' })
    }

    const { match, wrongCurrency, lowAmount } = findMatchingTransaction(
      remote.txns, txnId, Number(dep.expected_usdt),
    )
    if (!match) {
      const reason = lowAmount != null ? 'low_amount' : wrongCurrency ? 'wrong_currency' : 'not_found'
      await admin.from('binance_deposits').update({
        verify_detail: { reason, low_amount: lowAmount },
        updated_at: new Date().toISOString(),
      }).eq('id', dep.id)
      if (isNew) await notifyReview(admin, userId, dep, txnId, `No automatic match (${reason})`)
      return json({ status: 'pending_review', reason })
    }

    // The same real Binance payment can only credit once — a payment carries
    // several IDs (orderId, transactionId) and each variant could be submitted.
    const matchedTxnId = match.transactionId != null ? String(match.transactionId) : null
    const matchedOrderId = match.orderId != null ? String(match.orderId) : null
    const safeId = (v: string | null) => (v && /^[A-Za-z0-9_\-]{1,128}$/.test(v) ? v : null)
    const dupeOr = [
      safeId(matchedTxnId) ? `matched_transaction_id.eq.${safeId(matchedTxnId)}` : null,
      safeId(matchedOrderId) ? `matched_order_id.eq.${safeId(matchedOrderId)}` : null,
    ].filter(Boolean).join(',')
    if (dupeOr) {
      const [{ data: dupe }, { data: crossDupe }] = await Promise.all([
        admin.from('binance_deposits').select('id')
          .eq('credited', true).neq('id', dep.id).or(dupeOr).limit(1),
        // Cross-site: another platform may have already claimed this payment.
        admin.from('binance_payment_claims').select('site').or(dupeOr).limit(1),
      ])
      if ((dupe && dupe.length > 0) || (crossDupe && crossDupe.length > 0)) {
        await admin.from('binance_deposits').update({
          status: 'rejected',
          admin_note: 'Duplicate: this Binance payment was already credited',
          verify_detail: { reason: 'binance_payment_already_used' },
          updated_at: new Date().toISOString(),
        }).eq('id', dep.id)
        return json({ error: 'This Binance payment has already been used for a top-up' }, 409)
      }
    }

    await admin.from('binance_deposits').update({
      status: 'verified',
      matched_amount_usdt: Number(match.amount),
      matched_transaction_id: matchedTxnId,
      matched_order_id: matchedOrderId,
      verify_detail: {
        matched: true,
        currency: match.currency,
        amount: Number(match.amount),
        transactionTime: match.transactionTime ?? null,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', dep.id)

    // Atomic credit — advisory lock + credited flag inside the RPC, no double credit.
    const { data: res, error: creditError } = await admin.rpc('credit_wallet_binance', { p_deposit_id: dep.id })
    if (creditError) {
      console.error('Binance wallet credit failed', { deposit: dep.id, error: creditError.message })
      return json({ error: 'Payment verified but wallet credit failed', detail: creditError.message }, 500)
    }
    const credited = !!(res as { credited?: boolean })?.credited
    const duplicate = !!(res as { duplicate?: boolean })?.duplicate
    if (credited && !duplicate) {
      await notifyDepositDirect(admin, {
        userId,
        orderId: txnId,
        method: 'Binance Pay',
        status: 'success',
        amountInr: dep.amount_inr,
        amountUsd: dep.expected_usdt,
        title: '⚡ <b>Binance Pay Auto-approved</b>',
      }).catch((e) => console.error('Binance Telegram notification failed', e))
    }
    return json({ status: 'credited', credited, already: duplicate })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})

// Admin Telegram alert when a new request could not be auto-verified.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyReview(admin: any, userId: string, dep: any, txnId: string, reasonText: string) {
  try {
    await notifyDepositDirect(admin, {
      userId,
      orderId: txnId,
      method: 'Binance Pay',
      status: 'failed',
      amountInr: dep.amount_inr,
      amountUsd: dep.expected_usdt,
      reason: reasonText,
      title: '🟡 <b>Binance Pay — Review Needed</b>',
      adminOnly: true,
    })
  } catch (e) {
    console.error('Binance review notification failed', e)
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status,
  })
}
