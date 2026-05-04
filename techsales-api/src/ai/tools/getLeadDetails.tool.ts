/**
 * `get_lead_details` — fetches a single Lead by id via the registry repo
 * (works in both Mongo and JSON modes). Used by the recommend agent as its
 * first step to ground recommendations in the lead's profile (state,
 * Medicaid eligibility, tagged drugs, etc.).
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  leadId: z.string().min(1).describe('The lead identifier, e.g. "LEAD-001".'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const getLeadDetailsTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const lead = await repos.lead.findById(input.leadId);
      if (!lead) {
        return JSON.stringify({ error: 'Lead not found', leadId: input.leadId });
      }
      return JSON.stringify(lead);
    } catch (err) {
      return JSON.stringify({ ok: false, error: String(err) });
    }
  },
  {
    name: 'get_lead_details',
    description:
      'Fetch the lead profile by id. Returns the full lead record including state, county, ' +
      'Medicaid id, Medicare numbers, tagged drugs, tagged pharmacies, and tagged providers. ' +
      'Use this once at the start to ground recommendations in the lead\'s actual profile.',
    schema: inputSchema,
  },
);
