# Deep code review — 2024-10-07

## Scope
- Runtime flow for the LiveRC ingestion API (`src/app/api/liverc/import/route.ts`).
- LiveRC import service orchestration (`src/core/app/services/importLiveRc.ts`).
- HTTP adapter for LiveRC (`src/core/infra/http/liveRcClient.ts`).
- Supporting documentation under `docs/integrations`.

## High-signal findings
1. **HTTP error mapping gap** – `LiveRcHttpClient` wraps non-2xx responses in `LiveRcHttpError`, but the API route only handles `LiveRcImportError` and Prisma init faults. Any LiveRC 4xx/5xx today bubbles to the generic 500 handler, hiding useful context from the client (`ENTRY_LIST_FETCH_FAILED`, `RACE_RESULT_FETCH_FAILED`, status codes). The route should branch on `LiveRcHttpError` and surface a deterministic 4xx/5xx envelope instead of "unexpected error".
2. **Entry list contract violation** – the import service happily creates entrants when a lap exists without a matching entry-list row. Docs explicitly call for rejecting orphan laps to avoid inventing drivers; today we silently hydrate entrants from race-result payloads. This leaks bad upstream data into persistence and breaks dedupe by entryId.
3. **Session timestamp parsing risk** – `parseDateOrNull` pipes LiveRC `startTimeUtc` straight into `new Date(value)`. LiveRC often emits naive `YYYY-MM-DD HH:MM:SS` strings; Node parses those in the server's local timezone. On Sydney-hosted infra that shifts events by +10/+11 hours. We should either treat ambiguous strings as `null` or parse with an explicit timezone derived from the event metadata.

## Documentation alignment
- Updated `docs/integrations/liverc-data-model.md` so the reference schema matches the current Prisma/domain models (`Lap.entrantId`, `(entrantId, lapNumber)` uniqueness, `Entrant` owning driver names).

## Suggested next steps
- Teach the API route to detect `LiveRcHttpError` and respond with its status/code payload.
- Harden `LiveRcImportService` to fail fast when an entry list row is missing for a lap entry; logging the upstream identifiers will help debugging LiveRC quirks.
- Replace `new Date(...)` parsing with a safe parser (e.g. `DateTime.fromSQL` via `luxon`) or discard timestamps that lack timezone context.
