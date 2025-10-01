-- DropIndex
DROP INDEX IF EXISTS "Lap_driverName_lapNumber_key";

-- DropTable
DROP TABLE IF EXISTS "Lap";

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceClass" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classCode" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaceClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "raceClassId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceSessionId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "raceClassId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "carNumber" TEXT,
    "sourceEntrantId" TEXT,
    "sourceTransponderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lap" (
    "id" TEXT NOT NULL,
    "entrantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lapNumber" INTEGER NOT NULL,
    "lapTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_sourceEventId_key" ON "Event"("sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_sourceUrl_key" ON "Event"("sourceUrl");

-- CreateIndex
CREATE INDEX "Event_name_idx" ON "Event"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RaceClass_eventId_classCode_key" ON "RaceClass"("eventId", "classCode");

-- CreateIndex
CREATE INDEX "RaceClass_classCode_idx" ON "RaceClass"("classCode");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sourceSessionId_key" ON "Session"("sourceSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sourceUrl_key" ON "Session"("sourceUrl");

-- CreateIndex
CREATE INDEX "Session_eventId_idx" ON "Session"("eventId");

-- CreateIndex
CREATE INDEX "Session_raceClassId_idx" ON "Session"("raceClassId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrant_sessionId_displayName_key" ON "Entrant"("sessionId", "displayName");

-- CreateIndex
CREATE INDEX "Entrant_sourceEntrantId_idx" ON "Entrant"("sourceEntrantId");

-- CreateIndex
CREATE UNIQUE INDEX "Lap_entrantId_lapNumber_key" ON "Lap"("entrantId", "lapNumber");

-- CreateIndex
CREATE INDEX "Lap_sessionId_lapNumber_idx" ON "Lap"("sessionId", "lapNumber");

-- AddForeignKey
ALTER TABLE "RaceClass" ADD CONSTRAINT "RaceClass_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_raceClassId_fkey" FOREIGN KEY ("raceClassId") REFERENCES "RaceClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_raceClassId_fkey" FOREIGN KEY ("raceClassId") REFERENCES "RaceClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrant" ADD CONSTRAINT "Entrant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lap" ADD CONSTRAINT "Lap_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "Entrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lap" ADD CONSTRAINT "Lap_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
