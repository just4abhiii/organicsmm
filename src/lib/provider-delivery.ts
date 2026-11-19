// Provider-truth delivery for one run. remains=0 is NOT evidence while the provider
// still reports Pending/In progress (providers send remains 0 before starting).
export function providerRunDelivered(run: any): number {
  const qty = Number(run?.quantity_to_send || 0);
  if (!(qty > 0)) return 0;
  const ps = (run?.provider_status || "").toString().toLowerCase().replace(/\s+/g, "");
  const raw = run?.provider_remains;
  const remains = raw === null || raw === undefined || String(raw).trim() === "" ? null : Number(raw);
  const hasRemains = remains !== null && Number.isFinite(remains);
  if (ps === "completed" || ps === "complete" || ps === "success") return qty;
  if (ps === "partial") return hasRemains ? Math.max(0, qty - Math.max(0, remains as number)) : 0;
  if (ps === "inprogress" || ps === "processing") return hasRemains && (remains as number) > 0 ? Math.max(0, qty - (remains as number)) : 0;
  if (!ps) return (run?.status || "") === "completed" ? qty : 0;
  return 0;
}
