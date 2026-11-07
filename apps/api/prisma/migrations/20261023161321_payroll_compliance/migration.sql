-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('NEW', 'OLD');

-- CreateEnum
CREATE TYPE "PayItemKind" AS ENUM ('BONUS', 'INCENTIVE', 'ARREARS', 'OTHER_EARNING', 'ADVANCE_RECOVERY', 'LOAN_RECOVERY', 'OTHER_DEDUCTION', 'LEAVE_ENCASHMENT', 'GRATUITY', 'NOTICE_PAY', 'NOTICE_RECOVERY');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'FINAL');

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "annualTax" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "arrearsPaid" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "bonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "edli" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "employerLwf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "encashmentIds" UUID[],
ADD COLUMN     "eps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "epsWages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "esiWages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lwf" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payItemIds" UUID[],
ADD COLUMN     "pfAdmin" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pfWages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "regime" "TaxRegime" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "salaryId" UUID,
ADD COLUMN     "taxableIncome" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TaxDeclaration" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "regime" "TaxRegime" NOT NULL DEFAULT 'NEW',
    "rentMonthly" INTEGER NOT NULL DEFAULT 0,
    "landlordPan" TEXT,
    "sec80C" INTEGER NOT NULL DEFAULT 0,
    "sec80D" INTEGER NOT NULL DEFAULT 0,
    "sec80DParents" INTEGER NOT NULL DEFAULT 0,
    "parentsSenior" BOOLEAN NOT NULL DEFAULT false,
    "sec80CCD1B" INTEGER NOT NULL DEFAULT 0,
    "homeLoanInterest" INTEGER NOT NULL DEFAULT 0,
    "otherDeductions" INTEGER NOT NULL DEFAULT 0,
    "previousEmployerIncome" INTEGER NOT NULL DEFAULT 0,
    "previousEmployerTds" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "kind" "PayItemKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "exempt" INTEGER NOT NULL DEFAULT 0,
    "pfWages" INTEGER NOT NULL DEFAULT 0,
    "esiWages" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "settlementId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "lastWorkingDay" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalisedAt" TIMESTAMP(3),

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxDeclaration_tenantId_fyStart_idx" ON "TaxDeclaration"("tenantId", "fyStart");

-- CreateIndex
CREATE UNIQUE INDEX "TaxDeclaration_employeeId_fyStart_key" ON "TaxDeclaration"("employeeId", "fyStart");

-- CreateIndex
CREATE INDEX "PayItem_tenantId_month_idx" ON "PayItem"("tenantId", "month");

-- CreateIndex
CREATE INDEX "PayItem_employeeId_month_idx" ON "PayItem"("employeeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_employeeId_key" ON "Settlement"("employeeId");

-- AddForeignKey
ALTER TABLE "TaxDeclaration" ADD CONSTRAINT "TaxDeclaration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDeclaration" ADD CONSTRAINT "TaxDeclaration_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayItem" ADD CONSTRAINT "PayItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayItem" ADD CONSTRAINT "PayItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayItem" ADD CONSTRAINT "PayItem_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

