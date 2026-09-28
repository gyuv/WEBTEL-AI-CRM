const buckets = new Map<string, number[]>();

/** Simple in-memory sliding-window limiter (per server instance). */
export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}
