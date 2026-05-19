const SUCCESS_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;

type CacheEntry =
  | { ok: true; expiresAt: number; value: unknown }
  | { ok: false; expiresAt: number; error: string };

const cache = new Map<string, CacheEntry>();

export function cacheKey(name: string, input: unknown): string {
  return `${name}:${JSON.stringify(input)}`;
}

export async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    if (existing.ok) return existing.value as T;
    throw new Error(existing.error);
  }

  try {
    const value = await fn();
    cache.set(key, { ok: true, expiresAt: now + SUCCESS_TTL_MS, value });
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cache.set(key, { ok: false, expiresAt: now + FAILURE_TTL_MS, error: message });
    throw error;
  }
}

export function clearCache(): void {
  cache.clear();
}
