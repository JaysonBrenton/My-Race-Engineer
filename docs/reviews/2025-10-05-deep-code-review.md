# Deep code & documentation review — 2025-10-05

> **2025-12 note:** The direct `/api/liverc/import` and `/api/liverc/import-file` endpoints mentioned below were retired in favour of the connector workflow. The findings remain for historical traceability.

## Scope

- LiveRC ingestion flows (`LiveRcImportService`, response mappers, Prisma persistence adapters).
- Import UI surface (`src/app/(dashboard)/import`) and its supporting utilities.
- SEO utilities (`src/lib/seo.ts`) and site metadata configuration.

## Resolution summary (2025-10 follow-up)

- File upload imports now attach filename, size, timestamps, and a SHA-256 digest to build a high-entropy namespace that seeds fallback slugs and the `uploaded-file://` provenance URL, preventing collisions when upstream identifiers are absent.【F:src/app/(dashboard)/import/ImportForm.tsx†L66-L133】【F:src/app/api/liverc/import-file/route.ts†L1-L147】【F:src/core/app/services/importLiveRc.ts†L208-L258】【F:src/core/app/liverc/uploadNamespace.ts†L1-L55】
- The importer bookmarklet always emits an absolute target derived from environment configuration (falling back to `http://localhost:3001`), so local development flows succeed without manual overrides.【F:src/app/(dashboard)/import/page.tsx†L12-L39】
- Withdrawn entrants and their laps increment the skipped counters, ensuring import summaries accurately reflect dropped data.【F:src/core/app/services/importLiveRc.ts†L284-L339】
- Development defaults for canonical URLs now match the documented port 3001, keeping SEO helpers aligned with the actual dev server.【F:src/lib/seo.ts†L1-L22】【F:README.md†L5-L27】

## Critical issues

1. **File uploads with missing identifiers collapse into a single synthetic event/class/session.**
   - `parseRaceResultPayload` falls back to the hard-coded slugs `uploaded-event`, `uploaded-class`, `uploaded-round`, and `uploaded-race` when an uploaded JSON payload omits identifiers such as `event_id` or `race_id`.【F:src/core/app/liverc/responseMappers.ts†L220-L273】
   - Those fallback slugs are then used as the `sourceEventId`, `classCode`, `sourceSessionId`, and the synthetic `uploaded-file://…` URL written to Prisma during import.【F:src/core/app/services/importLiveRc.ts†L412-L536】
   - Consequence: two different uploads that lack identifiers will overwrite each other because they hash to the same deduplication keys, silently corrupting prior imports.
   - _Status: Resolved with upload metadata–seeded namespaces and enriched provenance URLs._【F:src/app/api/liverc/import-file/route.ts†L1-L147】【F:src/core/app/services/importLiveRc.ts†L208-L258】

2. **Bookmarklet defaults to a broken relative redirect when `NEXT_PUBLIC_APP_ORIGIN` is unset.**
   - The bookmarklet target becomes `/import?src=` whenever the environment variable is missing, which navigates the user back to the LiveRC domain instead of our app when executed on an upstream results page.【F:src/app/(dashboard)/import/page.tsx†L17-L53】
   - In local/dev environments (where this variable is typically absent) the generated bookmarklet cannot load the importer, defeating its purpose.
   - _Status: Resolved by always deriving an absolute origin with a localhost:3001 fallback._【F:src/app/(dashboard)/import/page.tsx†L12-L39】

3. **Import summaries under-report skipped entrants and laps.**
   - We increment `skippedEntrantCount` and `skippedLapCount` only when an entry list row is missing; entrants marked as `withdrawn` are skipped without touching these counters, and their laps disappear from the totals.【F:src/core/app/services/importLiveRc.ts†L286-L357】【F:src/core/app/liverc/responseMappers.ts†L75-L121】
   - Operators reviewing the summary will see fewer skipped entrants/laps than actually bypassed, making it harder to reconcile upstream data vs. stored records.
   - _Status: Resolved; withdrawn entrants now increment both counters with contextual logging._【F:src/core/app/services/importLiveRc.ts†L298-L329】

## Additional observations

- **SEO helpers default to the wrong local port.** `DEFAULT_APP_URL` still points at `http://localhost:3000` even though the README and dev server run on port 3001, so canonical URLs are wrong unless developers remember to set `APP_URL`/`NEXT_PUBLIC_APP_URL`.【F:src/lib/seo.ts†L1-L41】【F:README.md†L1-L35】
  - _Status: Resolved; `DEFAULT_APP_URL` reads the Next dev port and falls back to `http://localhost:3001`._【F:src/lib/seo.ts†L1-L22】

## Suggested next steps

- Accept file-upload metadata (or require it) and incorporate a higher-entropy namespace (e.g. file hash, timestamp) into the fallback identifiers so uploads do not collide. Update the `uploaded-file://` provenance format accordingly.
- Always emit an absolute bookmarklet target. Derive it from `APP_URL`/`NEXT_PUBLIC_APP_URL` with a sensible fallback so the generated bookmarklet works out of the box.
- Treat withdrawn entrants as “skipped” in the summary counters (and optionally log them) so telemetry dashboards reflect the true ingest outcome.
- Align `DEFAULT_APP_URL` with the documented dev port or, better, read the port from `process.env.PORT`/Next config to keep canonical links consistent during development.
