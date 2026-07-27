/**
 * QA pipeline — supervisor endpoints over persisted call records.
 *
 *   GET  /api/ai/qa/calls           list (review queue; no transcript lines)
 *   GET  /api/ai/qa/calls/:callSid  full record incl. transcript + tags
 *   POST /api/ai/qa/review/:callSid run the shared QA evaluator
 *
 * Admin gate: POC posture — the caller passes their userId and we verify
 * accessLevel === 'admin' || isSuperAdmin. Spoofable by construction (no
 * session auth in this app yet); documented follow-up.
 */
import type { Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { repos } from '../repositories/registry.js';
import { friendlyLlmError } from '../ai/llm/friendlyError.js';
import { resolveAgentName, resolveAgentNames } from '../services/agentNameCache.js';
import {
  runQaReview,
  QaReviewConflictError,
  QaReviewNotFoundError,
} from '../ai/qa/runQaReview.js';

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await repos.user.findById(userId);
  if (!user) return false;
  return user.accessLevel === 'admin' || user.isSuperAdmin === true;
}

export async function listQaCalls(req: Request, res: Response): Promise<void> {
  const userId = String(req.query.userId ?? '');
  if (!(await isAdmin(userId))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const calls = await repos.callRecord.list({
    flaggedOnly: req.query.flaggedOnly === 'true',
    ...(req.query.agentUserId ? { userId: String(req.query.agentUserId) } : {}),
    ...(req.query.limit ? { limit: Number(req.query.limit) } : {}),
  });
  const names = await resolveAgentNames(calls.map((c) => c.userId));
  const enriched = calls.map((c) => ({
    ...c,
    ...(c.userId && names.has(c.userId) ? { agentName: names.get(c.userId) } : {}),
  }));
  res.json({ success: true, data: { total: enriched.length, calls: enriched } });
}

/** Training simulator — trainees may read/score their OWN practice
 *  sessions; everything else stays admin-only. */
function ownsSimRecord(
  record: { simulated?: boolean; userId?: string } | null,
  userId: string,
): boolean {
  return !!record && record.simulated === true && !!userId && record.userId === userId;
}

export async function getQaCall(req: Request, res: Response): Promise<void> {
  const userId = String(req.query.userId ?? '');
  const record = await repos.callRecord.findByCallSid(String(req.params.callSid));
  // Missing record → 404 for everyone: the trainee's post-session poll
  // relies on 404-means-retry while persistence catches up.
  if (!record) {
    res.status(404).json({ success: false, error: 'Call record not found' });
    return;
  }
  if (!(await isAdmin(userId)) && !ownsSimRecord(record, userId)) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  const agentName = await resolveAgentName(record.userId);
  res.json({ success: true, data: { ...record, ...(agentName ? { agentName } : {}) } });
}

export async function postQaReview(req: Request, res: Response): Promise<void> {
  const userId = String((req.body as { userId?: string } | undefined)?.userId ?? '');
  if (!(await isAdmin(userId))) {
    const record = await repos.callRecord.findByCallSid(String(req.params.callSid));
    if (!ownsSimRecord(record, userId)) {
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
  }
  try {
    const result = await runQaReview(String(req.params.callSid), userId);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof QaReviewNotFoundError) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    if (err instanceof QaReviewConflictError) {
      res.status(409).json({ success: false, error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    // Stub provider (no LLM) surfaces as a clean 503, other failures 500.
    // Users get friendly copy; the raw error goes to the log.
    logger.error({ err, callSid: req.params.callSid }, 'QA review failed');
    const status = msg.includes('AI_LLM_PROVIDER=stub') ? 503 : 500;
    res.status(status).json({ success: false, error: friendlyLlmError(err) });
  }
}
