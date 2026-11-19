import { describe, it, expect } from 'vitest';
import { needsLegalConsent } from './consent-policy';
describe('signup and order consent switch', () => {
 it('ON requires acceptance', () => expect(needsLegalConsent(true, false)).toBe(true));
 it('ON permits accepted consent', () => expect(needsLegalConsent(true, true)).toBe(false));
 it('OFF permits proceeding without acceptance', () => expect(needsLegalConsent(false, false)).toBe(false));
});
