# Deep code & documentation review — 2025-03-09

## Scope
- LiveRC ingestion surface: `LiveRcImportService`, URL parsing helpers, and the HTTP client responsible for sourcing entry lists and race results.
- Persistence metadata generated for events, race classes, and sessions when ingesting remote payloads.
- Documentation touchpoints that guide external integrators (`docs/integrations/liverc-import-api.md`).

## Critical issues
1. **LiveRC subdomain context is discarded, breaking imports for club-specific hosts.**
   - `parseLiveRcUrl` only returns slug segments and the `LiveRcImportService` subsequently issues fetches with those slugs, ignoring the hostname that the user supplied.【F:src/core/liverc/urlParser.ts†L34-L131】【F:src/core/app/services/importLiveRc.ts†L161-L188】
   - The HTTP client hard-codes `https://liverc.com` when constructing entry list and race result URLs, so any event that lives on `https://<club>.liverc.com` will be fetched from the wrong origin and typically 404.【F:src/core/infra/http/liveRcClient.ts†L32-L125】
   - The persistence layer cements that incorrect host into `sourceUrl` metadata for events and race classes, so even if the fetch succeeded by accident the stored provenance would still point to the wrong domain.【F:src/core/app/services/importLiveRc.ts†L367-L400】
   - The guardrails already document `https://canberraoffroad.liverc.com` style URLs, so we know subdomain results are a supported scenario that the current implementation cannot handle.【F:docs/guardrails/qa-network-access.md†L9-L19】
   - **Impact:** Every LiveRC deployment that serves results from a club subdomain (common for regional tracks) will fail to import, blocking production usage. **Fix:** Thread the origin (protocol + host) through the parser, derive fetch URLs from the original host, and persist the exact source URLs that were ingested.

2. **URL normalisation rewrites valid LiveRC slugs, causing false 404s.**
   - During parsing we aggressively trim whitespace, collapse repeated hyphens, and force lowercase on every slug segment before contacting LiveRC.【F:src/core/liverc/urlParser.ts†L34-L125】
   - Those normalised slugs are the ones we hand to the HTTP client, so any legitimate slug that relies on uppercase characters or intentional double-hyphen separators will be rewritten before the request ever leaves our app.【F:src/core/app/services/importLiveRc.ts†L161-L188】【F:src/core/infra/http/liveRcClient.ts†L32-L125】
   - LiveRC serves static JSON assets where the path is case- and character-sensitive. Altering `Main--Event` to `main-event` or `A2` to `a2` will return a 404 even though the user pasted a perfectly valid link.
   - **Impact:** Imports intermittently fail depending on how the upstream organiser formatted their slugs, which is extremely hard for operators to diagnose. **Fix:** Preserve the original path segments (aside from trimming an optional `.json` suffix on the final segment) and only reject URLs that are actually malformed.

## Documentation observations
- `docs/integrations/liverc-import-api.md` still advertises multiple “_pending_” screenshot and wireframe placeholders instead of reflecting the shipped UI variants. That section should either be populated with the current assets or rewritten to describe the available flows textually until visuals exist.【F:docs/integrations/liverc-import-api.md†L73-L89】

## Suggested next steps
- Update the URL parser to retain protocol + host alongside the untouched slug segments, pass that through the import service, and have the HTTP client respect it when issuing requests and storing provenance.
- Relax slug normalisation so we only strip the optional `.json` extension and basic leading/trailing whitespace; keep every other character intact.
- Refresh the integration guide’s usability section so external teams aren’t blocked waiting on “pending” artefacts.
