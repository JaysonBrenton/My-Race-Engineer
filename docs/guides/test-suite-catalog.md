<!--
Filename: docs/guides/test-suite-catalog.md
Purpose: Reference for all automated tests available in the repo and how to run them.
License: MIT
-->

# Automated test suite catalog

This guide lists every automated test that currently lives in the repository, explains what it covers, and shows the exact command to run it locally. Commands are written relative to the repository root (`My-Race-Engineer`).

## Prerequisites

- **Node.js 20+ and npm 9+.** The project enforces these engine versions in `package.json` and the test tooling depends on them. 【F:package.json†L3-L10】【F:package.json†L44-L52】
- **Install dependencies once per clone:**
  ```bash
  npm ci
  ```
- **Database access (when required).** The Playwright end-to-end suites and raw POST auth tests expect `DATABASE_URL` to point at a reachable PostgreSQL instance. They automatically skip when the variable is missing but cannot pass without it. 【F:tests/e2e/auth-login.raw-post.spec.ts†L1-L52】【F:tests/e2e/db.ts†L1-L27】

> ✅ **Tip:** The [Login & Registration Test Execution Guide](run-login-registration-tests.md) contains extended walkthroughs for auth-focused suites; use it alongside this catalog when you need deeper context. 【F:docs/guides/run-login-registration-tests.md†L1-L94】

## Quick reference: npm scripts

| Command                    | What it runs                                               | Purpose                                                                                                                                |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:auth`        | `tsx --test tests/core/auth/*.test.ts`                     | Domain/application auth flow coverage (registration, origin guard, session validation). 【F:package.json†L16-L22】                     |
| `npm run test:auth:e2e`    | `tsx --test tests/core/auth/auth-flow.e2e.test.ts`         | Isolated run of the cross-service registration/login happy path. 【F:package.json†L16-L22】                                            |
| `npm run test:cookie:unit` | `tsx --test tests/server/runtime/cookies.strategy.test.ts` | Verifies the server cookie storage strategy. 【F:package.json†L16-L22】【F:tests/server/runtime/cookies.strategy.test.ts†L1-L9】       |
| `npm run test:seo`         | `tsx --test tests/seo.test.ts`                             | Checks default metadata exports and canonical URLs. 【F:package.json†L16-L22】【F:tests/seo.test.ts†L1-L26】                           |
| `npm run test:e2e`         | `playwright test`                                          | Launches the Playwright auth end-to-end suite (form + raw POST scenarios). 【F:package.json†L16-L23】【F:playwright.config.ts†L1-L21】 |

All other specs run through the same `tsx --test` runner; use `npx tsx --test <path>` to execute them individually.

## Node-based suites (`tsx --test`)

### Core authentication

- `tests/core/auth/registerUserService.test.ts` — exercises registration service validation and persistence orchestration. 【F:tests/core/auth/registerUserService.test.ts†L1-L25】
- `tests/core/auth/origin.test.ts` — ensures the domain-level origin guard logic enforces configured origins. 【F:tests/core/auth/origin.test.ts†L1-L17】
- `tests/core/auth/validateSessionTokenService.test.ts` — validates session token verification branches (valid, expired, revoked). 【F:tests/core/auth/validateSessionTokenService.test.ts†L1-L22】
- `tests/core/auth/auth-flow.e2e.test.ts` — runs a service-level registration → login flow across in-memory adapters. 【F:tests/core/auth/auth-flow.e2e.test.ts†L1-L33】

Run everything together with `npm run test:auth` or target a single file via `npx tsx --test tests/core/auth/<name>.test.ts`. 【F:package.json†L16-L21】

### App Router auth actions

- `tests/app/auth/form-submission.test.ts` — covers the `registerAction` and `loginAction` server actions, including cookie handling and redirect outcomes. 【F:tests/app/auth/form-submission.test.ts†L1-L33】

Command:

```bash
npx tsx --test tests/app/auth/form-submission.test.ts
```

### Middleware and origin guards

- `tests/next/middleware/auth-origin-middleware.test.ts` — validates the Next.js middleware that enforces POST origin checks for `/auth` routes. 【F:tests/next/middleware/auth-origin-middleware.test.ts†L1-L19】
- `tests/middleware.origin.test.ts` — snapshot-style guard covering the legacy middleware origin rules. 【F:tests/middleware.origin.test.ts†L1-L17】
- `tests/origin.test.ts` — verifies shared origin helper utilities used across the stack. 【F:tests/origin.test.ts†L1-L15】

Run each with `npx tsx --test <path>`.

### LiveRC importer domain & services

- `tests/core/liverc/client.test.ts` — unit coverage for the LiveRC HTTP client error handling and response mapping. 【F:tests/core/liverc/client.test.ts†L1-L13】
- `tests/core/liverc/parse.test.ts` — validates parsing utilities for LiveRC URLs and payloads. 【F:tests/core/liverc/parse.test.ts†L1-L14】
- `tests/core/liverc/importPlanService.test.ts` — checks how the importer builds work plans from user input. 【F:tests/core/liverc/importPlanService.test.ts†L1-L14】
- `tests/core/liverc/jobQueue.test.ts` — ensures importer job queue deduplication and enqueue logic. 【F:tests/core/liverc/jobQueue.test.ts†L1-L17】
- `tests/core/liverc/summaryImporter.test.ts` — covers summarised ingestion paths. 【F:tests/core/liverc/summaryImporter.test.ts†L1-L14】
- `tests/core/liverc/lapId.test.ts` — verifies deterministic lap hashing to keep lap imports idempotent. 【F:tests/core/liverc/lapId.test.ts†L1-L35】

### LiveRC importer integration tests

- `tests/importLiveRc.test.ts` — exercises the full import service with stubbed repositories and logging assertions. 【F:tests/importLiveRc.test.ts†L1-L40】
- `tests/import-live-rc-date-parsing.test.ts` — focuses on scheduled start parsing and storage semantics. 【F:tests/import-live-rc-date-parsing.test.ts†L1-L92】
- `tests/liverc-http-client.test.ts` — asserts HTTP client failure modes and successful JSON decoding. 【F:tests/liverc-http-client.test.ts†L1-L49】
- `tests/parse-live-rc-url.test.ts` — checks slug parsing and validation for LiveRC URLs. 【F:tests/parse-live-rc-url.test.ts†L1-L18】

Run each with:

```bash
npx tsx --test tests/<file>.test.ts
```

### API route handlers (LiveRC connectors)

These specs hit the Next.js route handlers with in-memory Prisma/SQLite fallbacks:

- `tests/livercImportPlanRoute.test.ts` — `/api/connectors/liverc/import/plan` validation and payload shaping. 【F:tests/livercImportPlanRoute.test.ts†L1-L14】
- `tests/livercImportApplyRoute.test.ts` — `/api/connectors/liverc/import/apply` branching and background job creation. 【F:tests/livercImportApplyRoute.test.ts†L1-L14】
- `tests/dev-liverc-results-proxy-route.test.ts` — dev-only proxy for fetching LiveRC results. 【F:tests/dev-liverc-results-proxy-route.test.ts†L1-L18】

Execute any of them via `npx tsx --test <path>`; the connector route tests set an in-memory `DATABASE_URL` when one is not provided so they do not require Postgres for local runs.

### Build & middleware manifests

- `tests/util/middleware-manifest.test.ts` — asserts that a production build emits middleware metadata for the auth routes. Requires a preceding `CI=1 npm run build`. 【F:tests/util/middleware-manifest.test.ts†L1-L17】【F:docs/guides/run-login-registration-tests.md†L55-L73】
- `tests/build/auth-guard-routes.compile.test.ts` — smoke test that ensures the auth guard route modules compile. 【F:tests/build/auth-guard-routes.compile.test.ts†L1-L15】

### Server configuration & runtime helpers

- `tests/server/config/environment.test.ts` — covers environment variable parsing and validation. 【F:tests/server/config/environment.test.ts†L1-L52】
- `tests/tools/env-doctor.test.ts` — snapshots the `.env` doctor utility output. 【F:tests/tools/env-doctor.test.ts†L1-L17】
- `tests/tools/env-sync.test.ts` — ensures the env sync tool appends required keys. 【F:tests/tools/env-sync.test.ts†L1-L16】
- `tests/lap-summary-dependencies.test.ts` — verifies importer summarisation runs without missing runtime dependencies. 【F:tests/lap-summary-dependencies.test.ts†L1-L22】
- `tests/web-vitals.test.ts` — checks the custom metrics reporter wiring. 【F:tests/web-vitals.test.ts†L1-L19】
- `tests/middleware.origin.test.ts` (listed above) and `tests/origin.test.ts` provide additional runtime guard coverage. 【F:tests/middleware.origin.test.ts†L1-L17】【F:tests/origin.test.ts†L1-L15】

### Auth utilities

- `tests/lib/auth/formTokens.test.ts` — validates form token generation and verification helpers. 【F:tests/lib/auth/formTokens.test.ts†L1-L21】
- `tests/server/runtime/cookies.strategy.test.ts` — ensures the cookie storage strategy integrates with the session layer. Also exposed through `npm run test:cookie:unit`. 【F:tests/server/runtime/cookies.strategy.test.ts†L1-L18】【F:package.json†L16-L22】

### SEO & analytics

- `tests/seo.test.ts` — verifies default metadata exports, canonical URLs, and Open Graph tags. 【F:tests/seo.test.ts†L1-L26】
- `tests/web-vitals.test.ts` — described above under runtime helpers; it specifically asserts the custom web vitals reporter forwards metrics. 【F:tests/web-vitals.test.ts†L1-L19】

## Playwright end-to-end suites (`npm run test:e2e`)

Playwright bootstraps a production build on port `3101` and runs three projects: HTTP, HTTPS-proxied headers, and raw-request scenarios. 【F:playwright.config.ts†L1-L21】

### Projects included

- `tests/e2e/auth.form-db.spec.ts` — drives the auth UI to register and log in real users against the database, and asserts cookie behaviour across HTTP vs HTTPS-proxied runs. 【F:tests/e2e/auth.form-db.spec.ts†L1-L52】
- `tests/e2e/auth-login.raw-post.spec.ts` — submits the login form as a raw POST request and checks redirect headers. Skips automatically when `DATABASE_URL` is not defined. 【F:tests/e2e/auth-login.raw-post.spec.ts†L1-L52】
- `tests/e2e/auth-register.raw-post.spec.ts` — mirrors the POST flow for registration and validates outcomes/headers. 【F:tests/e2e/auth-register.raw-post.spec.ts†L1-L52】

### Extra setup

1. Provide a PostgreSQL database and set `DATABASE_URL` before invoking the tests. The helper utilities connect via Prisma and create/delete users as part of each run. 【F:tests/e2e/db.ts†L1-L27】【F:tests/e2e/auth.form-db.spec.ts†L1-L36】
2. Generate Prisma client artefacts if you have not already: `npx prisma generate`.
3. Run the suite:
   ```bash
   npm run test:e2e
   ```
   The Playwright configuration starts the production server automatically with session secrets and feature flags suitable for the tests. 【F:playwright.config.ts†L6-L21】

Playwright attaches debug artefacts on failure (headers, HTML) to aid troubleshooting. Cookies and temporary users are cleaned up at the end of each test via the shared helpers. 【F:tests/e2e/auth.form-db.spec.ts†L1-L50】【F:tests/e2e/auth-login.raw-post.spec.ts†L1-L52】

---

Use this catalog to pick the right suite before opening a PR. Combine it with the CI gate commands (`npm run lint`, `npm run typecheck`, `npm run build`) to mirror pipeline coverage locally. 【F:README.md†L227-L236】
