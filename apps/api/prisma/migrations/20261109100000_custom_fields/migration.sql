-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'EMAIL', 'PHONE', 'URL');

-- CreateEnum
CREATE TYPE "FieldVisibility" AS ENUM ('HR_ONLY', 'MANAGERS', 'EVERYONE');

-- CreateTable
CREATE TABLE "CustomFieldDef" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "helpText" TEXT NOT NULL DEFAULT '',
    "section" TEXT NOT NULL DEFAULT 'Other details',
    "visibility" "FieldVisibility" NOT NULL DEFAULT 'MANAGERS',
    "selfEditable" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDef_tenantId_key_key" ON "CustomFieldDef"("tenantId", "key");

-- AddForeignKey
ALTER TABLE "CustomFieldDef" ADD CONSTRAINT "CustomFieldDef_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;



