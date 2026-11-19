import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft, ShieldAlert, Mail, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageMeta } from "@/components/seo/PageMeta";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  organization: z.string().trim().max(200).optional(),
  email: z.string().trim().email("Enter a valid email").max(255),
  url: z.string().trim().min(5, "Enter the affected URL").max(1000),
  details: z.string().trim().min(10, "Please describe the abuse (at least 10 characters)").max(5000),
});

export default function ReportAbuse() {
  const [f, setF] = useState({ name: "", organization: "", email: "", url: "", details: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const v = schema.safeParse(f);
    if (!v.success) { setErr(v.error.issues[0]?.message ?? "Please check the form"); return; }
    setBusy(true);
    const { error } = await (supabase as any).rpc("submit_abuse_report", {
      _name: v.data.name, _organization: v.data.organization ?? "", _email: v.data.email,
      _url: v.data.url, _details: v.data.details, _user_agent: navigator.userAgent,
    });
    setBusy(false);
    if (error) { setErr(error.message || "Could not submit. Please email us instead."); return; }
    setDone(true);
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <PageMeta title="Report Abuse & Grievance Officer | OrganicSMM" description="Report fraud, spam or misuse of OrganicSMM and get the offending link blacklisted. Complaints resolved within 24-48 hours." canonicalPath="/report-abuse" breadcrumbs={[{ name: "Home", path: "/" }, { name: "Report Abuse", path: "/report-abuse" }]} />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <Link to="/"><Button variant="ghost" size="sm" className="mb-8 gap-2"><ArrowLeft className="h-4 w-4" /> Back to Home</Button></Link>

          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert className="h-8 w-8 text-red-500" />
            <h1 className="text-3xl font-bold">Report Abuse & Grievance Officer</h1>
          </div>
          <p className="text-muted-foreground mb-8">For brands, companies and individuals affected by misuse of OrganicSMM.</p>

          <div className="grid gap-4 mb-10">
            <div className="rounded-xl border border-border bg-card p-5 flex gap-3">
              <Mail className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-sm"><strong>Official Grievance & Legal Compliance Email:</strong>{" "}
                <a href="mailto:organicsmmofficial@gmail.com" className="text-orange-500 hover:underline break-all">organicsmmofficial@gmail.com</a></p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 flex gap-3">
              <Clock className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm"><strong>Mandatory Action Guarantee:</strong> All abuse or fraud complaints from brands, companies, or individuals are reviewed and resolved within 24 to 48 hours.</p>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-4">Report & Blacklist URL</h2>
          {done ? (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 flex gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
              <p className="text-sm">Your report has been received. Our compliance team will review it and take action within 24 to 48 hours.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className="text-sm font-medium">Your Name *</label><Input value={f.name} onChange={set("name")} maxLength={100} /></div>
                <div><label className="text-sm font-medium">Company / Organization</label><Input value={f.organization} onChange={set("organization")} maxLength={200} /></div>
              </div>
              <div><label className="text-sm font-medium">Your Email *</label><Input type="email" value={f.email} onChange={set("email")} maxLength={255} /></div>
              <div><label className="text-sm font-medium">Affected URL *</label><Input value={f.url} onChange={set("url")} placeholder="https://instagram.com/..." maxLength={1000} /></div>
              <div><label className="text-sm font-medium">Proof / Details *</label><Textarea rows={6} value={f.details} onChange={set("details")} maxLength={5000} placeholder="Describe the abuse and include links to proof (screenshots, documents)." /></div>
              {err && <p className="text-sm text-red-500">{err}</p>}
              <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Report"}</Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
