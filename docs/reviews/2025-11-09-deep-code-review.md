# Deep code review — 2025-11-09

## Scope
- LiveRC import API surface (`src/app/api/liverc/import` and `import-file` routes) and the shared `LiveRcImportService` orchestration that persists entry, session, entrant, and lap data.

## Critical issues

1. **`LiveRcImportService` will fetch arbitrary hosts, enabling SSRF against internal services.**
   - `parseLiveRcUrl` only validates the path shape under `/results/` and returns the caller-provided origin verbatim; there is no allowlist for trusted LiveRC domains.【F:src/core/liverc/urlParser.ts†L58-L132】
   - The API route passes that origin straight to `LiveRcImportService`, which reuses it to fetch entry lists and race results. Any authenticated caller can therefore coerce the server into issuing requests to arbitrary origins (e.g., the instance metadata service) so long as they tuck `/results/...` into the path.【F:src/core/app/services/importLiveRc.ts†L173-L207】
   - Guarding against SSRF requires rejecting URLs whose host is not an approved LiveRC domain (or, alternatively, proxying through a fixed allowlisted hostname). Until then, the import endpoints represent a critical security exposure.

2. **Withdrawn entrants leave stale lap data behind.**
   - When an entry list row is flagged `withdrawn`, the import loop logs the skip and increments counters, but it never calls into `entrantRepository` or `lapRepository` for that driver.【F:src/core/app/services/importLiveRc.ts†L293-L350】
   - If a driver had laps from an earlier import and is later marked withdrawn (or disappears from the entry list entirely), those old laps remain in the database because `replaceForEntrant` is only triggered when `persistEntrant` runs. Downstream reports will keep showing the driver as if they still completed laps, contradicting LiveRC’s source of truth.
   - The fix is to resolve the entrant by `sourceEntrantId` (even for skipped/withdrawn rows) and invoke `replaceForEntrant` with an empty collection so their historical laps are purged when LiveRC says they should vanish.

## Suggested next steps
- Tighten URL validation to permit only the known LiveRC hostnames, and add regression tests that cover both allowlisted and rejected origins to keep the SSRF protection intact.
- Teach the import path to clear laps for withdrawn or missing entrants (e.g., by fetching existing entrants via `findBySourceEntrantId`) so subsequent imports stay faithful to the LiveRC dataset.
