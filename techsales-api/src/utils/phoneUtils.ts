/**
 * Phone-number helpers for the backend. Mirrors `techsales-app/src/utils/
 * phoneUtils.ts` so both sides of the wire normalize the same way.
 *
 * Used by:
 *   - Inbound webhook → lookup-by-phone repo path (normalize stored values
 *     before comparing against Twilio's E.164 caller id).
 *   - `/api/leads/lookup-by-phone` controller.
 */

/** Returns E.164 (`+` followed by 1-15 digits) or null if normalization fails. */
export function normalizeToE164(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    return /^\+[1-9]\d{1,14}$/.test(digits) ? digits : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Return the trailing 10 digits of a normalized E.164 string (US shape). Null otherwise. */
export function toLast10(raw: string | null | undefined): string | null {
  const e164 = normalizeToE164(raw);
  if (!e164) return null;
  const digits = e164.slice(1); // strip +
  return digits.slice(-10);
}
