```markdown
<!--
Filename: docs/guides/auth-runtime-and-origin-guard.md
Purpose: Comprehensive guide to auth runtime fixes, origin guard scope, and prevention checklists.
Author: Jayson Brenton
Date: 2025-10-09
License: MIT License
-->
```

# Authentication runtime & origin guard runbook

## 1) Problem statement — what went wrong
- **Visible symptom:** on submission the registration form refreshed without confirmation; all input fields blanked, misleading users into thinking nothing happened.
- **Root causes previously observed:**
  | Cause | Impact | Remediation |
  | --- | --- | --- |
  | Middleware redirect triggered early when `Origin` header did not match `APP_URL`/`ALLOWED_ORIGINS` | Browser issued a full-page reload, wiping transient form state | Align browser origin with config; middleware now logs a single warning and preserves the redirect context |
  | Auth pages were rendered as static (cached) despite carrying per-request tokens | Stale CSRF token/nonce mismatched on submit, causing server action rejection and redirect | Force dynamic rendering (`dynamic = 'force-dynamic'`, `revalidate = 0`, `noStore()`) |
  | Development builds shipped cookies with `Secure` enforced while running over HTTP | Browsers silently discarded the cookie; after redirect, no session existed so the form rendered fresh | Tie the `secure` flag to `NODE_ENV === 'production'` |
  | Both a Server Action **and** a Route Handler accepted the same submit | Competing responses caused double handling or redirected without preserving body | Pick a single submission pathway per form |
- **Why tests stayed green:** historical tests verified helpers (origin parsing, cookie flag selection) but never exercised the full runtime flow (render → submit → middleware → cookie → re-render). Missing integration/e2e coverage allowed the regression to escape.

## 2) Why we made these changes — goals & principles
- **Reliability:** authentication routes must stay dynamic and non-cacheable to keep tokens, nonces, and flash state fresh.
- **User experience:** validation errors should keep safe fields (e.g. name, email) populated while passwords remain blank.
- **Security:** constrain auth POSTs to trusted origins, set dev-safe cookie flags, emit structured warnings, and avoid leaking sensitive values.
- **Maintainability:** adopt **one** submission pattern per auth page—either a Server Action re-render or a Route Handler redirect—not both.

## 3) Final architecture — how it works now
### Auth pages (`/auth/login`, `/auth/register`)
- Explicit runtime controls: `export const dynamic = 'force-dynamic'`, `export const revalidate = 0`, and `headers().set('Cache-Control', 'no-store')` via `noStore()`.
- Choose a single submission mode:
  - **Server Action** returns state to the same page; we re-render with the action result.
  - **Route Handler** handles POST, then redirects back with `?prefill=<json>` for safe fields only. Passwords are never echoed.

### Cookies
- Session cookies are issued with:
  ```ts
  cookieStore.set('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  ```
- Conditional `secure` avoids the development-only reset where HTTP pages drop cookies. Production remains HTTPS-only.

### Middleware (origin guard)
- **Scope:** POST requests to `/auth/login` and `/auth/register` only; `/api/**` and all other methods bypass.
- **Allow list:** `ALLOWED_ORIGINS` comma-separated list → fallback `APP_URL`. Compare using canonical `scheme://host[:port]` with the host lowercased and port preserved.
- **Missing `Origin`:** treated as allowed (`reason: 'no-origin-header'`) so non-browser tools (mobile apps, curl) can still sign in.
- **Mismatch handling:** emits one structured warning (`auth.origin.mismatch`) with request metadata, then returns `303` redirect plus `?error=invalid-origin` and `Cache-Control: no-store`.
- **Flow overview:**
  1. Browser renders `/auth/register` (dynamic, uncached).
  2. User submits form.
  3. Middleware intercepts auth POSTs only.
  4. If origin allowed → handler executes → cookie set.
  5. Response redirects or re-renders; page reload shows validation or success state.

### APIs remain unaffected
- `/api/**`, `/api/health`, `/api/ready`, and `/api/version` never hit this middleware. They rely on authentication/authorisation tokens instead of browser-origin checks.
- Documented scope in code comments and monitoring dashboards prevents accidental expansion.

## 4) Environment & configuration guidance
| Variable | Expectation | Notes |
| --- | --- | --- |
| `APP_URL` | Exact browser origin (scheme + host + optional port) | Example dev: `http://localhost:3001`; prod: `https://race-engineer.example.com` |
| `ALLOWED_ORIGINS` | Comma-separated list including the primary origin | Add alternates (e.g. `http://127.0.0.1:3001`, IP-based tunnel hosts) |
| `SESSION_SECRET` | ≥ 32 bytes, stable | Rotate intentionally; short secrets disable auth |
| `TRUST_PROXY` | `false` unless behind a proxy | When `true`, ensure proxy forwards `x-forwarded-proto`/`host` |

**Typical values**

| Environment | `APP_URL` | `ALLOWED_ORIGINS` | `TRUST_PROXY` |
| --- | --- | --- | --- |
| Local dev | `http://localhost:3001` | `http://localhost:3001,http://127.0.0.1:3001` | `false` |
| Shared dev (tunnel) | `https://mre-dev.au.ngrok.io` | `https://mre-dev.au.ngrok.io,http://localhost:3001` | `false` |
| Production | `https://app.myraceengineer.com.au` | `https://app.myraceengineer.com.au` | `true` (behind load balancer) |

> When alternating between hostname and IP access in development, include both forms in `ALLOWED_ORIGINS` to avoid intermittent redirects.

## 5) Runtime & e2e test coverage — what we added and why
- **Happy path registration:** Playwright journey confirms submit → success banner → session cookie persists through redirect.
- **Validation failure:** tests assert inline error banner, name/email remain in the DOM, password inputs blank.
- **Cross-origin POST:** middleware unit tests assert `303` redirect, `?error=invalid-origin`, and single structured log stub.
- **No-store enforcement:** integration test reloads page to verify fresh nonce and absence of silent resets.
- **Single submission path invariant:** unit guard ensures a page exports either `export async function action()` or a POST route—not both.

_Minimal assertion snippets_
```ts
await expect(page.getByTestId('register-success')).toBeVisible();
await expect(page.context().cookies()).toContainEqual(expect.objectContaining({ name: 'session' }));
```
```ts
expect(logger.warn).toHaveBeenCalledWith(
  expect.objectContaining({ event: 'auth.origin.mismatch' }),
);
```

## 6) Middleware & API interactions — prevention plan
- **APIs remain safe:** guard stays restricted to auth POSTs. Document the matcher and keep `/api/**` out of scope.
- **OPTIONS / CORS:** middleware does not process preflight requests; cross-site auth POSTs are unsupported by design.
- **Reverse proxies & `TRUST_PROXY`:** when enabling proxies (nginx, Cloudflare Tunnel):
  - Set `TRUST_PROXY=true`.
  - Confirm proxy forwards `X-Forwarded-Proto` and `X-Forwarded-Host`.
  - Verify `APP_URL` matches the externally visible origin.
- **HTTPS upgrade / HSTS:** once HTTPS enforced, keep `APP_URL` scheme `https://`; mismatches force cookie rejection. Enable HSTS only after confirming secure cookies succeed.
- **Multiple dev origins:** update `ALLOWED_ORIGINS` whenever switching between IP, `localhost`, or custom hostnames.
- **Next.js upgrades:** retain `force-dynamic` + `noStore()` on auth pages after version bumps; review release notes for caching behaviour changes.
- **Edge runtime migrations:** if moving middleware/handlers to Edge, ensure header mutation and cookie APIs still behave identically.
- **Future SSO / NextAuth:** avoid double session stacks; ensure provider callbacks either bypass or align with the origin guard expectations.

## 7) Troubleshooting & observability
- **Log payload template:** `{ event, origin, allowedList, path, method, requestId, reason }`.
- **Common failure signatures:**
  | Signature | Likely cause | Fix |
  | --- | --- | --- |
  | `?error=invalid-origin` + warning log | Origin missing from allow list | Align `APP_URL`/`ALLOWED_ORIGINS`; use exact browser origin |
  | `invalid-token` error on page | Cached page or duplicate submit path | Verify dynamic flags; remove redundant handlers |
  | No session cookie after success | Cookie `secure` mis-set | Confirm `NODE_ENV` and proxy scheme |
- **Quick probes:**
  ```bash
  # Good origin
  curl -i -X POST \
    "$APP_URL/auth/login" \
    -H "Origin: $APP_URL" \
    -d 'email=driver@example.com&password=placeholder'
  ```
  ```bash
  # Bad origin
  curl -i -X POST \
    "$APP_URL/auth/login" \
    -H 'Origin: https://evil.example' \
    -d 'email=driver@example.com&password=placeholder'
  ```
  Expect `303` with `x-auth-origin-guard: mismatch` only in the second case.

## 8) Acceptance criteria — definition of done
- Registration POSTs from configured origins succeed or display inline validation while preserving name/email and blanking passwords.
- HTTP development flows set a session cookie and keep it after redirects.
- Cross-origin submits return `?error=invalid-origin` and log exactly one warning per attempt.
- Auth routes never cache; reloads fetch fresh tokens without looped resets.
- `/api/**` (including health/version/ready) behave exactly as before.

## 9) Appendix — glossary & quick reference
- **Origin vs host:** origin = `scheme://host[:port]`; host is the hostname + optional port.
- **CSRF vs CORS vs origin guard:** CSRF tokens protect sessions, CORS governs cross-site resource sharing, the origin guard blocks unexpected browser POSTs.
- **Server Actions vs Route Handlers:** Server Actions return action state to the same component; Route Handlers respond like REST endpoints.
- **Dynamic rendering:** disabling caching ensures per-request data (tokens, flash messages) stays current.

**Local dev checklist**
- [ ] `APP_URL` and `ALLOWED_ORIGINS` include every dev host/IP.
- [ ] `SESSION_SECRET` ≥ 32 bytes and stored in `.env`.
- [ ] Auth pages export `dynamic = 'force-dynamic'` and call `noStore()`.
- [ ] Only one submit handler per form.

**Production checklist**
- [ ] `APP_URL` uses `https://` and matches public DNS.
- [ ] `ALLOWED_ORIGINS` matches production hostnames (load balancer + vanity).
- [ ] `TRUST_PROXY=true` with correct forwarded headers.
- [ ] Session cookie marked `secure` and `httpOnly`.
- [ ] Alerting wired to `auth.origin.mismatch` spikes.
