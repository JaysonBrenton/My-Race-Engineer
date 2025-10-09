-- Scope entrant source identifiers to event/class/session

-- Multiple historical ingestions created duplicate entrants that share the same
-- source identifier within an event/class/session tuple. The unique constraint
-- we are about to add would fail while those duplicates are present, so we
-- collapse them here by keeping the most recently updated record for each
-- tuple and removing the rest.
WITH ranked_entrants AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "eventId", "raceClassId", "sessionId", "sourceEntrantId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
    ) AS row_num
  FROM "Entrant"
  WHERE "sourceEntrantId" IS NOT NULL
)
DELETE FROM "Entrant"
WHERE id IN (
  SELECT id FROM ranked_entrants WHERE row_num > 1
);

ALTER TABLE "Entrant"
ADD CONSTRAINT "Entrant_eventId_raceClassId_sessionId_sourceEntrantId_key"
UNIQUE ("eventId", "raceClassId", "sessionId", "sourceEntrantId");
