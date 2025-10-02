# Markdown audit — 2025-02-14

## Scope & method
- Reviewed all Markdown files tracked in the repository root and `docs/**` (excluding vendored `node_modules/**`).
- Checked for factual drift against current architecture guardrails, layering rules, and ingestion contracts.
- Flagged opportunities to clarify workflows or cross-link related guidance.

## Summary findings
| File | Status | Notes | Suggested follow-up |
| --- | --- | --- | --- |
| `AGENTS.md` | ✅ Accurate | Aligns with repository guardrails and layering expectations. | None.
| `README.md` | ✅ Accurate | Provides complete setup plus guardrails; consider surfacing the product guardrails link more prominently for newcomers. | Optional: add a "Product scope" link near the quickstart for new contributors.
| `src/core/app/README.md` | ✅ Updated | Adjusted the dedupe constraint to reference `(entrantId, lapNumber)` so it matches the documented Prisma unique key. | None.
| `docs/integrations/liverc-data-model.md` | ✅ Accurate | Contract mirrors current schema and ingestion rules, including hashing guidance. | None until schema changes.
| `docs/integrations/liverc-import-api.md` | ✅ Accurate | Response envelopes and error handling guidance remain aligned with the API review. | Future enhancement: add rate limiting/backoff note once implemented.
| `docs/reviews/2024-10-07-deep-code-review.md` | ⚠️ Time-sensitive | Still authoritative but assumes pending fixes (HTTP error mapping, orphan lap rejection). | Refresh once those fixes land to mark recommendations as resolved.
| `docs/guardrails/product-guardrails.md` | ✅ Accurate | MVP scope and non-goals are clear; definition of "slow lap" is detailed. | Consider formatting the slow-lap heuristics as a sub-list for quicker scanning.
| `docs/roles/typescript-domain-engineer.md` | ✅ Accurate | Responsibilities align with layering rules and ADR expectations. | None.
| `docs/roles/nextjs-front-end-engineer.md` | ✅ Accurate | Reinforces App Router guardrails and performance budgets. | Add reference to forthcoming design principles doc when published.
| `docs/roles/devops-platform-engineer.md` | ✅ Accurate | Captures CI/CD ownership and readiness gating. | None.
| `docs/roles/prisma-postgresql-backend-engineer.md` | ✅ Accurate | Keeps Prisma responsibilities aligned with ingestion contract. | None.
| `docs/roles/observability-incident-response-lead.md` | ✅ Accurate | Telemetry expectations and collaboration touchpoints are comprehensive. | None.
| `docs/roles/quality-automation-engineer.md` | ✅ Accurate | Emphasises CI ownership and flaky-test response times. | None.
| `docs/roles/documentation-knowledge-steward.md` | ✅ Accurate | Highlights doc freshness and ADR facilitation. | None.

## Next steps
- Track the outstanding action items noted in the 2024-10-07 deep review and update that document after remediation.
- When design principle documentation is authored, remember to link it from the README and the Next.js role guide per the suggestions above.
