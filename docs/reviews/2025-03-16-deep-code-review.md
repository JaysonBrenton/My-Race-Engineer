# Deep code review — 2025-03-16

## Scope
- Persistence layer for entrant & lap imports (`PrismaEntrantRepository`, `PrismaLapRepository`, Prisma schema constraints).
- LiveRC import orchestration (`LiveRcImportService`).

## Critical issues

1. **Entrants are silently re-assigned to whichever session imported them last.**  
   `PrismaEntrantRepository.upsertBySource` looks up an existing row solely by `sourceEntrantId`, then updates that single record to the *new* `sessionId` every time we ingest laps for the same driver.【F:src/core/infra/prisma/prismaEntrantRepository.ts†L47-L89】  
   In LiveRC data a driver keeps the same `entry_id` across an event, so importing qualifying and main sessions back-to-back causes the second run to hijack the entrant created for the first session.  `LiveRcImportService` then persists laps against this reused entrant id.【F:src/core/app/services/importLiveRc.ts†L336-L363】【F:src/core/app/services/importLiveRc.ts†L500-L522】  
   Because the Prisma schema enforces one entrant per session via `@@unique([sessionId, displayName])`, we intended entrant rows to be session-scoped.【F:prisma/schema.prisma†L62-L81】  Today the code breaks that invariant, so historical lap data ends up tied to the wrong session (see issue 2).  **Fix:** include `eventId`/`raceClassId`/`sessionId` in the lookup (and ideally add a composite unique on those + `sourceEntrantId`) so each ingestion creates or reuses the entrant for the *current* session only.

2. **Lap imports for subsequent sessions drop data due to the corrupted entrant reuse.**  
   Once the entrant record has been reassigned as described above, `replaceForEntrant` deletes laps for the new session and inserts the fresh batch with `skipDuplicates: true`.【F:src/core/infra/prisma/prismaLapRepository.ts†L29-L54】  
   The Prisma schema also declares `@@unique([entrantId, lapNumber])` on `Lap` records.【F:prisma/schema.prisma†L83-L97】  
   Qualifying laps (entrantId `E`, lapNumber `1`) remain in the table because we only delete rows matching the *new* session id. When the main event import tries to insert lap 1 for the same entrant id, Prisma treats it as a duplicate and silently skips it thanks to `skipDuplicates: true`. The result is a mangled lap history where whole mains appear to have zero laps imported.  **Fix:** resolve issue #1 so entrants are session-specific, or expand the lap delete to cover all laps for the entrant before insert and drop `skipDuplicates` so we fail fast instead of muting data loss.

## Additional observations

- **Ambiguous entrant lookups leak between events.**  `findBySourceEntrantId` also ignores `eventId`/`raceClassId`, so any future feature that resolves a driver by upstream id can return the wrong person once two events reuse the same `entry_id`.【F:src/core/infra/prisma/prismaEntrantRepository.ts†L30-L35】【F:prisma/schema.prisma†L62-L81】  This should match the tighter scope suggested in issue #1 so lookups stay local to an event/class/session.

## Suggested next steps
- Update `PrismaEntrantRepository` (and supporting schema indexes) so entrant identity is scoped by event/class/session in both the read and write paths.
- Revisit `replaceForEntrant` once entrants are session-scoped: removing `skipDuplicates` will let Prisma raise on unexpected collisions instead of masking them.
- Add regression tests that import the same driver across two sessions to ensure both sets of laps persist correctly.
