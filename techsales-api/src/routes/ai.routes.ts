/**
 * /api/ai/* router. Every route is gated behind the `AI_ENABLED` env flag —
 * when off, the entire surface returns 501 with a structured error code
 * (`AI_DISABLED`) so the frontend can render a clean "AI is off" UI without
 * relying on free-text matching.
 *
 * Phase 6 hardening — middleware order:
 *   /api/ai/stats  ←─ skips the entire AI guard chain (read-only metrics)
 *   AI_ENABLED guard  →  rateLimit  →  tokenCap  →  route handlers
 *
 * Stats is mounted FIRST so the AI_ENABLED guard / rate-limit / token-cap
 * never short-circuit a metrics request.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { aiRateLimiter } from '../middleware/rateLimit.js';
import { aiDailyTokenCap } from '../middleware/tokenCap.js';
import {
  postEcho,
  recommendHandler,
  explainHandler,
  searchHandler,
  compareHandler,
  drugCoverageHandler,
  chatHandler,
  aiStatsHandler,
} from '../controllers/ai.controller.js';
import {
  postAtlasChat,
  getAtlasSession,
  deleteAtlasSession,
  postAtlasApproval,
  getAtlasGreeting,
} from '../controllers/atlas.controller.js';
import { callRouter } from './call.routes.js';
import { listQaCalls, getQaCall, postQaReview } from '../controllers/callQa.controller.js';
import { getSupervisorStream } from '../controllers/supervisor.controller.js';
import { getCostAnalysis } from '../controllers/aiCost.controller.js';
import { env } from '../config/env.js';

export const aiRouter: Router = Router();

// Read-only metrics endpoint — mounted BEFORE the AI_ENABLED guard so it works
// regardless of whether AI is currently switched on. Pure aggregation over the
// existing aiInteractions audit log.
aiRouter.get('/stats', asyncHandler(aiStatsHandler));

// Phase 4 — Atlas non-LLM endpoints (greeting, session load, approvals).
// Mounted BEFORE the rate-limit + tokenCap chain so they remain responsive
// even when an agent has burned through their daily token budget.
aiRouter.get('/atlas/session/:userId', asyncHandler(getAtlasSession));
aiRouter.delete('/atlas/session/:userId', asyncHandler(deleteAtlasSession));
aiRouter.get('/atlas/greeting/:userId', asyncHandler(getAtlasGreeting));
aiRouter.post('/atlas/approvals/:proposalId', asyncHandler(postAtlasApproval));

// QA pipeline + Supervisor CoPilot — always-on admin reads (LLM-free),
// mounted BEFORE the AI_ENABLED guard like /stats. The review POST (spends
// tokens) is mounted after the guard chain below.
aiRouter.get('/qa/calls', asyncHandler(listQaCalls));
aiRouter.get('/qa/calls/:callSid', asyncHandler(getQaCall));
aiRouter.get('/supervisor/stream', asyncHandler(getSupervisorStream));
// AI cost analysis — admin-gated aggregation over the audit log (LLM-free).
aiRouter.get('/cost-analysis', asyncHandler(getCostAnalysis));

aiRouter.use((_req: Request, res: Response, next: NextFunction) => {
  if (!env.AI_ENABLED) {
    res.status(501).json({
      success: false,
      error: 'AI features are disabled',
      code: 'AI_DISABLED',
    });
    return;
  }
  next();
});

// Per-user/per-IP bucket. /echo is exempt internally.
aiRouter.use(aiRateLimiter);

// Daily token cap. Cheap-ish (one Mongo aggregate); runs after rate-limit.
aiRouter.use(asyncHandler(aiDailyTokenCap));

aiRouter.post('/echo', asyncHandler(postEcho));
aiRouter.post('/recommend', asyncHandler(recommendHandler));
aiRouter.post('/explain', asyncHandler(explainHandler));
aiRouter.post('/search', asyncHandler(searchHandler));
aiRouter.post('/compare', asyncHandler(compareHandler));
aiRouter.post('/drug-coverage', asyncHandler(drugCoverageHandler));
aiRouter.post('/chat', asyncHandler(chatHandler));

// Phase 4 — Atlas chat (LLM-driven; gated by rate-limit + tokenCap above).
aiRouter.post('/atlas/chat', asyncHandler(postAtlasChat));

// QA pipeline — on-demand LLM review (token-spending; behind the guard chain).
aiRouter.post('/qa/review/:callSid', asyncHandler(postQaReview));

// Phase 2 — Live Call Copilot (Twilio + Deepgram).
aiRouter.use('/call', callRouter);
