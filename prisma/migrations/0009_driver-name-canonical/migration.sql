-- Add canonical driver name column for case-insensitive lookups
ALTER TABLE "User" ADD COLUMN     "driverNameCanonical" TEXT;

UPDATE "User"
SET "driverNameCanonical" = lower("driverName");

ALTER TABLE "User" ALTER COLUMN "driverNameCanonical" SET NOT NULL;

CREATE UNIQUE INDEX "User_driverNameCanonical_key" ON "User"("driverNameCanonical");
