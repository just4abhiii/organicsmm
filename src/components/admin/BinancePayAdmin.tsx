import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw,
    Settings2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type BinanceSettings = { usdt_rate: number; pay_id: string; min_inr: number };

type BinanceDepositRow = {
    id: string;
    user_id: string;
    email: string | null;
    full_name: string | null;
    amount_inr: number;
    expected_usdt: number;
    usdt_rate: number;
    binance_txn_id: string;
    status: 'pending_review' | 'verified' | 'approved' | 'credited' | 'rejected';
    matched_amount_usdt: number | null;
    verify_detail: { reason?: string; low_amount?: number | null } | null;
    admin_note: string | null;
    created_at: string;
};

const REASON_LABEL: Record<string, string> = {
    not_found: 'Binance par nahi mili',
    wrong_currency: 'USDT nahi hai',
    low_amount: 'Amount kam hai',
    binance_api_error: 'Binance API error',
};

export default function BinancePayAdmin() {
    const { session } = useAuth();
    const queryClient = useQueryClient();
    const [rate, setRate] = useState('');
    const [payId, setPayId] = useState('');
    const [minInr, setMinInr] = useState('');

    const call = async (body: Record<string, unknown>) => {
        if (!session?.access_token) throw new Error('Admin session expired. Please login again.');
        const { data, error } = await supabase.functions.invoke('binance-admin-action', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body,
        });
        if (error) throw new Error(error.message || 'Action failed');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((data as any)?.error) throw new Error((data as any).error);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return data as any;
    };

    const { data, isLoading } = useQuery({
        queryKey: ['binance-admin-deposits'],
        queryFn: () => call({ action: 'list' }),
        enabled: !!session?.access_token,
    });

    useEffect(() => {
        const s = data?.settings as BinanceSettings | undefined;
        if (s) {
            setRate(String(s.usdt_rate));
            setPayId(String(s.pay_id));
            setMinInr(String(s.min_inr));
        }
    }, [data?.settings]);

    const actionMutation = useMutation({
        mutationFn: (body: Record<string, unknown>) => call(body),
        onSuccess: (res) => {
            toast({
                title: res?.status === 'credited' ? 'Credited ✅' : res?.status === 'rejected' ? 'Rejected' : 'Done',
                description: res?.reason ? `Reason: ${REASON_LABEL[res.reason] || res.reason}` : undefined,
            });
            queryClient.invalidateQueries({ queryKey: ['binance-admin-deposits'] });
        },
        onError: (error: Error) => {
            toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
        },
    });

    const saveSettings = () => {
        actionMutation.mutate({
            action: 'update_settings',
            usdt_rate: Number(rate),
            pay_id: payId.trim(),
            min_inr: Number(minInr),
        });
    };

    const deposits: BinanceDepositRow[] = data?.deposits ?? [];
    const pending = deposits.filter((d) => d.status === 'pending_review');

    return (
        <div className="space-y-6 mt-8">
            {/* Settings */}
            <Card className="glass-card overflow-hidden">
                <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Settings2 className="h-4 w-4 text-primary" />
                        <h2 className="text-lg font-bold text-foreground">Binance Pay Settings</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">USDT Rate (₹)</label>
                            <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1 h-10 rounded-xl" />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Binance Pay ID</label>
                            <Input value={payId} onChange={(e) => setPayId(e.target.value)} className="mt-1 h-10 rounded-xl" />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Min Amount (₹)</label>
                            <Input type="number" value={minInr} onChange={(e) => setMinInr(e.target.value)} className="mt-1 h-10 rounded-xl" />
                        </div>
                    </div>
                    <Button
                        onClick={saveSettings}
                        disabled={actionMutation.isPending}
                        className="mt-3 h-9 px-4 rounded-xl text-[12px] font-bold"
                    >
                        {actionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Settings'}
                    </Button>
                </CardContent>
            </Card>

            {/* Requests */}
            <Card className="glass-card overflow-hidden">
                <div className="flex items-center justify-between p-5 pb-0">
                    <h2 className="text-lg font-bold text-foreground">
                        Binance Pay Requests
                        {pending.length > 0 && (
                            <Badge className="ml-2 bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] uppercase">
                                {pending.length} pending
                            </Badge>
                        )}
                    </h2>
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-3 text-[11px] font-bold gap-1.5 rounded-lg"
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['binance-admin-deposits'] })}
                    >
                        <RefreshCw className="h-3 w-3" /> Refresh
                    </Button>
                </div>
                <Table className="mt-4">
                    <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                            <TableHead>User</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Txn ID</TableHead>
                            <TableHead>Verify</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : deposits.length > 0 ? (
                            deposits.map((d) => (
                                <TableRow key={d.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell>
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-bold text-sm truncate">{d.full_name || 'Unnamed'}</span>
                                            <span className="text-[10px] text-muted-foreground truncate">{d.email}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-0.5">
                                            <Badge variant="outline" className="w-fit font-black text-primary border-primary/20 bg-primary/5">
                                                ₹{Number(d.amount_inr).toLocaleString('en-IN')}
                                            </Badge>
                                            <span className="text-[10px] text-muted-foreground">{Number(d.expected_usdt)} USDT @ ₹{Number(d.usdt_rate)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded border border-border">
                                            {d.binance_txn_id}
                                        </code>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-[11px] text-muted-foreground">
                                            {d.status === 'credited'
                                                ? `Matched ${d.matched_amount_usdt ?? ''} USDT`
                                                : REASON_LABEL[d.verify_detail?.reason ?? ''] || d.verify_detail?.reason || '—'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                            {format(new Date(d.created_at), 'MMM d, h:mm a')}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {d.status === 'pending_review' ? (
                                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] uppercase tracking-wider">Pending</Badge>
                                        ) : d.status === 'credited' ? (
                                            <Badge className="bg-success/10 text-success border-success/20 text-[10px] uppercase tracking-wider">Credited</Badge>
                                        ) : (
                                            <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] uppercase tracking-wider">Rejected</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {d.status === 'pending_review' && (
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button
                                                    size="sm"
                                                    className="h-8 px-2.5 text-[11px] font-bold gap-1 bg-success/90 hover:bg-success text-white"
                                                    onClick={() => actionMutation.mutate({ action: 'approve', deposit_id: d.id })}
                                                    disabled={actionMutation.isPending}
                                                >
                                                    <CheckCircle2 className="h-3 w-3" /> Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 px-2.5 text-[11px] font-bold gap-1"
                                                    onClick={() => actionMutation.mutate({ action: 'reverify', deposit_id: d.id })}
                                                    disabled={actionMutation.isPending}
                                                    title="Binance par dobara check karo"
                                                >
                                                    <RefreshCw className="h-3 w-3" /> Recheck
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    className="h-8 px-2.5 text-[11px] font-bold gap-1"
                                                    onClick={() => {
                                                        const note = window.prompt('Reject reason (optional):') ?? '';
                                                        actionMutation.mutate({ action: 'reject', deposit_id: d.id, note });
                                                    }}
                                                    disabled={actionMutation.isPending}
                                                >
                                                    <XCircle className="h-3 w-3" /> Reject
                                                </Button>
                                            </div>
                                        )}
                                        {d.status === 'credited' && (
                                            <div className="text-[10px] text-success font-bold flex items-center justify-end gap-1">
                                                <CheckCircle2 className="h-3 w-3" /> Finalized
                                            </div>
                                        )}
                                        {d.status === 'rejected' && (
                                            <div className="text-[10px] text-destructive font-bold flex items-center justify-end gap-1">
                                                <XCircle className="h-3 w-3" /> Cancelled
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                    No Binance Pay requests yet.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
