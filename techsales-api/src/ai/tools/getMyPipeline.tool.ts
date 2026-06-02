/**
 * Phase 4 (M3) — `get_my_pipeline`. First-person tool: returns the leads
 * owned by the currently-logged-in agent (resolved by `userId`), grouped
 * by status with counts. Used by Atlas to answer "show me my book" /
 * "how many appointments do I have scheduled" type questions.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  userId: z
    .string()
    .min(1)
    .describe('The agent\'s userId (e.g. "USER-002"). Required.'),
  state: z
    .string()
    .optional()
    .describe('Optional 2-letter state filter (e.g. "FL"). Case-insensitive.'),
});

type ToolInput = z.infer<typeof inputSchema>;

const MAX_LEADS_RETURNED = 25;

export const getMyPipelineTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const leads = await repos.lead.findByAssignedTo(input.userId);
      const filtered = input.state
        ? leads.filter((l) => (l.state ?? '').toUpperCase() === input.state!.toUpperCase())
        : leads;

      const byStatus: Record<string, number> = {};
      for (const l of filtered) {
        byStatus[l.leadStatus] = (byStatus[l.leadStatus] ?? 0) + 1;
      }

      const trimmed = filtered.slice(0, MAX_LEADS_RETURNED).map((l) => ({
        leadId: l.leadId,
        name: `${l.firstName} ${l.lastName}`.trim(),
        status: l.leadStatus,
        state: l.state,
        phone: l.phone,
        updatedAt: l.updatedAt ?? l.createdAt,
      }));

      return JSON.stringify({
        totalCount: filtered.length,
        truncated: filtered.length > MAX_LEADS_RETURNED,
        countsByStatus: byStatus,
        leads: trimmed,
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'get_my_pipeline',
    description:
      'Return the leads the current agent owns, grouped by status with counts. ' +
      'Use this for any "my leads" / "my pipeline" / "leads I own" question. ' +
      'Optionally filter by state. Returns up to 25 leads with leadId + name + status + phone.',
    schema: inputSchema,
  },
);
