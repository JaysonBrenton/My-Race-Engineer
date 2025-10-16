ALTER TABLE "Driver"
  ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'Manual',
  ADD COLUMN     "sourceDriverId" TEXT;

CREATE UNIQUE INDEX "Driver_provider_sourceDriverId_key"
  ON "Driver" ("provider", "sourceDriverId");
