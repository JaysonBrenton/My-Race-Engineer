# ADR-20251011: Drop mandatory admin approval for basic sign-up

- Status: Accepted
- Owners: Product & Platform Engineering
- Date: 2025-10-11

## Context

The previous registration flow forced every new account to wait for manual administrator approval, even when the user only needed
baseline access to pacing dashboards. This slowed onboarding, created manual toil for the admin team, and blocked automated QA
runs. We still require email verification for security, and elevated roles (club admins, ingestion operators) should remain gated
behind human review, but the baseline `driver` experience needs to be self-service.

## Decision

- Default registrations now provision the lowest-privilege `driver` role immediately after email verification.
- `FEATURE_REQUIRE_EMAIL_VERIFICATION` defaults to `true` to keep the verification gate active.
- `FEATURE_REQUIRE_ADMIN_APPROVAL` defaults to `false`; when set to `true` we restore the legacy “await admin approval” flow for
  all sign-ups.
- Introduced `FEATURE_INVITE_ONLY` (default blank/`false`) to allow deployments to disable open self-service when a controlled
  invite program is required.
- Domain and UI telemetry were updated to emit `auth.registration.created` with approval + verification flags so analytics can
  separate open sign-ups from invite-only workflows.

## Consequences

- New users can create an account and, after confirming their email, sign in immediately without waiting on staff.
- Administrators only need to review elevation requests instead of every single registration, reducing queue volume.
- QA and staging environments no longer need seeded approval records to exercise the login flow.
- Feature flags allow operations teams to re-enable universal approval or invite-only registration if risks emerge.

## Rollback plan

1. Set `FEATURE_REQUIRE_ADMIN_APPROVAL=true` in the environment to reinstate the previous behaviour without code changes.
2. If deeper rollback is required, revert PR `feature/drop-admin-approval-basic-signup` and redeploy.

## Related flags

- `FEATURE_REQUIRE_EMAIL_VERIFICATION`
- `FEATURE_REQUIRE_ADMIN_APPROVAL`
- `FEATURE_INVITE_ONLY`
