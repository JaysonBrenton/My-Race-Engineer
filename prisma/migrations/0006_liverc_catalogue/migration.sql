-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('QUAL', 'MAIN');

-- CreateEnum
CREATE TYPE "ImportJobMode" AS ENUM ('SUMMARY', 'FULL');

-- CreateEnum
CREATE TYPE "ImportJobState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportJobItemTargetType" AS ENUM ('EVENT', 'SESSION');

-- CreateEnum
CREATE TYPE "ImportJobItemState" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "driversCount" INTEGER,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "entriesCount" INTEGER,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'LiveRC',
ADD COLUMN     "providerEventId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "className" TEXT,
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "heatLabel" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'LiveRC',
ADD COLUMN     "providerSessionId" TEXT,
ADD COLUMN     "roundLabel" TEXT,
ADD COLUMN     "startTime" TIMESTAMP(3),
ADD COLUMN     "type" "SessionType";

-- AlterTable
ALTER TABLE "Lap" ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "positionOnLap" INTEGER;

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "region" TEXT,
    "timezone" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "lastChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "transponder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverAlias" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "transponder" TEXT,
    "nameVariant" TEXT NOT NULL,

    CONSTRAINT "DriverAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultRow" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "position" INTEGER,
    "carNumber" TEXT,
    "laps" INTEGER,
    "totalTimeMs" INTEGER,
    "behindMs" INTEGER,
    "fastestLapMs" INTEGER,
    "fastestLapNum" INTEGER,
    "avgLapMs" INTEGER,
    "avgTop5Ms" INTEGER,
    "avgTop10Ms" INTEGER,
    "avgTop15Ms" INTEGER,
    "top3ConsecMs" INTEGER,
    "stdDevMs" INTEGER,
    "consistencyPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "mode" "ImportJobMode" NOT NULL,
    "state" "ImportJobState" NOT NULL DEFAULT 'QUEUED',
    "progressPct" DOUBLE PRECISION,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "targetType" "ImportJobItemTargetType" NOT NULL,
    "targetRef" TEXT NOT NULL,
    "countsJson" JSONB,
    "state" "ImportJobItemState" NOT NULL DEFAULT 'QUEUED',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Club_subdomain_key" ON "Club"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_transponder_key" ON "Driver"("transponder");

-- CreateIndex
CREATE UNIQUE INDEX "DriverAlias_driverId_nameVariant_key" ON "DriverAlias"("driverId", "nameVariant");

-- CreateIndex
CREATE UNIQUE INDEX "ResultRow_sessionId_driverId_key" ON "ResultRow"("sessionId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJobItem_jobId_targetType_targetRef_key" ON "ImportJobItem"("jobId", "targetType", "targetRef");

-- CreateIndex
CREATE UNIQUE INDEX "Event_provider_providerEventId_key" ON "Event"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_provider_providerSessionId_key" ON "Session"("provider", "providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Lap_sessionId_driverId_lapNumber_key" ON "Lap"("sessionId", "driverId", "lapNumber");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lap" ADD CONSTRAINT "Lap_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverAlias" ADD CONSTRAINT "DriverAlias_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultRow" ADD CONSTRAINT "ResultRow_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultRow" ADD CONSTRAINT "ResultRow_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJobItem" ADD CONSTRAINT "ImportJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

