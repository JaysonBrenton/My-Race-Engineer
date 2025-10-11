# Deep code review — 2025-11-07

## Scope
- End-to-end account registration flow: server action (`src/app/(auth)/auth/register/actions.impl.ts`), supporting state helpers, and the `RegisterUserService` domain orchestration.
- Prisma adapters for user and session persistence that the registration flow depends on.

## Highlights
- The server action now orchestrates the entire happy path: origin guard, rate limiting, form-token validation, input parsing, and redirect handling are all wired up, which means the UI can surface precise error reasons instead of generic failures. The logging hooks also emit structured fingerprints instead of raw emails, keeping observability safe by default.【F:src/app/(auth)/auth/register/actions.impl.ts†L82-L314】
- Domain and infrastructure layers remain neatly separated. The server action only depends on the app-layer service, while Prisma repositories continue to encapsulate persistence details, matching the layering guidance in `AGENTS.md`.

## Critical issues
1. **Duplicate email race still results in 500s.** `RegisterUserService` checks `findByEmail` before calling `create`, but there is no unique-constraint handling if two requests race. The second insert will bubble a Prisma error that the server action catches as an unexpected fault and maps to `server-error`, regressing the UX back to a generic failure.【F:src/core/app/services/auth/registerUser.ts†L48-L122】【F:src/app/(auth)/auth/register/actions.impl.ts†L215-L278】 Wrap the creation in a transaction or trap `PrismaClientKnownRequestError` code `P2002` so the caller still gets `{ ok: false, reason: 'email-taken' }`.
2. **Partially created accounts when downstream work fails.** After creating the user, the service performs several side effects (verification token issuance, email dispatch, session creation) without transactional protection. Any failure past the insert leaves an orphaned pending user that operators must clean up manually, despite the server action telling the customer to retry.【F:src/core/app/services/auth/registerUser.ts†L88-L205】 Use a Prisma transaction with compensating logic or perform side effects first and commit the user last to keep state consistent.
3. **Session secrets stored in plaintext.** When a session is issued, the raw `sessionToken` is persisted and returned to the action, and Prisma writes it verbatim. A database leak would immediately compromise every active session.【F:src/core/app/services/auth/registerUser.ts†L160-L205】【F:src/core/infra/prisma/prismaUserSessionRepository.ts†L8-L43】 Hash tokens (e.g. SHA-256 or Argon2) before storage and compare hashes on lookup so stolen rows cannot be replayed.
4. **Admin approval + verification clash is still ambiguous.** The service returns `nextStep: 'verify-email'` when email verification is required, even if admin approval is also enabled, so the UI never communicates that users must wait for approval after verifying. Customers see success yet remain unable to log in.【F:src/core/app/services/auth/registerUser.ts†L98-L150】 Extend the result contract (and UI handling) with a combined outcome such as `verify-email-await-approval`.

## Recommendations
- Add targeted tests that cover the duplicate email race (simulated via repository throwing `P2002`) and the combined verification/approval scenario so regressions fail fast.【F:tests/core/auth/registerUserService.test.ts†L1-L120】
- Introduce a transactional helper in the Prisma layer for registration that can roll back the user insert if token creation, email dispatch, or session writes fail.
- Store session tokens as hashed digests and rotate any existing plaintext records during rollout to avoid forced logouts.
- Revisit UX copy once the combined verification/approval state exists so the "rego" (registration) process continues to guide operators and end users accurately now that the happy path works reliably.
