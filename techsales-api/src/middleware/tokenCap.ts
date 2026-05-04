/**
 * Phase 6 — Daily AI token cap.
 *
 * Sums non-cached input + output tokens across the last 24h for
 * `provider:'anthropic'` aiInteractions and refuses the request with 429
 * `TOKEN_CAP_EXCEEDED` when the total has already crossed
 * `env.AI_MAX_DAILY_TOKENS`. The cap protects the Anthropic Max subscription
 * from runaway agent loops.
 *
 * This middleware is mounted AFTER the rate-limiter so the cheap in-memory
 * bucket check happens first.
 *
 *   tokensUsed = SUM(tokensIn) + SUM(tokensOut) - SUM(cachedInputTokens)
 *
 * The subtraction avoids double-counting: cachedInputTokens are billed at a
 * lower rate by Anthropic but still appear in tokensIn, so they shouldn't
 * also count against the cap. (cachedReadTokens are read-from-cache hits and
 * are not added to tokensIn by the SDK, so we leave them alone.)
 *
 * Failures during the count query are non-fatal: we log and let the request
 * through, because we'd rather over-serve than 500 a user on a transient DB
 * blip.
 */
import type { Request, Response, NextFunction } from 'express';
import { repos } from '../repositories/registry.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function aiDailyTokenCap(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Echo is exempt — same rationale as rateLimit.
  if (req.path === '/echo' || req.originalUrl.endsWith('/api/ai/echo')) {
    next();
    return;
  }

  const cap = env.AI_MAX_DAILY_TOKENS;
  if (!cap || cap <= 0) {
    next();
    return;
  }

  const sinceMs = Date.now() - ONE_DAY_MS;
  let usedTokens = 0;
  try {
    usedTokens = await repos.aiInteraction.sumTokens('anthropic', sinceMs);
  } catch (err) {
    logger.error({ err }, 'Daily token-cap query failed; allowing request through');
    next();
    return;
  }

  if (usedTokens > cap) {
    res.status(429).json({
      success: false,
      error: 'Daily AI token cap reached. Please try again tomorrow.',
      code: 'TOKEN_CAP_EXCEEDED',
      usedTokens,
      capTokens: cap,
    });
    return;
  }

  next();
}
