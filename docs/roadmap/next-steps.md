# Next steps for My Race Engineer

This note maps the immediate follow-up work after the current repository baseline so contributors know "what is next" without digging through multiple docs.

## 1. Ship the authentication entry points
- Finalise the sign-in landing by wiring the planned login, registration, and password reset flows.
- Uphold the accessibility and tokenisation rules documented in `docs/ux-principles.md` when building the screens and copy.
- Store credentials with Argon2id hashing and add secure session management per the roadmap placeholder.

## 2. Stand up the LiveRC ingestion baseline
- Promote the existing importer wizard behind the feature flags into a default-on path once QA in `docs/QA.md` passes reliably.
- Build the `/api/liverc/import` handling outlined in `docs/integrations/liverc-import-api.md`, including error envelopes and resolver guidance.
- Flesh out the normalised storage model so entry lists and race results from LiveRC can power comparisons without reprocessing.

## 3. Operational hardening
- Implement the `/api/health`, `/api/ready`, and `/api/version` endpoints called out in the README, ensuring readiness checks fail when Postgres or migrations are unavailable.
- Add structured logging with request IDs in the server handlers, following the guardrails in the repo root `AGENTS.md`.
- Confirm environment setup stays in sync with `.env.example`, including any new flags introduced while turning on importer features.

## 4. Analytics and telemetry foundations
- Instrument the importer and dashboard flows with minimal analytics events that respect the structured logging expectations.
- Document telemetry schemas and retention expectations so future features can emit events consistently.
- Prepare to surface key metrics (import success rate, processing latency) on an internal dashboard once logging exists.

---

Each track above should land via a focused branch and PR. Keep diffs narrowly scoped, update docs alongside code, and run the lint/typecheck/build suite before requesting review.
