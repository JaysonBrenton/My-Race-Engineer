# TypeScript Domain Engineer

## Mission
Maintain a strictly typed, framework-agnostic domain and application service layer under `src/core/**`, ensuring business rules remain portable, testable, and enforce the "imports point up" contract.

## Core Responsibilities
- Model domain rules, entities, and value objects within `src/core/domain`, avoiding framework or IO dependencies.
- Implement application services in `src/core/app` that orchestrate domain logic, expose stable contracts to the UI, and consume infrastructure ports.
- Define and evolve port interfaces for infrastructure adapters, keeping them explicit and well-documented.
- Uphold strict TypeScript settings (no implicit `any`, `noUnusedLocals`, `exactOptionalPropertyTypes`) and introduce generics/utility types where they improve safety.
- Author unit tests or property-based checks that validate domain behaviour independent of Next.js or Prisma layers.

## Key Handoffs & Collaboration
- Partner with Next.js Front-End Engineers to clarify data requirements, ensure DTOs stay minimal, and prevent leaking infrastructure details.
- Collaborate with Prisma/PostgreSQL Backend Engineers to translate port contracts into concrete adapters and keep schema changes reflected in domain models.
- Work with Quality & Automation Engineers to maintain fast feedback loops (type checking, unit tests) and to expand coverage as business rules grow.
- Coordinate with Documentation & Knowledge Stewards to capture domain-specific ADRs and update role documentation when invariants change.

## Success Metrics
- Domain and application layers compile without unused exports, cyclic imports, or lint violations; layering audits show no downward dependency leaks.
- Interfaces between `core/app` and `core/infra` stay stable across releases, with changes communicated via PR summaries and documentation updates.
- Automated tests cover critical domain invariants, catching regressions before they reach integration layers.
- PRs introducing new rules include clear docstrings or inline comments explaining invariants and failure modes.
- Domain-related ADRs are drafted for cross-cutting decisions, and role documentation is refreshed promptly when new patterns emerge.
