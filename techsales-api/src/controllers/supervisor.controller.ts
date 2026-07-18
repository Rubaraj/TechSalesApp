/**
 * Ambient Supervisor CoPilot — live SSE feed for admins.
 *
 * GET /api/ai/supervisor/stream?userId=<adminId>
 *
 * On connect: a `snapshot` of active calls; then forwards global bus events
 * (call_started / compliance_flag / call_ended / qa_completed), enriched
 * with agent display names. Skeleton cloned from
 * call.controller.getCallAnalyzeStream (headers / heartbeat / cleanup).
 */
import type { Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { repos } from '../repositories/registry.js';
import {
  subscribeGlobal,
  getActiveCalls,
  type SupervisorEvent,
} from '../services/callBus.js';
import { env } from '../config/env.js';

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const user = await repos.user.findById(userId);
  if (!user) return false;
  return user.accessLevel === 'admin' || user.isSuperAdmin === true;
}

export async function getSupervisorStream(req: Request, res: Response): Promise<void> {
  const userId = String(req.query.userId ?? '');
  if (!(await isAdmin(userId))) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const writeEvent = (data: unknown): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Per-connection agent-name cache so enrichment doesn't hammer the repo.
  const nameCache = new Map<string, string>();
  const agentName = async (id?: string): Promise<string | undefined> => {
    if (!id) return undefined;
    const cached = nameCache.get(id);
    if (cached) return cached;
    const user = await repos.user.findById(id).catch(() => null);
    const name = user ? `${user.firstName} ${user.lastName}`.trim() : id;
    nameCache.set(id, name);
    return name;
  };

  const enrich = async (
    event: SupervisorEvent,
  ): Promise<SupervisorEvent & { agentName?: string }> => {
    const withUser = event as SupervisorEvent & { userId?: string };
    const name = await agentName(withUser.userId);
    return name ? { ...event, agentName: name } : event;
  };

  // Snapshot of active calls on connect (drop entries past the max call
  // duration + grace — belt-and-suspenders against registry ghosts).
  const maxAgeMs = (env.TWILIO_MAX_CALL_DURATION_SECONDS + 60) * 1000;
  const fresh = getActiveCalls().filter((c) => Date.now() - c.startedAt < maxAgeMs);
  const snapshotCalls = await Promise.all(
    fresh.map(async (c) => ({ ...c, agentName: await agentName(c.userId) })),
  );
  writeEvent({ type: 'snapshot', calls: snapshotCalls });

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15_000);

  const unsubscribe = subscribeGlobal((event) => {
    void enrich(event).then(writeEvent);
  });

  const cleanup = (): void => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  };
  req.on('close', cleanup);
  req.on('aborted', cleanup);

  logger.info({ userId }, 'supervisor stream opened');
}
