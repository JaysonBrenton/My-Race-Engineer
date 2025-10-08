# 2025-03-18 Deep Review – Account Registration

## Scope & Context
This review audits the current account registration workflow spanning the App Router form (`/auth/register`), the server action orchestration, and the `RegisterUserService` domain logic plus supporting infrastructure. The goal is to identify correctness, security, and resilience gaps that affect account creation and the subsequent onboarding steps.

## Highlights
- Strong password policy enforcement exists in both the server action schema and the domain service, preventing weak credentials before persistence or expensive work is performed.【F:src/app/(auth)/auth/register/actions.ts†L17-L53】【F:src/core/app/services/auth/registerUser.ts†L70-L116】
- Registration outcomes map to clear next steps (verification, approval, or direct session issuance), and the UI propagates contextual messaging back to the caller via structured redirects.【F:src/app/(auth)/auth/register/actions.ts†L153-L205】

## Risks & Gaps
1. **Duplicate email race leads to 500s instead of friendly errors.** The service performs a `findByEmail` check and then calls `userRepository.create` without guarding against unique constraint violations. Concurrent requests for the same email can pass the existence check and rely on the database to reject the duplicate, which propagates as an unhandled exception and surfaces as a 500 rather than returning the documented `email-taken` result.【F:src/core/app/services/auth/registerUser.ts†L86-L117】【F:src/core/infra/prisma/prismaUserRepository.ts†L37-L66】
2. **No transactional safety around multi-step side effects.** After inserting the user the service sends verification emails, persists tokens, and optionally issues sessions. Any failure after the user row is created (e.g. mailer outage, Prisma error) leaves the account in a partially initialised state without compensating cleanup or retries, forcing operators to intervene manually.【F:src/core/app/services/auth/registerUser.ts†L109-L208】
3. **Session tokens persisted in plaintext.** Issued session secrets are written directly to the database and returned to the caller without hashing, which means a datastore leak immediately compromises every active session. The Prisma adapter mirrors this by storing `sessionToken` verbatim.【F:src/core/app/services/auth/registerUser.ts†L176-L208】【F:src/core/infra/prisma/prismaUserSessionRepository.ts†L21-L36】
4. **Mixed verification + admin approval flows are ambiguous.** When both feature flags are enabled the service returns `nextStep: 'verify-email'`, never signalling that admin approval is still required after verification. Users who verify successfully will continue to see a pending account with no messaging about the remaining approval gate.【F:src/core/app/services/auth/registerUser.ts†L100-L174】
5. **Unhandled domain faults bubble into generic error pages.** The server action assumes the domain call resolves to a success/failure result but does not catch thrown errors (e.g. database constraint violations or infrastructure outages) to translate them into the `server-error` UI state. Any unexpected fault renders the global error boundary instead of keeping the user on the registration surface.【F:src/app/(auth)/auth/register/actions.ts†L140-L206】

## Recommendations
- Wrap the user creation + follow-up side effects in a Prisma transaction and catch unique constraint errors to return `{ ok: false, reason: 'email-taken' }` consistently. Roll back the user insert when downstream dependencies fail so operators do not inherit partially configured accounts.
- Hash session tokens (e.g. SHA-256 or bcrypt) before persistence and compare hashed values on lookup to mitigate database compromise scenarios.
- Extend the service result to represent combined verification + approval states (e.g. `nextStep: 'verify-email-await-approval'`) and update the UI messaging so users understand both required actions.
- Add defensive error handling inside `registerAction` to trap thrown errors, log them with context, and redirect back with `error=server-error` to preserve UX while instrumentation captures the root cause.

## Test Coverage & Follow-up
- Added a targeted unit suite for `RegisterUserService` covering weak-password rejection, duplicate email handling, verification email dispatch, admin approval behaviour, and happy-path session issuance.【F:tests/core/auth/registerUserService.test.ts†L1-L216】 This suite should be integrated into continuous integration runs (e.g. `npm run test:auth`) so regressions in account creation surface quickly.
- Automated test execution: `npx tsx --test tests/core/auth/registerUserService.test.ts`【4fd8a8†L1-L12】

Addressing the highlighted risks will tighten security posture, improve error resilience, and align the onboarding UX with feature-flag combinations expected in production.
