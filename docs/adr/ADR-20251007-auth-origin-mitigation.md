# ADR-20251007: Auth origin mitigation before Server Actions

- Status: Accepted
- Owners: Platform Engineering
- Date: 2025-10-07

## Context

Next.js 14 tightened enforcement for Server Actions and now rejects any POST where the `Origin` header does not match the host that served the page. Our `/auth/login` and `/auth/register` flows submit to Server Actions. When a proxy or misconfigured client sends a mismatched `Origin`, Next.js throws `Invalid Server Actions request`, returning a 500 before our guards execute. The behaviour leaked implementation details and produced confusing errors for legitimate users when their origin differed from the allowlist.

## Decision

Introduce a root middleware that screens POST requests headed to `/auth/login` or `/auth/register` before they reach Server Actions. The middleware normalises the `Origin` header, compares it against the allowlist derived from `ALLOWED_ORIGINS` (falling back to `APP_URL`), and issues a `303 See Other` redirect with `?error=invalid-origin` when the header is missing or unrecognised. Allowed requests continue as normal.

Keep the existing route guard (`guardAuthPostOrigin`) at the start of each handler for defence in depth. Authentication forms now submit to the route handlers (`action="/auth/..."`) instead of invoking Server Actions directly so the middleware can intercept requests consistently. For local development, expose an explicit `experimental.serverActions.allowedOrigins` list covering the dev hosts we use behind reverse proxies.

## Consequences

- Users hitting the auth surfaces from disallowed origins receive a deterministic redirect instead of a 500, avoiding the Next.js error page and keeping logs clean.
- Middleware, route guards, and server actions share the same origin normalisation helper, reducing drift in how allowlists are interpreted.
- Operators must maintain `ALLOWED_ORIGINS` or `APP_URL` to include every legitimate origin; misconfiguration now surfaces to the user via `?error=invalid-origin`.
- Dev-only Server Action overrides ensure proxied requests still function without broadening the production attack surface.

## Follow-ups

- Monitor logs for repeated `invalid-origin` redirects to identify legitimate hosts that need to be allowlisted.
- Revisit once Next.js exposes a more granular hook for Server Action origin validation to potentially remove the middleware.
