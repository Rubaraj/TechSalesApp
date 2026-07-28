/**
 * Phase 2.6 — Presence heartbeat controller.
 *
 * Browsers POST `/api/presence/heartbeat` every ~30 s with the signed-in
 * user's id and their current in-call flag. Used by the inbound-call
 * webhook (`/api/twilio/incoming`) to round-robin across available agents.
 *
 * Auth note: we trust the userId from the body, validating it exists +
 * is active via `repos.user.findById` (same pattern as `postCallToken`).
 * A full session-auth layer for /api/* is tracked as a separate followup.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { heartbeat, clearPresence, _debugSnapshot } from '../services/agentPresence.js';
import { repos } from '../repositories/registry.js';
import { logger } from '../config/logger.js';

const HeartbeatBody = z.object({
  userId: z.string().min(1),
  inCall: z.boolean().default(false),
});

export async function postPresenceHeartbeat(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = HeartbeatBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ success: false, error: 'Invalid body', issues: parsed.error.issues });
    return;
  }
  const { userId, inCall } = parsed.data;

  try {
    const user = await repos.user.findById(userId);
    if (!user || user.isActive === false) {
      res.status(403).json({ success: false, error: 'Unknown or inactive user' });
      return;
    }
    // Admins are NOT routable: they have no incoming-call UI, so Twilio's
    // <Dial> to their client identity fails instantly — which used to burn
    // the round-robin turn (and, with auto-screening on, handed the caller
    // to the AI before any real agent rang). Enforced here rather than in
    // the browser so a stale tab can't re-register itself.
    if (user.accessLevel === 'admin' || user.isSuperAdmin) {
      clearPresence(userId);
      res.json({ success: true, data: { routable: false } });
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'presence heartbeat: user lookup failed');
    res.status(500).json({ success: false, error: 'User lookup failed' });
    return;
  }

  heartbeat(userId, inCall);
  res.json({ success: true, data: { routable: true } });
}

/** Dev-only snapshot of the presence registry. Mounted under `/_debug/` so
 *  production routing skips it. Useful for end-to-end round-robin tests. */
export function getPresenceDebugSnapshot(_req: Request, res: Response): void {
  res.json({ success: true, data: _debugSnapshot() });
}
