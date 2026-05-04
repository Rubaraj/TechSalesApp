/**
 * Single source of truth for "should I render the AI feature?". Combines
 * three signals so a flip in any one of them turns AI off cleanly:
 *
 *   1. `VITE_AI_ENABLED` env var — build-time off-switch.
 *   2. `getMode()` — `'local'` means we're in offline-fallback mode and
 *      can't call the backend at all, so AI is off.
 *   3. `AuthContext.aiEnabled` — backend's `AI_ENABLED` flag, surfaced via
 *      `/api/health.aiEnabled` at login.
 *
 * Components should `if (!useAiEnabled()) return null` rather than mounting
 * half a feature. See plan §"Modular Flag".
 */
import { useAuth } from '../context/AuthContext';
import { getMode } from '../api/mode';

export function useAiEnabled(): boolean {
  const envOn = (import.meta.env.VITE_AI_ENABLED as string | undefined) !== 'false';
  const sessionMode = getMode();
  const { aiEnabled } = useAuth();
  return envOn && sessionMode === 'api' && aiEnabled === true;
}
