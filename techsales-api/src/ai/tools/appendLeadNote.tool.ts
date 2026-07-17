/**
 * Phase B — `append_lead_note`. WRITE / PROPOSE tool. Atlas proposes adding a
 * note to a lead's record. Executed on approval by the `note` executor, which
 * APPENDS to the existing notes (never replaces — same contract as the call
 * copilot's post-call add_note actions) with an [Atlas <date>] stamp.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';
import { createProposal } from '../../services/atlasSessionService.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The agent's userId. Required."),
  leadId: z.string().min(1).describe('The lead to add the note to, e.g. "LEAD-001".'),
  note: z
    .string()
    .min(3)
    .max(500)
    .describe('The note text, 1-3 sentences. Will be appended to existing notes, never replacing them.'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const appendLeadNoteTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const lead = await repos.lead.findById(input.leadId);
      if (!lead) {
        return JSON.stringify({ error: 'Lead not found', leadId: input.leadId });
      }

      const proposal = await createProposal({
        userId: input.userId,
        kind: 'note',
        payload: {
          leadId: lead.leadId,
          note: input.note.trim(),
        },
      });

      return JSON.stringify({
        proposalId: proposal.proposalId,
        approvalRequired: true,
        kind: 'note',
        preview: {
          leadId: lead.leadId,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          note: input.note.trim(),
        },
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'append_lead_note',
    description:
      "Propose appending a note to a lead's record and create a pending PROPOSAL the agent " +
      'must approve first. Notes are APPENDED with a date stamp — existing notes are never ' +
      'overwritten. Call this when the agent asks to note something down on a lead ' +
      '(e.g. "note that Joshua prefers afternoon calls", "add a note: asked about dental").',
    schema: inputSchema,
  },
);
