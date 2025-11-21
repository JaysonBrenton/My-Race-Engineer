<!--
 * Project: My Race Engineer
 * File: docs/reviews/2025-05-19-antipattern-audit.md
 * Summary: Repository-wide review highlighting antipatterns and inefficiencies.
 -->

# Antipattern and inefficiency review — 2025-05-19

## Scope

Combed through server/runtime utilities, auth and rate-limit helpers, LiveRC ingestion workflows, and dependency fallbacks to spot structural antipatterns or performance pitfalls.

## Findings

### 1) In-memory rate limiter grows without bounds and performs linear scans

- The in-memory rate limiter keeps every timestamp for each `(bucket, identifier)` key in a module-level `Map` with no eviction or backpressure mechanism, so long-running processes will leak memory and eventually slow down under steady traffic.
- Each request re-filters the entire array and calls `Math.min(...recentEntries)`, making the hot path O(n) in the number of recorded hits per key; large buckets can trigger expensive spreads or even stack issues.
- **Recommendation:** Move to a sliding-window structure that trims expired entries in-place, caps per-key history, or backs the limiter with a TTL-aware store (e.g., Redis `ZSET` with `ZREMRANGEBYSCORE`) to bound memory and keep lookups O(log n) or better.

### 2) LiveRC import pipeline does heavy sequential I/O and double-sorts lap data

- `LiveRcImportService.executeImport` performs a fully sequential chain of persistence calls (event → class → session → entrant → lap replacement) inside nested loops, issuing `replaceForEntrant` and entrant lookups one-at-a-time per entry. Large race files will serialize hundreds of DB calls, stretching job latency and retry windows.
- Lap arrays are sorted twice: once per entrant inside `groupLapsByEntry`, and again when mapping to `LapUpsertInput` before writing. The redundant sorts add avoidable O(n log n) work for every driver.
- **Recommendation:** Batch lap and entrant upserts (or wrap in a transaction) to reduce round-trips, and rely on a single sort—either keep the grouped laps ordered and drop the second sort, or generate ordered inputs without re-sorting.

### 3) Mock lap repository copies and sorts data on every access with unbounded cache growth

- The `MockLapRepository` fallback reads mutate-free data by cloning, sorting, and mapping every stored lap list on each `listByEntrant` call, even when the dataset has not changed. Writes similarly clone every lap into the in-memory map, with no cap or eviction, so repeated imports can balloon memory use.
- Because the fallback paths run on every request when `DATABASE_URL` is unset or Prisma is down, the repeated allocations and sorts sit on a synchronous path that will slow local/dev usage and degrade resilience during outages.
- **Recommendation:** Keep lap arrays sorted at write time and reuse them on reads (or memoize the sorted copy), and add simple caps/TTL to the in-memory cache so fallback storage cannot grow without bound.
