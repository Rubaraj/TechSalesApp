import { Router, type Request, type Response } from 'express';
import { getDbHealth, isMongoConnected } from '../config/mongo.js';
import { getMode } from '../repositories/registry.js';
import { env } from '../config/env.js';
import { getLlmHealth, type LlmHealthSummary } from '../ai/llm/llmHealth.js';
import type { ServiceResponse } from '../repositories/types.js';

const PROCESS_START = Date.now();

interface HealthPayload {
  mode: 'mongo' | 'json' | 'databricks';
  mongoUp: boolean;
  dbs: {
    app: { name: string; readyState: number };
    lookup: { name: string; readyState: number };
  };
  uptimeSec: number;
  /** Whether /api/ai/* is currently accepting requests (mirrors `AI_ENABLED`). */
  aiEnabled: boolean;
  /** Active LLM provider — `ollama` (free, local), `anthropic` (Claude),
   *  or `stub` (rule-based, Phase 3a — no real LLM). */
  aiProvider: 'ollama' | 'anthropic' | 'stub';
  /** Phase 2 — whether Twilio+Deepgram call pipeline is configured + on. */
  twilioEnabled: boolean;
  /** Gap 7 — passive LLM degradation state (real-call outcomes + probe). */
  llm: LlmHealthSummary;
}

/**
 * GET /api/health (plan §3) — reports the mode the backend booted into.
 * `mongoUp` reflects current driver readyState, but the mode itself is fixed
 * at startup and does not flip based on liveness.
 */
export const healthRouter: Router = Router();

healthRouter.get('/', (_req: Request, res: Response<ServiceResponse<HealthPayload>>) => {
  const dbs = getDbHealth();
  const payload: HealthPayload = {
    mode: getMode(),
    mongoUp: isMongoConnected(),
    dbs,
    uptimeSec: Math.floor((Date.now() - PROCESS_START) / 1000),
    aiEnabled: env.AI_ENABLED,
    aiProvider: env.AI_LLM_PROVIDER,
    twilioEnabled: env.TWILIO_ENABLED,
    llm: getLlmHealth(),
  };
  res.json({ success: true, data: payload });
});
