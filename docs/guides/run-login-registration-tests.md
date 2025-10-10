<!--
Filename: docs/guides/run-login-registration-tests.md
Author: Jayson + The Brainy One
Date: 2025-03-18
Purpose: Document every automated login and registration test and how to run them locally.
License: MIT License
-->

# Login & Registration Test Execution Guide

This guide documents every automated test that exercises the login or registration flow and explains exactly how to run them locally. All commands assume you are in the repository root (`My-Race-Engineer`).

## 1. Prerequisites

1. **Node.js 20+ and npm 9+.** The project enforces these engine versions in `package.json`.
2. **Install dependencies:**
   ```bash
   npm ci
   ```
3. **Environment variables:** The listed tests either stub or manage their own environment configuration. You do **not** need to create a `.env` file to run them.

> ℹ️ If you previously generated Prisma artefacts, make sure `npm install` has run at least once so that `@prisma/client` is generated.

## 2. Core auth service tests

Covers the domain/application services that back registration and login (password rules, verification workflow, origin guard helpers, and cross-service E2E flow).

Run the full suite with:
```bash
npm run test:auth
```
This script executes every spec in `tests/core/auth/*.test.ts`, which currently includes:
- `tests/core/auth/registerUserService.test.ts`
- `tests/core/auth/origin.test.ts`
- `tests/core/auth/auth-flow.e2e.test.ts`

### Run an individual core test file
Use the `tsx --test` runner directly, for example:
```bash
npx tsx --test tests/core/auth/registerUserService.test.ts
```
Replace the path with any other file under `tests/core/auth/` to scope the run.

## 3. App Router action tests

Validates the `registerAction` and `loginAction` server actions used by the App Router forms, including cookie handling, redirects, and validation branches.

```bash
npx tsx --test tests/app/auth/form-submission.test.ts
```
No additional setup is required; the test suite supplies all dependencies and stubs.

## 4. Middleware origin guard tests

Ensures the middleware that guards `/auth/login` and `/auth/register` POST submissions enforces the configured origin policy.

```bash
npx tsx --test tests/next/middleware/auth-origin-middleware.test.ts
```
The tests snapshot and restore any `APP_URL`, `ALLOWED_ORIGINS`, and `DEV_TRUST_LOCAL_ORIGINS` values, so you can run them without pre-configuring the environment.

## 5. Middleware manifest verification

Validates that a production build emits middleware metadata covering `/auth/:path*`, ensuring the origin guard stays active in deployment bundles.

1. Build the project (CI flag keeps output lean):
   ```bash
   CI=1 npm run build
   ```
2. Execute the manifest assertion:
   ```bash
   npx tsx --test tests/util/middleware-manifest.test.ts
   ```

If the manifest is missing the matcher, the test fails with a descriptive assertion so the regression can be triaged before release.

## 6. Route module compile guards

Confirms that the guard routes wrapping the login and registration endpoints load without throwing when compiled.

```bash
npx tsx --test tests/build/auth-guard-routes.compile.test.ts
```
This is a lightweight smoke test that dynamically imports `src/app/(auth)/auth/login/(guard)/route` and `src/app/(auth)/auth/register/(guard)/route`.

## 7. Running everything together

To execute **all** login and registration related tests in one go, combine the commands:

```bash
npm run test:auth \
  && npx tsx --test tests/app/auth/form-submission.test.ts \
  && npx tsx --test tests/next/middleware/auth-origin-middleware.test.ts \
  && CI=1 npm run build \
  && npx tsx --test tests/util/middleware-manifest.test.ts \
  && npx tsx --test tests/build/auth-guard-routes.compile.test.ts
```

Because each command exits non-zero on failure, the chain stops at the first failing suite, making it easy to spot and address issues.

## 8. Troubleshooting tips

- **TypeScript build errors:** Ensure `npx tsx --test` is used (not `node --test`), so that TypeScript files are compiled on the fly.
- **Slow runs:** Pass `--watch` to any `tsx --test` command to re-run on file changes.
- **Environment pollution:** If you manually set `ALLOWED_ORIGINS`, `APP_URL`, or `DEV_TRUST_LOCAL_ORIGINS`, clear them before re-running middleware or origin guard tests; they otherwise rely on the defaults managed within the suites.

By following the steps above you can confidently execute every automated check that covers the login and registration lifecycle.
