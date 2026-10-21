import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { currentContext, requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records an action by the current user in the current workspace. */
  async record(action: string, entity: string, entityId?: string | null, data?: unknown) {
    const ctx = currentContext();
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: requireTenantId(),
        actorId: ctx.userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: ctx.ip ?? null,
      },
    });
  }

  /**
   * The audit log in plain words for people screens: who did what to whom. `employeeId`
   * narrows it to things done to that person. Downloads and check-outs are left out.
   */
  async feed({ take = 30, employeeId }: { take?: number; employeeId?: string }) {
    const rows = await this.prisma.db.auditLog.findMany({
      where: {
        action: { notIn: ['document.downloaded', 'attendance.check_out'] },
        ...(employeeId
          ? {
              OR: [
                { entity: 'Employee', entityId: employeeId },
                { data: { path: ['employeeId'], equals: employeeId } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
    });
    type Row = (typeof rows)[number];
    const uniq = (xs: (string | null | undefined)[]) => [
      ...new Set(xs.filter((x): x is string => Boolean(x))),
    ];
    const subjectOf = (r: Row) =>
      r.entity === 'Employee'
        ? r.entityId
        : ((r.data as { employeeId?: string } | null)?.employeeId ?? null);
    const actorIds = uniq(rows.map((r) => r.actorId));
    const [actors, employees, actorEmployees] = await Promise.all([
      this.prisma.db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, fullName: true },
      }),
      this.prisma.db.employee.findMany({
        where: { id: { in: uniq(rows.map(subjectOf)) } },
        select: { id: true, firstName: true, lastName: true },
      }),
      // A check-in is by the person themselves; find their employee record through their login.
      this.prisma.db.employee.findMany({
        where: { userId: { in: actorIds } },
        select: { userId: true, id: true },
      }),
    ]);
    const actorName = (id: string | null) => actors.find((a) => a.id === id)?.fullName ?? 'Someone';
    const empName = (id: string | null) => {
      const e = employees.find((x) => x.id === id);
      return e ? `${e.firstName} ${e.lastName}`.trim() : null;
    };
    const items = [];
    for (const r of rows) {
      const subject =
        subjectOf(r) ??
        (r.action === 'attendance.check_in'
          ? (actorEmployees.find((e) => e.userId === r.actorId)?.id ?? null)
          : null);
      const text = describe(
        r.action,
        actorName(r.actorId),
        empName(subject),
        (r.data ?? {}) as Record<string, unknown>,
      );
      if (text)
        items.push({ id: r.id, at: r.createdAt, action: r.action, text, employeeId: subject });
    }
    return items;
  }

  list(take = 50, cursor?: string) {
    return this.prisma.db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }
}

/** One line per kind of change. Returns null for actions that don't belong on a people feed. */
function describe(
  action: string,
  by: string,
  who: string | null,
  data: Record<string, unknown>,
): string | null {
  const them = who ?? 'someone';
  switch (action) {
    case 'employee.created':
      return `${by} added ${them}`;
    case 'employee.updated':
      return `${by} updated ${them}’s record`;
    case 'employee.profile_updated':
      return data.bySelf ? `${them} updated their profile` : `${by} updated ${them}’s profile`;
    case 'employee.invited':
      return `${by} invited ${them} to sign in`;
    case 'attendance.check_in':
      return `${by} checked in`;
    case 'attendance.marked':
      return `${by} marked ${them} ${String(data.code ?? '')} for ${String(data.date ?? '')}`;
    case 'leave.requested':
      return data.onBehalf
        ? `${by} added ${String(data.type ?? '')} leave for ${them} · ${String(data.days ?? '')} days`
        : `${them} applied for ${String(data.type ?? '')} leave · ${String(data.days ?? '')} days`;
    case 'leave.approved':
      return `${by} approved ${them}’s leave`;
    case 'leave.rejected':
      return `${by} declined ${them}’s leave`;
    case 'leave.cancelled':
      return `${them}’s leave was cancelled`;
    case 'document.uploaded':
      return who
        ? `${by} uploaded a ${String(data.category ?? 'document')} for ${them}`
        : `${by} uploaded a company document`;
    case 'document.deleted':
      return `${by} deleted a document${who ? ` of ${them}` : ''}`;
    case 'checklist.started':
      return `${String(data.kind) === 'OFFBOARDING' ? 'Offboarding' : 'Onboarding'} started for ${them}`;
    case 'checklist.completed':
      return `${them} ${String(data.kind) === 'OFFBOARDING' ? 'has left; offboarding finished' : 'is fully onboarded'}`;
    case 'checklist.cancelled':
      return `${by} cancelled ${them}’s ${String(data.kind ?? '').toLowerCase()} checklist`;
    case 'asset.assigned':
      return `${by} gave ${them} a company asset`;
    case 'asset.returned':
      return `${them} returned a company asset · ${String(data.condition ?? '').toLowerCase()}`;
    default:
      return null;
  }
}
