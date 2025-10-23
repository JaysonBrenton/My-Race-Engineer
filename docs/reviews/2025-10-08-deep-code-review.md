# Deep code review — 2025-10-08

> **2025-12 note:** The file-upload route referenced here (`/api/liverc/import-file`) has been removed; connector-based ingestion replaces it. These notes remain as an archival record of the prior behaviour.

## Scope

- LiveRC file-upload ingestion pipeline (`src/app/api/liverc/import-file/route.ts`, `src/core/app/liverc/uploadNamespace.ts`, `src/core/app/services/importLiveRc.ts`, `src/core/app/liverc/responseMappers.ts`).
- Offline lap summary fallbacks wired through `src/dependencies/server.ts` and exercised by `tests/lap-summary-dependencies.test.ts`.

## Critical issues

1. **File-upload imports can no longer deduplicate identical payloads.**
   - The import-file route mixes the random request ID into the namespace seed that feeds every fallback identifier written to Prisma (`sourceEventId`, `classCode`, `sourceSessionId`, and the `uploaded-file://…` provenance URL).【F:src/app/api/liverc/import-file/route.ts†L165-L205】【F:src/core/app/liverc/uploadNamespace.ts†L1-L75】
   - When upstream JSON omits event/class/race IDs (the very scenario the fallback is meant to cover), two uploads of the **same** file now land in distinct namespaces because each request ID differs. Both `parseRaceResultPayload` and `buildUploadedSourceUrl` carry that seed forward, so every retry creates a brand-new event/class/session tuple instead of upserting the prior record.【F:src/core/app/liverc/responseMappers.ts†L272-L301】【F:src/core/app/services/importLiveRc.ts†L224-L595】
   - Consequence: operations staff lose idempotency. A transient network hiccup or a manual re-run produces duplicate events and sessions with no shared keys, so dashboards show double counts and reconciliation becomes manual.
   - **Fix:** make the namespace seed deterministic for a given payload (e.g. hash + size + timestamps) and drop the per-request entropy, while still allowing an explicit override when collisions must be forced apart.

2. **Mock lap fallbacks tag non-baseline entrants with the wrong session.**
   - `MockLapRepository.listByEntrant` always stamps fallback laps with the hard-coded `baseline-session` ID, regardless of which entrant is being served.【F:src/dependencies/server.ts†L48-L126】
   - In the offline/dev path (no `DATABASE_URL`) the lap summary service is expected to service arbitrary entrants, as shown in `lap-summary-dependencies.test.ts`, but those callers receive laps tied to the baseline session instead of their own context.【F:tests/lap-summary-dependencies.test.ts†L66-L139】
   - Consequence: any feature that groups by session (charts, comparisons, or future caching keyed by `{entrantId, sessionId}`) will mis-associate fallback laps, leading to empty UI states or polluted aggregates until a real import runs.
   - **Fix:** derive the session ID from the caller’s context (e.g. allow the mock to look up the entrant before emitting laps) or, at minimum, scope the fallback laps to the baseline entrant only so other IDs fail fast instead of receiving mismatched data.

## Suggested next steps

- Adjust the upload namespace helper so it produces a stable slug for identical files (hash/size/timestamps) and reserve request-specific entropy for optional overrides.
- Update the mock lap repository to respect each entrant’s session (or restrict the fallback to the baseline seed) and extend the dependency test to assert the session ID so regressions trip immediately.
