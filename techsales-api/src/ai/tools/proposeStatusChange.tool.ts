/**
 * Phase A — `propose_status_change`. WRITE / PROPOSE tool. Atlas proposes a
 * lead status change and persists it as a pending proposal. The FE renders an
 * Approval Card; on Approve, the controller's existing `kind: 'status'`
 * executor calls `repos.lead.update` — the execution side shipped in M3, this
 * tool is the missing entry point.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';
import { createProposal } from '../../services/atlasSessionService.js';

/** Mirrors the LeadStatus union used by the FE and seed data. */
const LEAD_STATUSES = [
  'New Lead',
  'Contacted Lead',
  'Appointment Schedule',
  'Enrollment in progress',
  'Enrolled',
  'Dropped / Lost lead',
] as const;

const inputSchema = z.object({
  userId: z.string().min(1).describe("The agent's userId. Required."),
  leadId: z.string().min(1).describe('The lead to update, e.g. "LEAD-001".'),
  newStatus: z
    .enum(LEAD_STATUSES)
    .describe('The status to move the lead to. Must be one of the fixed set.'),
  reason: z
    .string()
    .max(200)
    .optional()
    .describe(
      'One short sentence on why (e.g. "spoke on the phone today, wants to enroll"). Shown on the Approval Card.',
    ),
});

type ToolInput = z.infer<typeof inputSchema>;

export const proposeStatusChangeTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const lead = await repos.lead.findById(input.leadId);
      if (!lead) {
        return JSON.stringify({ error: 'Lead not found', leadId: input.leadId });
      }
      if (lead.leadStatus === input.newStatus) {
        return JSON.stringify({
          error: `Lead is already in status "${input.newStatus}" — no change needed.`,
          leadId: input.leadId,
        });
      }

      const proposal = await createProposal({
        userId: input.userId,
        kind: 'status',
        payload: {
          leadId: lead.leadId,
          newStatus: input.newStatus,
          previousStatus: lead.leadStatus,
          reason: input.reason,
        },
      });

      return JSON.stringify({
        proposalId: proposal.proposalId,
        approvalRequired: true,
        kind: 'status',
        preview: {
          leadId: lead.leadId,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          from: lead.leadStatus,
          to: input.newStatus,
          reason: input.reason,
        },
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'propose_status_change',
    description:
      "Propose moving a lead to a different pipeline status and create a pending PROPOSAL " +
      'the agent must approve before the record changes. NEVER updates directly. Valid ' +
      `statuses: ${LEAD_STATUSES.join(' | ')}. Returns a proposalId + preview the FE ` +
      'renders as an Approval Card. Call this when the agent asks to update, move, or ' +
      'change a lead\'s status (e.g. "mark John as contacted", "move LEAD-001 to enrolled").',
    schema: inputSchema,
  },
);
