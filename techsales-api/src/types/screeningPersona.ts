/**
 * Per-agent AI call-screening persona. Each sales agent can tune how the
 * screening assistant sounds when it answers on their behalf (Header ›
 * gear icon › AI Assistant popup). One record per userId; absence means
 * the built-in defaults apply.
 *
 * `instructions` are layered ON TOP of the fixed triage guardrails
 * (service-only, no selling, disclose automated) — they never replace
 * them.
 */
export interface ScreeningPersonaRecord {
  userId: string;
  /** Opening line the assistant speaks; `{agent}` expands to the agent's
   *  display name. */
  greeting: string;
  /** Personality/style additions appended to the fixed triage prompt. */
  instructions: string;
  /** Deepgram Aura TTS voice model (e.g. aura-2-thalia-en). */
  voice: string;
  createdAt: string;
  updatedAt?: string;
}
