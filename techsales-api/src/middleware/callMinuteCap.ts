/**
 * Phase 2 — Per-user daily Twilio-call minute cap.
 *
 * Refuses to mint a new Voice Access Token (and refuses SSE analyze
 * subscription) once a user has consumed their daily budget. Prevents a
 * runaway dialer (or compromised browser) from burning the Twilio + Deepgram
 * credits.
 *
 * Counter is in-memory and resets at midnight UTC. A DB-backed version that
 * sums actual completed-call duration will land in a Phase 3 pass when we
 * have the `aiInteraction.kind = 'call_end'` rows to aggregate.
 *
 * Increment happens *outside* this middleware — the Twilio status callback
 * (`POST /api/twilio/status`) calls `incrementMinutesForUser` when a call
 * completes. This middleware only *reads*.
 */
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

interface UsageEntry {
  /** epoch ms when this entry was opened (used to detect midnight reset) */
  openedAt: number;
  minutes: number;
}

const usageByUser = new Map<string, UsageEntry>();

function isSameUtcDay(a: number, b: number): boolean {
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

function getEntry(userId: string): UsageEntry {
  const existing = usageByUser.get(userId);
  const now = Date.now();
  if (!existing || !isSameUtcDay(existing.openedAt, now)) {
    const fresh: UsageEntry = { openedAt: now, minutes: 0 };
    usageByUser.set(userId, fresh);
    return fresh;
  }
  return existing;
}

export function incrementMinutesForUser(userId: string, minutes: number): void {
  const entry = getEntry(userId);
  entry.minutes += minutes;
}

export function getMinutesForUser(userId: string): number {
  return getEntry(userId).minutes;
}

/**
 * Refuses the request when the user has exceeded their daily Twilio-call
 * minute budget. `userId` is read from the AuthContext-equivalent on the
 * server — for now it's the `x-user-id` header set by the FE; Phase 3 will
 * tighten this with a real session middleware.
 *
 * When `TWILIO_ENABLED=false`, this is a no-op (the request is going to be
 * 501'd downstream anyway).
 */
export function callMinuteCap(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!env.TWILIO_ENABLED) {
    next();
    return;
  }

  const cap = env.TWILIO_MAX_DAILY_CALL_MINUTES_PER_USER;
  if (!cap || cap <= 0) {
    next();
    return;
  }

  // userId is sourced from req.body.userId (matches the rest of /api/ai/*).
  const body = (req.body ?? {}) as { userId?: string };
  const userId = body.userId ?? (req.query?.userId as string | undefined);

  if (!userId) {
    // Anonymous calls can't be capped per-user; deny in production, allow in dev.
    if (env.NODE_ENV === 'production') {
      res.status(400).json({
        success: false,
        error: 'userId required for call minute cap',
        code: 'CALL_CAP_MISSING_USER',
      });
      return;
    }
    next();
    return;
  }

  const used = getMinutesForUser(userId);
  if (used >= cap) {
    res.status(429).json({
      success: false,
      error: 'Daily call-minute budget reached. Resets at midnight UTC.',
      code: 'CALL_CAP_EXCEEDED',
      usedMinutes: used,
      capMinutes: cap,
    });
    return;
  }

  next();
}
