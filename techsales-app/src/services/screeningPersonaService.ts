/**
 * AI screening assistant persona — per-agent tuning of the assistant that
 * answers calls on the agent's behalf (Header › gear icon popup).
 *
 * GET returns the saved persona (null when the agent never customized),
 * the built-in defaults (used to prefill the form), and the curated
 * Deepgram Aura voice list for the picker.
 */
import { API_BASE } from '../api/apiBase';

export interface ScreeningPersonaFields {
  /** Opening line; `{agent}` expands to the agent's display name. */
  greeting: string;
  /** The call playbook — what the assistant asks, and in what order. */
  instructions: string;
  /** Deepgram Aura TTS voice model (aura-2-*). */
  voice: string;
  /** Look up and mention plan availability after saving the lead. */
  offerPlans: boolean;
  /** Run the intake and save the lead during the call, opening the lead
   *  screen so it fills in live. */
  createLeadLive: boolean;
}

export interface ScreeningVoiceOption {
  id: string;
  label: string;
}

export interface ScreeningPersonaResponse {
  persona: (ScreeningPersonaFields & { updatedAt?: string }) | null;
  defaults: ScreeningPersonaFields;
  voices: ScreeningVoiceOption[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body.data;
}

export const getScreeningPersona = (userId: string): Promise<ScreeningPersonaResponse> =>
  request<ScreeningPersonaResponse>(`/screening/persona/${encodeURIComponent(userId)}`);

export const saveScreeningPersona = (
  userId: string,
  fields: ScreeningPersonaFields,
): Promise<{ persona: ScreeningPersonaFields }> =>
  request<{ persona: ScreeningPersonaFields }>(
    `/screening/persona/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    },
  );

export const resetScreeningPersona = (userId: string): Promise<{ reset: boolean }> =>
  request<{ reset: boolean }>(`/screening/persona/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
