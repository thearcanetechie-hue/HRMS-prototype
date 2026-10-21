-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BEHIND', 'DONE');

-- CreateEnum
CREATE TYPE "GoalScope" AS ENUM ('COMPANY', 'TEAM', 'PERSONAL');

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('SELF', 'MANAGER', 'CALIBRATION', 'SHARED');

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" "GoalScope" NOT NULL DEFAULT 'PERSONAL',
    "dueDate" DATE NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ON_TRACK',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCycle" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "closesOn" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "reviewerId" UUID,
    "stage" "ReviewStage" NOT NULL DEFAULT 'SELF',
    "selfRating" INTEGER,
    "selfComments" TEXT,
    "managerRating" INTEGER,
    "managerComments" TEXT,
    "finalRating" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kudos" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_tenantId_scope_idx" ON "Goal"("tenantId", "scope");

-- CreateIndex
CREATE INDEX "Goal_tenantId_ownerId_idx" ON "Goal"("tenantId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCycle_tenantId_name_key" ON "ReviewCycle"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Review_tenantId_reviewerId_idx" ON "Review"("tenantId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_cycleId_employeeId_key" ON "Review"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "Kudos_tenantId_createdAt_idx" ON "Kudos"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_progress_check" CHECK ("progress" BETWEEN 0 AND 100);
ALTER TABLE "Review" ADD CONSTRAINT "Review_ratings_check" CHECK (
  ("selfRating" IS NULL OR "selfRating" BETWEEN 1 AND 5) AND
  ("managerRating" IS NULL OR "managerRating" BETWEEN 1 AND 5) AND
  ("finalRating" IS NULL OR "finalRating" BETWEEN 1 AND 5));
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_not_self" CHECK ("fromId" <> "toId");

-- Only one active review cycle per workspace.
CREATE UNIQUE INDEX "ReviewCycle_one_active" ON "ReviewCycle"("tenantId") WHERE "active";

UPDATE "Role"
SET "permissions" = array_append("permissions", 'performance.manage')
WHERE "key" IN ('owner', 'hr_admin')
  AND NOT ('performance.manage' = ANY("permissions"));
