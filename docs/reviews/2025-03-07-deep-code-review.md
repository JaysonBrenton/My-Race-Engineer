# Deep code & documentation review — 2025-03-07

## Scope
- LiveRC ingestion surface: `src/core/app/services/importLiveRc.ts`, `src/core/infra/http/liveRcClient.ts`, and `/api/liverc/import`.
- Supporting dependencies (`src/dependencies/**`, Prisma repositories, SEO helpers) and the baseline Next.js page.
- Documentation sweep across `README.md`, `docs/**`, and other tracked Markdown assets (excluding vendored `node_modules/**`).

## Critical issues
1. **Race URL handling contradicts the documented `.json` contract (blocking imports).** ✅ *Resolved 2025-03-07*
   - Parsed race slugs now trim trailing `.json` tokens before building upstream URLs, so callers can submit either the human-facing results URL or the raw JSON endpoint without triggering double extensions.【F:src/core/app/services/importLiveRc.ts†L276-L316】
   - The dev LiveRC proxy accepts both `entry-list` and `entry-list.json`, normalises the final segment, and mirrors the ingestion rules to avoid future drift.【F:src/app/api/dev/liverc/results/[...slug]/route.ts†L12-L111】
   - Documentation for the import API highlights the optional `.json` suffix so external clients keep using the canonical contract.【F:docs/integrations/liverc-import-api.md†L14-L37】

2. **LiveRC HTTP client drops network/JSON failures on the floor, leading to opaque 500s.** ✅ *Resolved 2025-03-07*
   - Both LiveRC fetches now wrap network calls and JSON decoding in guarded helpers that translate failures into typed `LiveRcHttpError` instances with retry-safe metadata.【F:src/core/infra/http/liveRcClient.ts†L86-L170】
   - API responses surface the upstream status/code pair consistently, including new `ENTRY_LIST_INVALID_RESPONSE` and `RACE_RESULT_INVALID_RESPONSE` variants for malformed JSON payloads.【F:src/app/api/liverc/import/route.ts†L96-L155】【F:docs/integrations/liverc-import-api.md†L38-L59】

## High-priority issues
- **`APP_URL` requirement crashes builds/tests by default.** ✅ *Resolved 2025-03-07* – SEO utilities lazily compute the base URL, fall back to `http://localhost:3000` outside production, and continue to fail fast when the variable is missing in production builds.【F:src/lib/seo.ts†L1-L44】

## Medium / lower-priority observations
- **Slug validation accepts `entry-list.json` only in the dev proxy, but the import service expects an entry list without the `.json` suffix.** ✅ *Resolved 2025-03-07* – The proxy now normalises the filename and forwards consistent slugs to LiveRC.【F:src/app/api/dev/liverc/results/[...slug]/route.ts†L12-L111】
- **Baseline data fallbacks only cover the default entrant.** ✅ *Resolved 2025-03-07* – Mock lap repositories seed deterministic fallback laps for any entrant when Prisma is unavailable or misconfigured, preventing empty UI states during development.【F:src/dependencies/server.ts†L48-L131】

## Documentation audit
| File | Status | Notes |
| --- | --- | --- |
| `README.md` | ✅ Updated | Duplicate "Forthcoming docs" sections and stray branch slugs removed; doc index now reflects the maintained references only.【F:README.md†L263-L297】 |
| `src/core/app/README.md` | ✅ Updated | Documents the shipped LiveRC import service instead of a future pipeline, including persistence rules and test strategy.【F:src/core/app/README.md†L1-L52】 |
| `docs/reviews/2024-10-07-deep-code-review.md` | ✅ Historical | Annotated with resolution dates so readers know the flagged issues have been addressed.【F:docs/reviews/2024-10-07-deep-code-review.md†L9-L34】 |
| `docs/reviews/2025-02-14-markdown-audit.md` | ✅ Updated | Table entries refreshed to match the current documentation state and follow-up guidance.【F:docs/reviews/2025-02-14-markdown-audit.md†L9-L38】 |
| `docs/integrations/liverc-data-model.md` | ✅ Accurate | Scoped to the entry list and race result endpoints implemented today, deferring future ingestion stages until they ship.【F:docs/integrations/liverc-data-model.md†L27-L116】 |
| Other guardrails & role guides | ✅ Accurate | Product guardrails, QA network access notes, and role playbooks remain aligned with the codebase; no action beyond periodic freshness checks.【F:docs/guardrails/product-guardrails.md†L1-L82】【F:docs/guardrails/qa-network-access.md†L1-L21】 |

## Suggested next steps
All follow-up items from this review were completed on 2025-03-07. Future audits should focus on upcoming ingestion stages (heat sheets, rankings, multi-main) and ensuring rate-limit/backoff guidance is documented when implemented.
