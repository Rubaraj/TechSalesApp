/**
 * Phase 6 — Per-user (or per-IP) rate limit for /api/ai/*.
 *
 * Mounted on the AI router AFTER the AI_ENABLED guard but BEFORE the route
 * handlers (and BEFORE the daily-token cap, since the in-memory bucket lookup
 * is cheaper than the aiInteractions DB scan).
 *
 * Key resolution order (matches plan §6):
 *   1. body.userId
 *   2. body.memberId
 *   3. req.ip
 *
 * `/api/ai/echo` is exempt — it's the smoke-test endpoint and we don't want
 * test scripts hitting the limit on the way to verifying the pipeline.
 *
 * 429 response shape:
 *   { success: false, error: 'Rate limit exceeded. Try again later.',
 *     code: 'RATE_LIMITED', retryAfterSeconds: number }
 */
import rateLimit, { type Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';

interface MaybeIdentifiedBody {
  userId?: unknown;
  memberId?: unknown;
}

const stringOrUndefined = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

/**
 * Resolve the limiter key from the request body, falling back to the client's
 * IP address. Public so tests / debug code can introspect it if needed.
 */
export function resolveAiLimiterKey(req: Request): string {
  const body = (req.body ?? {}) as MaybeIdentifiedBody;
  const userId = stringOrUndefined(body.userId);
  if (userId) return `user:${userId}`;
  const memberId = stringOrUndefined(body.memberId);
  if (memberId) return `member:${memberId}`;
  // express-rate-limit's default fallback is `req.ip`; we mirror it explicitly
  // so the key prefix is consistent across modes.
  return `ip:${req.ip ?? 'unknown'}`;
}

const handler429: Options['handler'] = (req, res) => {
  // express-rate-limit stamps `req.rateLimit` with the bucket state. The
  // `resetTime` is a Date; round up to whole seconds for Retry-After.
  const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const retryAfterSeconds =
    reset instanceof Date
      ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))
      : Math.ceil(env.AI_RATE_LIMIT_WINDOW_MS / 1000);

  // Both the standard and our payload's Retry-After should agree.
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    success: false,
    error: 'Rate limit exceeded. Try again later.',
    code: 'RATE_LIMITED',
    retryAfterSeconds,
  });
};

export const aiRateLimiter = rateLimit({
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  limit: env.AI_RATE_LIMIT_MAX,
  // Surface the standard `RateLimit-*` headers; suppress the legacy `X-RateLimit-*`
  // ones to keep response headers compact.
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per-user/per-member/per-IP bucketing.
  keyGenerator: (req: Request) => resolveAiLimiterKey(req),
  // /api/ai/echo is the smoke-test endpoint; never rate-limit it.
  skip: (req: Request) => req.path === '/echo' || req.originalUrl.endsWith('/api/ai/echo'),
  handler: handler429,
  // Don't double-count failed (4xx/5xx) responses against the bucket — only
  // successful AI calls should consume quota. (express-rate-limit defaults
  // to counting *all* requests; we relax that here.)
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
}) as unknown as (req: Request, res: Response, next: () => void) => void;
