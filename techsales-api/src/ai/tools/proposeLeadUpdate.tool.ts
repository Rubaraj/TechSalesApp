/**
 * Phase B — `propose_lead_update`. WRITE / PROPOSE tool. Atlas proposes
 * changes to a lead's contact fields and persists them as a pending proposal.
 * Executed on approval by the `lead_update` executor, which re-enforces the
 * field allowlist at the write boundary.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';
import { createProposal } from '../../services/atlasSessionService.js';

const updatesSchema = z
  .object({
    firstName: z.string().min(1).optional().describe('Corrected first name.'),
    lastName: z.string().min(1).optional().describe('Corrected last name.'),
    phone: z.string().min(7).optional().describe('New phone number.'),
    email: z.string().email().optional().describe('New email address.'),
    address1: z.string().optional().describe('New street address (line 1).'),
    address2: z.string().optional().describe('New street address (line 2).'),
    city: z.string().optional().describe('New city.'),
    state: z.string().length(2).optional().describe('New state, 2-letter code, e.g. "FL".'),
    county: z.string().optional().describe('New county name.'),
    zipCode: z.string().regex(/^\d{5}$/).optional().describe('New 5-digit zip code.'),
    medicareNumber: z.string().optional().describe('Medicare Beneficiary Identifier (MBI).'),
    medicaidId: z.string().optional().describe('Medicaid ID number.'),
    partADate: z.string().optional().describe('Medicare Part A effective date, YYYY-MM-DD.'),
    partBDate: z.string().optional().describe('Medicare Part B effective date, YYYY-MM-DD.'),
  })
  .describe('Only include the fields being changed.');

const inputSchema = z.object({
  userId: z.string().min(1).describe("The agent's userId. Required."),
  leadId: z.string().min(1).describe('The lead to update, e.g. "LEAD-001".'),
  updates: updatesSchema,
  reason: z
    .string()
    .max(200)
    .optional()
    .describe('One short sentence on why (shown on the Approval Card).'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const proposeLeadUpdateTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const entries = Object.entries(input.updates).filter(
        ([, v]) => typeof v === 'string' && v.trim() !== '',
      );
      if (entries.length === 0) {
        return JSON.stringify({ error: 'No fields to update — provide at least one field in `updates`.' });
      }
      const lead = await repos.lead.findById(input.leadId);
      if (!lead) {
        return JSON.stringify({ error: 'Lead not found', leadId: input.leadId });
      }

      const leadRecord = lead as unknown as Record<string, unknown>;
      const changes: Record<string, { from: unknown; to: string }> = {};
      for (const [field, value] of entries) {
        changes[field] = { from: leadRecord[field] ?? '(empty)', to: (value as string).trim() };
      }

      const proposal = await createProposal({
        userId: input.userId,
        kind: 'lead_update',
        payload: {
          leadId: lead.leadId,
          updates: Object.fromEntries(entries),
          reason: input.reason,
        },
      });

      return JSON.stringify({
        proposalId: proposal.proposalId,
        approvalRequired: true,
        kind: 'lead_update',
        preview: {
          leadId: lead.leadId,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          changes,
          reason: input.reason,
        },
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'propose_lead_update',
    description:
      "Propose updating a lead's details and create a pending PROPOSAL the agent " +
      'must approve before the record changes. NEVER updates directly. Updatable fields: ' +
      'firstName, lastName, phone, email, address1, address2, city, state, county, zipCode, ' +
      'medicareNumber, medicaidId, partADate, partBDate — nothing else (status changes ' +
      'use propose_status_change; notes use append_lead_note). Call this when the agent asks ' +
      'to change lead info (e.g. "update her phone to 555-0100", "his MBI is 1EG4-TE5-MK73").',
    schema: inputSchema,
  },
);
