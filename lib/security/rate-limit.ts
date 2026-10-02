const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const item = buckets.get(key);
  if (!item || item.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (item.count >= limit) return { ok: false, retryAfter: Math.ceil((item.resetAt - now) / 1000) };
  item.count += 1;
  return { ok: true, retryAfter: 0 };
}
