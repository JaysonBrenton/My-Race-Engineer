# Auth Login & Registration Workflow Audit
- Author: Jayson Brenton
- Date: 2025-03-10
- Purpose: Capture current-state review findings for the authentication registration and login implementation.
- License: MIT

## Summary Findings
- **Domain model + schema gaps**
  - The `User` aggregate lacks the `status` attribute (ACTIVE/PENDING/SUSPENDED) and `emailVerifiedAt` is the only lifecycle marker, so the service layer cannot enforce admin-approval or richer verification flows.【F:src/core/domain/auth/user.ts†L1-L17】
  - Prisma schema mirrors the thin domain model: there is no status column, no verification or reset token tables, and user sessions only capture a token/expires tuple without device metadata or revocation support.【F:prisma/schema.prisma†L60-L105】
  - Repository ports expose only `findByEmail`/`create`, offering no way to update verification timestamps, persist status transitions, or rotate credentials/tokens, which blocks required flows like `verifyEmail`, `startReset`, and `confirmReset`.【F:src/core/app/ports/auth/userRepository.ts†L1-L8】【F:src/core/app/ports/auth/userSessionRepository.ts†L1-L5】

- **Core service limitations**
  - `RegisterUserService` stops at duplicate-email detection; it does not validate password strength (spec requires ≥10 chars), set initial status based on feature flags, queue verification tokens, or emit emails.【F:src/core/app/services/auth/registerUser.ts†L8-L38】
  - `LoginUserService` only checks an optional email verification flag and never inspects user status, so suspended or pending accounts will authenticate. It also issues sessions without revoking prior ones or persisting device context, making reset flows impossible.【F:src/core/app/services/auth/loginUser.ts†L9-L60】
  - Both services return raw domain objects and tokens but never surface structured log events or guard against weak/compromised password submissions, falling short of the security/DX guardrails.

- **Infrastructure adapters**
  - Prisma adapters only handle create/find and cannot mark emails as verified, flip status, or prune sessions, so implementing `verifyEmail`/`confirmReset` would require additional persistence operations not present today.【F:src/core/infra/prisma/prismaUserRepository.ts†L1-L38】【F:src/core/infra/prisma/prismaUserSessionRepository.ts†L1-L30】
  - There is no adapter for email delivery or token storage, meaning the mandated `MailerPort`, email verification, and password reset tokens are entirely absent.

- **UI & routing concerns**
  - App Router pages post to REST-style route handlers instead of server actions, diverging from the requirement for minimal pages backed by server actions for `/auth/*` flows.【F:src/app/(auth)/auth/register/submit/route.ts†L1-L149】【F:src/app/(auth)/auth/login/submit/route.ts†L1-L113】
  - Successful registration always redirects to login without establishing a session when verification/approval are optional, so the UX never mirrors the “auto-login when allowed” guardrail.【F:src/app/(auth)/auth/register/submit/route.ts†L109-L131】
  - Login handler writes cookies with `expires` but omits an explicit `maxAge` and lacks consistent structured logging (falls back to `console.error` on failure), reducing observability and violating the logging guidance.【F:src/app/(auth)/auth/login/submit/route.ts†L94-L112】

- **Configuration & secret handling**
  - Auth forms stay enabled when `SESSION_SECRET` is missing or <32 chars in non-production environments because the token helper silently generates an ephemeral secret; requirements call for disabling the forms entirely until a valid secret is present.【F:src/lib/auth/formTokens.ts†L27-L59】
  - Dependencies wire services without injecting the mailer, flag evaluation, or additional collaborators needed for verification/reset workflows, so feature toggles (`FEATURE_REQUIRE_ADMIN_APPROVAL`, etc.) are effectively ignored beyond a basic email-verification boolean.【F:src/dependencies/auth.ts†L1-L19】

- **Security & resilience**
  - There is no rate limiting, IP/device tracking, or token invalidation, leaving `/auth/*` endpoints unprotected against brute-force attacks and making password reset/verification replay trivial.
  - Session issuance never revokes old sessions after password change (because no reset flow exists) and lacks storage for hashed session secrets, making token leakage high risk.【F:src/core/app/services/auth/loginUser.ts†L44-L55】【F:src/core/infra/prisma/prismaUserSessionRepository.ts†L16-L28】

- **Testing & documentation gaps**
  - The existing automated suite targets telemetry ingestion and SEO scenarios, with no coverage for registration/login or reset flows, so mandated happy/negative auth paths remain untested.【8f720e†L1-L4】

## Recommendations
- Expand the domain model and Prisma schema to include user status enums, token tables, and richer session metadata before layering the new service methods.
- Introduce comprehensive auth services (`register`, `login`, `verifyEmail`, `startReset`, `confirmReset`) behind ports, with structured logging and password strength enforcement aligned with specs.
- Replace route-handler submissions with server actions, ensuring session cookies honour `maxAge`, secure attributes, and secret gating, while respecting feature flags.
- Add rate limiting for `/auth/*` in development, implement Nodemailer adapters, and flesh out automated tests covering end-to-end happy/negative paths.
