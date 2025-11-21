<!--
/**
 * Project: My Race Engineer
 * File: docs/adr/ADR-20251120-liverc-club-based-discovery.md
 * Summary: Record the pivot to club-based LiveRC discovery and rejection of the legacy /events/?date endpoint.
 */
-->

# ADR-20251120: LiveRC discovery pivots to club-based endpoints

- Status: Accepted
- Date: 2025-11-20
- Authors: LiveRC Connector Working Group

## Context

- The original LiveRC discovery design targeted a presumed global endpoint at `https://live.liverc.com/events/?date=<dateLabel>`
  built from a date range and free-text track substring.
- The `https://live.liverc.com/events/?date=<dateLabel>` endpoint does not exist on the current LiveRC site, resulting in 404s
  and preventing discovery from returning real events.
- The v1 design also accepted a free-text `track` field that was fuzzy matched against event track names, coupling discovery to a
  non-existent upstream surface.

## Decision

- Discovery is now **club based** and must not depend on the non-existent global date endpoint.
- Clients must provide a `clubId` that refers to a stored `Club` record.
- The discovery connector resolves that `clubId` to the club’s LiveRC subdomain and fetches `https://<club-subdomain>.liverc.com/events/`.
- Events are filtered locally using the supplied `startDate` and `endDate` to bound the inclusive date range.
- The discovery API input schema is `{ clubId, startDate, endDate, limit? }`; the `track` field has been removed.
- URLs of the form `https://live.liverc.com/events/?date=...` are invalid and must not be used by services, routes, or tests.

## Consequences

- The Dashboard quick import UI must surface a club selector backed by the `Club` catalogue and send `clubId` plus dates to the
  discovery route.
- Any code or tests referencing `/events/?date` or track-based discovery must be updated or removed as the refactor progresses.
- Import plan, apply, and summary connectors remain unchanged and continue to operate on the events discovered via the club-based
  connector.
- Future work may add a LiveRC club sync job to populate and refresh the `Club` table from the root track list; that initiative is
  orthogonal to the discovery behaviour captured here.
