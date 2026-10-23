-- CreateEnum
CREATE TYPE "RegularisationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PunchDirection" AS ENUM ('IN', 'OUT', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE 'REGULARISED';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "biometricId" TEXT,
ADD COLUMN     "shiftId" UUID;

-- CreateTable
CREATE TABLE "Shift" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 15,
    "fullDayMinutes" INTEGER NOT NULL DEFAULT 480,
    "halfDayMinutes" INTEGER NOT NULL DEFAULT 240,
    "weeklyOffs" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "locationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRegularisation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "RegularisationStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRegularisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricDevice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "locationId" UUID,
    "keyHash" TEXT,
    "keyPrefix" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Punch" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "deviceUserId" TEXT NOT NULL,
    "employeeId" UUID,
    "punchedAt" TIMESTAMP(3) NOT NULL,
    "direction" "PunchDirection" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Punch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shift_tenantId_name_key" ON "Shift"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Holiday_tenantId_date_idx" ON "Holiday"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_tenantId_date_name_key" ON "Holiday"("tenantId", "date", "name");

-- CreateIndex
CREATE INDEX "AttendanceRegularisation_tenantId_status_idx" ON "AttendanceRegularisation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRegularisation_employeeId_date_idx" ON "AttendanceRegularisation"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricDevice_serialNumber_key" ON "BiometricDevice"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BiometricDevice_keyHash_key" ON "BiometricDevice"("keyHash");

-- CreateIndex
CREATE INDEX "Punch_tenantId_employeeId_punchedAt_idx" ON "Punch"("tenantId", "employeeId", "punchedAt");

-- CreateIndex
CREATE INDEX "Punch_tenantId_deviceUserId_idx" ON "Punch"("tenantId", "deviceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Punch_deviceId_deviceUserId_punchedAt_key" ON "Punch"("deviceId", "deviceUserId", "punchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_tenantId_biometricId_key" ON "Employee"("tenantId", "biometricId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegularisation" ADD CONSTRAINT "AttendanceRegularisation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRegularisation" ADD CONSTRAINT "AttendanceRegularisation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Punch" ADD CONSTRAINT "Punch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Every workspace gets a default shift matching the old fixed rules: 09:30 to 18:30, on time
-- until 10:00, Saturday and Sunday off.
INSERT INTO "Shift" ("id", "tenantId", "name", "startTime", "endTime", "graceMinutes", "isDefault", "updatedAt")
SELECT gen_random_uuid(), t."id", 'General', '09:30', '18:30', 30, true, now() FROM "Tenant" t;

-- Only one default shift per workspace.
CREATE UNIQUE INDEX "Shift_one_default" ON "Shift"("tenantId") WHERE "isDefault";

ALTER TABLE "Shift" ADD CONSTRAINT "Shift_minutes_check"
  CHECK ("halfDayMinutes" <= "fullDayMinutes" AND "graceMinutes" >= 0);
