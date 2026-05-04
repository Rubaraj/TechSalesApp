/**
 * `get_member_plan` — fetches a member's enrolled plan info via the registry
 * `member` repo. Used by the Phase 5 chat agent. Implemented now since the
 * surface area is small.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  memberId: z.string().min(1).describe('The member identifier, e.g. "MBR-001".'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const getMemberPlanTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const member = await repos.member.findById(input.memberId);
      if (!member) {
        return JSON.stringify({ error: 'Member not found', memberId: input.memberId });
      }
      return JSON.stringify({
        memberId: member.memberId,
        firstName: member.firstName,
        lastName: member.lastName,
        planId: member.planId,
        carrier: member.carrier,
        enrollmentDate: member.enrollmentDate,
      });
    } catch (err) {
      return JSON.stringify({ ok: false, error: String(err) });
    }
  },
  {
    name: 'get_member_plan',
    description:
      'Fetch a member by id and return their enrolled plan summary (planId, carrier, ' +
      'enrollment date, name). Use when answering member-side questions about their plan.',
    schema: inputSchema,
  },
);
