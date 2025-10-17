-- AlterTable
ALTER TABLE "User" ADD COLUMN     "driverName" TEXT;

-- Backfill existing users with unique driver names derived from their id to avoid collisions.
UPDATE "User"
SET "driverName" =
  TRIM(
    COALESCE(NULLIF("name", ''), 'Driver') || ' ' || SUBSTR("id", 1, 8)
  )
WHERE "driverName" IS NULL;

-- Ensure the new column is non-nullable going forward.
ALTER TABLE "User" ALTER COLUMN "driverName" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_driverName_key" ON "User"("driverName");
