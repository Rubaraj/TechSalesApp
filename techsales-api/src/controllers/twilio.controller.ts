/**
 * Twilio webhook controllers — Phase 2 + 2.6.
 *
 *   POST /api/twilio/voice            → TwiML for an outbound dial originated
 *                                       by the browser Voice SDK.
 *   POST /api/twilio/status           → Call lifecycle webhook.
 *   POST /api/twilio/incoming         → Phase 2.6 — TwiML for an inbound PSTN
 *                                       call. Round-robins to an available
 *                                       agent or plays a fallback message.
 *   POST /api/twilio/incoming/result  → Phase 2.6 — `action=` callback on the
 *                                       inbound `<Dial>`. Plays fallback when
 *                                       the client didn't accept.
 */
import type { Request, Response } from 'express';
import { env, autoScreeningEnabled } from '../config/env.js';
import { logger } from '../config/logger.js';
import { incrementMinutesForUser } from '../middleware/callMinuteCap.js';
import { pickRoundRobin } from '../services/agentPresence.js';
import { repos } from '../repositories/registry.js';
import {
  getScreening,
  registerScreening,
  consumeScreening,
} from '../ai/screening/screeningState.js';
import { buildScreeningTwiml } from '../ai/screening/screeningTwiml.js';

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
    `<Parameter name="direction" value="outbound"/>` +
    `</Stream>` +
    `</Start>` +
    `<Dial callerId="${escapeXml(callerId)}" timeLimit="${timeLimit}">` +
    `<Number>${escapeXml(to)}</Number>` +
    `</Dial>` +
    `</Response>`;

  res.type('text/xml').send(twiml);
}

const FALLBACK_TWIML =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<Response>` +
  `<Say voice="alice">We're not available right now. Please call back later.</Say>` +
  `<Hangup/>` +
  `</Response>`;

/**
 * Phase 2.6 — Inbound PSTN call webhook.
 *
 * Twilio POSTs here when a caller dials our company phone number. We:
 *   1. Round-robin to an available signed-in agent via `agentPresence`.
 *   2. If none available → auto-screen (the Voice Agent answers, emitting
 *      its own transcription fork since this path never built one), or the
 *      fallback `<Say>+<Hangup/>` when auto-screening is off.
 *   3. Else → `<Start><Stream>` for diarization + `<Dial timeout="20"><Client>`
 *      pointing at the agent's Voice SDK identity. The Dial's `action`
 *      attribute fires `/api/twilio/incoming/result` when the dial settles;
 *      it carries `?agent=<userId>` so that handler knows who was rung (the
 *      dialed client identity is NOT in Twilio's callback params).
 *
 * Speaker labels:  the Media Stream WS handler reads `direction=inbound` from
 * the Stream's customParameters and flips the track-to-speaker mapping (the
 * PSTN side is the parent call here, opposite of outbound — see ws handler).
 */
export async function twilioIncomingWebhook(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, string>;
  const callSid = body.CallSid ?? '';
  const from = (body.From ?? '').trim();
  const to = (body.To ?? '').trim();

  const pickedUserId = pickRoundRobin();
  logger.info(
    { callSid, from, to, pickedUserId },
    'Twilio incoming webhook',
  );

  if (!pickedUserId) {
    // Nobody online — hand the caller to the assistant rather than losing
    // the lead. This path never built a <Start><Stream>, so the screening
    // TwiML emits one (startFork) to drive analysis/entities/auto-lead.
    // Belt-and-braces try/catch: a caller must never hear a Twilio error
    // because auto-screening failed — any problem falls through to the
    // fallback message. (`repos.user` throws SYNCHRONOUSLY when the
    // registry isn't initialized, so a `.catch()` alone wouldn't hold.)
    if (autoScreeningEnabled() && callSid) {
      try {
        const fallbackId = env.SCREENING_FALLBACK_USER_ID;
        const fallbackUser = await repos.user.findById(fallbackId);
        if (!fallbackUser) {
          logger.error(
            { fallbackId },
            'auto-screen: SCREENING_FALLBACK_USER_ID not found — playing fallback message',
          );
        } else {
          const entry = registerScreening(callSid, fallbackId, { unattended: true });
          const twiml = buildScreeningTwiml({
            callSid,
            userId: fallbackId,
            token: entry.token,
            startFork: from ? { prospectNumber: from } : {},
          });
          if (twiml) {
            logger.info(
              { callSid, from, fallbackId },
              'auto-screen: no agent online — AI answering',
            );
            res.type('text/xml').send(twiml);
            return;
          }
          consumeScreening(callSid); // never leave a registration behind
          logger.error(
            { callSid },
            'auto-screen: PUBLIC_BASE_URL missing — playing fallback message',
          );
        }
      } catch (err) {
        consumeScreening(callSid);
        logger.error({ err, callSid }, 'auto-screen: failed — playing fallback message');
      }
    }
    res.type('text/xml').send(FALLBACK_TWIML);
    return;
  }

  if (!env.PUBLIC_BASE_URL) {
    logger.error('PUBLIC_BASE_URL not set; cannot return inbound TwiML');
    res.type('text/xml').send(FALLBACK_TWIML);
    return;
  }

  const wsBase = env.PUBLIC_BASE_URL.replace(/\/$/, '').replace(/^https?/, 'wss');
  const httpBase = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const streamUrl = `${wsBase}/ws/twilio-media`;
  // ?agent= threads the rung agent into the action callback: Twilio's
  // callback params do NOT include the dialed <Client> identity, and
  // auto-screening needs it (greeting name, persona, tool scope, lead
  // owner). Signature-safe — verifyTwilioSignature rebuilds the signed URL
  // from PUBLIC_BASE_URL + req.originalUrl, which includes the query.
  const actionUrl = `${httpBase}/api/twilio/incoming/result?agent=${encodeURIComponent(pickedUserId)}`;
  const clientIdentity = `agent_${pickedUserId}`;

  // 20s ring timeout. If the agent doesn't accept, `action` fires the fallback.
  // Phase 3b — stash the prospect's caller ID so the WS handler can hand it
  // to the callAnalysisAgent. The phone extractor uses it to suppress matches
  // where the prospect repeats their own number.
  const prospectNumberParam = from
    ? `<Parameter name="prospectNumber" value="${escapeXml(from)}"/>`
    : '';

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Start>` +
    `<Stream url="${escapeXml(streamUrl)}" track="both_tracks">` +
    `<Parameter name="userId" value="${escapeXml(pickedUserId)}"/>` +
    `<Parameter name="direction" value="inbound"/>` +
    prospectNumberParam +
    `</Stream>` +
    `</Start>` +
    `<Dial timeout="20" action="${escapeXml(actionUrl)}" method="POST">` +
    // Expanded <Client> form so the browser leg receives the PARENT (PSTN)
    // CallSid as a custom parameter. The media stream publishes transcripts
    // under the parent sid; without this bridge the FE would subscribe with
    // its own child-leg sid and never match (inbound-only quirk).
    `<Client>` +
    `<Identity>${escapeXml(clientIdentity)}</Identity>` +
    `<Parameter name="parentCallSid" value="${escapeXml(callSid)}"/>` +
    `</Client>` +
    `</Dial>` +
    `</Response>`;

  res.type('text/xml').send(twiml);
}

/**
 * Phase 2.6 — Action callback fired when the inbound `<Dial>` settles.
 *
 * Twilio passes `DialCallStatus`: `completed | no-answer | busy | failed |
 * canceled`. `completed` → empty `<Response/>` (Twilio hangs up the parent).
 * Anything else means the agent never took the call, so we auto-screen: the
 * Voice Agent answers instead of playing "we're not available". The ring-time
 * `<Start><Stream>` fork survives this redirect, so analysis, entities and
 * auto-lead keep running — no startFork needed here.
 *
 * Note: an agent clicking Decline also lands here (as `busy`), so the AI
 * answers that caller too. Accepted for the POC — the rule is "never lose an
 * inbound call"; the agent still sees the lead the assistant creates.
 */
export function twilioIncomingResultWebhook(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, string>;
  const status = body.DialCallStatus ?? '';
  const parentStatus = body.CallStatus ?? '';
  const callSid = body.CallSid ?? '';
  logger.info({ callSid, status, parentStatus }, 'Twilio incoming result webhook');

  const emptyResponse = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

  // AI screening hedge: a redirect that interrupts the <Dial> should skip
  // this callback entirely — if it fires anyway, do NOT run the fallback
  // TwiML (it would hang up a call the assistant is handling). This also
  // absorbs a retried/duplicate fire of THIS handler after we register below.
  if (callSid && getScreening(callSid)) {
    logger.warn(
      { callSid, status },
      'Twilio incoming result fired for a SCREENED call — returning empty response',
    );
    res.type('text/xml').send(emptyResponse);
    return;
  }

  if (status === 'completed') {
    res.type('text/xml').send(emptyResponse);
    return;
  }

  // Dead-call guard: the caller hung up during the ring (child `canceled`,
  // or the parent leg already gone). Answering would start an assistant
  // session on a call nobody is on. `canceled` with a LIVE parent only
  // happens on the manual-Screen redirect, which the guard above caught.
  if (status === 'canceled' || parentStatus === 'completed' || parentStatus === 'canceled') {
    res.type('text/xml').send(emptyResponse);
    return;
  }

  const agentUserId = typeof req.query.agent === 'string' ? req.query.agent : '';
  if (autoScreeningEnabled() && agentUserId && callSid) {
    const entry = registerScreening(callSid, agentUserId, { unattended: true });
    const twiml = buildScreeningTwiml({ callSid, userId: agentUserId, token: entry.token });
    if (twiml) {
      logger.info({ callSid, agentUserId, status }, 'auto-screen: unanswered ring — AI answering');
      res.type('text/xml').send(twiml);
      return;
    }
    consumeScreening(callSid); // never leave a registration behind
    logger.error({ callSid }, 'auto-screen: PUBLIC_BASE_URL missing — playing fallback message');
  }

  res.type('text/xml').send(FALLBACK_TWIML);
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
