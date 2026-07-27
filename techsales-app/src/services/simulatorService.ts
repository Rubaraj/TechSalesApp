/**
 * Training simulator — FE client helpers: the /ws/simulator URL and the
 * persona catalog.
 */
import { API_BASE } from '../api/apiBase';

export interface SimulatorPersonaCard {
  id: string;
  label: string;
  description: string;
}

/**
 * Derive the simulator WebSocket URL from API_BASE:
 *   absolute  https://api.example.com/techsales/api → wss://api.example.com/techsales/ws/simulator
 *   relative  '/api' (dev proxy)                    → ws(s)://<page host>/ws/simulator
 */
export function simulatorWsUrl(userId: string, personaId: string): string {
  const query = `?userId=${encodeURIComponent(userId)}&personaId=${encodeURIComponent(personaId)}`;
  if (/^https?:\/\//.test(API_BASE)) {
    const origin = API_BASE.replace(/\/api$/, '').replace(/^http/, 'ws');
    return `${origin}/ws/simulator${query}`;
  }
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws/simulator${query}`;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function fetchPersonas(): Promise<{
  enabled: boolean;
  personas: SimulatorPersonaCard[];
}> {
  const res = await fetch(`${API_BASE}/simulator/personas`);
  const body = (await res.json()) as ApiEnvelope<{
    enabled: boolean;
    personas: SimulatorPersonaCard[];
  }>;
  if (!body.success || !body.data) {
    throw new Error(body.error ?? `Personas fetch failed (${res.status})`);
  }
  return body.data;
}
