# Auth debug quick reference

This guide captures the tooling added for diagnosing raw `/auth/register` and `/auth/login` submissions. Use it when reproducing origin guard behaviour, validating form token handling, or inspecting the new Playwright coverage.

## 1. Origin guard sanity checks

Run these commands from the project root while the dev server is running on `http://127.0.0.1:3101`.

Allowed origin (expects `200 OK` and `x-auth-origin-guard: ok`):

```bash
curl -i \
  -H 'Origin: http://127.0.0.1:3101' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'name=Example&email=example%40test.invalid&password=ExamplePass!123&confirmPassword=ExamplePass!123' \
  http://127.0.0.1:3101/auth/register
```

Blocked origin (expects `303 See Other`, `Location: /auth/register?error=invalid-origin`, and `x-auth-origin-guard: mismatch`):

```bash
curl -i \
  -H 'Origin: http://example.com' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'name=Example&email=example%40test.invalid&password=ExamplePass!123&confirmPassword=ExamplePass!123' \
  http://127.0.0.1:3101/auth/register
```

## 2. Playwright raw POST coverage

The end-to-end suite now includes request-level reproductions of the failing scenario for registration and login. Run them with:

```bash
npx playwright test tests/e2e/auth-register.raw-post.spec.ts
npx playwright test tests/e2e/auth-login.raw-post.spec.ts
```

Each test performs a GET to scrape the hidden `formToken`, replays the POST with cookies, and attaches the new `x-auth-*` headers to the test artefacts for quick inspection.【F:tests/e2e/auth-register.raw-post.spec.ts†L1-L75】【F:tests/e2e/auth-login.raw-post.spec.ts†L1-L56】

## 3. Reading the new instrumentation

Server actions now emit structured events for request arrival, token validation, payload validation, and final outcome. Examples:

* `auth.register.request` – includes `hasOriginHeader`, `originAllowed`, and `method` for correlation.【F:src/app/(auth)/auth/register/actions.impl.ts†L150-L175】
* `auth.formToken.validate` – reports `result`, `tokenAgeMs`, and a short fingerprint for both register and login flows.【F:src/app/(auth)/auth/register/actions.impl.ts†L216-L248】【F:src/app/(auth)/auth/login/actions.impl.ts†L207-L246】
* `auth.register.outcome` / `auth.login.outcome` – records whether the action redirected or re-rendered along with the target path/status key.【F:src/app/(auth)/auth/register/actions.impl.ts†L177-L205】【F:src/app/(auth)/auth/login/actions.impl.ts†L164-L204】

In development builds, the guard routes surface the same details via response headers:

* `x-auth-action`: `register` or `login`
* `x-auth-token`: `ok`, `invalid`, `expired`, or `missing`
* `x-auth-outcome`: `redirect`, `rerender`, or `unknown`

The headers are applied from the guard after the server action completes so they mirror the logs one-for-one.【F:src/app/(auth)/auth/register/(guard)/guard.impl.ts†L30-L79】【F:src/app/(auth)/auth/login/(guard)/guard.impl.ts†L17-L86】

## 4. Dev-only auth settings endpoint

Hit `/api/dev/auth-debug` during local development to confirm the active origin allow-list, token TTL, and email-verification flags:

```bash
curl -s http://127.0.0.1:3101/api/dev/auth-debug | jq
```

The route is disabled (404) in production deployments.【F:src/app/api/dev/auth-debug/route.ts†L1-L35】
