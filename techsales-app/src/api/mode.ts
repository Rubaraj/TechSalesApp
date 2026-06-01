/**
 * Frontend session mode + data source helpers.
 *
 * Two related but distinct things are tracked in sessionStorage:
 *
 *  1. **App mode** (`medhub-mode`): how the FE talks to data.
 *      - `'api'`   — backend reachable at login; services hit /api/* via `apiClient`.
 *      - `'local'` — backend unreachable at login; services fall back to bundled JSON.
 *     Decided ONCE by `AuthContext.login()` / `memberLoginHandler` and locked for the session.
 *
 *  2. **Data source** (`medhub-data-source`): what is ultimately backing the data shown in the UI.
 *      - `'mongo'` — FE → backend → MongoDB on the Pi.
 *      - `'json'`  — either FE → backend (which booted in JSON-store mode), OR FE itself
 *                    (locked to `'local'` because backend was unreachable at login).
 *     Used by the header badge so the user can see at a glance where data is coming from.
 *
 * Default for both is the optimistic case (`'api'` / `'mongo'`). Cleared on logout.
 */
export type AppMode = 'api' | 'local';
export type DataSource = 'mongo' | 'json' | 'databricks';
/** Active LLM provider on the backend — mirrors `AI_LLM_PROVIDER`. Header badge
 * uses this so the user can tell at a glance whether responses are from local
 * Ollama (free) or cloud Claude. */
export type AiProvider = 'ollama' | 'anthropic';

/**
 * Combined backend probe result. The login flow needs all three bits to decide
 * what to render (data source badge + AI feature gate + AI provider badge).
 */
export interface DataAiState {
  dataSource: DataSource | null;
  aiEnabled: boolean;
  aiProvider: AiProvider | null;
  /** Phase 2 — Twilio+Deepgram call pipeline configured. */
  twilioEnabled: boolean;
}

const MODE_KEY = 'medhub-mode';
const SOURCE_KEY = 'medhub-data-source';
const AI_ENABLED_KEY = 'medhub-ai-enabled';
const AI_PROVIDER_KEY = 'medhub-ai-provider';
const TWILIO_ENABLED_KEY = 'medhub-twilio-enabled';

// ---------- App mode ----------

export function getMode(): AppMode {
  try {
    const v = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(MODE_KEY) : null;
    return v === 'local' ? 'local' : 'api';
  } catch {
    return 'api';
  }
}

export function setMode(mode: AppMode): void {
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore (private mode, etc.)
  }
}

// ---------- Data source ----------

export function getDataSource(): DataSource | null {
  try {
    const v = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SOURCE_KEY) : null;
    return v === 'mongo' || v === 'json' || v === 'databricks' ? v : null;
  } catch {
    return null;
  }
}

export function setDataSource(source: DataSource): void {
  try {
    sessionStorage.setItem(SOURCE_KEY, source);
  } catch {
    // ignore
  }
}

// ---------- AI enabled (server flag, mirrored from /api/health) ----------

export function getAiEnabled(): boolean {
  try {
    const v = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(AI_ENABLED_KEY) : null;
    // Default to FALSE when unknown — the hook combines this with the env var
    // and getMode() to decide whether to render AI UI. Optimistic-on would
    // briefly show AI surfaces before the probe completes.
    return v === 'true';
  } catch {
    return false;
  }
}

export function setAiEnabled(b: boolean): void {
  try {
    sessionStorage.setItem(AI_ENABLED_KEY, b ? 'true' : 'false');
  } catch {
    // ignore (private mode, etc.)
  }
}

// ---------- AI provider (server flag, mirrored from /api/health) ----------

export function getAiProvider(): AiProvider | null {
  try {
    const v = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(AI_PROVIDER_KEY) : null;
    return v === 'ollama' || v === 'anthropic' ? v : null;
  } catch {
    return null;
  }
}

export function setAiProvider(p: AiProvider | null): void {
  try {
    if (p === null) sessionStorage.removeItem(AI_PROVIDER_KEY);
    else sessionStorage.setItem(AI_PROVIDER_KEY, p);
  } catch {
    // ignore (private mode, etc.)
  }
}

// ---------- Twilio enabled (server flag, mirrored from /api/health) ----------

export function getTwilioEnabled(): boolean {
  try {
    const v =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(TWILIO_ENABLED_KEY)
        : null;
    return v === 'true';
  } catch {
    return false;
  }
}

export function setTwilioEnabled(b: boolean): void {
  try {
    sessionStorage.setItem(TWILIO_ENABLED_KEY, b ? 'true' : 'false');
  } catch {
    // ignore
  }
}

// ---------- Logout / clear ----------

/**
 * Clear session-scoped state on logout. Optionally clears the per-user call
 * state key (`techsales:callState:${userId}`) — pass the current userId so
 * the user's own call doesn't persist into a re-login (QA H3).
 */
export function clearMode(userId?: string | null): void {
  try {
    sessionStorage.removeItem(MODE_KEY);
    sessionStorage.removeItem(SOURCE_KEY);
    sessionStorage.removeItem(AI_ENABLED_KEY);
    sessionStorage.removeItem(AI_PROVIDER_KEY);
    sessionStorage.removeItem(TWILIO_ENABLED_KEY);
    if (userId) {
      sessionStorage.removeItem(`techsales:callState:${userId}`);
    }
  } catch {
    // ignore
  }
}

// ---------- Backend probe ----------

interface HealthResponse {
  success: boolean;
  data?: {
    mode?: 'mongo' | 'json' | 'databricks';
    mongoUp?: boolean;
    aiEnabled?: boolean;
    aiProvider?: 'ollama' | 'anthropic';
    twilioEnabled?: boolean;
  };
}

/**
 * Probes the backend's `/api/health` to learn:
 *  - whether it booted into Mongo or JSON-store mode (`dataSource`)
 *  - whether AI features are currently enabled (`aiEnabled`, mirrors
 *    `AI_ENABLED` on the backend)
 *  - which LLM provider the backend is wired to (`aiProvider`, mirrors
 *    `AI_LLM_PROVIDER`) — drives the "AI: Ollama" / "AI: Claude" header pill
 *
 * Called once after a successful API login. Returns `{ dataSource: null }`
 * for the data-source field if the probe fails; AI defaults to `false` on
 * any failure (we'd rather hide AI UI than 501 the user mid-flow).
 */
export async function probeBackendMode(): Promise<DataAiState> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok)
      return { dataSource: null, aiEnabled: false, aiProvider: null, twilioEnabled: false };
    const body = (await res.json()) as HealthResponse;
    const mode = body.data?.mode;
    const dataSource =
      mode === 'mongo' || mode === 'json' || mode === 'databricks' ? mode : null;
    const aiEnabled = body.data?.aiEnabled === true;
    const provider = body.data?.aiProvider;
    const aiProvider = provider === 'ollama' || provider === 'anthropic' ? provider : null;
    const twilioEnabled = body.data?.twilioEnabled === true;
    return { dataSource, aiEnabled, aiProvider, twilioEnabled };
  } catch {
    return { dataSource: null, aiEnabled: false, aiProvider: null, twilioEnabled: false };
  }
}
