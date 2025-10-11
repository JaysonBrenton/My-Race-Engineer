# ADR-20251011: LiveRC catalogue and import strategy

- Status: Accepted
- Authors: Data Integrations Working Group
- Date: 2025-10-11

## Context
The LiveRC integration will power multi-club intelligence in My Race Engineer. Today we only mirror post-race summaries supplied manually, which limits automation, discoverability, and telemetry. We plan to ingest LiveRC data directly so coaches can browse upcoming events, analyse historical sessions, and trigger automated imports without touching raw CSV exports. Establishing a clear namespace and sequencing the build lets us stage delivery safely while reusing existing auth, job infrastructure, and telemetry hooks.

## Options considered
1. **Single-phase, monolithic LiveRC pipeline under generic `/api/connectors`**.
   - Pros: One-time setup, fewer ADR updates.
   - Cons: High blast radius, unclear ownership, hard to rollback partial features, mixes providers.
2. **Extend existing results ingestion endpoints with LiveRC-specific flags.**
   - Pros: Reuses routes, minimal scaffolding.
   - Cons: Breaks provider boundaries, complicates auth, risks regressions for other providers, unclear caching strategy.
3. **Create a provider-scoped namespace `/api/connectors/liverc/...` with phased delivery.**
   - Pros: Explicit ownership, incremental rollout, enables provider-specific caching and telemetry, isolates failures.
   - Cons: Requires additional documentation and new routing scaffolding.

## Decision
Adopt option 3. We will introduce a dedicated provider namespace rooted at `/api/connectors/liverc/...` and implement the LiveRC connector through staged phases:
1. **Catalogue & search** for clubs, events, sessions, and drivers.
2. **Plan & apply imports plus job tracking** for summaries and full-lap auto ingests.
3. **Watch mode** to stream or poll for live session updates.
4. **Power filters** to enrich dashboards with LiveRC-derived metadata.

Data persisted during these phases will include: `Club`, `Event`, `Session`, `ResultRow`, `Lap`, `Driver`, `Alias`, and `ImportJob`. We will generate idempotency keys per upstream entity import (e.g., `provider:liveRC:session:{externalId}`) and per job submission (`provider:liveRC:job:{externalId}:{timestampBucket}`) to ensure reruns reconcile without duplication. Existing authentication mechanisms, queue workers, and infrastructure remain untouched; this ADR only scopes documentation and repository layout.

## Consequences
- Upcoming work has a clear home under `src/app/api/connectors/liverc/` and `src/core/app/connectors/liverc/`, keeping imports aligned with layering rules.
- Phased delivery enables partial ship-readiness after each milestone and keeps cache/performance budgets (<100 ms typeahead P95, <400 ms event list P95) visible per phase.
- Idempotency keys guarantee repeatable imports and simplify retries when upstream LiveRC responses fluctuate.
- Future ADRs or design docs can focus on per-phase details (e.g., telemetry hooks, caching), avoiding namespace churn or auth refactors.
