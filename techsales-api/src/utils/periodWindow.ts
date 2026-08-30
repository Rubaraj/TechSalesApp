/**
 * Shared period-window math for target pacing.
 *
 * Extracted from `ai/tools/getMyTargets.tool.ts` so the Atlas copilot and the
 * `/api/insights` productivity dashboard resolve "this week" identically. If
 * these ever diverge, the UI and the assistant will quietly disagree about the
 * same question — keep this the single definition.
 *
 *   elapsedFraction      = elapsed time in period / total period length
 *   expectedToDate       = targetValue × elapsedFraction
 *   onTrack              = actualToDate >= expectedToDate
 *   projectedEndOfPeriod = actualToDate / elapsedFraction
 */
import type { Target } from '../types/index.js';

export type TargetPeriod = Target['period'];

export interface PeriodWindow {
  start: Date;
  end: Date;
  label: string;
}

export function periodWindow(period: TargetPeriod, now: Date): PeriodWindow {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'daily': {
      const start = new Date(y, m, now.getDate());
      return { start, end: new Date(y, m, now.getDate() + 1), label: start.toISOString().slice(0, 10) };
    }
    case 'weekly': {
      // Monday-based week.
      const dow = (now.getDay() + 6) % 7;
      const start = new Date(y, m, now.getDate() - dow);
      return { start, end: new Date(y, m, now.getDate() - dow + 7), label: `week of ${start.toISOString().slice(0, 10)}` };
    }
    case 'quarterly': {
      const qStart = Math.floor(m / 3) * 3;
      return { start: new Date(y, qStart, 1), end: new Date(y, qStart + 3, 1), label: `Q${Math.floor(m / 3) + 1} ${y}` };
    }
    case 'yearly':
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: String(y) };
    case 'monthly':
    default:
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1), label: now.toISOString().slice(0, 7) };
  }
}

/**
 * The window immediately before `w`, same length, for period-over-period
 * comparison. Anchored by stepping `now` back one period rather than by
 * subtracting a duration, so month-length and DST differences stay correct.
 */
export function previousPeriodWindow(period: TargetPeriod, now: Date): PeriodWindow {
  const w = periodWindow(period, now);
  // One millisecond before the current window starts is always inside the
  // previous window, whatever its length.
  return periodWindow(period, new Date(w.start.getTime() - 1));
}

/**
 * Parse a stored date.
 *
 * Date-only strings ("2026-08-30" — how enrollmentDate and scheduledDate are
 * stored) are parsed by `new Date()` as UTC midnight, while the windows above
 * are built from local-midnight boundaries. West of UTC that pushes a date-only
 * value into the previous day, so an enrollment dated today was counted as
 * yesterday and the daily window came back empty. Parse those as LOCAL midnight
 * so both sides of the comparison use the same clock. Full timestamps carry
 * their own offset and are left alone.
 */
export function parseStoredDate(dateStr: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(dateStr);
}

export function inWindow(dateStr: string | undefined | null, w: PeriodWindow): boolean {
  if (!dateStr) return false;
  const d = parseStoredDate(dateStr);
  return !Number.isNaN(d.getTime()) && d >= w.start && d < w.end;
}

/**
 * Fraction of the period elapsed at `now`, clamped so day 1 of a period does
 * not divide by ~zero when projecting end-of-period figures.
 */
export function elapsedFraction(w: PeriodWindow, now: Date): number {
  return Math.min(
    1,
    Math.max(0.02, (now.getTime() - w.start.getTime()) / (w.end.getTime() - w.start.getTime())),
  );
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;
