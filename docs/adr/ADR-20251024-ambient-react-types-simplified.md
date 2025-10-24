# ADR-20251024 Ambient React Types Simplified

## Context

Post-pull guard conflict between legacy `tools/tsconfig-types-guard.ts` (required `react/next`, `react-dom/next`) and new guard scripts (required `react`, `react-dom`).

## Decision

Standardise on `compilerOptions.types = ["node","react","react-dom"]`; remove `react/next` shims. Maintain “no React types in server routes” rule and route guard.

## Rationale

Simpler, version-agnostic ambient surface for Next 15 + React 18; avoids brittle namespace resolution; keeps server boundary clean.

## Consequences

Post-pull health checks agree; lower maintenance; easier upgrades.

## How to Verify

`npm run config:doctor`, `npm run guard`, `npm run build` must all pass.

## Status

Accepted (2025-10-24).
