-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'UNDISCLOSED');

-- CreateTable
CREATE TABLE "EmployeeProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "dateOfBirth" DATE,
    "gender" "Gender",
    "maritalStatus" "MaritalStatus",
    "bloodGroup" TEXT,
    "personalEmail" TEXT,
    "personalPhone" TEXT,
    "currentAddress" JSONB,
    "permanentAddress" JSONB,
    "emergencyContacts" JSONB NOT NULL DEFAULT '[]',
    "panEnc" TEXT,
    "panLast4" TEXT,
    "aadhaarEnc" TEXT,
    "aadhaarLast4" TEXT,
    "uanEnc" TEXT,
    "uanLast4" TEXT,
    "esicNumberEnc" TEXT,
    "esicNumberLast4" TEXT,
    "bankAccountNumberEnc" TEXT,
    "bankAccountNumberLast4" TEXT,
    "bankIfsc" TEXT,
    "bankName" TEXT,
    "bankAccountHolder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeProfile_employeeId_key" ON "EmployeeProfile"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeProfile_tenantId_idx" ON "EmployeeProfile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_idx" ON "Invitation"("tenantId");

-- CreateIndex
CREATE INDEX "Invitation_userId_idx" ON "Invitation"("userId");

-- AddForeignKey
ALTER TABLE "EmployeeProfile" ADD CONSTRAINT "EmployeeProfile_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bring existing workspaces' system roles in line with the new permission catalogue:
-- managers see their reporting line in full and everyone else through the directory;
-- employees see the directory; only owners and HR admins see unmasked identifiers.
UPDATE "Role" SET "permissions" = ARRAY['org.read', 'directory.read', 'team.read']
  WHERE "isSystem" AND "key" = 'manager';
UPDATE "Role" SET "permissions" = ARRAY['org.read', 'directory.read']
  WHERE "isSystem" AND "key" = 'employee';
UPDATE "Role" SET "permissions" = ARRAY(
    SELECT DISTINCT unnest("permissions" || ARRAY['directory.read', 'employee.sensitive.read'])
  )
  WHERE "isSystem" AND "key" = 'hr_admin';
UPDATE "Role" SET "permissions" = ARRAY(
    SELECT DISTINCT unnest("permissions" || ARRAY['directory.read', 'team.read', 'employee.sensitive.read'])
  )
  WHERE "isSystem" AND "key" = 'owner';
