/**
 * AI call screening — agent-invoked control endpoints (POC userId
 * posture, same as the rest of the app):
 *
 *   POST /api/screening/start    {callSid, userId} — AI answers the call
 *   POST /api/screening/takeover {callSid, userId} — agent takes over
 *   POST /api/screening/hangup   {callSid, userId} — end the call
 *
 *   GET  /api/screening/status/:callSid — is this call AI-screened?
 *        (the FE polls this when its ring leg is canceled, to tell an
 *        auto-screen apart from a plain unanswered call)
 *
 * Persona (per-agent assistant tuning — Header gear icon popup):
 *   GET    /api/screening/persona/:userId — saved persona + defaults + voices
 *   PUT    /api/screening/persona/:userId {greeting, instructions, voice}
 *   DELETE /api/screening/persona/:userId — reset to defaults
 *
 * start/takeover redirect the PARENT call via Twilio REST. The original
 * <Start><Stream> transcription fork survives both redirects, so one
 * analysis session spans ring → screening → takeover → hangup.
 */
import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { env, screeningEnabled } from '../config/env.js';
import { logger } from '../config/logger.js';
import { repos } from '../repositories/registry.js';
import { getTwilioClient, forceEndCall } from '../services/twilioService.js';
import {
  registerScreening,
  getScreening,
  markTakenOver,
  consumeScreening,
} from '../ai/screening/screeningState.js';
import { buildScreeningTwiml } from '../ai/screening/screeningTwiml.js';
import {
  DEFAULT_SCREENING_GREETING,
  DEFAULT_SCREENING_VOICE,
} from '../ai/screening/screeningPersonaDefaults.js';
import { CURATED_VOICES } from '../ai/simulator/personas.js';

export const screeningRouter = Router();

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface ScreeningBody {
  callSid?: string;
  userId?: string;
}

async function validateRequest(
  req: Request,
  res: Response,
): Promise<{ callSid: string; userId: string } | null> {
  if (!screeningEnabled()) {
    res.status(501).json({ success: false, error: 'Screening is not enabled on this server' });
    return null;
  }
  const body = (req.body ?? {}) as ScreeningBody;
  const callSid = String(body.callSid ?? '');
  const userId = String(body.userId ?? '');
  if (!callSid || !userId) {
    res.status(400).json({ success: false, error: '`callSid` and `userId` are required' });
    return null;
  }
  const user = await repos.user.findById(userId);
  if (!user) {
    res.status(403).json({ success: false, error: 'Unknown user' });
    return null;
  }
  return { callSid, userId };
}

screeningRouter.post(
  '/start',
  asyncHandler(async (req: Request, res: Response) => {
    const input = await validateRequest(req, res);
    if (!input) return;
    const { callSid, userId } = input;

    const entry = registerScreening(callSid, userId);
    // <Connect><Stream> is bidirectional AND blocking — redirecting the
    // parent here cancels the in-progress <Dial> ringing the browser. No
    // startFork: this call's transcription fork survives the redirect.
    const twiml = buildScreeningTwiml({ callSid, userId, token: entry.token });
    if (!twiml) {
      consumeScreening(callSid);
      res.status(500).json({ success: false, error: 'PUBLIC_BASE_URL not configured' });
      return;
    }
    try {
      await getTwilioClient().calls(callSid).update({ twiml });
    } catch (err) {
      logger.error({ err, callSid }, 'screening: start redirect failed');
      res.status(502).json({ success: false, error: 'Could not redirect the call to the assistant' });
      return;
    }
    logger.info({ callSid, userId }, 'screening: started');
    res.json({ success: true, data: { screening: true, callSid } });
  }),
);

screeningRouter.post(
  '/takeover',
  asyncHandler(async (req: Request, res: Response) => {
    const input = await validateRequest(req, res);
    if (!input) return;
    const { callSid, userId } = input;
    const entry = getScreening(callSid);
    if (!entry) {
      res.status(404).json({ success: false, error: 'No screening session for this call' });
      return;
    }
    markTakenOver(callSid);
    const base = (env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
    // Byte-identical topology to the original inbound dial — the surviving
    // transcription fork keeps capturing both tracks. No new <Start><Stream>.
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      `<Dial timeout="20" action="${escapeXml(`${base}/api/twilio/incoming/result`)}" method="POST">` +
      '<Client>' +
      `<Identity>${escapeXml(`agent_${userId}`)}</Identity>` +
      `<Parameter name="parentCallSid" value="${escapeXml(callSid)}"/>` +
      '</Client></Dial></Response>';
    try {
      await getTwilioClient().calls(callSid).update({ twiml });
    } catch (err) {
      logger.error({ err, callSid }, 'screening: takeover redirect failed');
      res.status(502).json({ success: false, error: 'Could not hand the call to the agent' });
      return;
    }
    logger.info({ callSid, userId }, 'screening: takeover requested');
    res.json({ success: true, data: { takeover: true, callSid } });
  }),
);

screeningRouter.post(
  '/hangup',
  asyncHandler(async (req: Request, res: Response) => {
    const input = await validateRequest(req, res);
    if (!input) return;
    try {
      await forceEndCall(input.callSid);
    } catch (err) {
      logger.error({ err, callSid: input.callSid }, 'screening: hangup failed');
      res.status(502).json({ success: false, error: 'Could not end the call' });
      return;
    }
    res.json({ success: true, data: { ended: true } });
  }),
);

/**
 * Is this call currently AI-screened? The FE polls this the moment its
 * ringing leg is canceled: an auto-screen (server answered on timeout)
 * looks identical to a plain missed call from the browser's side.
 * Always 200 — absence is `screening: false`, not an error. Never returns
 * the auth token.
 */
screeningRouter.get('/status/:callSid', (req: Request, res: Response) => {
  const entry = getScreening(String(req.params.callSid ?? ''));
  res.json({
    success: true,
    data: { screening: !!entry, takenOver: entry?.takenOver ?? false },
  });
});

// ---------------------------------------------------------------------------
// Per-agent persona (self-service; POC userId posture like everything else).
// Not gated on screeningEnabled() — the popup should work even while the
// pipeline is temporarily off (e.g. Deepgram key rotation).
// ---------------------------------------------------------------------------

const PERSONA_DEFAULTS = {
  greeting: DEFAULT_SCREENING_GREETING,
  instructions: '',
  voice: DEFAULT_SCREENING_VOICE,
};

const MAX_GREETING_CHARS = 400;
const MAX_INSTRUCTIONS_CHARS = 4000;

async function requireUser(req: Request, res: Response): Promise<string | null> {
  const userId = String(req.params.userId ?? '');
  if (!userId) {
    res.status(400).json({ success: false, error: '`userId` is required' });
    return null;
  }
  const user = await repos.user.findById(userId);
  if (!user) {
    res.status(403).json({ success: false, error: 'Unknown user' });
    return null;
  }
  return userId;
}

screeningRouter.get(
  '/persona/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const persona = await repos.screeningPersona.findByUserId(userId);
    res.json({
      success: true,
      data: { persona, defaults: PERSONA_DEFAULTS, voices: CURATED_VOICES },
    });
  }),
);

screeningRouter.put(
  '/persona/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const body = (req.body ?? {}) as { greeting?: unknown; instructions?: unknown; voice?: unknown };
    const greeting = String(body.greeting ?? '').trim();
    const instructions = String(body.instructions ?? '').trim();
    const voice = String(body.voice ?? '').trim();
    if (!greeting) {
      res.status(400).json({ success: false, error: '`greeting` is required' });
      return;
    }
    if (greeting.length > MAX_GREETING_CHARS) {
      res
        .status(400)
        .json({ success: false, error: `\`greeting\` must be ≤ ${MAX_GREETING_CHARS} characters` });
      return;
    }
    if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
      res.status(400).json({
        success: false,
        error: `\`instructions\` must be ≤ ${MAX_INSTRUCTIONS_CHARS} characters`,
      });
      return;
    }
    if (!voice.startsWith('aura-')) {
      res
        .status(400)
        .json({ success: false, error: '`voice` must be a Deepgram Aura model (aura-…)' });
      return;
    }
    const persona = await repos.screeningPersona.upsert(userId, {
      greeting,
      instructions,
      voice,
    });
    logger.info({ userId, voice }, 'screening: persona saved');
    res.json({ success: true, data: { persona } });
  }),
);

screeningRouter.delete(
  '/persona/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = await requireUser(req, res);
    if (!userId) return;
    const deleted = await repos.screeningPersona.delete(userId);
    logger.info({ userId, deleted }, 'screening: persona reset to defaults');
    res.json({ success: true, data: { reset: true } });
  }),
);
