/**
 * Phase 2 — Twilio webhook signature verification.
 *
 * Twilio signs every webhook POST with `X-Twilio-Signature`: an HMAC-SHA1
 * of `originalUrl + sorted-form-params-concatenated`, keyed by our Auth Token.
 * Without this check anyone on the public internet could forge a TwiML
 * webhook hitting our tunnel URL and trick the API into dialing arbitrary
 * numbers on our trial credit (or worse).
 *
 * The escape hatch `TWILIO_SKIP_VERIFY=true` is module-asserted in env.ts to
 * be off when NODE_ENV === 'production'.
 *
 * URL reconstruction matters: Twilio signs the URL Twilio called, including
 * the protocol and host. Behind the Cloudflare Tunnel, `req.protocol` is
 * `http` (cloudflared terminates TLS) but Twilio sees `https://...trycloudflare.com`.
 * We therefore reconstruct from `env.PUBLIC_BASE_URL` + req.originalUrl, NOT
 * from req.protocol/req.host. Misconfigured PUBLIC_BASE_URL → signature
 * mismatch → 403; that's a clear failure mode.
 */
import type { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export function verifyTwilioSignature(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (env.TWILIO_SKIP_VERIFY) {
    // Already module-asserted to be off in production.
    next();
    return;
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    // Should be unreachable when TWILIO_ENABLED — boot would have failed.
    res.status(500).json({
      success: false,
      error: 'Twilio auth token not configured',
      code: 'TWILIO_NOT_CONFIGURED',
    });
    return;
  }

  const signature = req.header('X-Twilio-Signature');
  if (!signature) {
    res.status(401).json({
      success: false,
      error: 'Missing X-Twilio-Signature header',
      code: 'TWILIO_SIGNATURE_MISSING',
    });
    return;
  }

  // Reconstruct the URL Twilio signed. Trim trailing `/` from PUBLIC_BASE_URL
  // since req.originalUrl always starts with `/`.
  const base = (env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  const url = `${base}${req.originalUrl}`;

  // Twilio signs form-urlencoded body params (POST) or query string (GET).
  // For our webhooks, Twilio POSTs application/x-www-form-urlencoded, so
  // req.body is already parsed into an object by Express's urlencoded parser.
  const params = (req.body ?? {}) as Record<string, string>;

  const valid = twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params,
  );

  if (!valid) {
    logger.warn(
      { url, signature, paramKeys: Object.keys(params) },
      'Twilio webhook signature verification failed',
    );
    res.status(403).json({
      success: false,
      error: 'Twilio signature verification failed',
      code: 'TWILIO_SIGNATURE_INVALID',
    });
    return;
  }

  next();
}
