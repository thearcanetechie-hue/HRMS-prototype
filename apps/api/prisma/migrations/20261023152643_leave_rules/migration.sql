-- CreateEnum
CREATE TYPE "LeaveLedgerKind" AS ENUM ('OPENING', 'ADJUSTMENT', 'CARRY_FORWARD', 'COMP_OFF', 'ENCASHED', 'LAPSED');

-- CreateEnum
CREATE TYPE "AttendanceMonthStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "encashable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCompOff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "validityDays" INTEGER;

-- CreateTable
CREATE TABLE "LeaveLedger" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "kind" "LeaveLedgerKind" NOT NULL,
    "note" TEXT,
    "sourceDate" DATE,
    "expiresOn" DATE,
    "paidInRunId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveYearClose" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "encashed" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "closedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveYearClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceMonth" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "AttendanceMonthStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceMonth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveLedger_tenantId_employeeId_year_idx" ON "LeaveLedger"("tenantId", "employeeId", "year");

-- CreateIndex
CREATE INDEX "LeaveLedger_employeeId_kind_sourceDate_idx" ON "LeaveLedger"("employeeId", "kind", "sourceDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveYearClose_tenantId_year_key" ON "LeaveYearClose"("tenantId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMonth_tenantId_month_key" ON "AttendanceMonth"("tenantId", "month");

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveYearClose" ADD CONSTRAINT "LeaveYearClose_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonth" ADD CONSTRAINT "AttendanceMonth_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Comp off is earned, not given yearly; credits last 90 days. Paid leave can be encashed.
UPDATE "LeaveType" SET "isCompOff" = true, "validityDays" = 90, "daysPerYear" = NULL WHERE "code" = 'CO';
UPDATE "LeaveType" SET "encashable" = true WHERE "code" = 'PL';
