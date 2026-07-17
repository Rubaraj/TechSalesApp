/**
 * Phase 4 (M3) — `search_leads`. General lead search across the whole book
 * (NOT scoped to the current agent — use `get_my_pipeline` for that). Useful
 * for queries like "find John Smith" or "find leads in Florida with status
 * Appointment Schedule".
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  searchTerm: z
    .string()
    .optional()
    .describe(
      'Free-text search across leadId / firstName / lastName / email / phone / city / ' +
        'county / zipCode / medicareNumber / medicaidId.',
    ),
  status: z
    .enum([
      'New Lead',
      'Contacted Lead',
      'Appointment Schedule',
      'Enrollment in progress',
      'Enrolled',
      'Dropped / Lost lead',
    ])
    .optional()
    .describe('Optional exact-match status filter.'),
  state: z.string().optional().describe('Optional 2-letter state filter.'),
  pageSize: z.number().int().positive().max(25).optional().default(10),
});

type ToolInput = z.infer<typeof inputSchema>;

export const searchLeadsTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const filters: Record<string, unknown> = {};
      if (input.status) filters.leadStatus = input.status;
      if (input.state) filters.state = input.state.toUpperCase();

      const result = await repos.lead.search({
        ...(input.searchTerm ? { searchTerm: input.searchTerm } : {}),
        filters,
        page: 1,
        pageSize: input.pageSize ?? 10,
      });

      const trimmed = result.data.map((l) => ({
        leadId: l.leadId,
        name: `${l.firstName} ${l.lastName}`.trim(),
        status: l.leadStatus,
        state: l.state,
        phone: l.phone,
        email: l.email,
      }));

      return JSON.stringify({
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        leads: trimmed,
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'search_leads',
    description:
      'Search ALL leads in the system by name / phone / email / city / status / state. ' +
      'NOT scoped to the current agent. Use this to find a specific lead by name or browse ' +
      'the broader book. Returns up to 25 results with leadId + name + status + state + phone + email.',
    schema: inputSchema,
  },
);
