/**
 * Phase C — `get_appointments`. READ tool. The agent's member appointments,
 * optionally filtered by date range or status.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getAppointmentsForAgent } from '../../services/appointmentReader.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The agent's userId. Required."),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Only appointments on/after this date, YYYY-MM-DD.'),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('Only appointments on/before this date, YYYY-MM-DD.'),
  status: z
    .string()
    .optional()
    .describe('Optional status filter, e.g. "Scheduled".'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const getAppointmentsTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      let appts = await getAppointmentsForAgent(input.userId);
      if (input.from) appts = appts.filter((a) => a.scheduledDate >= input.from!);
      if (input.to) appts = appts.filter((a) => a.scheduledDate <= input.to!);
      if (input.status) {
        const s = input.status.toLowerCase();
        appts = appts.filter((a) => (a.status ?? '').toLowerCase() === s);
      }
      appts.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

      return JSON.stringify({
        total: appts.length,
        appointments: appts.slice(0, 20).map((a) => ({
          appointmentId: a.appointmentId,
          memberId: a.memberId,
          type: a.appointmentType,
          date: a.scheduledDate,
          time: a.scheduledTime,
          status: a.status,
          notes: a.notes,
        })),
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'get_appointments',
    description:
      "The agent's member appointments (annual reviews, plan discussions). Use for " +
      '"what\'s on my calendar", "when am I seeing <member>", "my appointments this week" ' +
      '(pass from/to dates for a range).',
    schema: inputSchema,
  },
);
