/**
 * Twilio + Deepgram pipeline availability. Combines:
 *   1. Auth session has `twilioEnabled === true` (mirrors backend `TWILIO_ENABLED`).
 *   2. AI is on (no Twilio path without AI).
 *
 * Components should `if (!useTwilioEnabled()) fallbackToWebSpeech()` rather
 * than initializing the SDK eagerly.
 */
import { useAuth } from '../context/AuthContext';
import { useAiEnabled } from './useAiEnabled';

export function useTwilioEnabled(): boolean {
  const ai = useAiEnabled();
  const { twilioEnabled } = useAuth();
  return ai && twilioEnabled === true;
}
