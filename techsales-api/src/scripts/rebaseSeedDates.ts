/**
 * Rolling seed dates.
 *
 * The sample data is a fixed historical snapshot. Left as-is, every
 * period-scoped view ("today", "this week", "this month") goes empty as soon as
 * the snapshot ages — which is exactly what made the productivity dashboard
 * unusable. This maps the snapshot forward at seed time so the newest activity
 * always lands on the day you seed.
 *
 * Two rules make this safe:
 *
 * 1. ONE monotonic mapping is applied to every rebasable field across every
 *    collection. A shared mapping is what preserves causality: a lead stays
 *    older than its own enrollment, because relative order is preserved
 *    everywhere at once. Per-collection offsets would silently produce
 *    enrollments that predate the lead they belong to.
 *
 * 2. Only ACTIVITY dates move. Birth dates and Medicare Part A/B dates are
 *    identity facts — shifting them would change ages and eligibility.
 *
 * The mapping is anchored on the activity spine (lead createdAt + enrollment
 * enrollmentDate) rather than on the global maximum, so the newest enrollment
 * lands today. Appointments legitimately extend past the spine, and therefore
 * map into the near future — which is what a scheduled appointment should be.
 */

/** Activity timestamps — these move. */
export const REBASE_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'enrollmentDate',
  'effectiveDate',
  'scheduledDate',
  'lastLoginAt',
]);

/**
 * Identity / eligibility dates — these must NEVER move. Shifting a `dob` would
 * change the person's age and their Medicare eligibility.
 */
export const NEVER_REBASE_FIELDS = new Set(['dob', 'dateOfBirth', 'partADate', 'partBDate']);

export interface RebasePlan {
  srcMin: number;
  srcMax: number;
  dstMin: number;
  dstMax: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function parseIso(value: unknown): number | null {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Build the mapping from the activity spine.
 *
 * @param spineDates every lead `createdAt` and enrollment `enrollmentDate`
 * @param now        the moment the newest activity should land on
 * @param spanMonths how much history to spread across (default 12)
 */
export function buildRebasePlan(spineDates: string[], now: Date, spanMonths = 12): RebasePlan | null {
  const times = spineDates.map(parseIso).filter((t): t is number => t !== null);
  if (times.length === 0) return null;

  const srcMin = Math.min(...times);
  const srcMax = Math.max(...times);
  if (srcMax <= srcMin) return null;

  const dstMax = now.getTime();
  const dstMin = new Date(now.getFullYear(), now.getMonth() - spanMonths, now.getDate()).getTime();
  return { srcMin, srcMax, dstMin, dstMax };
}

/**
 * Map one timestamp. Linear and monotonic, so ordering is preserved for values
 * outside [srcMin, srcMax] too — that is how appointments scheduled after the
 * last enrollment stay in the future.
 */
export function rebaseTime(t: number, plan: RebasePlan): number {
  const scale = (plan.dstMax - plan.dstMin) / (plan.srcMax - plan.srcMin);
  return Math.round(plan.dstMin + (t - plan.srcMin) * scale);
}

/** Rebase every eligible date field on a document, in place. */
export function rebaseDoc<T extends Record<string, unknown>>(doc: T, plan: RebasePlan): T {
  for (const [key, value] of Object.entries(doc)) {
    if (NEVER_REBASE_FIELDS.has(key) || !REBASE_FIELDS.has(key)) continue;
    const t = parseIso(value);
    if (t === null) continue;
    // Preserve date-only formatting (e.g. "2026-01-06") vs full ISO timestamps.
    const iso = new Date(rebaseTime(t, plan)).toISOString();
    doc[key as keyof T] = ((value as string).length <= 10 ? iso.slice(0, 10) : iso) as T[keyof T];
  }
  return doc;
}

export function describePlan(plan: RebasePlan): Record<string, string> {
  const d = (t: number): string => new Date(t).toISOString().slice(0, 10);
  return {
    from: `${d(plan.srcMin)} → ${d(plan.srcMax)}`,
    to: `${d(plan.dstMin)} → ${d(plan.dstMax)}`,
  };
}
