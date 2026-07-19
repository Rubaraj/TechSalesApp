/**
 * Single source of truth for the API base URL.
 *
 * - Default `/api`: same-origin, resolved by the Vite dev proxy (dev) or a
 *   reverse proxy in front of the static build.
 * - Override with `VITE_API_BASE_URL` to point at a remote API, e.g.
 *   `https://api.rubarajan.dev/techsales/api` (the shared multi-project
 *   gateway). Trailing slash is trimmed so `${API_BASE}/path` composes.
 */
export const API_BASE: string = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'
).replace(/\/$/, '');
