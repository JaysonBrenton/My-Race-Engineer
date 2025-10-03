# Deep code & documentation review — 2025-03-07

## Scope
- LiveRC ingestion surface: `src/core/app/services/importLiveRc.ts`, `src/core/infra/http/liveRcClient.ts`, and `/api/liverc/import`.
- Supporting dependencies (`src/dependencies/**`, Prisma repositories, SEO helpers) and the baseline Next.js page.
- Documentation sweep across `README.md`, `docs/**`, and other tracked Markdown assets (excluding vendored `node_modules/**`).

## Critical issues
1. **Race URL handling contradicts the documented `.json` contract (blocking imports).**
   - The import service parses the user-provided URL into path segments but never strips the `.json` suffix. Those segments are later interpolated into a fresh LiveRC URL that *also* appends `.json`, producing requests such as `.../race.json.json` that 404 upstream.【F:src/core/app/services/importLiveRc.ts†L265-L304】【F:src/core/infra/http/liveRcClient.ts†L128-L139】
   - The public API and documentation explicitly instruct callers to submit race URLs with the `.json` extension, so the broken reconstruction path is the default code path for every compliant request.【F:docs/integrations/liverc-import-api.md†L14-L23】
   - **Recommendation:** normalise the parsed slug by trimming a trailing `.json` (and other known extensions) before reusing it, or parse via `pathname.replace(/\.json$/,'')` so the reconstructed URL matches the documented contract. Add regression coverage for URLs with/without the extension.

2. **LiveRC HTTP client drops network/JSON failures on the floor, leading to opaque 500s.**
   - `fetchEntryList` and `fetchRaceResult` only branch on `response.ok`. Any network failure, timeout, or JSON parse error throws a generic `TypeError`/`SyntaxError`, which bypasses the LiveRC-specific guards in the API route and maps to `500 UNEXPECTED_ERROR` for callers.【F:src/core/infra/http/liveRcClient.ts†L92-L126】【F:src/app/api/liverc/import/route.ts†L78-L177】
   - **Recommendation:** wrap each fetch in `try/catch`, translate network-level faults and JSON decoding failures into `LiveRcHttpError` instances (e.g., `status: 502`, `code: 'ENTRY_LIST_FETCH_FAILED'` with a `cause`), and propagate structured diagnostics so clients can retry intelligently.

## High-priority issues
- **`APP_URL` requirement crashes builds/tests by default.** SEO helpers compute `appUrlCache` at module load and throw if `APP_URL` is unset. Because Next.js (and the test suites) import these helpers eagerly, a missing variable prevents the dev server, unit tests, or Storybook from even booting.【F:src/lib/seo.ts†L1-L26】 Provide a safer default (e.g., lazily read the env var with a descriptive error that surfaces through Next.js configuration) or guard tests/dev builds with a fallback to `http://localhost:3001`.

## Medium / lower-priority observations
- **Slug validation accepts `entry-list.json` only in the dev proxy, but the import service expects an entry list without the `.json` suffix.** Align the slug parsing rules across the dev proxy and ingestion service once the double-extension fix above lands to avoid future drift.【F:src/app/api/dev/liverc/results/[...slug]/route.ts†L12-L61】
- **Baseline data fallbacks only cover the default entrant.** The in-memory mocks inside `src/dependencies/server.ts` skip persistence for any non-baseline entrant when Prisma is unavailable, so the UI silently shows empty cards for other IDs. Consider either widening the mock coverage or adding user-facing messaging when mock data are unavailable.【F:src/dependencies/server.ts†L42-L128】

## Documentation audit
| File | Status | Notes |
| --- | --- | --- |
| `README.md` | ❌ Needs cleanup | Stray branch slug (`codex/create-entry-list-json-fixture-and-update-tests-uma7xw`) and duplicated "Forthcoming docs" sections should be removed to avoid confusion.【F:README.md†L263-L283】 |
| `src/core/app/README.md` | ⚠️ Outdated | Still describes the LiveRC ingestion service as "to be implemented" and references heat-sheet/multi-main orchestration that the current codebase does not provide.【F:src/core/app/README.md†L3-L52】 |
| `docs/reviews/2024-10-07-deep-code-review.md` | ⚠️ Stale context | Flags three issues (HTTP error propagation, orphan entrant creation, naive timestamp parsing) that have since been addressed. Update the status or archive the document to avoid sending reviewers on solved quests.【F:docs/reviews/2024-10-07-deep-code-review.md†L9-L20】 |
| `docs/reviews/2025-02-14-markdown-audit.md` | ⚠️ Drifting | Marks the docs above as ✅/⚠️ even though the underlying problems are now fixed or have regressed. Revise the table so the "latest audit" reflects today’s reality.【F:docs/reviews/2025-02-14-markdown-audit.md†L8-L27】 |
| `docs/integrations/liverc-data-model.md` | ⚠️ Ambitious vs. implemented | Documents heat-sheet, ranking, and multi-main ingestion stages that are not represented in the current `LiveRcImportService`, risking mismatched expectations for contributors.【F:docs/integrations/liverc-data-model.md†L16-L58】 |
| Other guardrails & role guides | ✅ Accurate | Product guardrails, QA network access notes, and role playbooks remain aligned with the codebase; no action beyond periodic freshness checks.【F:docs/guardrails/product-guardrails.md†L1-L82】【F:docs/guardrails/qa-network-access.md†L1-L21】 |

## Suggested next steps
1. Patch the LiveRC import URL reconstruction and extend test coverage to ensure both `.json` and extensionless inputs succeed.
2. Harden the HTTP adapter error handling so LiveRC downtime or bad JSON produces actionable, non-500 responses.
3. Relax the `APP_URL` dependency in SEO utilities (or document a required `.env` default) so local builds/tests do not crash on first import.
4. Refresh the documentation to remove stale guidance and clearly call out the currently implemented ingestion surface area.
