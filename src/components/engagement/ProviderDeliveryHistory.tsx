
type ProviderRun = {
 id?: string;run_number?: number;engagement_type?: string;status?: string;quantity_to_send?: number;
 provider_order_id?: string|null;provider_account_name?: string|null;provider_start_count?: number|null;
 provider_remains?: number|null;provider_status?: string|null;started_at?: string|null;completed_at?: string|null;
 last_status_check?: string|null;provider_requested_quantity?: number|null;provider_history_order_id?: string|null;
 engagement_order_item_id?: string|null;order_id?: string|null;provider_response?: unknown;
 provider_public_start_count?: number|null;provider_public_end_count?: number|null;
 provider_public_start_observed_at?: string|null;provider_public_end_observed_at?: string|null;
};
function historyCount(value: unknown): number|null {
 if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value).trim())) return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
export function RunDeliveryEvidence({run}:{run:ProviderRun;orderNumber?:number|string;nextRun?:ProviderRun}) {
 const start=historyCount(run.provider_public_start_count)??historyCount(run.provider_start_count);
 const end=historyCount(run.provider_public_end_count);
 const show=(n:number|null)=>n===null?'—':n.toLocaleString();
 return <span className="inline-flex items-center gap-1 text-xs tabular-nums whitespace-nowrap" aria-label="Start and end count">
  <span className="text-muted-foreground">Start</span><span className="font-semibold text-foreground">{show(start)}</span>
  <span className="text-muted-foreground">→</span>
  <span className="text-muted-foreground">End</span><span className="font-semibold text-foreground">{show(end)}</span>
 </span>;
}
export function ProviderDeliveryHistory(_props:{runs:ProviderRun[];orderNumber?:number|string}) { return null; }
