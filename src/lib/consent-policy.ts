export function needsLegalConsent(enabled: boolean, accepted: boolean): boolean {
  return enabled && !accepted;
}
