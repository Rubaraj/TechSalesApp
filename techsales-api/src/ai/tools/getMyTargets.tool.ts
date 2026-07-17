/**
 * Phase C — `get_my_targets`. READ tool. The org's active targets applied to
 * THIS agent's actual numbers, with deterministic pro-rating done here (not
 * by the model) so "am I on track?" always gets the same math:
 *
 *   elapsedFraction   = elapsed time in period / total period length
 *   expectedToDate    = targetValue × elapsedFraction
 *   onTrack           = actualToDate >= expectedToDate
 *   projectedEndOfPeriod = actualToDate / elapsedFraction
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';
import { getAppointmentsForAgent } from '../../services/appointmentReader.js';
import type { Target } from '../../types/index.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The agent's userId. Required."),
  period: z
    .enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .optional()
    .default('monthly')
    .describe('Which target period to report on. Defaults to monthly.'),
});

type ToolInput = z.infer<typeof inputSchema>;

interface PeriodWindow {
  start: Date;
  end: Date;
  label: string;
}

function periodWindow(period: Target['period'], now: Date): PeriodWindow {
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

function inWindow(dateStr: string | undefined, w: PeriodWindow): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime()) && d >= w.start && d < w.end;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const getMyTargetsTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const targets = (await repos.target.findActive()).filter(
        (t) => t.period === input.period,
      );
      if (targets.length === 0) {
        return JSON.stringify({ period: input.period, targets: [], note: 'No active targets for this period.' });
      }

      const now = new Date();
      const w = periodWindow(input.period, now);
      // Clamp so day 1 of a period doesn't divide by ~zero.
      const elapsedFraction = Math.min(
        1,
        Math.max(0.02, (now.getTime() - w.start.getTime()) / (w.end.getTime() - w.start.getTime())),
      );

      // Per-metric actuals for THIS agent within the window.
      const [myLeads, myEnrollments, myAppointments] = await Promise.all([
        repos.lead.findByAssignedTo(input.userId),
        repos.enrollment.findByAgent(input.userId),
        getAppointmentsForAgent(input.userId),
      ]);
      const actuals: Record<string, number | null> = {
        'New Leads': myLeads.filter((l) => inWindow(l.createdAt, w)).length,
        'New Enrollments': myEnrollments.filter((e) => inWindow(e.enrollmentDate ?? e.createdAt, w)).length,
        'New Appointments': myAppointments.filter((a) => inWindow(a.scheduledDate, w)).length,
        // No backend data source for e-kits yet — report honestly rather than 0.
        'Electronic Kits Sent': null,
      };

      const report = targets.map((t) => {
        const actual = actuals[t.metric] ?? null;
        if (actual === null) {
          return { metric: t.metric, targetValue: t.targetValue, actualToDate: null, note: 'no data source for this metric yet' };
        }
        const expected = round1(t.targetValue * elapsedFraction);
        return {
          metric: t.metric,
          targetValue: t.targetValue,
          actualToDate: actual,
          expectedToDate: expected,
          paceDelta: round1(actual - expected),
          onTrack: actual >= expected,
          progressPct: Math.round((actual / t.targetValue) * 100),
          projectedEndOfPeriod: round1(actual / elapsedFraction),
          points: t.points,
        };
      });

      return JSON.stringify({
        period: input.period,
        window: w.label,
        percentOfPeriodElapsed: Math.round(elapsedFraction * 100),
        targets: report,
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'get_my_targets',
    description:
      'The agent\'s progress against active targets, with pro-rated pacing computed ' +
      'deterministically (expectedToDate = target × fraction of period elapsed; onTrack; ' +
      'projected end-of-period). Use for "am I on track", "how am I doing this month", ' +
      '"will I hit my enrollment target". Report the tool\'s numbers as-is — do not recompute.',
    schema: inputSchema,
  },
);
