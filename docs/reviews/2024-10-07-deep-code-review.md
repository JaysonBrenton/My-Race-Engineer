# Deep code review — 2024-10-07

## Scope
- Runtime flow for the LiveRC ingestion API (`src/app/api/liverc/import/route.ts`).
- LiveRC import service orchestration (`src/core/app/services/importLiveRc.ts`).
- HTTP adapter for LiveRC (`src/core/infra/http/liveRcClient.ts`).
- Supporting documentation under `docs/integrations`.

## High-signal findings
1. **HTTP error mapping gap** *(Resolved 2024-12)* – `LiveRcHttpClient` now throws `LiveRcHttpError` instances and the API route maps them verbatim to HTTP responses (`status`, `code`, `details`). Follow-up reviews (2025-03) confirmed network/JSON failures are also translated with actionable `cause` details.
2. **Entry list contract violation** *(Resolved 2024-11)* – `LiveRcImportService` skips laps that lack an entry-list match, increments the skipped counters, and logs identifiers for reconciliation instead of creating phantom entrants.
3. **Session timestamp parsing risk** *(Resolved 2025-01)* – Ambiguous timestamps are treated as `null`, preventing timezone drift across hosting regions. A future ingestion enhancement can store richer schedule metadata once LiveRC exposes timezones explicitly.

## Documentation alignment
- Updated `docs/integrations/liverc-data-model.md` so the reference schema matches the current Prisma/domain models (`Lap.entrantId`, `(entrantId, lapNumber)` uniqueness, `Entrant` owning driver names).

## Suggested next steps
- Teach the API route to detect `LiveRcHttpError` and respond with its status/code payload.
- Harden `LiveRcImportService` to fail fast when an entry list row is missing for a lap entry; logging the upstream identifiers will help debugging LiveRC quirks. ✅ (2024-11)
- Replace `new Date(...)` parsing with a safe parser (e.g. `DateTime.fromSQL` via `luxon`) or discard timestamps that lack timezone context. ✅ (2025-01)

---

_Maintenance note:_ This review is treated as a living reference for the LiveRC ingestion stack. Keep it in sync with major architecture changes and cross-link updates back in [`AGENTS.md`](../../AGENTS.md) so future reviewers can discover the latest context quickly.
