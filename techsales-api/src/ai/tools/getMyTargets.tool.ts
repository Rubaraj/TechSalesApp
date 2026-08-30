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
import { periodWindow, inWindow, elapsedFraction, round1 } from '../../utils/periodWindow.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The agent's userId. Required."),
  period: z
    .enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    .optional()
    .default('monthly')
    .describe('Which target period to report on. Defaults to monthly.'),
});

type ToolInput = z.infer<typeof inputSchema>;

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
      const elapsed = elapsedFraction(w, now);

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
        const expected = round1(t.targetValue * elapsed);
        return {
          metric: t.metric,
          targetValue: t.targetValue,
          actualToDate: actual,
          expectedToDate: expected,
          paceDelta: round1(actual - expected),
          onTrack: actual >= expected,
          progressPct: Math.round((actual / t.targetValue) * 100),
          projectedEndOfPeriod: round1(actual / elapsed),
          points: t.points,
        };
      });

      return JSON.stringify({
        period: input.period,
        window: w.label,
        percentOfPeriodElapsed: Math.round(elapsed * 100),
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
