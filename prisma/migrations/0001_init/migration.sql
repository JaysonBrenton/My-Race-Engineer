CREATE TABLE "Lap" (
    "id" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "lapNumber" INTEGER NOT NULL,
    "lapTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Lap_driverName_lapNumber_key" ON "Lap"("driverName", "lapNumber");
