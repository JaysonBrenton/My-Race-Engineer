# Deep code review — 2025-10-26

## Scope
- Authentication password reset UX (`src/app/(auth)/auth/reset-password`) and supporting infrastructure.
- Domain-level password reset orchestration (`StartPasswordResetService`) and dependency wiring.

## Critical issues

1. **Password reset requests always fail because no handler exists for the form post.**
   - The reset page submits directly to `/auth/reset-password`, but there is no route handler or server action wired to receive that POST. Browsers will get a 404/405 response instead of triggering the email flow, so nobody can even start a reset.【F:src/app/(auth)/auth/reset-password/page.tsx†L74-L128】
   - The only reference to `startPasswordResetService` is in the dependency container; nothing in the app layer invokes it, confirming the missing integration.【F:src/dependencies/auth.ts†L107-L121】【f8b9b6†L1-L4】

2. **Issued reset links point to a non-existent confirmation route.**
   - The reset email embeds `/auth/reset-password/confirm?token=…`, but there is no corresponding page or route under `src/app/(auth)/auth/reset-password`, so recipients land on the 404 page and cannot finish the reset flow.【F:src/core/app/services/auth/startPasswordReset.ts†L40-L66】【2c2b53†L1-L2】【5e0ebb†L1-L2】

## Suggested next steps
- Add a server action or route handler for `/auth/reset-password` that validates the form token, enforces rate limits, and delegates to `startPasswordResetService`, then surface success/failure states on the page.
- Implement the `/auth/reset-password/confirm` route (page + POST handler) that verifies the token via `confirmPasswordResetService`, collects the new password, and feeds back clear status messaging.
- Once the flows exist, add regression tests that exercise both happy paths and expired/invalid token branches so future refactors keep them intact.
