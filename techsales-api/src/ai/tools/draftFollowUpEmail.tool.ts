/**
 * Phase 4 (M3) — `draft_follow_up_email`. WRITE / PROPOSE tool. Atlas drafts
 * a follow-up email for a lead and persists it as a pending proposal. The FE
 * renders an Approval Card; on Approve, the agent POSTs `/api/ai/atlas/
 * approvals/:proposalId` and we mock-send the email (audit only — no real
 * SMTP send in the POC).
 *
 * The email body is templated with the lead's first name + agent's first name
 * + a tone-specific opening. No second LLM call here — that's a Phase 4b
 * upgrade. Keeps cost predictable: $0 per draft.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';
import { createProposal } from '../../services/atlasSessionService.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe('The agent\'s userId. Required.'),
  leadId: z.string().min(1).describe('The lead to email, e.g. "LEAD-001".'),
  tone: z
    .enum(['warm', 'formal', 'urgent'])
    .optional()
    .default('warm')
    .describe('Email tone. Defaults to warm.'),
  customNote: z
    .string()
    .max(300)
    .optional()
    .describe(
      'Optional 1-2 sentence note from the agent to weave in (e.g. specific topic discussed).',
    ),
});

type ToolInput = z.infer<typeof inputSchema>;

const TONE_OPENERS: Record<string, string> = {
  warm: 'Hi {first}, hope you\'re having a great day.',
  formal: 'Dear {first},',
  urgent: 'Hi {first}, following up on something time-sensitive.',
};

const TONE_CLOSERS: Record<string, string> = {
  warm: 'Looking forward to chatting again.',
  formal: 'I appreciate your time and look forward to your response.',
  urgent: 'Please let me know as soon as you can.',
};

export const draftFollowUpEmailTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const lead = await repos.lead.findById(input.leadId);
      if (!lead) {
        return JSON.stringify({ error: 'Lead not found', leadId: input.leadId });
      }
      const agent = await repos.user.findById(input.userId);
      const agentName = agent ? `${agent.firstName} ${agent.lastName}`.trim() : 'your agent';

      const opener = (TONE_OPENERS[input.tone ?? 'warm'] ?? TONE_OPENERS.warm).replace(
        '{first}',
        lead.firstName,
      );
      const closer = TONE_CLOSERS[input.tone ?? 'warm'] ?? TONE_CLOSERS.warm;
      const noteLine = input.customNote ? `\n\n${input.customNote}\n` : '';

      const subject = `Following up — ${lead.firstName}, your Medicare options`;
      const body =
        `${opener}\n\n` +
        `I wanted to circle back on the Medicare options we discussed. I'm happy to ` +
        `answer any questions you have, walk through specific plans, or set up a time ` +
        `to compare what's available in your area.` +
        `${noteLine}\n` +
        `${closer}\n\n` +
        `— ${agentName}`;

      const proposal = await createProposal({
        userId: input.userId,
        kind: 'email',
        payload: {
          leadId: lead.leadId,
          to: lead.email,
          subject,
          body,
        },
      });

      return JSON.stringify({
        proposalId: proposal.proposalId,
        approvalRequired: true,
        kind: 'email',
        preview: {
          to: lead.email,
          subject,
          body,
        },
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'draft_follow_up_email',
    description:
      'Draft a follow-up email for a lead and create a pending PROPOSAL the agent ' +
      'must approve before it is sent. NEVER sends directly. Returns a proposalId + ' +
      'preview the FE renders as an Approval Card. Tones: warm | formal | urgent.',
    schema: inputSchema,
  },
);
