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

- **Paste anything**
  - Screenshot: _pending quick paste modal capture_
  - Wireframe: _pending quick paste modal wireframe_
- **Wizard** _(flagged)_
  - Screenshot: _pending multi-step wizard capture_
  - Wireframe: _pending multi-step wizard wireframe_
- **Bulk paste**
  - Screenshot: _pending bulk editor capture_
  - Wireframe: _pending bulk editor wireframe_
- **Bookmarklet**
  - Screenshot: _pending bookmarklet handoff capture_
  - Wireframe: _pending bookmarklet integration wireframe_
- **File drop** _(flagged)_
  - Screenshot: _pending drag-and-drop capture_
  - Wireframe: _pending drag-and-drop wireframe_
