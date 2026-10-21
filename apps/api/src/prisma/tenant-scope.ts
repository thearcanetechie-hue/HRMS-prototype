import { Prisma, PrismaClient } from '@prisma/client';

/** Models that belong to a workspace. Tenant itself is not scoped. */
export const TENANT_SCOPED_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  'User',
  'Role',
  'UserRole',
  'Session',
  'LegalEntity',
  'Location',
  'Department',
  'Designation',
  'Employee',
  'AuditLog',
  'Document',
  'DocumentFolder',
  'ChecklistTemplate',
  'EmployeeChecklist',
  'ChecklistTask',
  'LeaveType',
  'LeaveRequest',
  'AttendanceRecord',
  'Asset',
  'AssetEvent',
  'OvertimeRequest',
  'ClaimCategory',
  'ExpenseClaim',
  'SalaryStructure',
  'PayrollRun',
  'Payslip',
  'ComplianceFiling',
]);

type AnyArgs = Record<string, any>;

function withTenant(data: unknown, tenantId: string) {
  return Array.isArray(data)
    ? data.map((row) => ({ ...row, tenantId }))
    : { ...(data as AnyArgs), tenantId };
}

/**
 * Wraps a Prisma client so every query on a tenant-scoped model is filtered by,
 * and every write is stamped with, the current workspace id.
 *
 * Writes must use scalar foreign keys (`departmentId`), not nested `connect`,
 * and nested writes are not scoped: services check that referenced ids belong
 * to the workspace before writing (see EmployeesService.assertReferences).
 */
export function tenantScoped(base: PrismaClient, getTenantId: () => string) {
  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) return query(args);
          const tenantId = getTenantId();
          const a: AnyArgs = { ...(args as AnyArgs) };
          switch (operation) {
            case 'create':
            case 'createMany':
            case 'createManyAndReturn':
              a.data = withTenant(a.data, tenantId);
              break;
            case 'upsert':
              a.where = { ...a.where, tenantId };
              a.create = withTenant(a.create, tenantId);
              break;
            default:
              a.where = { ...a.where, tenantId };
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof tenantScoped>;
