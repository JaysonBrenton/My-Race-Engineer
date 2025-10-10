# Code review — Auth origin guard middleware change (2025-10-29)

## Context
- **Change under review:** `middleware.ts` now redirects auth POSTs only when `isAllowedOrigin` returns `allowed === false`, instead of also redirecting when `reason === 'no-origin-header'`.
- **Motivation:** Recent regression reports showed legitimate POSTs lacking an `Origin` header (mobile clients, CLI tools) being bounced with `?error=invalid-origin`. The fix aims to treat those submissions as allowed while retaining mismatch protection.

## Deep dive & reasoning
1. **Origin evaluation contract**
   - `evaluateOriginHeader` explicitly returns `{ allowed: true, reason: 'no-origin-header' }` when the header is absent. That contract is already relied upon by `guardAuthPostOrigin` (server action guard) to allow such requests.
   - Therefore, aligning middleware to honour the same rule restores parity between edge and app-router guard paths.
2. **Redirect & logging behaviour**
   - Redirects still occur when `allowed === false` (`origin-not-allowed` or `invalid-origin-header`). Structured logging retains the same payload, so observability for true mismatches remains intact.
   - When `allowed === true` but the header is missing, we deliberately skip logging to avoid noisy warnings for legitimate clients.
3. **Security impact assessment**
   - Modern browsers attach an `Origin` header to cross-site POSTs; attackers cannot strip it, so CSRF protection is unaffected by allowing the `no-origin-header` case.
   - Non-browser clients (mobile, curl) that omit the header now succeed instead of being redirected, matching the guidance in `docs/guides/auth-runtime-and-origin-guard.md`.
4. **Edge cases validated**
   - Requests with malformed origins still receive `invalid-origin-header` and trigger redirects.
   - Allow-list misconfiguration (empty list) surfaces because same-site browsers still send an `Origin` header, causing `origin-not-allowed` and a redirect. Missing headers from trusted internal services are permitted as intended.

## Recommendations
- ✅ **Approve.** Behaviour now matches the documented contract and the existing server-side guard. No blocking issues found.
- 🔍 **Follow-up (optional):** Add a regression test covering a login POST without an `Origin` header, mirroring the new register test, to ensure both auth endpoints remain in sync.

## Suggested verifications
- `npm test -- tests/next/middleware/auth-origin-middleware.test.ts`
- `npm test -- tests/core/auth/origin.test.ts`

_No automated checks were run as part of this review; recommendations above cover the most relevant suites._
