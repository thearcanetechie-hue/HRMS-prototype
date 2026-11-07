-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskAssignee" AS ENUM ('HR', 'MANAGER', 'EMPLOYEE', 'IT');

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ChecklistKind" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tasks" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeChecklist" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "templateId" UUID,
    "kind" "ChecklistKind" NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'OPEN',
    "startDate" DATE NOT NULL,
    "reason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTask" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignee" "TaskAssignee" NOT NULL,
    "dueDate" DATE NOT NULL,
    "documentCategory" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneById" UUID,
    "note" TEXT,

    CONSTRAINT "ChecklistTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplate_tenantId_kind_idx" ON "ChecklistTemplate"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_tenantId_name_key" ON "ChecklistTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EmployeeChecklist_tenantId_status_kind_idx" ON "EmployeeChecklist"("tenantId", "status", "kind");

-- CreateIndex
CREATE INDEX "EmployeeChecklist_tenantId_employeeId_idx" ON "EmployeeChecklist"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "ChecklistTask_tenantId_checklistId_idx" ON "ChecklistTask"("tenantId", "checklistId");

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChecklist" ADD CONSTRAINT "EmployeeChecklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChecklist" ADD CONSTRAINT "EmployeeChecklist_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeChecklist" ADD CONSTRAINT "EmployeeChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTask" ADD CONSTRAINT "ChecklistTask_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "EmployeeChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one open checklist of each kind per employee.
CREATE UNIQUE INDEX "EmployeeChecklist_one_open_per_kind"
  ON "EmployeeChecklist"("employeeId", "kind") WHERE "status" = 'OPEN';

-- Give existing workspaces' Owner and HR Admin roles the new permission.
UPDATE "Role"
SET "permissions" = array_append("permissions", 'lifecycle.manage')
WHERE "key" IN ('owner', 'hr_admin')
  AND NOT ('lifecycle.manage' = ANY("permissions"));
