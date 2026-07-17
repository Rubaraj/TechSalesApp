/**
 * Phase 4 (M4) — Atlas SSE chat client. Modelled after `aiService.chat`,
 * adapted to Atlas's expanded event union (proposal_created, navigate).
 */

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export type AtlasStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: unknown; latencyMs: number }
  | {
      type: 'proposal_created';
      proposalId: string;
      kind: 'email' | 'status' | 'drug' | 'lead_update' | 'note';
      preview: unknown;
    }
  | { type: 'navigate'; route: string; reason: string }
  | { type: 'final'; content: string; interactionId: string }
  | { type: 'error'; error: string };

export interface AtlasChatRequest {
  userId: string;
  message: string;
  context: {
    route: string;
    leadId?: string;
    callSid?: string;
    mode: 'assist' | 'auto';
  };
}

export interface AtlasChatOptions {
  onEvent: (ev: AtlasStreamEvent) => void;
  signal?: AbortSignal;
}

async function chat(input: AtlasChatRequest, opts: AtlasChatOptions): Promise<void> {
  const url = `${BASE}/ai/atlas/chat`;
  const fetchInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(input),
  };
  if (opts.signal) fetchInit.signal = opts.signal;
  const res = await fetch(url, fetchInit);

  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('text/event-stream')) {
    let errMsg = `Atlas chat request failed (${res.status} ${res.statusText})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) errMsg = body.error;
    } catch {
      // not json
    }
    throw new Error(errMsg);
  }
  if (!res.body) throw new Error('Atlas chat response had no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (opts.signal?.aborted) {
        throw new DOMException('Atlas stream aborted', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const record = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLines: string[] = [];
        for (const line of record.split('\n')) {
          if (line.startsWith(':')) continue;
          if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length > 0) {
          try {
            opts.onEvent(JSON.parse(dataLines.join('\n')) as AtlasStreamEvent);
          } catch {
            // malformed event — drop
          }
        }
        sep = buffer.indexOf('\n\n');
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

export interface AtlasGreeting {
  greeting: string;
  suggestedPrompts: string[];
  stats: { total: number; byStatus: Record<string, number> };
}

export interface AtlasSession {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; ts: number }>;
}

async function getGreeting(userId: string): Promise<AtlasGreeting | null> {
  const res = await fetch(`${BASE}/ai/atlas/greeting/${encodeURIComponent(userId)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { success: boolean; data?: AtlasGreeting };
  return body.success ? (body.data ?? null) : null;
}

async function getSession(userId: string): Promise<AtlasSession> {
  const res = await fetch(`${BASE}/ai/atlas/session/${encodeURIComponent(userId)}`);
  if (!res.ok) return { messages: [] };
  const body = (await res.json()) as { success: boolean; data?: AtlasSession };
  return body.success ? (body.data ?? { messages: [] }) : { messages: [] };
}

/** Phase 4 — Wipes the server-side session so the next `getSession` call
 *  returns empty. Used by "Start new session". */
async function clearSession(userId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/ai/atlas/session/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  return res.ok;
}

async function approveProposal(
  proposalId: string,
  userId: string,
  decision: 'approve' | 'reject',
): Promise<{ success: boolean; result?: unknown }> {
  const res = await fetch(
    `${BASE}/ai/atlas/approvals/${encodeURIComponent(proposalId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, decision }),
    },
  );
  const body = (await res.json()) as {
    success: boolean;
    data?: { decision: string; result?: unknown };
  };
  return { success: body.success, result: body.data?.result };
}

export const atlasService = {
  chat,
  getGreeting,
  getSession,
  clearSession,
  approveProposal,
};
