-- DropIndex
DROP INDEX IF EXISTS "Club_slug_key";
DROP INDEX IF EXISTS "Club_subdomain_key";

-- AlterTable
ALTER TABLE "Club"
    DROP COLUMN IF EXISTS "slug",
    DROP COLUMN IF EXISTS "name",
    DROP COLUMN IF EXISTS "subdomain",
    DROP COLUMN IF EXISTS "timezone",
    DROP COLUMN IF EXISTS "lastRefreshedAt",
    DROP COLUMN IF EXISTS "lastChangedAt",
    ADD COLUMN     "liveRcSubdomain" TEXT NOT NULL,
    ADD COLUMN     "displayName" TEXT NOT NULL,
    ADD COLUMN     "country" TEXT,
    ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Club_liveRcSubdomain_key" ON "Club"("liveRcSubdomain");

-- CreateIndex
CREATE INDEX "Club_displayName_idx" ON "Club"("displayName");
