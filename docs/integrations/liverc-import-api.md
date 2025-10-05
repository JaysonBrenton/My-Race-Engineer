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
  "url": "https://liverc.com/results/<event>/<class>/<round>/<race>[.json]",
  "includeOutlaps": false
}
```

Where the `<event>/<class>/<round>/<race>` segments map to the structure used by
LiveRC URLs. For example, the final race of the 2024 Summer Nationals 17.5
Buggy class might live at
`https://liverc.com/results/2024-summer-nationals/17-5-buggy/round-4/a-main.json`.
Another example for a club night heat could be
`https://liverc.com/results/rc-club-night-012524/sportsman-2wd/round-2/heat-3`.
The service accepts either version—with or without the trailing `.json`—and
automatically normalises the URL before ingestion.

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
