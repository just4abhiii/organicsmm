import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminAbuseReports() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["abuse-reports"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("abuse_reports").select("*").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await (supabase as any).from("abuse_reports").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["abuse-reports"] }); }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 space-y-4 pb-10">
        <Link to="/admin"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" /> Admin</Button></Link>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldAlert className="h-6 w-6 text-red-500" /> Abuse Reports</h1>
        <p className="text-sm text-muted-foreground">Search the affected URL in orders, ban the user, then mark the report resolved.</p>
        {isLoading ? <p>Loading…</p> : !data?.length ? <p className="text-muted-foreground">No reports yet.</p> : data.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={r.status === "new" ? "destructive" : "secondary"}>{r.status}</Badge>
              {r.url_blacklisted && <Badge variant="destructive">URL blacklisted</Badge>}
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
            </div>
            <p className="text-sm"><strong>{r.reporter_name}</strong>{r.organization ? ` (${r.organization})` : ""} · {r.reporter_email}</p>
            <p className="text-sm break-all"><strong>URL:</strong> {r.affected_url}</p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.details}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => update(r.id, { status: "reviewing" })}>Reviewing</Button>
              <Button size="sm" variant="destructive" onClick={() => update(r.id, { url_blacklisted: true })}>Mark URL blacklisted</Button>
              <Button size="sm" onClick={() => update(r.id, { status: "resolved" })}>Resolved</Button>
              <Button size="sm" variant="ghost" onClick={() => update(r.id, { status: "rejected" })}>Reject</Button>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}
