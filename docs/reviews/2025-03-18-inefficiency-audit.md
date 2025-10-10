# 2025-03-18 Inefficiency Audit Notes

## Context
Partner review of auth flows, LiveRC import orchestration, and server fallbacks highlighted a few recurring anti-patterns that will add maintenance drag if left in place.

## Findings

### Copy-paste helpers across auth actions
Multiple server actions and pages define the same `buildRedirectUrl` and `buildPrefillParam` helpers with identical logic. Examples include the login action, registration state/action guard, and the password reset flows.【F:src/app/(auth)/auth/login/actions.impl.ts†L44-L82】【F:src/app/(auth)/auth/register/state.ts†L93-L122】【F:src/app/(auth)/auth/reset-password/actions.ts†L26-L115】

*Impact:* updates to redirect semantics or prefill sanitisation require touching each copy, and the implementations can drift out of sync. This is classic copy-paste programming.

*Suggested next step:* centralise these helpers under a shared module (e.g., `src/lib/auth/url.ts`) so callers import the common logic.

### Hard-coded status message tables (“magic strings”)
Status and error messaging for auth pages is stored as long inline switch statements populated with hard-coded literals.【F:src/app/(auth)/auth/login/page.tsx†L85-L175】【F:src/app/(auth)/auth/register/state.ts†L46-L85】

*Impact:* adding or localising messages means editing several files, and there is no single source of truth for the allowed codes. This is a “magic strings” smell that can cause inconsistent UX copy and missed updates.

*Suggested next step:* extract shared enums/constants for status codes and message maps (potentially co-located with validation logic) so that page components consume structured data.

### LiveRcImportService acting as a god object
`LiveRcImportService` spans ~650 lines and directly coordinates URL validation, API fetching, persistence for events/classes/sessions/entrants, logging, lap grouping, and ID generation in one class.【F:src/core/app/services/importLiveRc.ts†L143-L360】

*Impact:* the class violates single-responsibility principles, making it hard to unit test or extend individual concerns (e.g., swapping persistence strategies or custom logging). Bugs in one area risk cascading through unrelated code.

*Suggested next step:* split the service into focused collaborators (URL validation, context persistence, lap transformation) and have a thin orchestrator compose them.

## Next actions
1. Deduplicate auth helper utilities and update all call sites.
2. Define shared status-code/message maps for auth flows.
3. Plan a refactor of the LiveRC import pipeline into smaller services with explicit interfaces.
