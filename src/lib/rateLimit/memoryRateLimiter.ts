const bucketStore = new Map<string, number[]>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

export const checkRateLimit = (
  bucket: string,
  identifier: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult => {
  const key = `${bucket}:${identifier}`;
  const entries = bucketStore.get(key) ?? [];
  const windowStart = now - windowMs;
  const recentEntries = entries.filter((timestamp) => timestamp > windowStart);

  if (recentEntries.length >= limit) {
    const oldest = Math.min(...recentEntries);
    return { ok: false, retryAfterMs: Math.max(oldest + windowMs - now, 0) };
  }

  recentEntries.push(now);
  bucketStore.set(key, recentEntries);

  return { ok: true };
};

export const resetRateLimit = (bucket: string, identifier: string) => {
  bucketStore.delete(`${bucket}:${identifier}`);
};
