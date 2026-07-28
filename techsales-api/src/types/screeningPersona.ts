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
  /**
   * The agent's call playbook — what the assistant asks, in what order,
   * and how it wraps up. Layered on top of the fixed guardrails.
   */
  instructions: string;
  /** Deepgram Aura TTS voice model (e.g. aura-2-thalia-en). */
  voice: string;
  /**
   * After the lead is saved, ask the caller whether they'd like to hear
   * what's available and look plans up for their zip. Off → the
   * assistant defers all plan talk to the callback (original behavior).
   */
  offerPlans: boolean;
  /**
   * Run the full intake and save the lead DURING the call, driving the
   * agent's browser to the lead screen so it fills in live. Off → details
   * are still captured, but the lead is only written when the call ends.
   */
  createLeadLive: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** Fields the agent can set from the AI Assistant popup. */
export type ScreeningPersonaUpdate = Pick<
  ScreeningPersonaRecord,
  'greeting' | 'instructions' | 'voice' | 'offerPlans' | 'createLeadLive'
>;
