/**
 * Call Copilot controllers — Phase 2.
 *
 *   - `postCallToken(req, res)` mints a 1-hour Twilio Voice Access Token for
 *     the browser SDK. Gated by AI guard + rate limit + token cap + per-user
 *     daily call-minute cap.
 *   - `getCallAnalyzeStream(req, res)` is the SSE bridge that the FE
 *     subscribes to once a call is connected. It pipes events from `callBus`
 *     (transcripts now; entities/actions/info-cards in Phase 3+) to the wire
 *     as JSON-encoded SSE records. Closes cleanly on client disconnect.
 */
import type { Request, Response } from 'express';
import type { ServiceResponse } from '../repositories/types.js';
import { mintVoiceAccessToken } from '../services/twilioService.js';
import { subscribe, type CallBusEvent } from '../services/callBus.js';
import { repos } from '../repositories/registry.js';
import type { CallStreamEvent } from '../ai/types/call.types.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

interface CallTokenRequestBody {
  userId?: unknown;
}

interface CallTokenResponseData {
  token: string;
  identity: string;
  expiresAt: number;
  /** Echoed back so the FE can pre-populate the Twilio Device caller ID UI. */
  outboundCallerId: string;
}

export async function postCallToken(
  req: Request,
  res: Response<ServiceResponse<CallTokenResponseData>>,
): Promise<void> {
  if (!env.TWILIO_ENABLED) {
    res.status(501).json({
      success: false,
      error: 'Twilio integration is disabled (TWILIO_ENABLED=false)',
    });
    return;
  }

  const body = (req.body ?? {}) as CallTokenRequestBody;
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    res
      .status(400)
      .json({ success: false, error: '`userId` is required (non-empty string)' });
    return;
  }

  // QA H6 — userId is currently trusted from the request body (matches the
  // existing /api/ai/* pattern of this codebase, no session middleware yet).
  // Defense-in-depth: validate the userId exists and is an active user.
  // Stops random/spoofed userIds from minting tokens; doesn't stop a logged-in
  // user from impersonating another (that needs real session auth — separate
  // task tracked as a security followup).
  try {
    const user = await repos.user.findById(userId);
    if (!user || user.isActive === false) {
      res.status(403).json({
        success: false,
        error: 'Unknown or inactive user',
      });
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, 'User lookup failed during token mint');
    res.status(500).json({ success: false, error: 'User lookup failed' });
    return;
  }

  try {
    const minted = mintVoiceAccessToken({ userId });
    res.json({
      success: true,
      data: {
        token: minted.token,
        identity: minted.identity,
        expiresAt: minted.expiresAt,
        outboundCallerId: env.TWILIO_OUTBOUND_CALLER_ID ?? '',
      },
    });
  } catch (err) {
    logger.error({ err, userId }, 'mintVoiceAccessToken failed');
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to mint Voice Access Token',
    });
  }
}

/**
 * SSE endpoint. The FE opens this once a call connects to receive diarized
 * transcript events. Phase 2 only delivers `transcript` events from
 * `callBus`. Phase 3+ will add `entities`, `actions`, `tool_start/end`, etc.
 *
 * Heartbeat (`: ping`) every 15s so proxies and Cloudflare Tunnel don't
 * idle-close the connection.
 */
export async function getCallAnalyzeStream(req: Request, res: Response): Promise<void> {
  if (!env.TWILIO_ENABLED) {
    res.status(501).json({
      success: false,
      error: 'Twilio integration is disabled (TWILIO_ENABLED=false)',
    });
    return;
  }

  const callSid =
    (req.query.callSid as string | undefined) ??
    (typeof req.body === 'object' && req.body
      ? (req.body as { callSid?: string }).callSid
      : undefined);

  if (!callSid || typeof callSid !== 'string') {
    res.status(400).json({
      success: false,
      error: '`callSid` query parameter is required',
    });
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

  const writeEvent = (data: unknown): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const writeHeartbeat = (): void => {
    res.write(`: ping ${Date.now()}\n\n`);
  };

  const openEvent: CallStreamEvent = { type: 'open', callSid };
  writeEvent(openEvent);
  const heartbeat = setInterval(writeHeartbeat, 15_000);

  // Forward every callBus event for this call to the SSE wire. Translates
  // bus shape → wire shape (the bus has internal 'status' events; the wire
  // has 'call_status').
  const unsubscribe = subscribe(callSid, (busEvent: CallBusEvent) => {
    if (busEvent.type === 'transcript') {
      const wireEvent: CallStreamEvent = { type: 'transcript', chunk: busEvent.chunk };
      writeEvent(wireEvent);
      return;
    }
    if (busEvent.type === 'status') {
      const wireEvent: CallStreamEvent = { type: 'call_status', status: busEvent.status };
      writeEvent(wireEvent);
      // When the call ends, close the SSE stream so the FE knows to clean up.
      if (busEvent.status === 'ended') {
        try {
          res.end();
        } catch {
          // already closed
        }
      }
      return;
    }
    if (busEvent.type === 'error') {
      const wireEvent: CallStreamEvent = { type: 'error', error: busEvent.error };
      writeEvent(wireEvent);
      return;
    }
    // Phase 3a — callAnalysisAgent events.
    if (busEvent.type === 'actions') {
      const wireEvent: CallStreamEvent = { type: 'actions', actions: busEvent.actions };
      writeEvent(wireEvent);
      return;
    }
    if (busEvent.type === 'entities') {
      const wireEvent: CallStreamEvent = { type: 'entities', entities: busEvent.entities };
      writeEvent(wireEvent);
      return;
    }
  });

  const cleanup = (): void => {
    clearInterval(heartbeat);
    unsubscribe();
    logger.debug({ callSid }, 'call analyze SSE closed');
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
}
