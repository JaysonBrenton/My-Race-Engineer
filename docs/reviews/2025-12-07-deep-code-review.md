# Deep code review — 2025-12-07

> **2025-12 note:** The JSON and file import endpoints assessed below have since been removed. Connector routes now enforce authentication and import guardrails.

## Scope

- LiveRC import HTTP endpoints and supporting middleware.
- Import dashboard client experience, including resolver affordances and the wizard flow.

## Current assessment

1. **Historical:** Import endpoints required authenticated, tokenised callers. Both JSON and file ingestion routes invoked `authorizeImportRequest` before they read the request body, enforcing session cookies, origin allow-listing, and per-request form tokens so anonymous submissions were rejected upstream.

2. **Resolver affordances are configurable and exposed to the client.** The import page resolves resolver and proxy flags on the server and passes them through props, allowing the client form to toggle Resolve button behaviour and modal guidance at runtime instead of hard-coding falsey fallbacks.【F:src/app/(dashboard)/import/page.tsx†L17-L91】【F:src/app/(dashboard)/import/ImportForm.tsx†L616-L934】

3. **Wizard localStorage access is resilient to browser quota limits.** Both the initial read and subsequent writes are wrapped in try/catch guards; the component tracks failed writes and falls back to in-memory history to avoid runtime crashes when storage is unavailable.【F:src/app/(dashboard)/import/Wizard.tsx†L34-L82】

## Suggested next steps

- Keep the authentication helper under unit/integration coverage so changes to session or form token semantics cannot silently weaken the guardrails.
- Add end-to-end coverage that verifies the resolver controls render when the server sets the flag, exercising both HTML and JSON flows in CI.
- Periodically exercise the wizard in storage-restricted browser contexts (e.g., automated Safari private mode runs) to confirm the defensive path stays healthy.

## Resolution status — 2025-10-20 (historical)

- ✅ Authentication and anti-CSRF validation lived in `src/app/api/liverc/authGuard.ts`, and both the JSON import and file import routes invoked it before reading the request body. The guard was removed alongside the legacy routes once connector-based ingestion shipped.
- ✅ `src/app/(dashboard)/import/page.tsx` resolves resolver/proxy flags on the server and passes them into the client import form, which uses the shared `ParsedState` helpers to decide when to show the Resolve affordance.
- ✅ `src/app/(dashboard)/import/Wizard.tsx` guards `localStorage.setItem` calls and degrades to an in-memory history if the browser blocks storage writes.
