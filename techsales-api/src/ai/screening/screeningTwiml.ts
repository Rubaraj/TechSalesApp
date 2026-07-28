/**
 * AI call screening — TwiML builder shared by the three paths that hand a
 * call to the Voice Agent bridge:
 *
 *   1. POST /api/screening/start        (agent clicked "Screen")
 *   2. POST /api/twilio/incoming/result (nobody answered the ring)
 *   3. POST /api/twilio/incoming        (nobody online at all)
 *
 * Paths 1-2 only need <Connect><Stream> — the call's original
 * <Start><Stream> transcription fork was created at ring time and survives
 * the redirect, so analysis/entities/auto-lead keep running. Path 3 never
 * got that fork (the no-agent branch returns before building it), so it
 * passes `startFork` and this builder emits BOTH: the fork first, then the
 * blocking <Connect>.
 */
import { env } from '../../config/env.js';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface ScreeningTwimlOptions {
  callSid: string;
  /** Screening identity — greeting name, persona, tool scope, lead owner. */
  userId: string;
  /** Nonce from registerScreening — the WS bridge's auth gate. */
  token: string;
  /**
   * Emit the <Start><Stream> transcription fork too. Only for calls that
   * never had one (the nobody-online path) — passing this on a call that
   * already has a fork would double-transcribe it.
   */
  startFork?: { prospectNumber?: string };
}

/** Full TwiML, or null when PUBLIC_BASE_URL isn't configured. */
export function buildScreeningTwiml(opts: ScreeningTwimlOptions): string | null {
  const base = (env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  if (!base) return null;
  const wsBase = base.replace(/^https?/, 'wss');

  let fork = '';
  if (opts.startFork) {
    const prospectParam = opts.startFork.prospectNumber
      ? `<Parameter name="prospectNumber" value="${escapeXml(opts.startFork.prospectNumber)}"/>`
      : '';
    fork =
      '<Start>' +
      `<Stream url="${escapeXml(`${wsBase}/ws/twilio-media`)}" track="both_tracks">` +
      `<Parameter name="userId" value="${escapeXml(opts.userId)}"/>` +
      '<Parameter name="direction" value="inbound"/>' +
      prospectParam +
      '</Stream>' +
      '</Start>';
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
    fork +
    '<Connect>' +
    `<Stream url="${escapeXml(`${wsBase}/ws/screening`)}">` +
    `<Parameter name="callSid" value="${escapeXml(opts.callSid)}"/>` +
    `<Parameter name="userId" value="${escapeXml(opts.userId)}"/>` +
    `<Parameter name="token" value="${escapeXml(opts.token)}"/>` +
    '</Stream>' +
    '</Connect>' +
    '</Response>'
  );
}
