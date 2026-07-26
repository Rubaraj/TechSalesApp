/**
 * QA pipeline — `run_qa_review`. ADMIN-ONLY Atlas tool wrapping the SAME
 * shared evaluator the supervisor dashboard button uses (ai/qa/runQaReview).
 * Enforcement is the in-tool access check — prompt guidance is advisory.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';
import { friendlyLlmError } from '../llm/friendlyError.js';
import {
  runQaReview,
  QaReviewConflictError,
  QaReviewNotFoundError,
} from '../qa/runQaReview.js';

async function isAdmin(userId: string): Promise<boolean> {
  const user = await repos.user.findById(userId);
  return !!user && (user.accessLevel === 'admin' || user.isSuperAdmin === true);
}

const inputSchema = z.object({
  userId: z.string().min(1).describe("The requesting user's userId. Required."),
  callSid: z.string().min(1).describe('The call to review, e.g. "QA-TEST-1".'),
});

type ToolInput = z.infer<typeof inputSchema>;

export const runQaReviewTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      if (!(await isAdmin(input.userId))) {
        return JSON.stringify({ error: 'This tool is only available to admin users.' });
      }
      const result = await runQaReview(input.callSid, input.userId);
      return JSON.stringify({
        callSid: input.callSid,
        ...result.scorecard,
        reviewedAt: result.reviewedAt,
        model: result.model,
      });
    } catch (err) {
      if (err instanceof QaReviewNotFoundError) {
        return JSON.stringify({ error: `No recorded call found for that callSid.` });
      }
      if (err instanceof QaReviewConflictError) {
        return JSON.stringify({ error: 'A QA review is already running for this call.' });
      }
      return JSON.stringify({ error: friendlyLlmError(err) });
    }
  },
  {
    name: 'run_qa_review',
    description:
      'ADMIN ONLY — run the LLM QA review on a recorded call and get the scorecard ' +
      '(overall + per-dimension scores against the supervisor-configured rubric, ' +
      'strengths, coaching points, disclosure checklist). Costs tokens; re-running ' +
      'overwrites. Non-admin users receive an error. Use get_team_calls first to find callSids.',
    schema: inputSchema,
  },
);
