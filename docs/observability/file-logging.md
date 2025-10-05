# Dedicated File Logging Strategy

## Goal
Add structured debug logging that persists to dedicated log files while keeping existing console visibility for local development and hosted environments.

## Constraints & Considerations
- **Runtime:** Next.js App Router on Node.js (Edge not in use). File writers must be disabled in truly serverless/Edge deployments.
- **Structure:** Logs must remain structured JSON including `timestamp`, `level`, `requestId`, `route`, `userAnonId`, `event`, `durationMs`, and redacted error metadata as required by the root observability guardrails.
- **Layering:** Logging infrastructure belongs in `src/core/infra`. Higher layers import a logger interface via dependency injection to avoid leaking implementation details.
- **Rotation & retention:** Baseline retention of 7 days for raw logs. File strategy should rotate at predictable size limits to prevent disk exhaustion.

## Recommended Implementation Steps
1. **Introduce a structured logger abstraction**
   - Create `src/core/app/ports/logger.ts` defining methods (`debug`, `info`, `warn`, `error`) that accept a `message` string plus a structured context object.
   - Provide a default implementation in `src/core/infra/logger/pinoLogger.ts` backed by [`pino`](https://github.com/pinojs/pino) because it emits fast JSON and offers transports for files and stdout.

2. **Configure multi-target transports**
   - Instantiate a base pino logger with level sourced from `LOG_LEVEL` (default `info`).
   - Configure a `pino.transport` pipeline that writes to both stdout and rotating files using `pino/file` targets:
     ```ts
     const transport = pino.transport({
       targets: [
         { target: 'pino/file', options: { destination: 1 } }, // stdout
         {
           target: 'pino/file',
           options: {
             destination: path.join(process.cwd(), 'logs/app.log'),
             mkdir: true,
             append: true,
             rotate: { interval: '1d', maxFiles: 7, size: '50m' },
           },
         },
       ],
     });
     ```
   - Use a second error-focused transport (e.g., `logs/error.log`) filtered by `level >= warn` using `pino` child loggers.

3. **Enrich log context**
   - Wrap the base logger so every call injects required fields (`timestamp`, `requestId`, `route`, `userAnonId`, etc.).
   - Update API route handlers (e.g., `src/app/api/liverc/import/route.ts`) to obtain a logger instance enriched with the current `requestId` rather than calling `console.*` directly. The wrapper can expose a helper like `withContext({ requestId, route })` that returns a scoped logger.

4. **Environment safeguards**
   - Allow disabling file sinks when `process.env.DISABLE_FILE_LOGS === 'true'` to support environments without writable disks (CI, Vercel serverless). Fall back to stdout-only in those cases.
   - Document the requirement in `.env.example` and README, including log directory locations and rotation behavior.

5. **Testing & verification**
   - Add unit tests for the logger adapter to assert JSON shape and file writes (using temporary directories) under Node.js.
   - Extend existing API integration tests to ensure log context (e.g., `requestId`) propagates correctly by mocking the logger and verifying metadata.

6. **Operations follow-up**
   - Update deployment manifests or Dockerfiles to mount `/app/logs` to persistent storage and integrate the log path with centralized log aggregation (e.g., Fluent Bit sidecar shipping `logs/*.log`).

## Rollout Checklist
- [ ] Add new dependency `pino` (and `pino-pretty` for local development readability if desired).
- [ ] Implement logger port + adapter.
- [ ] Replace existing `console.*` calls across API routes and infrastructure helpers with the logger abstraction.
- [ ] Update environment documentation (`README`, `.env.example`).
- [ ] Verify log files rotate and respect retention in staging before enabling in production.
- [ ] Coordinate with Ops to ensure log volume does not exceed storage quotas; adjust rotation size if necessary.

## Alternatives Considered
- **Winston:** Flexible transports but slower under load; additional adapters needed for structured JSON.
- **Prisma middleware only:** Prisma already emits query logs but does not cover application-level events or file sinks.
- **Cloud provider managed logging:** Useful for hosted deployments, but does not satisfy the requirement for on-disk debug logs during self-hosted runs.
