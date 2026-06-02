/**
 * /api/twilio/* router — Phase 2.
 *
 * Mounted OUTSIDE the /api/ai AI_ENABLED guard because Twilio webhooks must
 * always be answered (a 501 here would make Twilio retry indefinitely and
 * generate spurious traffic). When TWILIO_ENABLED=false the handlers
 * themselves refuse with TwiML-shaped errors.
 *
 * Every endpoint passes through `verifyTwilioSignature` first.
 */
import { Router, urlencoded } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyTwilioSignature } from '../middleware/verifyTwilioSignature.js';
import {
  twilioVoiceWebhook,
  twilioStatusWebhook,
  twilioIncomingWebhook,
  twilioIncomingResultWebhook,
} from '../controllers/twilio.controller.js';
import { env } from '../config/env.js';

export const twilioRouter: Router = Router();

// Twilio sends form-urlencoded bodies. Cap payload size aggressively — a
// real webhook is ~1 KB.
twilioRouter.use(urlencoded({ extended: false, limit: '8kb' }));

// IP rate limit on the public webhook surface. Twilio's edge IPs are stable
// per region, so a high ceiling is fine; this catches forged-webhook spam.
twilioRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Refuse all webhooks when Twilio is disabled — saves us validating sigs we
// can't possibly verify (auth token unset).
twilioRouter.use((_req, res, next) => {
  if (!env.TWILIO_ENABLED) {
    res
      .status(501)
      .type('text/xml')
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="rejected"/></Response>',
      );
    return;
  }
  next();
});

twilioRouter.post('/voice', verifyTwilioSignature, twilioVoiceWebhook);
twilioRouter.post('/status', verifyTwilioSignature, twilioStatusWebhook);
twilioRouter.post('/incoming', verifyTwilioSignature, twilioIncomingWebhook);
twilioRouter.post(
  '/incoming/result',
  verifyTwilioSignature,
  twilioIncomingResultWebhook,
);
