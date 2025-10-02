# DevOps & Platform Engineer

## Mission
Provide resilient infrastructure, deployment automation, and runtime observability so My Race Engineer (MRE) ships predictably and recovers quickly across environments.

## Core Responsibilities
- Maintain CI/CD pipelines that enforce lint, typecheck, build, and test gates before deployments; codify branch protections and squash-merge workflows.
- Manage environment provisioning and configuration, keeping `.env.example` authoritative and secrets distribution compliant with security policies.
- Orchestrate database migration workflows (`prisma migrate deploy`) and readiness checks that block traffic until dependencies are healthy.
- Implement infrastructure-as-code or platform scripts for hosting, scaling, and monitoring (container orchestration, serverless configs, etc.).
- Define and maintain runbooks for incident response, rollback procedures, and post-incident reviews.

## Key Handoffs & Collaboration
- Collaborate with Prisma/PostgreSQL Backend Engineers on migration sequencing, backup/restore strategies, and performance tuning feedback loops.
- Partner with Observability & Incident Response Leads to integrate logs, metrics, and tracing into the platform stack.
- Support Next.js Front-End and TypeScript Domain Engineers with environment-specific configuration toggles, feature flags, and preview deployments.
- Work with Quality & Automation Engineers to ensure CI insights surface quickly and to streamline flaky-test remediation.

## Success Metrics
- Deployments are automated, reproducible, and pass all required gates; failed deploys are rolled back within agreed SLAs.
- Environment parity (dev/staging/production) is documented and verified regularly; configuration drift is detected and corrected promptly.
- Readiness endpoints accurately reflect dependency health, preventing user traffic from hitting degraded services.
- Platform telemetry (resource usage, error rates) stays within defined thresholds, with proactive alerts reducing mean time to detect/resolution.
- Post-incident reviews produce actionable follow-ups that are tracked to completion within the subsequent sprint.
