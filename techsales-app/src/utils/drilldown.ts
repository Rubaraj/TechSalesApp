/**
 * Drill-down period filters.
 *
 * The productivity dashboard is period-scoped, so a card showing "147" must
 * land on exactly those 147 records. Rather than teach every destination screen
 * about periods, the window travels in the URL as `?from=<ISO>&to=<ISO>` and
 * each screen applies it with `inPeriod()`.
 *
 * `to` is EXCLUSIVE, matching the backend's period windows
 * (techsales-api/src/utils/periodWindow.ts) so both sides count identically.
 */

export interface PeriodParams {
  from: string;
  to: string;
}

export interface DrilldownParams extends Partial<PeriodParams> {
  status?: string;
  source?: string;
  createdBy?: string;
}

/** Build a query string for a drill-down link. Empty values are dropped. */
export function buildDrilldownQuery(params: DrilldownParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * Parse a stored date the same way the API does: a bare `YYYY-MM-DD` is local
 * midnight, not UTC midnight. Without this, date-only fields like
 * `enrollmentDate` fall into the previous day west of UTC and the drilled-down
 * list disagrees with the count that was clicked.
 */
export function parseStoredDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

/** Half-open [from, to) membership test. Missing bounds mean "unbounded". */
export function inPeriod(value: string | undefined | null, from?: string | null, to?: string | null): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const t = parseStoredDate(value).getTime();
  if (Number.isNaN(t)) return false;
  if (from && t < new Date(from).getTime()) return false;
  if (to && t >= new Date(to).getTime()) return false;
  return true;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const day = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

/**
 * Human label for a window, e.g. "Aug 2026", "Aug 24 – Aug 30, 2026",
 * "Aug 30, 2026". `to` is exclusive, so the displayed end is one day earlier.
 */
export function formatPeriodLabel(from?: string | null, to?: string | null): string {
  if (!from && !to) return '';
  if (from && !to) return `From ${day(new Date(from))}`;
  if (!from && to) return `Until ${day(new Date(new Date(to).getTime() - 86400000))}`;

  const start = new Date(from!);
  const endInclusive = new Date(new Date(to!).getTime() - 86400000);

  // Single day.
  if (start.toDateString() === endInclusive.toDateString()) return day(start);

  // Whole calendar month.
  const isMonthStart = start.getDate() === 1;
  const isMonthEnd =
    endInclusive.getMonth() === start.getMonth() &&
    endInclusive.getFullYear() === start.getFullYear() &&
    new Date(endInclusive.getFullYear(), endInclusive.getMonth() + 1, 0).getDate() === endInclusive.getDate();
  if (isMonthStart && isMonthEnd) {
    return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  }

  if (start.getFullYear() === endInclusive.getFullYear()) {
    return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[endInclusive.getMonth()]} ${endInclusive.getDate()}, ${start.getFullYear()}`;
  }
  return `${day(start)} – ${day(endInclusive)}`;
}
