/**
 * QA pipeline — `get_team_calls`. ADMIN-ONLY Atlas tool: the recorded-call
 * review queue (compact — no transcripts).
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { repos } from '../../repositories/registry.js';

const inputSchema = z.object({
  userId: z.string().min(1).describe("The requesting user's userId. Required."),
  flaggedOnly: z
    .boolean()
    .optional()
    .describe('Only calls with compliance flags (the review queue). Default false.'),
  agentUserId: z.string().optional().describe('Filter to one agent\'s calls.'),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

type ToolInput = z.infer<typeof inputSchema>;

export const getTeamCallsTool = tool(
  async (input: ToolInput): Promise<string> => {
    try {
      const user = await repos.user.findById(input.userId);
      if (!user || (user.accessLevel !== 'admin' && user.isSuperAdmin !== true)) {
        return JSON.stringify({ error: 'This tool is only available to admin users.' });
      }
      const calls = await repos.callRecord.list({
        ...(input.flaggedOnly ? { flaggedOnly: true } : {}),
        ...(input.agentUserId ? { userId: input.agentUserId } : {}),
        limit: input.limit,
      });
      const agentNames = new Map<string, string>();
      const rows = [];
      for (const c of calls) {
        let agentName = c.userId ?? 'unknown';
        if (c.userId) {
          if (!agentNames.has(c.userId)) {
            const u = await repos.user.findById(c.userId).catch(() => null);
            agentNames.set(c.userId, u ? `${u.firstName} ${u.lastName}`.trim() : c.userId);
          }
          agentName = agentNames.get(c.userId) ?? c.userId;
        }
        const tagCounts: Record<string, number> = {};
        for (const t of c.tags ?? []) tagCounts[t.kind] = (tagCounts[t.kind] ?? 0) + 1;
        rows.push({
          callSid: c.callSid,
          agent: agentName,
          direction: c.direction,
          startedAt: c.startedAt,
          durationSec: c.durationSec,
          flagged: c.flagged,
          tagCounts,
          qaScore: c.qaReview?.overallScore ?? null,
        });
      }
      return JSON.stringify({ total: rows.length, calls: rows });
    } catch (err) {
      return JSON.stringify({ error: String(err) });
    }
  },
  {
    name: 'get_team_calls',
    description:
      'ADMIN ONLY — list recorded team calls (review queue). Returns per call: agent, ' +
      'direction, start, duration, compliance-flagged status, tag counts, and QA score ' +
      'when reviewed. Use flaggedOnly:true for "show flagged calls". Non-admin users ' +
      'receive an error.',
    schema: inputSchema,
  },
);
