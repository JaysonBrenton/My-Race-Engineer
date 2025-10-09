# ADR-20251009: Auth origin guard and runtime hardening

- Status: Accepted
- Authors: Platform Engineering
- Date: 2025-10-09

## Context
Registration and login forms were "resetting" after submission because middleware redirects, cached pages, and cookie flags interacted poorly. We needed a cohesive plan to keep auth flows dynamic, scope origin enforcement correctly, and stop form state from disappearing.

## Options considered
1. **Keep dual submission paths (Server Action + Route Handler)** with heavier client-side state management.
2. **Disable the middleware entirely** and rely on downstream handlers for CSRF/origin checks.
3. **Adopt a single submission path per form**, enforce dynamic rendering, and keep middleware scoped to auth POSTs only.

## Decision
Choose option 3. Each auth page now declares one submission strategy, enforces `force-dynamic`/`noStore()`, and issues cookies with environment-aware `secure` flags. Middleware retains the origin guard but only for `/auth/login` and `/auth/register` POSTs so APIs remain unaffected. Full runbook: [Auth runtime & origin guard runbook](../guides/auth-runtime-and-origin-guard.md).

## Consequences
- Form resets are eliminated; validation keeps safe fields prefilled.
- Middleware generates clear logs on mismatches while leaving `/api/**` untouched.
- Configuration guidance (`APP_URL`, `ALLOWED_ORIGINS`, `TRUST_PROXY`) is explicit, simplifying onboarding.
- Future changes must respect the single submission-path rule or update the runbook accordingly.
