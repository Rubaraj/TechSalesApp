import type { ServiceResponse } from '../services/baseService';
import { API_BASE as BASE } from './apiBase';

/**
 * Minimal HTTP client per plan §7.
 *
 * - Base URL is `/api` by default (Vite proxy handles routing in dev). Override
 *   via `VITE_API_BASE_URL` for non-proxy deployments (see api/apiBase.ts).
 * - No `Authorization` header — auth is out of scope (plan §6 "Auth — deliberately minimal").
 * - Returns the parsed JSON body verbatim. Network errors propagate as thrown
 *   `TypeError`s (the AuthContext catches them at login time to flip mode).
 */

export async function api<T>(path: string, init?: RequestInit): Promise<ServiceResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  return (await res.json()) as ServiceResponse<T>;
}

export const apiGet = <T>(path: string): Promise<ServiceResponse<T>> => api<T>(path);

export const apiPost = <T>(path: string, body: unknown): Promise<ServiceResponse<T>> =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const apiPatch = <T>(path: string, body: unknown): Promise<ServiceResponse<T>> =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) });

export const apiDelete = <T>(path: string): Promise<ServiceResponse<T>> =>
  api<T>(path, { method: 'DELETE' });
