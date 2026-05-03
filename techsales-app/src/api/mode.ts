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
export type DataSource = 'mongo' | 'json';

const MODE_KEY = 'medhub-mode';
const SOURCE_KEY = 'medhub-data-source';

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
    return v === 'mongo' || v === 'json' ? v : null;
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

// ---------- Logout / clear ----------

export function clearMode(): void {
  try {
    sessionStorage.removeItem(MODE_KEY);
    sessionStorage.removeItem(SOURCE_KEY);
  } catch {
    // ignore
  }
}

// ---------- Backend probe ----------

interface HealthResponse {
  success: boolean;
  data?: {
    mode?: 'mongo' | 'json';
    mongoUp?: boolean;
  };
}

/**
 * Probes the backend's `/api/health` to learn whether it booted into Mongo or
 * JSON-store mode. Called once after a successful API login. Returns `null`
 * if the probe fails — caller decides what default to apply.
 */
export async function probeBackendMode(): Promise<DataSource | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    const body = (await res.json()) as HealthResponse;
    const mode = body.data?.mode;
    return mode === 'mongo' || mode === 'json' ? mode : null;
  } catch {
    return null;
  }
}
