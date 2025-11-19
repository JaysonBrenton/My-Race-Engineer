<!--
  Project: My Race Engineer
  File: docs/reviews/2025-02-01-security-review.md
  Summary: Security review identifying exposed operational endpoints and cookie hardening gaps.
-->

# Security review — operational surface and session handling

## Overview

Quick assessment of externally reachable operational endpoints and session issuance defaults. Focused on unauthenticated routes and cookie transport guarantees that could expose internal state or weaken session confidentiality.

## Findings

### 1) Readiness endpoint leaks infrastructure and configuration details (high)

- The public `/api/ready` response returns database connectivity results, pending migration names, and environment configuration hints (including which keys are missing or defaulted).【F:src/app/api/ready/route.ts†L53-L107】【F:src/app/api/ready/route.ts†L165-L362】
- Impact: An unauthenticated caller can fingerprint the deployment (DB availability, migration state, environment surface) and use the data to plan targeted attacks or exploit operational gaps. The endpoint also performs database queries on every call, creating an easy avenue for resource-based denial-of-service.
- Recommendation: Restrict `/api/ready` to authenticated internal probes (e.g., require an HMAC or network-level allowlist) and suppress detailed migration/env metadata from public responses. Consider caching the result for a short interval to reduce DB load if it must stay reachable.

### 2) Version endpoint discloses build provenance (medium)

- `/api/version` exposes the package name/version plus commit SHA and build timestamp drawn from environment variables without authentication.【F:src/app/api/version/route.ts†L25-L67】
- Impact: Attackers gain precise insight into the deployed revision and build time, which can be correlated with known vulnerabilities or release notes to speed up exploitation.
- Recommendation: Gate the endpoint behind authentication or strip commit/build metadata from the public payload, limiting responses to a coarse semantic version.

### 3) Session cookies may default to insecure transport in misconfigured HTTPS deployments (medium)

- Cookie security relies on auto-detection of the `x-forwarded-proto` header or parsing `APP_URL`; when these are absent or set to `http`, the session cookie is issued without the `Secure` flag.【F:src/server/runtime/cookies.ts†L5-L42】
- Impact: Behind certain load balancers or proxies that omit `x-forwarded-proto`, production deployments could silently downgrade to non-secure cookies, allowing session theft on shared networks.
- Recommendation: Force `Secure` cookies in production (e.g., `CookieSecureStrategy = 'always'` when `NODE_ENV === 'production'`) or validate `APP_URL`/proxy headers at startup to fail closed if HTTPS cannot be confirmed.
