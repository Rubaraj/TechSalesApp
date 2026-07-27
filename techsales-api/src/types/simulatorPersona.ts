/**
 * Admin-editable training-simulator persona. Supervisors manage these
 * from Admin › Training Personas; each session's Deepgram Voice Agent
 * Settings are built from the chosen row (stateless per connection, so
 * edits take effect on the very next practice session).
 *
 * `prompt` is the roleplay system prompt for the Deepgram-hosted think
 * LLM — it never leaves the backend (the trainee list endpoint returns
 * only id/label/description).
 */
export interface SimulatorPersonaRecord {
  personaId: string;
  /** Card title on the Training page. */
  label: string;
  /** Card subtitle on the Training page. */
  description: string;
  /** Deepgram Aura TTS voice model (e.g. aura-2-luna-en). */
  voice: string;
  /** Opening line the persona speaks when the session starts. */
  greeting: string;
  /** Roleplay system prompt (character + scenario facts + behavior). */
  prompt: string;
  /** Card order on the Training page (ascending). */
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}
