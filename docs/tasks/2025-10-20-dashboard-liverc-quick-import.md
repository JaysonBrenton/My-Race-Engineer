<!--
/**
 * Project: My Race Engineer
 * File: docs/tasks/2025-10-20-dashboard-liverc-quick-import.md
 * Summary: UX and API requirements for the Dashboard LiveRC quick import panel.
 */
-->

---

title: Dashboard LiveRC quick import
created: 2025-10-20
status: draft

---

## Current LiveRC quick import model (source of truth)

- LiveRC discovery is **club based**, not global.
- The quick import flow must let the user search for and select a **club** from our **Club table (Prisma-backed)** and pick a **start and end date**.
- The feature calls the discovery API with those inputs; the request body is `{ clubId: string, startDate: string (ISO YYYY-MM-DD), endDate: string (ISO YYYY-MM-DD), limit?: number }`.
- Discovery resolves `clubId` to a Club record (which stores the LiveRC subdomain), calls `https://<club-subdomain>.liverc.com/events/`, parses the events table, and filters events so only dates **between startDate and endDate (inclusive)** are returned.
- The URL `https://live.liverc.com/events/?date=<dateLabel>` does **not** exist on the current LiveRC site and must **never** be used by our code.

For the decision record that governs LiveRC discovery, see `docs/adr/ADR-20251120-liverc-club-based-discovery.md`.

### Constraints for Codex / implementation rules

- **Must not** introduce or use a `track` string field in LiveRC discovery inputs, UI, or schemas—discovery is keyed by `clubId`.
- **Must not** construct or call `https://live.liverc.com/events/?date=...` anywhere in code or tests.
- **Must** always resolve a `clubId` to a Club record and use its `subdomain` to build `https://<club-subdomain>.liverc.com/events/`.
- The dashboard quick import feature **must**:
  - Use a club search UI backed by our Club table (via an API); users may type search text, but only clubs selected from the search results (by id) are treated as valid input.
  - Send `{ clubId, startDate, endDate, limit? }` to `/api/connectors/liverc/discover`.
  - Display discovered events as a list, where each event carries an `eventRef` URL on the club subdomain.

## UX (specific for implementation)

### Dashboard shell (keep)

- Brand link: **MY RACE ENGINEER**
- Header buttons: **Settings**, **Sign out**
- Welcome line: `Welcome back to your telemetry hub {driverName}`

### Dashboard shell (remove)

- Buttons: **Start a new import**, **View marketing site**
- Sections: **Recent activity**, **Next steps**

### New panel: **LiveRC quick import** (client component)

- **Fields**
  - **Club** (search input)
    - Uses the new club search API backed by the synced LiveRC club catalogue.
    - Placeholder: `Search clubs…` and renders results with `clubName – location`.
    - Selecting a club stores the `clubId`; free-text values are not permitted.
  - **Search Start Date** (text input)
    - Placeholder: `DD-MM-YYYY`.
    - Required; accepts only two digits, dash, two digits, dash, four digits; rejects impossible dates (incl. leap years).
    - Convert to ISO `YYYY-MM-DD` before API calls.
  - **Search End Date** (text input)
    - Placeholder: `DD-MM-YYYY`.
    - Required; same validation as start date.
    - Must be ≥ start date.
    - Range length (end−start+1) must be ≤ **7** days.
- **Actions**
  - **Search** (primary)
    - Enabled only when a valid club is selected and the date range passes validation (≥ start, ≤ 7-day span).
    - Calls `POST /api/connectors/liverc/discover` with `{ clubId, startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD", limit: 40 }`.
  - **Create plan** (secondary)
    - Enabled when one or more results are checked.
    - Calls `POST /api/connectors/liverc/import/plan` with `{ events: [{ eventRef }] }`.
  - **Apply plan** (secondary)
    - Enabled when a `planId` exists and guardrails are satisfied.
    - Calls `POST /api/connectors/liverc/import/apply` with `{ planId }`.
- **Results list (after Search)**
  - Columns: **Select** (checkbox), **Event Title**, **Date/Time (local)**, **Link** (canonical LiveRC URL).
  - Events originate from parsing the selected club’s `/events/` page in the discovery service and are already filtered to the requested date range; the UI just renders the returned list (with any light client-side checks).
  - Sort: by **date/time asc** (using the event’s whenIso).
  - De‑duplicate by `eventRef` so the same event is not shown twice.
  - Already‑imported events: **shown but unchecked** by default.
  - Empty state: “No events found for that date range and club.”
- **Plan summary (after Create plan)**
  - Show **planId**, **selected event count**, and **estimated laps** (if provided per item).
  - If guardrail errors occur (too many events/laps), render the message inline and keep **Apply** disabled.
- **Status & errors**
  - Inline statuses: Loading…, Error: <message>.
  - Never crash the panel—always render a recoverable state.
- **Deprecations**
  - The legacy “Track or club name” free-text field and the retired global discovery endpoint are removed. This club-centric search flow replaces them completely.

---

## Constraints & Guardrails

- TypeScript strict. No new runtime dependencies.
- Typed routes ON. Do not relax ESLint/Prettier. Do not wrap string literals in parentheses.
- Layering: `web/` (Next) → API → services; no UI → infra shortcuts.
- Performance: P50 UI ≤ 300ms, P95 UI ≤ 800ms for discover/render. Avoid heavy client loops.
- Import guardrails: respect server caps (events per plan; lap estimates). Render friendly messages.
- Telemetry: use existing logger; add TODO hooks for metrics.
- Secrets: no `.env` changes in VCS.

---

## API contracts (club-based discovery)

### POST `/api/connectors/liverc/discover`

- **Request** (client sends ISO after converting DD‑MM‑YYYY):

```json
{ "clubId": "clb_123", "startDate": "2025-10-18", "endDate": "2025-10-21", "limit": 40 }
Validation

startDate and endDate must be valid ISO dates (YYYY‑MM‑DD).

startDate ≤ endDate and range length ≤ 7 days.

clubId must reference a known club.
```

Response (200)
{ "data": { "events": [
{ "eventRef": "https://canberra.liverc.com/events/2025-10-20-canberra-offroad-challenge",
"title": "Canberra Off Road Challenge",
"whenIso": "2025-10-20T09:00:00Z" }
] },
"requestId": "..." }
Errors

INVALID_JSON, INVALID_REQUEST, DISCOVERY_UPSTREAM_ERROR, UNEXPECTED_ERROR

POST /api/connectors/liverc/import/plan

Request: { "events": [{ "eventRef": "https://canberra.liverc.com/events/..." }] }

Response: { "data": { "planId": "...", "items": [ ... ] } }

POST /api/connectors/liverc/import/apply

Request: { "planId": "..." }

Response: 202 Accepted, body { "data": { "jobId": "..." } } and optional Location header.

Validation & Edge cases (UI)

Dates must be valid; reject impossible dates.

End date must be ≥ start date; range length ≤ 7.

Club selection is required; free-text input is not accepted.

Discovery with zero results is not an error.

Guardrail blocks prevent Apply and show message.

Acceptance criteria

Dashboard shows header + welcome + LiveRC quick import only.

Selecting a club via search and entering 18-10-2025 → 21-10-2025, Search renders results (or clean empty state). The request payload contains the `clubId` plus ISO startDate/endDate.

Selecting events and Create plan returns a planId and item counts.

Apply plan returns 202 and shows the jobId.

Errors are visible, human‑readable, and recoverable without reload.

## Historical design (superseded, do not implement)

This section describes the original v1 design and is kept for historical context only. Do not implement or reintroduce this pattern. The source of truth is the club based model described above.

- Inputs were **Track or club name** (free text), **Search Start Date**, **Search End Date**, and optional `limit`.
- Validation included “Track or club name must be at least 2 characters” alongside date checks.
- Example discovery payloads looked like:

  ```json
  { "startDate": "2025-10-18", "endDate": "2025-10-21", "track": "canberra", "limit": 40 }
  ```

- The intended upstream endpoint was described as `https://live.liverc.com/events/?date=<dateLabel>` built from the date range + track text; this endpoint no longer exists and must not be used.
- Commit guidance at the time referenced “date range + track” discovery and a free-text input; those references are historical only.

Commit guidance

Small, reviewable commits only:

feat(dashboard): replace CTAs with LiveRC quick import scaffold

feat(api): add /api/connectors/liverc/discover route (club search)

feat(core): add LiveRcDiscoveryService for club + range discovery

feat(dashboard): implement DD-MM-YYYY range handling in quick import

test(liverc): add discovery and route tests

docs(tasks): add 2025-10-20-dashboard-liverc-quick-import ---END FILE---

```

```
