import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMeta } from "@/components/seo/PageMeta";

const S = ({ n, t, children }: { n: number; t: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold text-foreground">{n}. {t}</h2>
    {children}
  </section>
);

export default function TermsOfService() {
  return (
    <>
      <PageMeta title="Terms of Service | OrganicSMM" description="Terms of Service for OrganicSMM, an automated digital marketing API intermediary." canonicalPath="/terms" breadcrumbs={[{ name: "Home", path: "/" }, { name: "Terms of Service", path: "/terms" }]} />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Link to="/"><Button variant="ghost" size="sm" className="mb-8 gap-2"><ArrowLeft className="h-4 w-4" /> Back to Home</Button></Link>

          <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: November 13, 2026</p>

          <div className="flex gap-3 p-4 mb-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400/90">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              <strong className="text-amber-400">Important:</strong> By creating an account, placing any order, or using the API of OrganicSMM, you confirm that you have read and agree to these Terms, the Privacy Policy, the Refund Policy and the Anti-Fraud Policy contained herein. Your acceptance is recorded electronically together with your IP address, device/user-agent, email and timestamp. If you do not agree, you must immediately stop using the Platform.
            </p>
          </div>

          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
            <S n={1} t="Acceptance of Terms">
              <p>These Terms constitute a legally binding electronic agreement between you ("User", "you") and OrganicSMM ("the Platform", "we", "us") under the Information Technology Act, 2000 (India) and applicable laws. Electronic consent captured at signup and at every order is valid and enforceable evidence of your acceptance.</p>
            </S>

            <S n={2} t="Pure Technical Intermediary & Zero Manual Control (IT Act, Section 79)">
              <p>OrganicSMM is strictly a <strong className="text-foreground">passive, automated API routing software</strong>. We do not generate, create, own or control any views, likes, followers, comments or traffic. All requests are automatically transmitted to third-party service providers through APIs, based solely on the input provided by the User.</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>The Platform does not initiate any transmission, does not select the receiver of any transmission, and does not select or modify the information contained in it.</li>
                <li>The founders, owners, developers and partners of OrganicSMM have <strong className="text-foreground">no knowledge of and no control over</strong> the links, accounts or content submitted by Users.</li>
                <li>OrganicSMM claims the protection available to intermediaries under Section 79 of the Information Technology Act, 2000, the Information Technology (Intermediary Guidelines) Rules, and equivalent safe-harbour laws worldwide.</li>
              </ul>
            </S>

            <S n={3} t="100% User Responsibility & Complete Indemnification">
              <p>You are the <strong className="text-foreground">sole originator and legal owner</strong> of every action, order, link and API request made through your account. You certify that you own, or are authorised by the owner of, every target link you submit.</p>
              <p>You unconditionally agree to <strong className="text-foreground">indemnify, defend and hold harmless</strong> OrganicSMM, its owners, founders, developers, employees and partners from and against any police complaint, FIR, cybercrime notice, lawsuit, brand or company claim, regulatory penalty, damages, and legal costs (including advocates' fees) arising out of or relating to your orders, your content, your use or misuse of the Platform, or your breach of these Terms or any law.</p>
            </S>

            <S n={4} t="Strict Anti-Fraud, Anti-Botting & Anti-Defamation Policy">
              <p>You must NOT use OrganicSMM to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Inflate metrics to deceive or defraud any brand, sponsor, advertiser, agency, investor, employer or platform;</li>
                <li>Obtain payments, campaigns, sponsorships or contracts from any company using engagement purchased here;</li>
                <li>Target, spam, harass, defame or attack any third-party account or link without the owner's consent;</li>
                <li>Conduct botting, spam, or any activity that violates any law or the terms of any social media platform.</li>
              </ul>
              <p>Any violation results in <strong className="text-foreground">immediate permanent account termination, 100% forfeiture of wallet balance</strong>, blacklisting of the target link, and full cooperation with law enforcement and the affected party.</p>
            </S>

            <S n={5} t="Automatic Law Enforcement & Brand Disclosure">
              <p>Upon receiving any legal notice, court order, police or cyber-cell request, or a valid abuse complaint from a brand or company, OrganicSMM will disclose all stored records relating to the concerned User — including IP addresses, device/user-agent data, registration details, consent logs, order history, target URLs and payment/transaction records — to the law enforcement agency or the affected party, <strong className="text-foreground">without prior notice to the User</strong>, to the extent permitted by law.</p>
            </S>

            <S n={6} t="No Platform Affiliation & Zero Guarantee">
              <p>OrganicSMM is completely independent and is <strong className="text-foreground">not affiliated with, endorsed by or connected to</strong> Instagram, Facebook, Meta, YouTube, Google, TikTok, Telegram, X (Twitter) or any other platform. All trademarks belong to their respective owners.</p>
              <p>Services are provided "as is" without any guarantee. You bear 100% of the risk of account suspension, bans, shadow-bans, removal of content, or drops in delivered engagement.</p>
            </S>

            <S n={7} t="Limitation of Liability">
              <p>To the maximum extent permitted by law, under no circumstances shall OrganicSMM or its owners, founders, developers or partners be liable for any direct, indirect, incidental, special, punitive or consequential damages. For any claim arising from misuse by a User or a third party, the liability of OrganicSMM is limited to <strong className="text-foreground">₹0 / $0</strong>. In any other case, total liability shall not exceed the amount you paid for the specific order in dispute.</p>
            </S>

            <S n={8} t="Accounts, Wallet & Payments">
              <p>You are responsible for keeping your login credentials and API key secure. All activity on your account is deemed to be done by you. Wallet funds are prepaid credits for using the Platform and are governed by our <Link to="/refund" className="text-orange-500 hover:underline">Refund Policy</Link>.</p>
            </S>

            <S n={9} t="Termination">
              <p>We may suspend or terminate any account, cancel any order, and blacklist any link at our sole discretion, with or without notice, especially upon any complaint or suspected violation of these Terms.</p>
            </S>

            <S n={10} t="Governing Law & Changes">
              <p>These Terms are governed by the laws of India. We may update these Terms at any time; continued use of the Platform after an update means you accept the updated Terms.</p>
            </S>

            <S n={11} t="Contact & Grievance">
              <p>For questions or complaints, email <strong className="text-foreground">organicsmmofficial@gmail.com</strong> or use our <Link to="/report-abuse" className="text-orange-500 hover:underline">Report Abuse & Grievance Officer</Link> page.</p>
            </S>
          </div>
        </div>
      </div>
    </>
  );
}
