# `core/app` services

The `core/app` layer orchestrates domain workflows by coordinating pure domain
rules with infrastructure adapters. Today it contains the LiveRC import service
that turns LiveRC timing endpoints into persisted Prisma records.

## LiveRC import service

`LiveRcImportService#importFromUrl(url, options)` is the public entry point. It:

1. **Parses the supplied URL** – extracts the event, class, round, and race
   slugs. Trailing `.json` extensions are trimmed so contributors can paste
   either the public results URL or the raw JSON endpoint.
2. **Fetches upstream data** – requests the class entry list and the race result
   JSON through the `LiveRcHttpClient`. Network failures, HTTP errors, and
   malformed JSON payloads are surfaced as structured `LiveRcHttpError`
   instances with retry-friendly detail.
3. **Upserts supporting records** – ensures the event, class, session, entrants,
   and laps exist in persistence, replacing stale lap rows when re-ingesting the
   same race.
4. **Builds a summary response** – returns the counts of entrants/laps processed
   (and skipped), the resolved upstream identifiers, and the `sourceUrl` for
   auditing.

### Lap persistence rules

- Lap identifiers are deterministic hashes derived from event/class/race/entrant
  identifiers plus `lapNumber`.
- Re-ingesting the same race updates existing laps (via
  `(entrantId, lapNumber)` uniqueness) and removes obsolete laps for that
  entrant/race pair.
- Laps flagged as outlaps are dropped unless `includeOutlaps: true` is supplied.
- Race laps with no matching entry-list entrant are skipped and recorded in the
  summary so operators can reconcile gaps with LiveRC.

### Testing guidance

- Unit tests stub repositories/HTTP clients so service logic runs in isolation.
- Integration tests should exercise the service against the fixtures under
  `fixtures/liverc/results/sample-event/sample-class/` to catch schema drift.
- Contract tests belong with the HTTP client to guarantee it translates upstream
  failures into meaningful `LiveRcHttpError` instances.

## Adding new services

When you add additional orchestration services, keep the following conventions:

- Accept domain-friendly inputs and depend only on interface-shaped adapters
  (repositories, HTTP clients) supplied via constructor injection.
- Emit typed error classes from the `core/app` layer so API routes can map
  failures deterministically.
- Update this README with the new service responsibilities so downstream
  maintainers can discover the behaviour quickly.
