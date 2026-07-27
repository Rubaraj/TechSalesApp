/**
 * AI call screening — agent-invoked control endpoints (POC userId
 * posture, same as the rest of the app):
 *
 *   POST /api/screening/start    {callSid, userId} — AI answers the call
 *   POST /api/screening/takeover {callSid, userId} — agent takes over
 *   POST /api/screening/hangup   {callSid, userId} — end the call
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
} from '../ai/screening/screeningState.js';

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

    const base = (env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '').replace(/^https?/, 'wss');
    if (!base) {
      res.status(500).json({ success: false, error: 'PUBLIC_BASE_URL not configured' });
      return;
    }
    const entry = registerScreening(callSid, userId);
    const streamUrl = `${base}/ws/screening`;
    // <Connect><Stream> is bidirectional AND blocking — redirecting the
    // parent here cancels the in-progress <Dial> ringing the browser.
    const twiml =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response><Connect>' +
      `<Stream url="${escapeXml(streamUrl)}">` +
      `<Parameter name="callSid" value="${escapeXml(callSid)}"/>` +
      `<Parameter name="userId" value="${escapeXml(userId)}"/>` +
      `<Parameter name="token" value="${escapeXml(entry.token)}"/>` +
      '</Stream></Connect></Response>';
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
