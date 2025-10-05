# My Race Engineer (MRE) — Agents Guide (Codex & other AI contributors)
**Repo:** `JaysonBrenton/My-Race-Engineer`
**Updated:** 2025-09-29  
**Purpose:** Guardrails for automated/semi-automated contributions. Deep details will live in `docs/**`.

---

## 1) Branching & workflow
- **Branch per change** (feature, fix, docs, chore). Short-lived; always via PR to `main`.
- **Small, single-purpose diffs.** Split if >~300 LOC or mixing concerns.

### 1.1 Branch naming (adopted)
**Format:** `<type>/<ticket?>-<short-kebab-summary>`  
**Allowed types:** `feature/`, `bugfix/`, `hotfix/`, `release/`, `refactor/`, `perf/`, `test/`, `docs/`, `chore/`, `ci/`, `spike/`, `revert/`  
**Rules:** lowercase; alphanumeric + hyphens; no spaces/underscores; no double/trailing hyphens; concise + descriptive.  
**Examples:** `feature/ABC-42-auth-mfa`, `bugfix/login-focus-trap`, `release/v1.0.1`

**Lifecycle:** branch → small commits → PR → **squash-merge** → delete branch.

---

## 2) Merging & history
- **Default:** **squash-merge** PRs into `main` (one coherent commit per PR).
- **Fast-forward merge:** allowed for tiny, linear doc-only changes.
- **No force-push to `main`** and **no history rewrites**. To undo, use GitHub **Revert** or a small follow-up PR. We preserve an auditable trail.

---

## 3) Layering & imports (“imports point up”)
src/
core/
domain/ # pure rules & types (no IO, no framework)
app/ # use-cases/services orchestrating domain via ports
infra/ # adapters: DB (Prisma), HTTP clients, queues, files
app/ # Next.js App Router (routes, UI)

markdown
Copy code
**Rules**
- `core/domain` → imports nothing outside domain.
- `core/app` → imports only from `core/domain`.
- `core/infra` → may import `core/domain`; provides implementations for app ports.
- `src/app` (Next.js) → imports **only** `core/app` (and design-system/UI).  
  **Never** import `core/infra` from pages/components.

---

## 4) Environments & configuration
- **Source of truth:** `/.env.example` (complete list with placeholders). Codex Environment must mirror it when keys change.
- **Browser-exposed keys:** must be prefixed **`NEXT_PUBLIC_`** (Next.js only exposes those to the client).
- **Fail fast:** the app must clearly error at boot if a required key is missing.

---

## 5) Linting, formatting & code health
- **TypeScript:** strict; `noUnusedLocals`, `noUnusedParameters`, exact optional property types.
- **ESLint:** `eslint-config-next`, `@typescript-eslint/*`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import` (order + no cycles), `eslint-plugin-unused-imports`.
- **Prettier:** integrated via ESLint.
- **Hooks/CI:** Husky + lint-staged pre-commit; CI must pass `typecheck`, `lint`, `build` (Next.js), and tests (if present) before merge.

---

## 6) Error handling, logging & telemetry (Next.js App Router)
- **UI boundaries:** `app/global-error.tsx` + route-level `error.tsx`; `not-found.tsx` per section; use `notFound()` for missing data.
- **APIs & server components:** boundary `try/catch`; return **typed error envelopes** with proper HTTP codes for expected failures; throw only for unexpected faults.
- **Correlation:** include `requestId` across logs and error responses.
- **Structured logs (JSON):** `timestamp`, `level`, `requestId`, `route`, `userAnonId`, `event`, `durationMs`, `outcome`, and a redacted error object.
- **Logger implementation:** server-side code must call the logger from `src/dependencies/logger.ts` (`applicationLogger` or `getRequestLogger`) instead of `console.*`; ensure request-scoped handlers attach `{ requestId, route }` context.
- **PII:** never log secrets/tokens/passwords/cookies.
- **Retention:** raw logs 7d; aggregated metrics 90d.
- **Reporter:** Sentry/Bugsnag allowed (with redaction).
- **PRs that add error paths must include:** table of case → user message → HTTP/status → log fields → recovery/CTA.

---

## 7) ADRs (Architecture Decision Records)
Create `docs/adr/ADR-YYYYMMDD-title.md` when a decision is **cross-cutting**, **breaking**, **costly to reverse**, or **security/ops-critical**. Include: context, options, decision, consequences, follow-ups.

---

## 8) Assets & binaries
- **Agents must not add/modify binary files** in PRs (`*.ico`, `*.png`, `*.jpg`, fonts, archives).  
- **Favicons:** use vector **`app/icon.svg`** (no `favicon.ico`).  
- **Automated guard:** CI should fail PRs that include disallowed binary extensions.  
- No Git LFS in agent PRs; files >1 MB are rejected.

---

## 9) Performance budgets
- **UI:** P50 ≤ 300 ms, P95 ≤ 800 ms.  
- **API reads:** P95 ≤ 400 ms.  
If at risk, call out in PR with a mitigation plan.

---

## 10) Design language
- **Semantic colour tokens only** — no hard-coded hex in components. Use CSS vars like:  
  `--color-bg`, `--color-fg`, `--color-fg-muted`, `--color-accent`, `--color-border`, `--color-danger`, `--color-warning`, `--color-success`.  
  Components reference tokens (`var(--color-*)`) or Tailwind utilities wired to those vars.
- Accessibility: enforce contrast, visible focus, keyboard navigation.

---

## 11) Database & migrations (Prisma)
- **Schema:** `prisma/schema.prisma` (root).
- **Migrations:** generate & commit with any schema change.
- **Readiness gating:** run `prisma migrate deploy` **before** start; `/api/ready` must **fail (503)** if DB is down or migrations are pending.

---

## 12) PR requirements
Every PR must state: **what/why**, design/UX compliance, checks (`typecheck`/`lint`/`build`/tests), perf note (if any), migrations/config and rollout steps, telemetry added, and risk & rollback.

---

## 13) Role playbooks (`docs/roles/*`)
- Treat each role document as **authoritative guidance** for collaborators filling that hat.
- If you update process, tooling, or expectations for a role, edit the matching markdown file (one per role) and keep examples current.
- When adding a new role doc, mirror the existing naming convention (`kebab-case-role.md`) and link it from any relevant onboarding or README sections.
- Current roles covered: DevOps Platform Engineer, Documentation Knowledge Steward, Next.js Front-end Engineer, Observability & Incident Response Lead, Prisma/PostgreSQL Backend Engineer, Quality Automation Engineer, and TypeScript Domain Engineer.
- Keep these files focused on responsibilities, key workflows, and references—avoid project-specific chatter that will rot quickly.

## 14) Deep review archives (`docs/reviews/*`)
- Before touching critical flows, check the relevant deep review in `docs/reviews/` for historical context and known pitfalls.
- The LiveRC ingestion pipeline has an in-depth audit at [`docs/reviews/2024-10-07-deep-code-review.md`](docs/reviews/2024-10-07-deep-code-review.md); consult it alongside this guide when working on those areas.
