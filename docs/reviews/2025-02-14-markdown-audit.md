# Markdown audit — 2025-02-14

## Scope & method

- Reviewed all Markdown files tracked in the repository root and `docs/**` (excluding vendored `node_modules/**`).
- Checked for factual drift against current architecture guardrails, layering rules, and ingestion contracts.
- Flagged opportunities to clarify workflows or cross-link related guidance.

## Summary findings

| File                                                 | Status        | Notes                                                                                           | Suggested follow-up                                                                      |
| ---------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `AGENTS.md`                                          | ✅ Accurate   | Aligns with repository guardrails and layering expectations.                                    | None.                                                                                    |
| `README.md`                                          | ✅ Accurate   | Setup and doc index refreshed; duplicate sections and stray branch slugs removed.               | Consider surfacing the product guardrails link near the quickstart for new contributors. |
| `src/core/app/README.md`                             | ✅ Accurate   | Documents the shipped LiveRC import service instead of future pipelines.                        | None.                                                                                    |
| `docs/integrations/liverc-data-model.md`             | ✅ Accurate   | Now scopes the contract to entry list + race result endpoints that exist today.                 | Expand once heat-sheet ingestion ships.                                                  |
| `docs/integrations/liverc-connectors.md`             | ✅ Accurate   | Notes optional `.json` suffixes and connector workflows after the direct import API retirement. | Future enhancement: add rate limiting/backoff note once implemented.                     |
| `docs/reviews/2024-10-07-deep-code-review.md`        | ✅ Historical | Updated with resolution dates for all prior action items.                                       | None.                                                                                    |
| `docs/guardrails/product-guardrails.md`              | ✅ Accurate   | MVP scope and non-goals are clear; definition of "slow lap" is detailed.                        | Consider formatting the slow-lap heuristics as a sub-list for quicker scanning.          |
| `docs/roles/typescript-domain-engineer.md`           | ✅ Accurate   | Responsibilities align with layering rules and ADR expectations.                                | None.                                                                                    |
| `docs/roles/nextjs-front-end-engineer.md`            | ✅ Accurate   | Reinforces App Router guardrails and performance budgets.                                       | Add reference to forthcoming design principles doc when published.                       |
| `docs/roles/devops-platform-engineer.md`             | ✅ Accurate   | Captures CI/CD ownership and readiness gating.                                                  | None.                                                                                    |
| `docs/roles/prisma-postgresql-backend-engineer.md`   | ✅ Accurate   | Keeps Prisma responsibilities aligned with ingestion contract.                                  | None.                                                                                    |
| `docs/roles/observability-incident-response-lead.md` | ✅ Accurate   | Telemetry expectations and collaboration touchpoints are comprehensive.                         | None.                                                                                    |
| `docs/roles/quality-automation-engineer.md`          | ✅ Accurate   | Emphasises CI ownership and flaky-test response times.                                          | None.                                                                                    |
| `docs/roles/documentation-knowledge-steward.md`      | ✅ Accurate   | Highlights doc freshness and ADR facilitation.                                                  | None.                                                                                    |

## Next steps

- Keep future LiveRC documentation updates in sync as additional ingestion stages (heat sheets, rankings, multi-main) ship.
- When design principle documentation is authored, remember to link it from the README and the Next.js role guide per the suggestions above.
