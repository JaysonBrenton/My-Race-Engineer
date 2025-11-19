<!--
/**
 * Project: My Race Engineer
 * File: docs/integrations/liverc-connectors.md
 * Summary: Overview of the LiveRC connector responsibilities and discovery model.
 */
-->

# LiveRC Connectors Overview

The LiveRC connector layer in `src/core/app/connectors/liverc/` exposes the
cohesive set of adapters that translate between upstream LiveRC data and the My
Race Engineer domain. The table below captures each connector, its primary
responsibilities, and the automated tests that cover the behaviour.

| Connector    | Responsibilities                                                                                                                                  | Primary tests                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `client.ts`  | HTTP client responsible for fetching LiveRC HTML/JSON payloads, resolving JSON endpoints from HTML fallbacks, and normalising upstream errors.    | `tests/core/liverc/client.test.ts`, `tests/liverc-http-client.test.ts` |
| `parse.ts`   | HTML parsing utilities that enumerate event sessions, extract metadata, and read session result tables.                                           | `tests/core/liverc/parse.test.ts`                                      |
| `plan.ts`    | Builds import plans by combining parsed session metadata with repository state to estimate workload and classify events as new/partial/existing.  | `tests/core/liverc/importPlanService.test.ts`                          |
| `summary.ts` | Orchestrates summary ingestion for event sessions, persisting events, classes, sessions, result rows, and laps while logging ingestion telemetry. | `tests/core/liverc/summaryImporter.test.ts`                            |
| `jobs.ts`    | In-memory job queue that schedules LiveRC summary imports, retries failures, and updates job progress as items complete.                          | `tests/core/liverc/jobQueue.test.ts`                                   |
| `lapId.ts`   | Deterministically hashes the composite identifiers for lap records so lap writes remain idempotent across imports.                                | `tests/core/liverc/lapId.test.ts`                                      |

All connectors share fixtures under `fixtures/liverc/**` to ensure parser and
importer expectations stay aligned with representative LiveRC HTML/JSON outputs.
The test suite catalog (`docs/guides/test-suite-catalog.md`) lists the
full collection of LiveRC-related tests and their intent.

## Discovery model

- **Club catalogue (new baseline):** A background sync enumerates the LiveRC
  track list surfaced on https://live.liverc.com/ and persists each club (name,
  slug, and LiveRC subdomain) so the Dashboard can expose a first-class club
  selector. The discovery backend now consumes a `clubId` resolved from this
  catalogue rather than arbitrary text.
- **Per-club event discovery:** Events are fetched by requesting the club’s
  public schedule page at `https://<club-subdomain>.liverc.com/events/` and
  parsing the table rows for event names, dates, and canonical links. The date
  filter logic happens on our side; LiveRC does not expose a parameterised date
  endpoint for this view.
- **Removed range + track substring search:** The former discovery flow that hit
  `https://live.liverc.com/events/?date=` with `{ startDate, endDate, track }`
  has been retired because LiveRC no longer serves that API. Any references to
  it should be treated as legacy documentation only.
- **Import plan + summary connectors unchanged:** After discovery returns
  candidate events, the existing `plan.ts` and `summary.ts` connectors continue
  to orchestrate import planning and execution exactly as before. Their
  contracts remain valid, and no call sites should change beyond passing in the
  new `eventRef` URLs that point at club-specific subdomains.
