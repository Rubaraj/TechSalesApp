/**
 * Twilio service — narrow wrapper around the `twilio` SDK, surfacing only
 * the operations the Call Copilot needs:
 *   - `mintVoiceAccessToken({ userId })` — short-lived JWT for the browser
 *     to identify itself to Twilio Voice. Scoped to our TwiML App SID.
 *   - `getTwilioClient()` — singleton REST client for call control
 *     (e.g. `client.calls(sid).update({status:'completed'})` to force-hang up).
 *
 * Credentials live in env; this module is the only file in the FE-reachable
 * code path that imports `twilio`. The browser never sees the Auth Token or
 * API Key Secret.
 */
import twilio from 'twilio';
import { env } from '../config/env.js';

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

interface MintVoiceAccessTokenInput {
  /** Our internal userId; becomes the Twilio `identity` claim and shows up
   *  in Twilio Console call logs so we can attribute calls to a user. */
  userId: string;
}

interface MintedToken {
  token: string;
  identity: string;
  expiresAt: number; // epoch ms
}

function assertTwilioConfigured(): void {
  if (!env.TWILIO_ENABLED) {
    throw new Error('Twilio is disabled (TWILIO_ENABLED=false)');
  }
  // Boot already asserted these when TWILIO_ENABLED — keep belt+braces.
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_API_KEY_SID ||
    !env.TWILIO_API_KEY_SECRET ||
    !env.TWILIO_TWIML_APP_SID
  ) {
    throw new Error('Twilio credentials missing despite TWILIO_ENABLED=true');
  }
}

/**
 * Mint a Voice Access Token (a JWT) the browser SDK uses to register a Voice
 * Device. The token grants `incoming` (so Twilio can ring this client) +
 * `outgoing` against our TwiML App, and nothing else. TTL is 1 hour.
 */
export function mintVoiceAccessToken({ userId }: MintVoiceAccessTokenInput): MintedToken {
  assertTwilioConfigured();

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  // Stable identity per user — also used by Twilio Voice Insights to group
  // calls by agent. We don't expose the raw userId to the prospect.
  const identity = `agent_${userId}`;

  const token = new AccessToken(
    env.TWILIO_ACCOUNT_SID!,
    env.TWILIO_API_KEY_SID!,
    env.TWILIO_API_KEY_SECRET!,
    { identity, ttl: TOKEN_TTL_SECONDS },
  );

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: env.TWILIO_TWIML_APP_SID!,
      incomingAllow: true,
    }),
  );

  return {
    token: token.toJwt(),
    identity,
    expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
  };
}

// --- REST client singleton (lazy) ------------------------------------------

let _client: twilio.Twilio | null = null;

/** Returns the Twilio REST client. Use for call control (update/hangup). */
export function getTwilioClient(): twilio.Twilio {
  assertTwilioConfigured();
  if (_client) return _client;
  _client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);
  return _client;
}

/**
 * Force a call to complete (server-side hangup). Used by the per-call duration
 * cap timer and by manual admin abort. Idempotent — calling on an already-
 * ended call returns the most recent state without error.
 */
export async function forceEndCall(callSid: string): Promise<void> {
  const client = getTwilioClient();
  await client.calls(callSid).update({ status: 'completed' });
}
