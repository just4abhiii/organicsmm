import { supabase } from "@/integrations/supabase/client";

export const LEGAL_CONSENT_TEXT =
  "I strictly accept the Terms of Service, Privacy Policy, and Anti-Fraud Policy. I legally certify that I am the authorized owner or have permission for the target link, I am NOT using this service to defraud any company/brand or conduct spam/botting attacks, and I accept 100% sole legal, civil, and criminal responsibility for this order.";

export async function recordLegalConsent(
  eventType: "signup" | "order" | "api_key",
  opts: { email?: string; reference?: string } = {},
) {
  try {
    await (supabase as any).rpc("record_legal_consent", {
      _event_type: eventType,
      _consent_text: LEGAL_CONSENT_TEXT,
      _email: opts.email ?? null,
      _reference: opts.reference ?? null,
      _user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch (e) {
    console.warn("consent log failed");
  }
}

export function LegalConsentCheckbox({
  checked,
  onChange,
  tone = "light",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  tone?: "light" | "dark";
}) {
  const text = tone === "dark" ? "text-zinc-300" : "text-muted-foreground";
  return (
    <label className={`flex items-start gap-3 cursor-pointer select-none rounded-xl border-2 p-4 text-[12px] leading-relaxed transition-colors active:scale-[0.99] ${checked ? "border-green-500/60 bg-green-500/10" : "border-red-500/30 bg-red-500/5"} ${text}`} style={{ WebkitTapHighlightColor: "transparent" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-7 w-7 shrink-0 cursor-pointer accent-green-600"
        aria-label="Accept legal terms"
      />
      <span>
        I strictly accept the{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="underline font-semibold">Terms of Service</a>,{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline font-semibold">Privacy Policy</a>, and{" "}
        <a href="/terms" target="_blank" rel="noreferrer" className="underline font-semibold">Anti-Fraud Policy</a>. I legally certify that I am the authorized owner or have permission for the target link, I am NOT using this service to defraud any company/brand or conduct spam/botting attacks, and I accept 100% sole legal, civil, and criminal responsibility for this order.
      </span>
    </label>
  );
}
