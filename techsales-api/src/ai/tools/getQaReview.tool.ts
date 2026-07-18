/**
 * QA pipeline — `get_qa_review`. ADMIN-ONLY Atlas tool: fetch an EXISTING
 * QA scorecard (no re-run, no token spend).
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The requesting user's userId. Required."),
  callSid: z.string().min(1).describe('The call whose scorecard to fetch.'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const getQaReviewTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const user = await repos.user.findById(input.userId);
      if (!user || (user.accessLevel !== 'admin' && user.isSuperAdmin !== true)) {
        return JSON.stringify({ error: 'This tool is only available to admin users.' });
      }
      const record = await repos.callRecord.findByCallSid(input.callSid);
      if (!record) return JSON.stringify({ error: 'No recorded call found for that callSid.' });
      if (!record.qaReview) {
        return JSON.stringify({
          callSid: input.callSid,
          qaReview: null,
          note: 'No QA review yet — use run_qa_review to create one.',
          flagged: record.flagged,
          durationSec: record.durationSec,
        });
      }
      return JSON.stringify({
        callSid: input.callSid,
        agentUserId: record.userId,
        durationSec: record.durationSec,
        flagged: record.flagged,
        ...record.qaReview,
      });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'get_qa_review',
    description:
      'ADMIN ONLY — fetch the existing QA scorecard for a recorded call (does NOT ' +
      're-run the review; free). Returns null qaReview when the call has not been ' +
      'reviewed yet. Non-admin users receive an error.',
    schema: inputSchema,
  },
);
