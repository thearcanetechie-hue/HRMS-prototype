-- CreateEnum
CREATE TYPE "AssessmentPurpose" AS ENUM ('GENERAL', 'TRAINING', 'HIRING', 'REVIEW', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResultsVisibility" AS ENUM ('AFTER_SUBMIT', 'AFTER_CLOSE', 'NEVER');

-- CreateEnum
CREATE TYPE "QuestionKind" AS ENUM ('SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'NUMBER', 'SHORT', 'LONG');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'MARKED');

-- CreateTable
CREATE TABLE "Assessment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "purpose" "AssessmentPurpose" NOT NULL DEFAULT 'GENERAL',
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "timeLimitMinutes" INTEGER,
    "passPercent" INTEGER NOT NULL DEFAULT 60,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "shuffle" BOOLEAN NOT NULL DEFAULT false,
    "showResults" "ResultsVisibility" NOT NULL DEFAULT 'AFTER_SUBMIT',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "courseId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" "QuestionKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "answer" JSONB NOT NULL DEFAULT 'null',
    "points" INTEGER NOT NULL DEFAULT 1,
    "explanation" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAssignment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "questionOrder" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "score" DECIMAL(8,2),
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "percent" DECIMAL(5,2),
    "passed" BOOLEAN,
    "markedById" UUID,
    "markedAt" TIMESTAMP(3),

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentResponse" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answer" JSONB NOT NULL,
    "points" DECIMAL(8,2),
    "autoMarked" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssessmentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_tenantId_status_idx" ON "Assessment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_order_idx" ON "AssessmentQuestion"("assessmentId", "order");

-- CreateIndex
CREATE INDEX "AssessmentAssignment_tenantId_employeeId_idx" ON "AssessmentAssignment"("tenantId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAssignment_assessmentId_employeeId_key" ON "AssessmentAssignment"("assessmentId", "employeeId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_assessmentId_employeeId_idx" ON "AssessmentAttempt"("assessmentId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentResponse_attemptId_questionId_key" ON "AssessmentResponse"("attemptId", "questionId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAssignment" ADD CONSTRAINT "AssessmentAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentResponse" ADD CONSTRAINT "AssessmentResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AssessmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_pass_check" CHECK ("passPercent" BETWEEN 0 AND 100);
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_attempts_check" CHECK ("maxAttempts" >= 1);

UPDATE "Role"
SET "permissions" = array_append("permissions", 'assessment.manage')
WHERE "key" IN ('owner', 'hr_admin')
  AND NOT ('assessment.manage' = ANY("permissions"));
