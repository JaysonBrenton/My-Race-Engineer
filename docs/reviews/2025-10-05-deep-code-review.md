# Deep code & documentation review — 2025-10-05

## Scope
- LiveRC ingestion flows (`LiveRcImportService`, response mappers, Prisma persistence adapters).
- Import UI surface (`src/app/(dashboard)/import`) and its supporting utilities.
- SEO utilities (`src/lib/seo.ts`) and site metadata configuration.

## Critical issues
1. **File uploads with missing identifiers collapse into a single synthetic event/class/session.**
   - `parseRaceResultPayload` falls back to the hard-coded slugs `uploaded-event`, `uploaded-class`, `uploaded-round`, and `uploaded-race` when an uploaded JSON payload omits identifiers such as `event_id` or `race_id`.【F:src/core/app/liverc/responseMappers.ts†L220-L273】
   - Those fallback slugs are then used as the `sourceEventId`, `classCode`, `sourceSessionId`, and the synthetic `uploaded-file://…` URL written to Prisma during import.【F:src/core/app/services/importLiveRc.ts†L412-L536】
   - Consequence: two different uploads that lack identifiers will overwrite each other because they hash to the same deduplication keys, silently corrupting prior imports.

2. **Bookmarklet defaults to a broken relative redirect when `NEXT_PUBLIC_APP_ORIGIN` is unset.**
   - The bookmarklet target becomes `/import?src=` whenever the environment variable is missing, which navigates the user back to the LiveRC domain instead of our app when executed on an upstream results page.【F:src/app/(dashboard)/import/page.tsx†L17-L53】
   - In local/dev environments (where this variable is typically absent) the generated bookmarklet cannot load the importer, defeating its purpose.

3. **Import summaries under-report skipped entrants and laps.**
   - We increment `skippedEntrantCount` and `skippedLapCount` only when an entry list row is missing; entrants marked as `withdrawn` are skipped without touching these counters, and their laps disappear from the totals.【F:src/core/app/services/importLiveRc.ts†L286-L357】【F:src/core/app/liverc/responseMappers.ts†L75-L121】
   - Operators reviewing the summary will see fewer skipped entrants/laps than actually bypassed, making it harder to reconcile upstream data vs. stored records.

## Additional observations
- **SEO helpers default to the wrong local port.** `DEFAULT_APP_URL` still points at `http://localhost:3000` even though the README and dev server run on port 3001, so canonical URLs are wrong unless developers remember to set `APP_URL`/`NEXT_PUBLIC_APP_URL`.【F:src/lib/seo.ts†L1-L41】【F:README.md†L1-L35】

## Suggested next steps
- Accept file-upload metadata (or require it) and incorporate a higher-entropy namespace (e.g. file hash, timestamp) into the fallback identifiers so uploads do not collide. Update the `uploaded-file://` provenance format accordingly.
- Always emit an absolute bookmarklet target. Derive it from `APP_URL`/`NEXT_PUBLIC_APP_URL` with a sensible fallback so the generated bookmarklet works out of the box.
- Treat withdrawn entrants as “skipped” in the summary counters (and optionally log them) so telemetry dashboards reflect the true ingest outcome.
- Align `DEFAULT_APP_URL` with the documented dev port or, better, read the port from `process.env.PORT`/Next config to keep canonical links consistent during development.
