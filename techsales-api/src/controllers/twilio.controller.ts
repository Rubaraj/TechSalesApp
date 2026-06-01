/**
 * Twilio webhook controllers — Phase 2.
 *
 *   POST /api/twilio/voice   → TwiML for an outbound dial originated by the
 *                              browser Voice SDK. Includes <Start><Stream>
 *                              with track="both_tracks" so the Media Stream
 *                              WS receiver gets both legs.
 *   POST /api/twilio/status  → Call lifecycle webhook (ringing, in-progress,
 *                              completed). Currently logs + would update the
 *                              call-minute usage in a follow-up.
 */
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { incrementMinutesForUser } from '../middleware/callMinuteCap.js';

// E.164 — `+` followed by 1-15 digits. Reject anything else before we hand it
// back as a <Number> child to <Dial>; otherwise an attacker forging a webhook
// could redirect dials to premium-rate or international numbers.
const E164_PATTERN = /^\+[1-9]\d{1,14}$/;

function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Outbound dial webhook. Twilio POSTs this when the browser SDK requests an
 * outbound call. We respond with TwiML that:
 *   1. Starts a Media Stream piping both legs (track="both_tracks") to our
 *      WS endpoint — that's how Deepgram gets audio for transcription.
 *   2. Dials the target number with a server-side duration cap.
 *
 * The Voice Access Token's `identity` field is delivered to us as
 * `Caller=client:agent_<userId>`. We stash the userId on the `<Stream>` via
 * customParameters so the Media Stream WS handler knows whose call it is
 * (used later for per-user minute accounting in the status webhook).
 */
export function twilioVoiceWebhook(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, string>;
  const to = (body.To ?? '').trim();

  // Parse userId from Twilio's `Caller=client:agent_<userId>` field. Voice
  // Access Tokens set identity=agent_<userId> in twilioService.mintVoiceAccessToken.
  const caller = (body.Caller ?? '').trim();
  const userIdMatch = caller.match(/^client:agent_(.+)$/);
  const userId = userIdMatch?.[1] ?? '';

  // Sanity checks. A forged webhook could put arbitrary content in `To`.
  if (!to || !isValidE164(to)) {
    logger.warn({ to }, 'Twilio voice webhook: invalid or missing `To`');
    res
      .status(400)
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>');
    return;
  }

  const callerId = env.TWILIO_OUTBOUND_CALLER_ID ?? '';
  if (!callerId || !isValidE164(callerId)) {
    logger.error(
      { callerId },
      'TWILIO_OUTBOUND_CALLER_ID invalid; refusing to generate TwiML',
    );
    res
      .status(500)
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>');
    return;
  }

  // PUBLIC_BASE_URL is asserted required when TWILIO_ENABLED=true. WSS protocol
  // for Twilio Media Stream; cloudflared terminates TLS upstream.
  const base = (env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '').replace(/^https?/, 'wss');
  const streamUrl = `${base}/ws/twilio-media`;
  const timeLimit = env.TWILIO_MAX_CALL_DURATION_SECONDS;

  // userId stashed in customParameters so the WS handler can attribute audio
  // to the right user. Twilio passes these through as `Parameter` elements
  // in the `start` event payload.
  const userIdParam = userId
    ? `<Parameter name="userId" value="${escapeXml(userId)}"/>`
    : '';
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Start>` +
    `<Stream url="${escapeXml(streamUrl)}" track="both_tracks">` +
    userIdParam +
    `</Stream>` +
    `</Start>` +
    `<Dial callerId="${escapeXml(callerId)}" timeLimit="${timeLimit}">` +
    `<Number>${escapeXml(to)}</Number>` +
    `</Dial>` +
    `</Response>`;

  res.type('text/xml').send(twiml);
}

/**
 * Call lifecycle webhook. Twilio POSTs status transitions (initiated, ringing,
 * answered, completed, etc.). On `completed`, we attribute the call's duration
 * to the agent's daily minute budget so the `callMinuteCap` middleware can
 * enforce limits on subsequent token mints.
 *
 * The userId is parsed from `Caller=client:agent_<userId>` (Voice Access Token
 * identity).
 */
export function twilioStatusWebhook(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, string>;
  const callSid = body.CallSid;
  const status = body.CallStatus;
  const durationStr = body.CallDuration ?? '0';
  const duration = Number.parseInt(durationStr, 10) || 0;

  logger.info(
    {
      callSid,
      status,
      from: body.From,
      to: body.To,
      duration,
      direction: body.Direction,
    },
    'Twilio call status webhook',
  );

  // QA H2 — attribute completed-call minutes to the user's daily budget.
  if (status === 'completed' && duration > 0) {
    const caller = (body.Caller ?? '').trim();
    const userIdMatch = caller.match(/^client:agent_(.+)$/);
    const userId = userIdMatch?.[1] ?? '';
    if (userId) {
      // Round up so a 5-second call counts as 1 minute (matches typical
      // telephony billing convention and prevents 0-minute calls slipping
      // past the cap entirely).
      const minutes = Math.max(1, Math.ceil(duration / 60));
      incrementMinutesForUser(userId, minutes);
      logger.info(
        { userId, minutes, callSid },
        'Incremented daily call minute usage',
      );
    } else {
      logger.warn({ callSid, caller }, 'Could not parse userId from Caller; minute usage NOT recorded');
    }
  }

  res.sendStatus(204);
}
