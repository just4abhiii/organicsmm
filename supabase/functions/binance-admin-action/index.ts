import { createClient } from 'npm:@supabase/supabase-js@2'
import { notifyDepositDirect } from '../_shared/deposit-notification.ts'
import {
  binanceConfigured,
  fetchRecentPayTransactions,
  findMatchingTransaction,
} from '../_shared/binance-pay.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const token = auth.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) return json({ error: 'Invalid token' }, 401)

    const { data: adminRole, error: roleError } = await admin
      .from('user_roles')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle()
    if (roleError) return json({ error: 'Unable to verify admin role' }, 500)
    if (!adminRole) return json({ error: 'Forbidden — admins only' }, 403)

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown'
    const ua = req.headers.get('user-agent') || 'unknown'

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '')

    const audit = async (entry: Record<string, unknown>) => {
      await admin.from('admin_audit_log').insert({
        actor_id: user.id,
        actor_email: user.email,
        ip_address: ip,
        user_agent: ua,
        ...entry,
      }).then(({ error }) => { if (error) console.error('audit insert failed', error.message) })
    }

    if (action === 'list') {
      const [{ data: settings }, { data: deps }] = await Promise.all([
        admin.from('binance_settings').select('usdt_rate, pay_id, min_inr, updated_at').eq('id', 1).maybeSingle(),
        admin.from('binance_deposits').select('*').order('created_at', { ascending: false }).limit(100),
      ])
      const userIds = [...new Set((deps ?? []).map((d) => d.user_id))]
      const { data: profiles } = userIds.length
        ? await admin.from('profiles').select('user_id, email, full_name').in('user_id', userIds)
        : { data: [] }
      const pmap = new Map((profiles ?? []).map((p) => [p.user_id, p]))
      return json({
        settings: settings ?? { usdt_rate: 90, pay_id: '1183631033', min_inr: 10 },
        deposits: (deps ?? []).map((d) => ({
          ...d,
          email: pmap.get(d.user_id)?.email ?? null,
          full_name: pmap.get(d.user_id)?.full_name ?? null,
        })),
      })
    }

    if (action === 'update_settings') {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body?.usdt_rate !== undefined) {
        const r = Number(body.usdt_rate)
        if (!Number.isFinite(r) || r <= 0 || r > 100000) return json({ error: 'Invalid usdt_rate' }, 400)
        patch.usdt_rate = r
      }
      if (body?.pay_id !== undefined) {
        const p = String(body.pay_id).trim()
        if (!/^[A-Za-z0-9]{3,64}$/.test(p)) return json({ error: 'Invalid Binance Pay ID' }, 400)
        patch.pay_id = p
      }
      if (body?.min_inr !== undefined) {
        const m = Number(body.min_inr)
        if (!Number.isFinite(m) || m < 1 || m > 100000) return json({ error: 'Invalid min_inr' }, 400)
        patch.min_inr = m
      }
      if (Object.keys(patch).length === 1) return json({ error: 'Nothing to update' }, 400)
      const { error } = await admin.from('binance_settings').update(patch).eq('id', 1)
      if (error) throw error
      await audit({ action: 'binance_settings_update', notes: JSON.stringify(patch) })
      const { data: s } = await admin.from('binance_settings')
        .select('usdt_rate, pay_id, min_inr').eq('id', 1).maybeSingle()
      return json({ success: true, settings: s })
    }

    const depositId = String(body?.deposit_id || '')
    if (!depositId) return json({ error: 'deposit_id required' }, 400)
    const { data: dep } = await admin.from('binance_deposits').select('*').eq('id', depositId).maybeSingle()
    if (!dep) return json({ error: 'Deposit not found' }, 404)
    const { data: profile } = await admin.from('profiles')
      .select('email').eq('user_id', dep.user_id).maybeSingle()

    if (dep.credited) return json({ success: true, status: 'credited', already: true })

    if (action === 'reject') {
      if (dep.status !== 'pending_review') return json({ error: `Already ${dep.status}` }, 400)
      const note = String(body?.note || '').slice(0, 300) || null
      await admin.from('binance_deposits')
        .update({ status: 'rejected', admin_note: note, updated_at: new Date().toISOString() })
        .eq('id', dep.id)
      await audit({
        action: 'binance_reject', target_user_id: dep.user_id, target_email: profile?.email ?? null,
        amount_inr: dep.amount_inr, notes: note, metadata: { deposit_id: dep.id, txn: dep.binance_txn_id },
      })
      await notifyDepositDirect(admin, {
        userId: dep.user_id,
        orderId: dep.binance_txn_id,
        method: 'Binance Pay',
        status: 'failed',
        amountInr: dep.amount_inr,
        amountUsd: dep.expected_usdt,
        reason: note || 'Admin rejected',
        title: '❌ <b>Binance Pay Rejected</b>',
      }).catch((e) => console.error('reject notify failed', e))
      return json({ success: true, status: 'rejected' })
    }

    if (action === 'approve' || action === 'reverify') {
      if (dep.status === 'rejected') return json({ error: 'Rejected request approve nahi ho sakti' }, 400)

      if (action === 'reverify') {
        if (!binanceConfigured()) return json({ error: 'Binance API is not configured' }, 503)
        const remote = await fetchRecentPayTransactions(100)
        if (!remote.ok) return json({ error: remote.error }, 502)
        const { match, wrongCurrency, lowAmount } = findMatchingTransaction(
          remote.txns, dep.binance_txn_id, Number(dep.expected_usdt),
        )
        if (!match) {
          const reason = lowAmount != null ? 'low_amount' : wrongCurrency ? 'wrong_currency' : 'not_found'
          await admin.from('binance_deposits').update({
            verify_detail: { reason, low_amount: lowAmount, rechecked_by: user.email },
            updated_at: new Date().toISOString(),
          }).eq('id', dep.id)
          return json({ success: true, status: 'pending_review', reason })
        }
        // The same real Binance payment can only credit once, whichever ID variant was submitted.
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
              verify_detail: { reason: 'binance_payment_already_used', rechecked_by: user.email },
              updated_at: new Date().toISOString(),
            }).eq('id', dep.id)
            await audit({
              action: 'binance_reverify_duplicate', target_user_id: dep.user_id,
              target_email: profile?.email ?? null, amount_inr: dep.amount_inr,
              metadata: { deposit_id: dep.id, txn: dep.binance_txn_id },
            })
            return json({ error: 'This Binance payment has already been credited to another request' }, 409)
          }
        }
        await admin.from('binance_deposits').update({
          status: 'verified',
          matched_amount_usdt: Number(match.amount),
          matched_transaction_id: matchedTxnId,
          matched_order_id: matchedOrderId,
          verify_detail: { matched: true, currency: match.currency, amount: Number(match.amount), rechecked_by: user.email },
          updated_at: new Date().toISOString(),
        }).eq('id', dep.id)
      } else {
        await admin.from('binance_deposits')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('id', dep.id)
      }

      const { data: res, error: creditError } = await admin.rpc('credit_wallet_binance', { p_deposit_id: dep.id })
      if (creditError) {
        console.error('Binance admin credit failed', { deposit: dep.id, error: creditError.message })
        return json({ error: 'Wallet credit failed', detail: creditError.message }, 500)
      }
      const credited = !!(res as { credited?: boolean })?.credited
      const duplicate = !!(res as { duplicate?: boolean })?.duplicate
      if (credited && !duplicate) {
        await audit({
          action: action === 'approve' ? 'binance_approve_manual' : 'binance_approve_reverify',
          target_user_id: dep.user_id, target_email: profile?.email ?? null,
          amount_inr: dep.amount_inr, amount_usd: (res as { credited_usd?: number })?.credited_usd ?? null,
          metadata: { deposit_id: dep.id, txn: dep.binance_txn_id },
        })
        await notifyDepositDirect(admin, {
          userId: dep.user_id,
          orderId: dep.binance_txn_id,
          method: 'Binance Pay',
          status: 'success',
          amountInr: dep.amount_inr,
          amountUsd: dep.expected_usdt,
          title: action === 'approve'
            ? '✅ <b>Binance Pay Approved (Admin)</b>'
            : '⚡ <b>Binance Pay Auto-approved</b>',
        }).catch((e) => console.error('approve notify failed', e))
      }
      return json({ success: true, status: 'credited', credited, already: duplicate })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('binance-admin-action error', e)
    return json({ error: String((e as Error).message || e) }, 500)
  }
})

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status,
  })
}
