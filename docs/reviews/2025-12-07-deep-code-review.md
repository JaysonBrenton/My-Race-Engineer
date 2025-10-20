# Deep code review — 2025-12-07

## Scope
- LiveRC import HTTP endpoints and supporting middleware.
- Import dashboard client experience, including resolver affordances and the wizard flow.

## Critical issues

1. **LiveRC import endpoints accept unauthenticated writes.**
   - The `/api/liverc/import` route simply instantiates the handlers and exposes `POST` without checking for a session or CSRF token.【F:src/app/api/liverc/import/route.ts†L3-L23】【F:src/app/api/liverc/import/handlers.ts†L19-L210】
   - Middleware currently only guards `/auth`, `/dashboard`, and `/import`, leaving all `/api/liverc/*` calls reachable to anonymous callers. Attackers can therefore enqueue arbitrary imports that mutate persistence state without logging in.【F:src/middleware.ts†L81-L151】
   - The import-file endpoint follows the same pattern, so uploaded payloads can be ingested anonymously as well.【F:src/app/api/liverc/import-file/route.ts†L1-L120】

2. **Resolver affordances are permanently disabled in the browser build.**
   - The import form marks the resolver as enabled only when `process.env.ENABLE_LIVERC_RESOLVER === '1'`, and checks for the internal proxy via `process.env.LIVERC_HTTP_BASE`. These variables are server-only; when bundled for the client they become `undefined`, so the booleans are always false.【F:src/app/(dashboard)/import/ImportForm.tsx†L111-L114】
   - Downstream UI (Resolve button, modal, QA proxy guidance) is gated on those flags, meaning the resolver workflow never appears regardless of deployment configuration.【F:src/app/(dashboard)/import/ImportForm.tsx†L1078-L1213】

3. **Wizard history writes can crash on storage-restricted browsers.**
   - The wizard reads localStorage behind a try/catch, but its subsequent `setItem` is unguarded. In Safari private browsing or exhausted quotas, that call throws synchronously during render, tearing down the wizard whenever state updates fire.【F:src/app/(dashboard)/import/Wizard.tsx†L46-L77】

## Suggested next steps
- Enforce authentication (session check plus anti-CSRF token) or move the LiveRC ingestion behind a server action so anonymous callers cannot write telemetry data.
- Surface resolver/proxy flags to the client via `NEXT_PUBLIC_…` variables or a server-provided config endpoint, and add a regression test that the Resolve button renders when the flag is enabled.
- Wrap the wizard’s `localStorage.setItem` in a try/catch (and degrade gracefully to in-memory history) so storage quota errors do not break the UI.

## Resolution status — 2025-10-20
- ✅ Authentication and anti-CSRF validation now live in `src/app/api/liverc/authGuard.ts`, and both the JSON import and file import routes invoke it before reading the request body.
- ✅ `src/app/(dashboard)/import/page.tsx` resolves resolver/proxy flags on the server and passes them into the client import form, which uses the shared `ParsedState` helpers to decide when to show the Resolve affordance.
- ✅ `src/app/(dashboard)/import/Wizard.tsx` guards `localStorage.setItem` calls and degrades to an in-memory history if the browser blocks storage writes.
