-- Leave without pay and maternity leave for workspaces created before they were defaults.
INSERT INTO "LeaveType" ("id", "tenantId", "name", "code", "tone", "daysPerYear", "accrual", "carryForward", "paid", "approver", "countsAsPresent", "active", "position", "updatedAt")
SELECT gen_random_uuid(), t."id", 'Leave without pay', 'LWP', 'danger', NULL, 'YEARLY', 0, false, 'MANAGER', false, true, 20, now()
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "LeaveType" l WHERE l."tenantId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "LeaveType" l WHERE l."tenantId" = t."id" AND (l."code" = 'LWP' OR l."name" = 'Leave without pay'));

INSERT INTO "LeaveType" ("id", "tenantId", "name", "code", "tone", "daysPerYear", "accrual", "carryForward", "documentAfterDays", "paid", "approver", "countsAsPresent", "active", "position", "updatedAt")
SELECT gen_random_uuid(), t."id", 'Maternity leave', 'ML', 'primary', 182, 'YEARLY', 0, 1, true, 'HR', false, false, 21, now()
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "LeaveType" l WHERE l."tenantId" = t."id")
  AND NOT EXISTS (SELECT 1 FROM "LeaveType" l WHERE l."tenantId" = t."id" AND (l."code" = 'ML' OR l."name" = 'Maternity leave'));