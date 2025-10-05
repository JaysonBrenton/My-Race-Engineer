# LiveRC Import API Route

The `/api/liverc/import` endpoint is the server entry point that kicks off an
import from the LiveRC timing service.

## Request

```http
POST /api/liverc/import
Content-Type: application/json
X-Request-Id: <optional>
```

```json
{
  "url": "https://dnc.liverc.com/results/?p=view_race_result&id=3485642",
  "includeOutlaps": false
}
```

LiveRC organises result links using `<event>/<class>/<round>/<race>` segments,
but the public site often serves them via query-string pages. The example above
points at the 1:8 Pro Nitro Buggy A-Main from the 2022 Dirt Nitro Challenge.
LiveRC occasionally retires historical events, so treat the URL as
illustrative—swap in a current race when exercising the importer. The canonical
slug pieces for the example race would be
`2022-the-dirt-nitro-challenge/1-8-pro-nitro-buggy/main-events/a-main`, and the
importer normalises either slug-style or query-string URLs—trailing `.json`
remains optional.

### Example `curl` requests

The importer accepts both the query-string links LiveRC exposes in its UI and
the canonical slug-based URLs. The commands below demonstrate how to verify a
result endpoint before submitting it to the API.

```bash
# Query-string view as shown in LiveRC UI (replace <race-id> with a live entry)
curl -IL "https://club.liverc.com/results/?p=view_race_result&id=<race-id>"

# Canonical slug without the optional .json suffix
curl -IL "https://club.liverc.com/results/<event>/<class>/<round>/<race>"

# Canonical slug with explicit .json suffix (importer trims it automatically)
curl -IL "https://club.liverc.com/results/<event>/<class>/<round>/<race>.json"
```

Use the placeholder commands to confirm that a specific race is reachable
before invoking the importer. A `200 OK` (or a redirect that lands on `200`)
signals that the upstream resource is available; a `404` typically indicates
that the event has been archived or the slug is mistyped.

```bash
# Submit a race to the importer with outlaps disabled
curl -X POST http://localhost:3001/api/liverc/import \
  -H 'Content-Type: application/json' \
  -H 'X-Request-Id: cli-demo-001' \
  -d '{
    "url": "https://club.liverc.com/results/?p=view_race_result&id=<race-id>",
    "includeOutlaps": false
  }'

# Submit another race and include outlaps in the summary
curl -X POST http://localhost:3001/api/liverc/import \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://club.liverc.com/results/<event>/<class>/<round>/<race>",
    "includeOutlaps": true
  }'
```

The importer responds with a `202 Accepted` payload on success and returns a
structured error envelope (with an HTTP status that mirrors the upstream
failure) when validation or LiveRC fetches fail.

- `url` *(required)* – LiveRC race result URL to ingest. Trailing `.json` is
  optional; the service trims it before reconstructing upstream requests.
- `includeOutlaps` *(optional)* – set to `true` to include outlaps in lap
  summaries; defaults to `false`.

## Responses

### Accepted

A successful submission returns `202 Accepted` with a summary envelope. The
payload contains ingestion counts and metadata and always echoes the
`requestId` so the caller can correlate logs.

### Validation and parsing errors

Malformed JSON or schema validation failures return `400 Bad Request` with a
structured `error` object describing the failure and a `requestId` for
correlation.

### LiveRC upstream failures

When the LiveRC HTTP client surfaces a `LiveRcHttpError`, the route propagates
the upstream status code, error code, and error details directly to the caller.
Example:

```json
{
  "error": {
    "code": "RACE_RESULT_FETCH_FAILED",
    "message": "LiveRC returned a server error.",
    "details": { "attempt": 1 }
  },
  "requestId": "<request id>"
}
```

This behaviour applies to any HTTP status (404, 500, etc.) raised by the LiveRC
client so downstream systems can differentiate between missing resources and
transient server issues without additional mapping logic. Network failures and
JSON parse errors are reported with `502` status, a failure-specific error code
(`ENTRY_LIST_FETCH_FAILED`, `ENTRY_LIST_INVALID_RESPONSE`,
`RACE_RESULT_FETCH_FAILED`, or `RACE_RESULT_INVALID_RESPONSE`), and an embedded
`cause` describing the underlying error.

### Infrastructure failures

If Prisma cannot connect to the backing database, the route responds with `503
Service Unavailable` and an error code of `DATABASE_UNAVAILABLE`.

Unexpected errors remain mapped to `500 Internal Server Error` with code
`UNEXPECTED_ERROR`.

## Troubleshooting

- **Connection refused on port 80:** The Next.js app only listens on the port
  defined by the `PORT` environment variable (`3001` in the default `.env`
  template). Point `curl` at `http://localhost:3001` (or the host/port combo you
  configured) rather than port `80` or the framework default of `3000`.
- **Next.js 404 page on `/api/liverc/import`:** This typically means the request
  reached the app but on the wrong host/port, so the API route was never
  matched. Double-check that the `APP_URL`, `HOST`, and `PORT` values in your
  environment match the URL you are posting to. Restart the dev server after any
  `.env` changes so the updated settings take effect.

## Usability flows

- **Paste anything** – operators land on a single-field form that accepts any
  LiveRC URL. The parser validates the link in real time, explains whether it
  maps to JSON or legacy HTML results, and highlights the canonical JSON link
  they should submit.
- **Wizard** _(flagged)_ – when the `ENABLE_LIVERC_RESOLVER` flag is enabled the
  UI exposes a guided, multi-step flow. It starts with the paste field, adds a
  confirmation step that previews the detected event/class/race, and finishes
  with the import summary so teams can retry failures without leaving the
  wizard.
- **Bulk paste** – the bulk editor accepts newline-delimited URLs, validates
  each entry, and shows queue states (`queued`, `importing`, `done`, `error`) so
  stewards can watch hundreds of imports progress without reloading the page.
- **Bookmarklet** – internal integrators can install the bookmarklet to capture
  the current LiveRC results page. Activating it opens the import form with the
  URL pre-filled, bypassing copy/paste friction for production race control.
- **File drop** _(flagged)_ – when enabled, operators can drag a JSON payload
  exported from LiveRC straight onto the form. The app parses the file
  client-side, shows a preview of detected drivers and laps, and only sends the
  payload to the server after the steward confirms the metadata.
