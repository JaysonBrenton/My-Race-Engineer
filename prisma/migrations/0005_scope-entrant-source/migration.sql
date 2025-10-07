-- Scope entrant source identifiers to event/class/session
ALTER TABLE "Entrant"
ADD CONSTRAINT "Entrant_eventId_raceClassId_sessionId_sourceEntrantId_key"
UNIQUE ("eventId", "raceClassId", "sessionId", "sourceEntrantId");
