/**
 * Phase C — `get_enrollments`. READ tool. Enrollment history for a lead, or
 * the agent's own submitted enrollments, optionally narrowed to a month.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  leadId: z.string().optional().describe('Filter to one lead, e.g. "LEAD-001".'),
  userId: z
    .string()
    .optional()
    .describe("Filter to the agent's own enrollments (the agent's userId)."),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe('Optional month filter, "YYYY-MM" (matches enrollmentDate).'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const getEnrollmentsTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      if (!input.leadId && !input.userId) {
        return JSON.stringify({ error: 'Provide leadId or userId.' });
      }
      let enrollments = input.leadId
        ? await repos.enrollment.findByLead(input.leadId)
        : await repos.enrollment.findByAgent(input.userId!);

      if (input.month) {
        enrollments = enrollments.filter((e) =>
          (e.enrollmentDate ?? '').startsWith(input.month!),
        );
      }

      enrollments.sort((a, b) => (b.enrollmentDate ?? '').localeCompare(a.enrollmentDate ?? ''));

      return JSON.stringify({
        total: enrollments.length,
        enrollments: enrollments.slice(0, 20).map((e) => ({
          enrollmentId: e.enrollmentId,
          leadId: e.leadId,
          planId: e.planId,
          status: e.status,
          enrollmentDate: e.enrollmentDate,
          effectiveDate: e.effectiveDate,
          enrollmentType: e.enrollmentType,
          premium: e.premium,
        })),
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'get_enrollments',
    description:
      'Enrollment history. Pass leadId for one lead ("show Joshua\'s enrollments") or ' +
      'userId for the agent\'s own submissions ("what did I enroll this month" — add ' +
      'month: "YYYY-MM"). Returns status, plan, dates, premium per enrollment.',
    schema: inputSchema,
  },
);
