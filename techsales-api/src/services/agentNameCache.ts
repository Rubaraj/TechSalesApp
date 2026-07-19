/**
 * Small TTL'd userId → display-name cache shared by the supervisor stream
 * and the QA endpoints. Keeps agent-name enrichment cheap without going
 * stale forever (names can be edited in User Management).
 */
import { repos } from '../repositories/registry.js';

const TTL_MS = 5 * 60_000;

interface Entry {
  name: string | null;
  at: number;
}

const cache = new Map<string, Entry>();

export async function resolveAgentName(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.name;
  let name: string | null = null;
  try {
    const user = await repos.user.findById(userId);
    if (user) name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || null;
  } catch {
    // lookup failure → treat as unknown, cache the miss briefly too
  }
  cache.set(userId, { name, at: Date.now() });
  return name;
}

/** Batch variant — resolves distinct ids concurrently, returns a map. */
export async function resolveAgentNames(
  userIds: Array<string | undefined>,
): Promise<Map<string, string>> {
  const distinct = [...new Set(userIds.filter((u): u is string => !!u))];
  const out = new Map<string, string>();
  await Promise.all(
    distinct.map(async (id) => {
      const name = await resolveAgentName(id);
      if (name) out.set(id, name);
    }),
  );
  return out;
}
