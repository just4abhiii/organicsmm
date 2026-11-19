import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { copyPaymentText } from '@/lib/binance-clipboard.mjs';
import { Loader2, Copy, Check, ShieldCheck } from 'lucide-react';

type Config = { usdt_rate: number; pay_id: string; min_inr: number };

type BinanceDeposit = {
  id: string;
  amount_inr: number;
  expected_usdt: number;
  binance_txn_id: string;
  status: 'pending_review' | 'verified' | 'approved' | 'credited' | 'rejected';
  admin_note: string | null;
  created_at: string;
};

const QUICK_INR = [100, 500, 1000, 2000];

export default function BinancePayAddFunds() {
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [inr, setInr] = useState('500');
  const [txnId, setTxnId] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'pay' | 'usdt' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const [deps, setDeps] = useState<BinanceDeposit[]>([]);

  const load = async () => {
    const { data, error } = await supabase.functions.invoke('binance-pay-verify', { body: { action: 'config' } });
    const res = data as (Config & { error?: string }) | null;
    if (error || res?.error) {
      setCfgError(res?.error || error?.message || 'Binance Pay unavailable');
    } else if (res) {
      setCfg(res);
      setCfgError(null);
    }
    const { data: my } = await supabase.functions.invoke('binance-pay-verify', { body: { action: 'my' } });
    const myRes = my as { deposits?: BinanceDeposit[] } | null;
    if (myRes?.deposits) setDeps(myRes.deposits);
  };

  useEffect(() => {
    load().catch(() => setCfgError('Binance Pay unavailable'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amount = Number(inr || 0);
  const rate = cfg?.usdt_rate ?? 90;
  const minInr = cfg?.min_inr ?? 10;
  const usdt = amount > 0 && rate > 0 ? amount / rate : 0;

  const copyValue = async (kind: 'pay' | 'usdt') => {
    if (!cfg) return;
    try {
      await copyPaymentText(kind === 'pay' ? cfg.pay_id : usdt.toFixed(4));
      if (copyTimer.current) clearTimeout(copyTimer.current);
      setCopied(kind);
      toast.success(kind === 'pay' ? 'Binance Pay ID copied' : 'USDT amount copied');
      copyTimer.current = setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
      toast.error('Copy unavailable. Select and copy the value manually.');
    }
  };

  const submit = async () => {
    const amountNum = Math.round(Number(inr) * 100) / 100;
    if (!Number.isFinite(amountNum) || amountNum < minInr) return toast.error(`Minimum ₹${minInr}`);
    const id = txnId.trim();
    if (!/^[A-Za-z0-9_\-]{6,64}$/.test(id)) return toast.error('Enter a valid Order ID / Transaction ID');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('binance-pay-verify', {
        body: { action: 'submit', amount_inr: amountNum, binance_txn_id: id },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = data as any;
      if (res?.error) throw new Error(res.error);
      if (error) throw new Error(error.message);
      if (res?.status === 'credited') {
        toast.success(res.already ? 'This payment is already credited.' : 'Payment verified — wallet credited! 🎉');
        setTxnId('');
        qc.invalidateQueries({ queryKey: ['wallet'] });
        qc.invalidateQueries({ queryKey: ['transactions'] });
      } else {
        toast.info('No matching payment found yet — your request has been sent for admin review. It will be credited once verified.');
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="binance-funds" aria-labelledby="binance-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 id="binance-heading" className="text-xl font-bold">Binance Pay</h2>
          <p className="binance-secondary text-sm mt-1">USDT · Pay ID transfer</p>
        </div>
        <span className="binance-verified inline-flex items-center gap-1.5 text-xs font-bold"><ShieldCheck aria-hidden="true" className="h-4 w-4"/>Auto-credit</span>
      </div>
      {cfgError ? <p role="alert" className="text-destructive">{cfgError}</p> : !cfg ? (
        <div role="status" aria-label="Loading Binance Pay" className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin"/></div>
      ) : (
        <div>
          <label htmlFor="binance-inr" className="binance-label">Amount (INR)</label>
          <div className="relative mt-2"><span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 font-bold">₹</span><input id="binance-inr" type="number" min={minInr} step="1" value={inr} onChange={e => setInr(e.target.value)} className="binance-input pl-9"/></div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            {QUICK_INR.map(v => <Button key={v} type="button" variant="outline" className="binance-quick" aria-pressed={inr === String(v)} onClick={() => setInr(String(v))}>₹{v >= 1000 ? `${v/1000}k` : v}</Button>)}
          </div>
          <div className="binance-transfer mt-4">
            <div className="binance-copy-row">
              <div className="min-w-0"><p className="binance-label">Send USDT</p><p className="binance-value">{usdt.toFixed(4)} <span className="text-base">USDT</span></p><p className="binance-secondary text-xs mt-1">1 USDT ≈ ₹{rate}</p></div>
              <Button type="button" variant="outline" className="binance-copy" aria-label="Copy USDT amount" disabled={!Number.isFinite(usdt) || usdt <= 0} onClick={() => copyValue('usdt')}>{copied === 'usdt' ? <Check aria-hidden="true" className="h-4 w-4"/> : <Copy aria-hidden="true" className="h-4 w-4"/>}{copied === 'usdt' ? 'Copied' : 'Copy'}</Button>
            </div>
            <div className="binance-copy-row binance-pay-row">
              <div className="min-w-0"><p className="binance-label">Binance Pay ID</p><p className="binance-value">{cfg.pay_id}</p></div>
              <Button type="button" variant="outline" className="binance-copy" aria-label="Copy Binance Pay ID" onClick={() => copyValue('pay')}>{copied === 'pay' ? <Check aria-hidden="true" className="h-4 w-4"/> : <Copy aria-hidden="true" className="h-4 w-4"/>}{copied === 'pay' ? 'Copied' : 'Copy'}</Button>
            </div>
          </div>
          <label htmlFor="binance-txn" className="binance-label block mt-5">Order ID / Transaction ID</label>
          <input id="binance-txn" type="text" value={txnId} onChange={e => setTxnId(e.target.value)} placeholder="Paste your payment ID" className="binance-input mt-2"/>
          <Button type="button" onClick={submit} disabled={loading || !inr || !txnId.trim()} className="binance-submit w-full mt-4">{loading ? <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin"/>Verifying…</> : <><ShieldCheck aria-hidden="true" className="h-4 w-4"/>Verify & Credit</>}</Button>
          <p className="binance-secondary text-xs text-center mt-3 leading-relaxed">Min ₹{minInr} · Credit after verification · Unmatched payments go to admin review</p>
          {deps.length > 0 && <div className="mt-5"><h3 className="binance-label mb-2">Recent Binance Requests</h3><div className="space-y-2">{deps.map(d => <div key={d.id} className="binance-request flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="text-sm font-bold">₹{Number(d.amount_inr).toLocaleString('en-IN')} · {Number(d.expected_usdt)} USDT</p><p className="binance-secondary text-xs break-all">{d.binance_txn_id}</p></div><span className="text-xs font-semibold">{d.status === 'credited' ? 'Credited' : d.status === 'rejected' ? 'Rejected' : 'In review'}</span></div>)}</div></div>}
        </div>
      )}
    </section>
  );
}
