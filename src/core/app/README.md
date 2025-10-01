# `core/app` services

This package coordinates domain logic with infra adapters. The LiveRC ingestion
service (to be implemented) will follow the pipeline below so all connectors stay
consistent with the [`LiveRC → TPTE Data Contract`](../../../docs/integrations/liverc-data-model.md).

## Ingestion workflow

1. **Bootstrap context**
   - Accept one or more LiveRC URLs (event, class, session, or driver views).
   - Parse the URL to extract `eventSlug`, `classSlug`, optional `roundSlug`,
     `raceSlug`, and/or `entryId` query parameters.
   - Resolve the target scope: *event-wide*, *class-only*, *specific round*, or
     *single driver*.

2. **Discovery (entry list + session selection)**
   - Fetch the entry list for each targeted class.
   - Normalise driver names to NFC and cache `entry_id` → driver metadata.
   - When URLs include a driver filter, drop all other entries before
     scheduling downstream requests.
   - Load the heat sheet for each relevant round and filter heats whose
     `session_type` matches the URL intent (e.g., skip practice when the URL is a
     qualifying round).
   - Combine ranking and multi-main data to determine which race IDs are
     complete and relevant to the selected drivers/classes.

3. **Download + normalise race data**
   - For each race ID, fetch the race result JSON.
   - Join back to the cached entry list to enrich driver metadata (number,
     spelling, sponsor tags) before creating domain models.
   - Convert lap times to integer milliseconds and generate deterministic lap
     IDs as described in the data contract.
   - Tag laps with metadata (`isOutlap`, penalties) to support filtering in the
     app layer.

4. **Deduplication and persistence**
   - Upsert every lap through the Prisma `Lap` model using the composite
     constraint `(driverName, lapNumber)` to guarantee idempotency.
   - If a new payload reports fewer laps than currently stored for the same
     driver/race, delete the superseded rows so re-scored results stay accurate.
   - Persist import metadata (source URL, fetched at, checksum) alongside the lap
     batch once the infra layer exposes a store for it.

5. **Session/class selection heuristics**
   - **Event URL** → ingest every class whose slug matches the supplied path.
     Respect class filters embedded in query parameters (e.g., `?class=2wd-mod`).
   - **Class URL** → ingest only the matching class; include all completed rounds
     unless a `round` query parameter is supplied.
   - **Session URL** → ingest only heats/mains whose round or race slug matches
     the path segment (e.g., `/round-3/heat-2` → `round_id === 3`, `heat_id === 2`).
   - **Driver URL** → intersect the above scopes with the targeted `entry_id` to
     avoid pulling unrelated drivers.

6. **Normalisation outputs**
   - Return an application DTO describing the import (counts, fastest lap,
     per-driver summary) alongside the persisted lap IDs.
   - Emit structured logs and analytics events (success/failure, scope, source
     URLs) for observability.

## Testing guidance

- Provide fixture payloads for each LiveRC endpoint and assert that repeated
  ingestion runs are idempotent.
- Mock infra adapters in unit tests so the domain/service logic can run without
  network access.
- Add integration tests that exercise the full pipeline against recorded LiveRC
  responses to catch schema drift.
