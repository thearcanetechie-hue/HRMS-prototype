import { Injectable } from '@nestjs/common';
import type { Permission } from '@hrms/shared';
import { currentContext, requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Who may see which employee records:
 * - `employee.read`: everyone, in full
 * - `team.read`: the caller's whole reporting line (direct and indirect), in full
 * - yourself, always in full
 * - `directory.read`: everyone else, basic fields only
 */
@Injectable()
export class EmployeeAccess {
  constructor(private readonly prisma: PrismaService) {}

  can(permission: Permission): boolean {
    return currentContext().permissions?.has(permission) ?? false;
  }

  /** The caller's own employee record id, if they have one. */
  async selfEmployeeId(): Promise<string | null> {
    const userId = currentContext().userId;
    if (!userId) return null;
    const me = await this.prisma.db.employee.findFirst({ where: { userId }, select: { id: true } });
    return me?.id ?? null;
  }

  /** Ids of everyone who reports to the manager, at any depth. */
  async reportingLine(managerId: string): Promise<string[]> {
    const tenantId = requireTenantId();
    // Raw SQL bypasses the tenant scope, so tenantId is filtered explicitly at every level.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH RECURSIVE line AS (
        SELECT id FROM "Employee" WHERE "tenantId" = ${tenantId}::uuid AND "managerId" = ${managerId}::uuid
        UNION
        SELECT e.id FROM "Employee" e JOIN line ON e."managerId" = line.id
        WHERE e."tenantId" = ${tenantId}::uuid
      )
      SELECT id FROM line`;
    return rows.map((r) => r.id);
  }

  async canSeeFull(employeeId: string): Promise<boolean> {
    if (this.can('employee.read')) return true;
    const self = await this.selfEmployeeId();
    if (self === employeeId) return true;
    if (self && this.can('team.read')) return (await this.reportingLine(self)).includes(employeeId);
    return false;
  }

  async isSelf(employeeId: string): Promise<boolean> {
    return (await this.selfEmployeeId()) === employeeId;
  }
}
