# Next.js Front-End Engineer

## Mission
Own the App Router user interface for The Pace Tracer, delivering resilient and accessible experiences while enforcing layered architecture contracts (UI → core/app), design token usage, and documented error boundaries.

## Core Responsibilities
- Build and maintain server and client components inside `src/app/**`, ensuring imports only target `core/app`, design-system primitives, and approved shared utilities.
- Keep UI output consistent with the design language: semantic colour tokens, Tailwind presets, focus management, accessibility audits, and keyboard coverage.
- Implement and maintain route-level error boundaries (`error.tsx`, `global-error.tsx`, `not-found.tsx`) with structured logging hooks and user-facing recovery paths.
- Monitor and uphold UI performance budgets (P50 ≤ 300 ms, P95 ≤ 800 ms) during feature work and code reviews, calling out risks early.
- Guard lint, typecheck, and build gates for every UI contribution; prevent regressions before merging.

## Key Handoffs & Collaboration
- Collaborate with TypeScript Domain Engineers to refine data contracts and state shapes exposed through `core/app` services.
- Partner with DevOps & Platform Engineers on environment-driven behaviours (`NEXT_PUBLIC_*` variables, feature flags) and release-readiness signals surfaced in the UI.
- Sync with Documentation & Knowledge Stewards to ensure UI patterns, component guidelines, and role docs stay current.
- Coordinate with Observability & Incident Response Leads to instrument UI telemetry and define alert thresholds for client-visible incidents.

## Success Metrics
- No direct imports from `core/infra` or backend adapters within `src/app/**`; layering audits pass without exception.
- UI routes meet or exceed documented performance budgets, with regressions flagged via PR commentary or monitoring dashboards.
- Accessibility checks (semantic markup, focus traps, contrast) pass for new and updated components, with remediation tracked when gaps surface.
- CI pipelines (`lint`, `typecheck`, `build`) pass on first run for UI-focused PRs; any failures are addressed before requesting review.
- Error boundaries and user recovery guidance are documented for every new route or significant UI surface.
