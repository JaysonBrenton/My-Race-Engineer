# My Race Engineer (MRE)
**The one-stop lap logic shop.**  
Next.js (App Router) + TypeScript + Prisma/PostgreSQL with clean layering, strict linting, structured error handling, and CI-friendly conventions.

> Repo: `JaysonBrenton/My-Race-Engineer` • Default port: **:3001** (binds `0.0.0.0`) • Timezone: **Australia/Sydney**

---

## Table of contents
- [What is this?](#what-is-this)
- [Architecture at a glance](#architecture-at-a-glance)
- [Local quickstart](#local-quickstart)
- [Environment variables](#environment-variables)
- [Authentication](#authentication)
- [Scripts](#scripts)
- [Error handling & logging](#error-handling--logging)
- [Performance budgets](#performance-budgets)
- [Branching & PR rules](#branching--pr-rules)
- [Assets & binaries policy](#assets--binaries-policy)
- [Migrations & readiness](#migrations--readiness)
- [Design tokens (colours)](#design-tokens-colours)
- [Docs & ADRs](#docs--adrs)
- [Roadmap placeholders](#roadmap-placeholders)
- [License](#license)

---

## What is this?
My Race Engineer (MRE) is a lightweight pace and consistency analysis platform for **1/8 and 1/10 off-road RC racers**, their crews, and team managers. The MVP focuses on helping drivers turn race timing data into actionable setup and driving decisions through:

- **Dashboard sign-in landing** that surfaces recent events, sessions, and key pace stats (best lap, median, standard deviation, outliers).
- **LiveRC ingestion** (by event, session, or driver) with storage in a normalised format for quick comparison lookups.
- **Competitor comparisons** showing per-lap times and deltas against a selected baseline.
- **Tokenised, accessible visualisations** (ApexCharts or similar) highlighting trends, anomalies, outlaps/inlaps, penalties, and consistency bands.
- **Filters** to toggle outlaps/inlaps, isolate stints, and spotlight where time was lost.

All product work should preserve the repo guardrails already in place:

- **Feature-per-branch** workflow and **small, reviewable diffs**.
- **Strict TypeScript** and **predictable lint/format**.
- **Framework-agnostic domain** with **UI/import guardrails**.
- **Structured error handling** with **request correlation**.
- **Operational endpoints** (to implement): `/api/health`, `/api/ready`, `/api/version`.

---

## Architecture at a glance
~~~
src/
  core/
    domain/   # Pure rules & types (no IO, no framework)
    app/      # Use-cases/services (orchestrate domain via ports)
    infra/    # Adapters: Prisma DB, HTTP clients, files, queues
  app/        # Next.js App Router (routes, layouts, UI components)
prisma/
  schema.prisma  # Single Prisma schema (root)
~~~

**Imports point up only**
- `src/app` (UI) → may import **`src/core/app`** (use-cases) and the design system.
- **Never** import `src/core/infra` from UI. Keep I/O behind use-cases.
- `core/app` depends on `core/domain` only. `core/infra` implements ports.
- **Why:** testable domain, swappable infra, thin UI; future-proof for a standalone `core/` package.

---

## Local quickstart
> Run on: macOS/Linux.  
> Prereqs: Node 20+ (LTS), npm (or pnpm), and PostgreSQL 14/15/16. Docker alternative included.

### 1) Get the code
~~~
git clone https://github.com/JaysonBrenton/My-Race-Engineer.git
cd My-Race-Engineer
~~~

### 2) Start Postgres (choose one)

**Option A — existing Postgres**
- Create a DB and user, e.g. user `pacetracer` and DB `pacetracer`.

**Option B — Docker (quick)**
~~~
docker run -d --name thepacetracer-postgres \
  -e POSTGRES_USER=pacetracer \
  -e POSTGRES_PASSWORD=change-me \
  -e POSTGRES_DB=pacetracer \
  -p 5432:5432 \
  -v thepacetracer-pgdata:/var/lib/postgresql/data \
  postgres:16
~~~

### 3) Configure environment
~~~
cp -n .env.example .env || true
~~~
Then open `.env` and set at least:
~~~
DATABASE_URL="postgresql://pacetracer:change-me@127.0.0.1:5432/pacetracer?schema=public"
SESSION_SECRET="<32+ random bytes>"
APP_URL="http://localhost:3001"
~~~

### 4) Install & generate
~~~
npm ci
npx prisma generate
~~~

### 5) Apply DB schema (dev)
~~~
npx prisma migrate dev
~~~

### 6) Run the app (dev)
~~~
npm run dev
~~~
Dev server listens on `http://localhost:3001/` (also `http://0.0.0.0:3001/`).

> **Production preview:** when deploying under systemd/user, run `prisma migrate deploy` **before** the app starts and gate readiness on schema (see [Migrations & readiness](#migrations--readiness)).

---

## Environment variables
> **Source of truth:** `/.env.example` (keep it complete and current).
> **Browser-safe keys** must be prefixed `NEXT_PUBLIC_` (Next.js only exposes those to the client).

| Key | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `HOST` | Bind address (default `0.0.0.0`) |
| `PORT` | Default `3001` |
| `TZ` | e.g., `Australia/Sydney` |
| `APP_URL` | Absolute origin (e.g., `http://localhost:3001`) |
| `NEXT_TELEMETRY_DISABLED` | `1` to disable Next.js telemetry |
| `DATABASE_URL` | Prisma connection string |
| `PRISMA_LOG_LEVEL` | `info` (or `query` locally) |
| `SESSION_SECRET` | 32+ random bytes; rotate on compromise |
| `TRUST_PROXY` | `true` if behind nginx/Caddy/Cloudflare |
| `ALLOWED_ORIGINS` | Comma-separated origins for CSRF-sensitive routes |
| `MAILER_DRIVER` | `console` (default) or `smtp` |
| `SMTP_URL` | Connection string when `MAILER_DRIVER=smtp` |
| `MAIL_FROM_EMAIL` / `MAIL_FROM_NAME` | Email identities for outgoing mail |
| `LOG_LEVEL` | `info` (or `debug`) |
| `DISABLE_FILE_LOGS` | `false`; set `true` in ephemeral environments without writable disks |
| `OTEL_*` | Optional OpenTelemetry exporter settings |
| `FEATURE_REQUIRE_EMAIL_VERIFICATION` | `true` / `false` |
| `FEATURE_REQUIRE_ADMIN_APPROVAL` | `false` by default |
| `APPROVAL_TOKEN_TTL_HOURS` | e.g., `48` |
| `INGEST_RATE_LIMIT_*` | Optional ingestion limits |
| `NEXT_PUBLIC_APP_NAME` | Public app name |
| `NEXT_PUBLIC_ENV` | `development` / `production` (UI only) |
| `NEXT_PUBLIC_BASE_URL` | Same as `APP_URL` for client code |

> ⚠️ Authentication forms are disabled when `SESSION_SECRET` is missing or shorter than 32 characters. Always set a strong value in production so registration, sign-in, and password reset flows function correctly.
>
> ℹ️ POSTs to `/auth/login` and `/auth/register` are pre-screened in middleware. Keep `ALLOWED_ORIGINS` (or `APP_URL`) aligned with the browser origin or requests will be redirected with `?error=invalid-origin` before they reach the route handlers.

---

### Auth setup checklist

- **APP_URL** must match the browser origin exactly (scheme + host + port).
- **ALLOWED_ORIGINS** must include every origin that will post to `/auth/login` or `/auth/register`.
- **SESSION_SECRET** must be a stable 32+ byte value; rotate it only when you intend to invalidate sessions.
- In local development keep `NODE_ENV=development` so the session cookie is accepted over HTTP.

#### Quick verification

Run these probes after configuring your `.env` file. The `formToken` payload can be a placeholder—the server action will still reject it, but the headers prove whether the origin guard passed.

```bash
curl -i -X POST \
  http://10.211.55.13:3001/auth/login \
  -H 'Origin: http://10.211.55.13:3001' \
  -d 'email=driver@example.com&password=placeholder&formToken=dummy'
```

Expect a `303` response with `x-auth-origin-guard: ok`.

```bash
curl -i -X POST \
  http://10.211.55.13:3001/auth/login \
  -H 'Origin: http://example.com' \
  -d 'email=driver@example.com&password=placeholder&formToken=dummy'
```

Expect a `303` redirect to `/auth/login?error=invalid-origin` and `x-auth-origin-guard: mismatch`.

---

## Authentication
- Auth forms are rendered dynamically (`force-dynamic`, `noStore()`) to keep tokens fresh and avoid silent resets.
- Middleware guards only the `/auth/login` and `/auth/register` POST flows; `/api/**` endpoints remain unaffected.
- Session cookies stay `httpOnly`, `sameSite='lax'`, and only use `secure` in production to prevent dev cookie drops.
- See also: [Auth runtime & origin guard runbook](docs/guides/auth-runtime-and-origin-guard.md).

---

## Scripts
- `npm run dev` — start Next in dev on `:3001`
- `npm run build` — typecheck + build  
- `npm run start` — start production build (`.next/`)  
- `npm run lint` — ESLint (with Prettier)  
- `npm run typecheck` — `tsc --noEmit`  
- `npm run prisma:generate` — Prisma client generate  
- `npm run prisma:migrate:dev` — dev migrations  
- `npm run prisma:migrate:deploy` — apply pending migrations in prod  

**PR gates:** `typecheck`, `lint`, `build` (and tests when present) must pass.

---

## Error handling & logging
- **UI boundaries:** provide `app/global-error.tsx` (catch-all) and route-level `error.tsx`; provide `not-found.tsx` per section; use `notFound()` when data is missing.
- **APIs & server components:** wrap boundaries with `try/catch`; return **typed error envelopes** (HTTP status + `{ code, message, details? }`) for expected failures; reserve `throw` for unexpected faults.
- **Correlation:** propagate a `requestId` (e.g., from `x-request-id`) and include it in all logs and error responses.
- **Structured logs (JSON):** include `timestamp`, `level`, `requestId`, `route`, `userAnonId`, `event`, `durationMs`, `outcome`, and a redacted error object.
- **Logger usage:** always use `applicationLogger`/`getRequestLogger` from `src/dependencies/logger.ts` for server-side logging; avoid `console.*` in APIs and infrastructure.
- **File outputs:** structured logs stream to `logs/app.log` (all levels) and `logs/error.log` (warn+), rotating daily with seven days retained; set `DISABLE_FILE_LOGS=true` when persistent storage is unavailable.
- **PII guardrails:** never log secrets/tokens/passwords/raw cookies.
- **Retention:** raw logs **7 days**, aggregated metrics **90 days**.
- **Reporter:** Sentry/Bugsnag is pluggable when desired (with redaction).
- **PRs that add error paths** should include a small table: *case → user message → HTTP/status → log fields → recovery/CTA*.

---

## Performance budgets
- **UI:** median (P50) ≤ **300 ms**, tail (P95) ≤ **800 ms**.  
- **API reads:** P95 ≤ **400 ms**.  
If a change risks these, call it out in the PR with mitigation (cache/precompute/stream/parallelise).

---

## Branching & PR rules
**Branch-per-change is mandatory.** Naming format:
~~~
<type>/<ticket?>-<short-kebab-summary>
~~~
Allowed types: `feature/`, `bugfix/`, `hotfix/`, `release/`, `refactor/`, `perf/`, `test/`, `docs/`, `chore/`, `ci/`, `spike/`, `revert/`  
Examples: `feature/ABC-42-auth-mfa`, `bugfix/login-focus-trap`, `release/v1.0.1`

**Merging**
- Default: **Squash-merge** PRs to `main` (one coherent commit per PR).  
- **Fast-forward** merges are OK for tiny, linear doc-only PRs.  
- **Never force-push** and **no history rewrites** on `main`. To undo, use GitHub **Revert** or a small follow-up PR.

---

## Assets & binaries policy
- PRs must **not** add/modify binary files (e.g., `*.ico`, `*.png`, `*.jpg`, fonts, archives).  
- **Favicon:** prefer **`app/icon.svg`** (Next.js supports SVG). If a raster is truly needed, a maintainer will add it in a separate commit.  
- (Recommended CI to add later) Fail PRs that include disallowed binary extensions or >1 MB files.

---

## Migrations & readiness
- **Single schema** at `prisma/schema.prisma` (root). We do **not** use `web/prisma/`.
- **Dev:** `npx prisma migrate dev`  
- **Prod:** `npx prisma migrate deploy` must run **before** the app starts (e.g., systemd `ExecStartPre`).  
- `/api/ready` should return **503** if:
  - DB is unavailable, or
  - migrations are pending.  
This prevents rolling out code that expects a DB schema that isn’t live yet.

---

## Design tokens (colours)
Use **semantic colour tokens** instead of hard-coding hex in components.

~~~css
/* globals.css (example) */
:root {
  --color-bg: #0b0e14;
  --color-fg: #e6e6e6;
  --color-fg-muted: #b9b9b9;
  --color-accent: #6ee7b7;
  --color-border: #2a2f3a;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-success: #22c55e;
}

/* Components consume tokens */
.card { background: var(--color-bg); color: var(--color-fg); border:1px solid var(--color-border); }
.button-accent { background: var(--color-accent); color: var(--color-bg); }
~~~

**Tailwind option:** wire tokens into `tailwind.config.js` so you can use `bg-accent text-bg` utilities.

---

## Docs & ADRs
- Keep `/.env.example` authoritative and in sync with the Codex Environment.
- Author **ADRs** under `docs/adr/ADR-YYYYMMDD-title.md` when a choice is **cross-cutting**, **breaking**, **costly to reverse**, or **security/ops-critical** (include context, options, decision, consequences, follow-ups).

### Guardrails & environment references
- [`docs/guardrails/product-guardrails.md`](docs/guardrails/product-guardrails.md) — MVP scope, success measures, and non-goals.
- [`docs/guardrails/qa-network-access.md`](docs/guardrails/qa-network-access.md) — sandbox networking limits for QA validation.

### UX principles
- [`docs/ux-principles.md`](docs/ux-principles.md) — layout, spacing, accessibility, and microcopy standards for authentication flows.

### LiveRC ingestion references
- [`docs/integrations/liverc-data-model.md`](docs/integrations/liverc-data-model.md) — contract that the current entry list + race result pipeline honours.
- [`docs/integrations/liverc-import-api.md`](docs/integrations/liverc-import-api.md) — `/api/liverc/import` request/response envelopes and error mapping.
- [`src/core/app/README.md`](src/core/app/README.md) — service responsibilities and orchestration notes.

### Roles, reviews, and audits
- Consult the **role playbooks** in [`docs/roles/`](docs/roles) whenever you are acting in one of those capacities; they capture process and decision context that should shape design choices for that hat.
- Review the **deep code review archives** in [`docs/reviews/`](docs/reviews) before modifying the covered flows so that new changes preserve the documented learnings.
- [`docs/reviews/2025-02-14-markdown-audit.md`](docs/reviews/2025-02-14-markdown-audit.md) tracks the latest doc freshness review and suggested follow-ups.

### Forthcoming docs (placeholders)
- `docs/design-principles.md` — layering exceptions, server/client rules, ADR policy
- `docs/domain-model.md` — entities/relations/invariants
- `docs/agents/**` — policies, prompts, checklists (auth-ux, auth-security, accessibility, telemetry)

### Sample LiveRC fixtures

- `fixtures/liverc/results/sample-event/sample-class/entry-list.json` — minimal entry list payload with event/class metadata and
  an entrant consumed by `mapEntryListResponse`.
- `fixtures/liverc/results/sample-event/sample-class/race-result.json` — companion race result payload for the same sample event
  and class.

---

## Roadmap placeholders
- Auth surfaces (Login/Register/Forgot) mid-fi with tokens & accessibility  
- Session management & Argon2id credentials  
- Ingestion stubs and LiveRC providers  
- Telemetry events & minimal analytics  
- Storybook + visual diffs (when UI stabilises)

---

## License
My Race Engineer (MRE) is released under the [MIT License](LICENSE).

You may use, copy, modify, merge, publish, distribute, sublicense, and sell
copies of the software, provided that the copyright notice and permission
notice from the LICENSE are included in all copies or substantial portions of
the software.
