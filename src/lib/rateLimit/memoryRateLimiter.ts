/**
 * Project: My Race Engineer
 * File: src/lib/rateLimit/memoryRateLimiter.ts
 * Summary: In-memory sliding-window rate limiter with automatic eviction of expired entries.
 */

const bucketStore = new Map<string, number[]>();

// Cap the number of keys in the Map to prevent unbounded growth from many unique identifiers.
// When the limit is reached, we evict the oldest entries using LRU-style behavior.
const MAX_STORED_KEYS = 10_000;

/**
 * Prunes expired entries from an array in-place and returns the trimmed array.
 * This avoids creating a new array on every check while still removing old timestamps.
 */
const trimExpiredEntries = (entries: number[], windowStart: number): number[] => {
  // Find the first index that's within the window (entries are naturally time-ordered
  // since we always append new timestamps).
  let firstValidIndex = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i] > windowStart) {
      firstValidIndex = i;
      break;
    }
  }

  // If all entries are expired, return empty array.
  if (firstValidIndex === 0 && entries.length > 0 && entries[0] <= windowStart) {
    return [];
  }

  // Slice from first valid index to keep recent entries.
  return entries.slice(firstValidIndex);
};

/**
 * Evicts oldest entries from the Map when it exceeds MAX_STORED_KEYS.
 * Uses a simple FIFO strategy: remove the first key encountered.
 */
const enforceKeyLimit = (): void => {
  if (bucketStore.size <= MAX_STORED_KEYS) {
    return;
  }

  // Evict the first (oldest) key. Map iteration order is insertion order in JavaScript,
  // so this approximates LRU behavior for eviction purposes.
  const firstKey = bucketStore.keys().next().value;
  if (firstKey) {
    bucketStore.delete(firstKey);
  }
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * Checks if a request exceeds the rate limit for the given bucket and identifier.
 * Automatically prunes expired entries and enforces a key limit to prevent unbounded growth.
 *
 * @param bucket - Rate limit bucket name (e.g., 'auth:login')
 * @param identifier - Unique identifier for the entity being rate-limited (e.g., IP address)
 * @param limit - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Rate limit check result with retry-after time if exceeded
 */
export const checkRateLimit = (
  bucket: string,
  identifier: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult => {
  const key = `${bucket}:${identifier}`;
  const existingEntries = bucketStore.get(key) ?? [];
  const windowStart = now - windowMs;

  // Trim expired entries in-place to keep only recent timestamps.
  const recentEntries = trimExpiredEntries(existingEntries, windowStart);

  if (recentEntries.length >= limit) {
    // Avoid spread operator for large arrays - use reduce or manual loop.
    // Since entries are naturally ordered (we append), the first entry is the oldest.
    const oldest = recentEntries.length > 0 ? recentEntries[0] : now;
    return { ok: false, retryAfterMs: Math.max(oldest + windowMs - now, 0) };
  }

  recentEntries.push(now);
  bucketStore.set(key, recentEntries);

  // Enforce key limit to prevent unbounded Map growth.
  enforceKeyLimit();

  return { ok: true };
};

export const resetRateLimit = (bucket: string, identifier: string) => {
  bucketStore.delete(`${bucket}:${identifier}`);
};
