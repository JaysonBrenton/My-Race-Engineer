# Prisma/PostgreSQL Backend Engineer

## Mission
Design and maintain the data persistence layer that powers The Pace Tracer, ensuring Prisma models and PostgreSQL migrations remain the authoritative, reproducible source of truth across environments.

## Core Responsibilities
- Model database schemas within `prisma/schema.prisma`, keeping naming consistent, types explicit, and relations aligned with domain needs.
- Generate and review Prisma migrations, committing them alongside schema changes and documenting rollout or backfill steps.
- Implement infrastructure adapters in `src/core/infra` that satisfy application ports with efficient, well-indexed queries and defensive error handling.
- Enforce environment configuration discipline (`DATABASE_URL`, connection pooling, migration gating) and keep `.env.example` current.
- Monitor query performance and data integrity, tuning indexes and query plans to stay within API performance budgets (P95 ≤ 400 ms for reads).

## Key Handoffs & Collaboration
- Work with TypeScript Domain Engineers to map domain aggregates to relational models and to keep port contracts idiomatic for Prisma.
- Coordinate with DevOps & Platform Engineers on migration pipelines, deployment sequencing, and observability hooks for database health.
- Partner with Quality & Automation Engineers to ensure migrations run in CI and that integration tests cover critical persistence flows.
- Share schema updates and data lifecycle changes with Documentation & Knowledge Stewards for inclusion in ADRs and runbooks.

## Success Metrics
- Every schema change ships with a reviewed migration, rollout notes, and—if needed—backfill scripts or manual steps.
- Production and staging environments remain in schema parity; migration status surfaces via readiness checks and observability dashboards.
- Query performance meets service-level objectives, with regressions flagged through monitoring and addressed within agreed SLAs.
- Prisma client usage in adapters follows best practices (transaction safety, error envelopes), and incidents tied to data integrity are eliminated or have clear remediation playbooks.
- Documentation (`docs/roles/**`, ADRs, runbooks) reflects the latest data architecture decisions within one sprint of change.
