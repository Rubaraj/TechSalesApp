/**
 * Phase 4 (M3) — Atlas chat + approvals + greeting SSE endpoints.
 *
 *   POST /api/ai/atlas/chat         — main agentic chat (SSE stream)
 *   GET  /api/ai/atlas/session/:userId  — load last N turns for hydration
 *   DELETE /api/ai/atlas/session/:userId — clear a user's session
 *   POST /api/ai/atlas/approvals/:proposalId — approve / reject a write proposal
 *   GET  /api/ai/atlas/greeting/:userId — personalized session-start greeting
 *                                          (templated; NO LLM call)
 *
 * Greeting + approvals bypass tokenCap (no LLM). Chat goes through tokenCap.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { repos } from '../repositories/registry.js';
import { proposalExecutors } from '../services/proposalExecutors.js';
import {
  streamAtlasAgent,
  type AtlasStreamEvent,
} from '../ai/agents/atlasAgent.js';
import {
  getSessionMessages,
  appendSessionMessage,
  clearSession,
  findProposalById,
  recordProposalDecision,
} from '../services/atlasSessionService.js';

const ContextSchema = z.object({
  route: z.string().default('/dashboard'),
  leadId: z.string().optional(),
  callSid: z.string().optional(),
  // 'silent' was merged into 'assist' — still accepted from stale clients
  // (mode persists in localStorage) and coerced rather than 400ing.
  mode: z
    .enum(['silent', 'assist', 'auto'])
    .default('assist')
    .transform((m): 'assist' | 'auto' => (m === 'silent' ? 'assist' : m)),
});

const ChatBodySchema = z.object({
  userId: z.string().min(1),
  message: z.string().min(1).max(4000),
  context: ContextSchema.default({ route: '/dashboard', mode: 'assist' }),
});

/**
 * POST /api/ai/atlas/chat — streaming SSE.
 */
export async function postAtlasChat(req: Request, res: Response): Promise<void> {
  if (!env.ATLAS_ENABLED) {
    res
      .status(501)
      .json({ success: false, error: 'Atlas is disabled', code: 'ATLAS_DISABLED' });
    return;
  }

  const parsed = ChatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ success: false, error: 'Invalid body', issues: parsed.error.issues });
    return;
  }
  const { userId, message, context } = parsed.data;

  // Validate user.
  const user = await repos.user.findById(userId);
  if (!user) {
    res.status(403).json({ success: false, error: 'Unknown user' });
    return;
  }

  // SSE headers.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const writeEvent = (data: AtlasStreamEvent): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  // Load history.
  const history = await getSessionMessages(userId, 20);

  // Persist the user message immediately.
  await appendSessionMessage(userId, {
    role: 'user',
    content: message,
    ts: Date.now(),
  });

  // Build dynamic prompt context (pipeline summary added if cheap).
  let pipelineSummary: { total: number; byStatus: Record<string, number> } | undefined;
  try {
    const myLeads = await repos.lead.findByAssignedTo(userId);
    const byStatus: Record<string, number> = {};
    for (const l of myLeads) {
      byStatus[l.leadStatus] = (byStatus[l.leadStatus] ?? 0) + 1;
    }
    pipelineSummary = { total: myLeads.length, byStatus };
  } catch (err) {
    logger.debug({ err, userId }, 'atlas: pipeline summary precompute failed');
  }

  let finalContent = '';
  const turnCards: Array<{ card: string; tool: string; data: unknown; ts: number }> = [];

  try {
    const stream = streamAtlasAgent(
      {
        userId,
        userMessage: message,
        history,
        context: {
          user: {
            userId: user.userId,
            firstName: user.firstName ?? 'there',
            lastName: user.lastName,
            role: user.accessLevel,
          },
          page: { route: context.route, ...(context.leadId ? { leadId: context.leadId } : {}) },
          mode: context.mode,
          today: new Date().toISOString().slice(0, 10),
          ...(pipelineSummary ? { pipelineSummary } : {}),
        },
      },
      ac.signal,
    );

    for await (const event of stream) {
      if (event.type === 'final') {
        finalContent = event.content;
      }
      // Rich-chat — collect display cards so they persist with the turn.
      if (event.type === 'display_card') {
        turnCards.push({ card: event.card, tool: event.tool, data: event.data, ts: Date.now() });
      }
      writeEvent(event);
    }
  } catch (err) {
    writeEvent({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }

  // Persist the assistant turn. Card-only turns (no text) persist too —
  // the agent's historyToMessages filters empty-content messages before
  // they reach the model.
  if (finalContent || turnCards.length > 0) {
    await appendSessionMessage(userId, {
      role: 'assistant',
      content: finalContent,
      ts: Date.now(),
      ...(turnCards.length > 0 ? { cards: turnCards } : {}),
    });
  }

  res.end();
}

/** GET /api/ai/atlas/session/:userId — load session for hydration. */
export async function getAtlasSession(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId ?? '');
  if (!userId) {
    res.status(400).json({ success: false, error: 'userId required' });
    return;
  }
  const messages = await getSessionMessages(userId, 20);
  res.json({ success: true, data: { messages } });
}

/** DELETE /api/ai/atlas/session/:userId — clear session. */
export async function deleteAtlasSession(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = String(req.params.userId ?? '');
  if (!userId) {
    res.status(400).json({ success: false, error: 'userId required' });
    return;
  }
  await clearSession(userId);
  res.json({ success: true });
}

const ApprovalBodySchema = z.object({
  decision: z.enum(['approve', 'reject']),
  userId: z.string().min(1),
});

/** POST /api/ai/atlas/approvals/:proposalId — execute or decline a proposal. */
export async function postAtlasApproval(
  req: Request,
  res: Response,
): Promise<void> {
  const proposalId = String(req.params.proposalId ?? '');
  if (!proposalId) {
    res.status(400).json({ success: false, error: 'proposalId required' });
    return;
  }
  const parsed = ApprovalBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ success: false, error: 'Invalid body', issues: parsed.error.issues });
    return;
  }
  const { decision, userId } = parsed.data;

  const proposal = await findProposalById(proposalId);
  if (!proposal) {
    res.status(404).json({ success: false, error: 'Proposal not found' });
    return;
  }
  if (proposal.userId !== userId) {
    res.status(403).json({ success: false, error: 'Proposal does not belong to this user' });
    return;
  }
  if (proposal.decision) {
    res.json({
      success: true,
      data: { alreadyDecided: true, decision: proposal.decision, result: proposal.result },
    });
    return;
  }

  let result: Record<string, unknown> | undefined;

  if (decision === 'approve') {
    // Phase B — executors live in the kind→executor registry; adding a write
    // capability no longer touches this controller.
    try {
      const executor = proposalExecutors[proposal.kind];
      result = executor
        ? await executor(proposal.payload as Record<string, unknown>, userId)
        : { error: `no executor for kind "${proposal.kind}"` };
    } catch (err) {
      logger.error({ err, proposalId }, 'Atlas approval execution failed');
      result = { error: String(err) };
    }
  }

  const updatedProposal = await recordProposalDecision(proposalId, decision, result);
  res.json({
    success: true,
    data: { decision, result, proposal: updatedProposal },
  });
}

/** GET /api/ai/atlas/greeting/:userId — personalized greeting (NO LLM). */
export async function getAtlasGreeting(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = String(req.params.userId ?? '');
  if (!userId) {
    res.status(400).json({ success: false, error: 'userId required' });
    return;
  }
  const user = await repos.user.findById(userId);
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  const myLeads = await repos.lead.findByAssignedTo(userId).catch(() => []);
  const byStatus: Record<string, number> = {};
  for (const l of myLeads) {
    byStatus[l.leadStatus] = (byStatus[l.leadStatus] ?? 0) + 1;
  }
  const total = myLeads.length;
  const newCount = byStatus['New Lead'] ?? 0;
  const apptCount = byStatus['Appointment Schedule'] ?? 0;

  const firstName = user.firstName ?? 'there';
  const greeting =
    `Hey ${firstName} — welcome back. ` +
    (total === 0
      ? `You don't have any leads assigned yet. Ask me to help you find or create one.`
      : `You have ${total} active leads` +
        (newCount > 0 ? `, including ${newCount} new this week` : '') +
        (apptCount > 0 ? ` and ${apptCount} appointments to follow up on` : '') +
        '.');

  const suggestedPrompts: string[] = [];
  if (total > 0) {
    suggestedPrompts.push('Show me my pipeline by status');
    if (apptCount > 0) suggestedPrompts.push('Help me prep for my upcoming appointments');
  }
  suggestedPrompts.push('Find leads in Florida that need follow-up');
  suggestedPrompts.push("What's a CSNP plan and who qualifies?");

  res.json({
    success: true,
    data: {
      greeting,
      suggestedPrompts,
      stats: { total, byStatus },
    },
  });
}
