/**
 * Phone-number helpers shared across the Call Copilot UI.
 *
 *   - `normalizeToE164(raw)` — accepts user input or stored phone strings and
 *     returns E.164 form (e.g. `+14155551234`) or `null` if the input can't
 *     be made valid. Assumes US (+1) when no country code is present.
 *   - `formatPhoneUS(raw)` — display formatter. Returns `(415) 555-1234` for
 *     10/11-digit US numbers, falls back to the raw string for anything else.
 *   - `isValidPhone(raw)` — true iff `normalizeToE164` would succeed.
 *
 * These previously lived in `Dialer.tsx` / `LeadDetail.tsx` / `LeadList.tsx`
 * with duplicated implementations. One source of truth here; consumers
 * import from this file.
 */

/** Return E.164 form (`+` + 1-15 digits) or null if input can't be normalized. */
export function normalizeToE164(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    return /^\+[1-9]\d{1,14}$/.test(digits) ? digits : null;
  }
  // No country code -> assume US (+1).
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/**
 * Format a phone number for display. Accepts raw stored values (`"2035551234"`,
 * `"+12035551234"`, `"203-555-1234"`, etc.) and returns `(203) 555-1234` for
 * standard US shapes. Falls back to the input unchanged when the input isn't
 * a recognized US 10/11-digit form.
 */
export function formatPhoneUS(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  // 10-digit US.
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  // 11-digit US with country prefix.
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(raw);
}

export function isValidPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return normalizeToE164(String(raw)) !== null;
}

/**
 * Extract just the digits from arbitrary input. Used by the Dialer's buffer
 * (single source of truth: digits-only, display derived via `formatPhoneUS`,
 * E.164 derived via `normalizeToE164`).
 */
export function toDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}
