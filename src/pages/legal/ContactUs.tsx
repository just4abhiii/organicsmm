import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMeta } from "@/components/seo/PageMeta";

export default function ContactUs() {
  return (
    <>
      <PageMeta
        title="Contact Us | OrganicSMM"
        description="Get in touch with the OrganicSMM support team by email."
        canonicalPath="/contact"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Contact Us", path: "/contact" }]}
      />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Link to="/">
            <Button variant="ghost" size="sm" className="mb-8 gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Button>
          </Link>

          <h1 className="text-3xl font-bold mb-2">Contact Us</h1>
          <p className="text-muted-foreground mb-8">
            OrganicSMM is operated as an Automated Digital Marketing API Intermediary. Reach us by email for all queries.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-10">
            <div className="rounded-xl border border-border p-5 bg-card">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-orange-500" />
                </div>
                <h3 className="font-semibold">Email Support</h3>
              </div>
              <a href="mailto:organicsmmofficial@gmail.com" className="text-sm text-orange-500 hover:underline break-all">
                organicsmmofficial@gmail.com
              </a>
              <p className="text-xs text-muted-foreground mt-2">For all general queries, billing & technical support.</p>
            </div>

            <div className="rounded-xl border border-border p-5 bg-card">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-purple-500" />
                </div>
                <h3 className="font-semibold">Response Time</h3>
              </div>
              <p className="text-sm">Email monitored 7 days a week.</p>
              <p className="text-xs text-muted-foreground mt-2">Live chat is available inside your dashboard.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border p-6 bg-card">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Abuse, Fraud & Grievances</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Brands, companies or individuals affected by misuse can file a complaint on our{" "}
                  <Link to="/report-abuse" className="text-orange-500 hover:underline">Report Abuse & Grievance Officer</Link>{" "}
                  page or email <a className="text-orange-500 hover:underline" href="mailto:organicsmmofficial@gmail.com">organicsmmofficial@gmail.com</a>. Complaints are reviewed within 24 to 48 hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
