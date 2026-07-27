/**
 * Admin-editable training personas — FE client for the admin CRUD under
 * /api/simulator/personas (userId param, POC posture).
 */
import { API_BASE } from '../api/apiBase';

export interface AdminPersona {
  personaId: string;
  label: string;
  description: string;
  voice: string;
  greeting: string;
  prompt: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface VoiceOption {
  id: string;
  label: string;
}

export interface PersonaInput {
  label: string;
  description: string;
  voice: string;
  greeting: string;
  prompt: string;
  sortOrder?: number;
  isActive?: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function listAdminPersonas(
  userId: string,
): Promise<{ personas: AdminPersona[]; voices: VoiceOption[] }> {
  const res = await fetch(
    `${API_BASE}/simulator/personas/admin?userId=${encodeURIComponent(userId)}`,
  );
  const body = (await res.json()) as ApiEnvelope<{
    personas: AdminPersona[];
    voices: VoiceOption[];
  }>;
  if (!body.success || !body.data) throw new Error(body.error ?? `List failed (${res.status})`);
  return body.data;
}

export interface PersonaMutationResult {
  persona: AdminPersona | null;
  error?: string;
}

export async function createPersona(
  userId: string,
  input: PersonaInput,
): Promise<PersonaMutationResult> {
  const res = await fetch(`${API_BASE}/simulator/personas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, userId }),
  });
  const body = (await res.json()) as ApiEnvelope<AdminPersona>;
  if (!body.success || !body.data) {
    return { persona: null, error: body.error ?? `Create failed (${res.status})` };
  }
  return { persona: body.data };
}

export async function updatePersona(
  userId: string,
  personaId: string,
  updates: Partial<PersonaInput>,
): Promise<PersonaMutationResult> {
  const res = await fetch(
    `${API_BASE}/simulator/personas/${encodeURIComponent(personaId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, userId }),
    },
  );
  const body = (await res.json()) as ApiEnvelope<AdminPersona>;
  if (!body.success || !body.data) {
    return { persona: null, error: body.error ?? `Update failed (${res.status})` };
  }
  return { persona: body.data };
}

export async function deletePersona(
  userId: string,
  personaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE}/simulator/personas/${encodeURIComponent(personaId)}?userId=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  const body = (await res.json()) as ApiEnvelope<{ deleted: boolean }>;
  if (!body.success) return { ok: false, error: body.error ?? `Delete failed (${res.status})` };
  return { ok: true };
}
