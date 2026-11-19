// Browser-only copy helper, shared verbatim with OrganicSMM's deployed frontend.
export async function copyPaymentText(text, navigatorApi = globalThis.navigator, documentApi = globalThis.document) {
  try {
    if (navigatorApi?.clipboard?.writeText) {
      await navigatorApi.clipboard.writeText(text);
      return;
    }
  } catch {
    // Some mobile/webview browsers deny Clipboard API access; use a selected field.
  }
  if (!documentApi?.body || typeof documentApi.execCommand !== 'function') {
    throw new Error('Clipboard unavailable');
  }
  const previousFocus = documentApi.activeElement;
  const field = documentApi.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.setAttribute('aria-label', 'Payment value to copy');
  field.setAttribute('style', 'position:fixed;left:0;top:0;opacity:0;pointer-events:none');
  documentApi.body.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    if (!documentApi.execCommand('copy')) throw new Error('Copy failed');
  } finally {
    field.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
}