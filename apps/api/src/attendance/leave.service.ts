import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateLeaveRequestInput,
  DecideLeaveInput,
  LeaveTypeInput,
  ListLeaveQuery,
  UpdateLeaveTypeInput,
} from '@hrms/shared';
import { LeaveType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_LEAVE_TYPES } from './default-leave-types';
import { isoDay, todayIst, toDate, workingDays } from './days';

const requestInclude = {
  leaveType: { select: { id: true, name: true, code: true, tone: true, approver: true } },
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      managerId: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.LeaveRequestInclude;

type RequestRow = Prisma.LeaveRequestGetPayload<{ include: typeof requestInclude }>;

export interface Viewer {
  manage: boolean;
  readAll: boolean;
  self: string | null;
  team: Set<string>;
}

/**
 * Leave types, requests and balances.
 *
 * - Everyone applies for their own leave and can withdraw it while it's pending.
 * - The employee's managers (anyone above them in the reporting line) decide types whose
 *   approver is MANAGER; `attendance.manage` (HR) decides anything and can apply on someone's
 *   behalf. Nobody decides their own request.
 * - Balances: yearly types grant the full allowance on 1 January, monthly ones build up a
 *   twelfth each month. Approved and pending requests both count against what is left, so two
 *   requests can't together overdraw it.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  async viewer(): Promise<Viewer> {
    const self = await this.access.selfEmployeeId();
    const team =
      self && this.access.can('team.read')
        ? new Set(await this.access.reportingLine(self))
        : new Set<string>();
    return {
      manage: this.access.can('attendance.manage'),
      readAll: this.access.can('employee.read'),
      self,
      team,
    };
  }

  canSee(v: Viewer, employeeId: string) {
    return v.manage || v.readAll || v.self === employeeId || v.team.has(employeeId);
  }

  // ---------- leave types ----------

  async types(includeInactive = true) {
    await this.ensureDefaults();
    return this.prisma.db.leaveType.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async createType(input: LeaveTypeInput) {
    await this.ensureDefaults();
    const position = (await this.prisma.db.leaveType.count()) + 1;
    const type = await this.prisma.db.leaveType.create({
      data: { ...input, position } as Prisma.LeaveTypeUncheckedCreateInput,
    });
    await this.audit.record('leave.type_created', 'LeaveType', type.id, { name: type.name });
    return type;
  }

  async updateType(id: string, input: UpdateLeaveTypeInput) {
    const existing = await this.prisma.db.leaveType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Leave type not found');
    const type = await this.prisma.db.leaveType.update({ where: { id }, data: input });
    await this.audit.record('leave.type_updated', 'LeaveType', id, { fields: Object.keys(input) });
    return type;
  }

  // ---------- balances ----------

  async balances(employeeId: string, year = Number(todayIst().slice(0, 4))) {
    const v = await this.viewer();
    const exists = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!exists || !this.canSee(v, employeeId)) throw new NotFoundException('Employee not found');
    const types = await this.types(false);
    const requests = await this.prisma.db.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) },
      },
      select: { leaveTypeId: true, status: true, days: true },
    });
    const months = Number(todayIst().slice(0, 4)) > year ? 12 : Number(todayIst().slice(5, 7));
    return types.map((t) => {
      const sum = (s: 'APPROVED' | 'PENDING') =>
        requests
          .filter((r) => r.leaveTypeId === t.id && r.status === s)
          .reduce((n, r) => n + Number(r.days), 0);
      const used = sum('APPROVED');
      const pending = sum('PENDING');
      const entitled =
        t.daysPerYear === null
          ? null
          : t.accrual === 'MONTHLY'
            ? Math.round(((t.daysPerYear * months) / 12) * 2) / 2
            : t.daysPerYear;
      return {
        leaveType: { id: t.id, name: t.name, code: t.code, tone: t.tone },
        entitled,
        total: t.daysPerYear,
        used,
        pending,
        left: entitled === null ? null : Math.max(0, entitled - used - pending),
      };
    });
  }

  // ---------- requests ----------

  async list(q: ListLeaveQuery) {
    const v = await this.viewer();
    const where: Prisma.LeaveRequestWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.employeeId ? { employeeId: q.employeeId } : {}),
    };
    if (!v.manage && !v.readAll) {
      const ids = [...v.team, ...(v.self ? [v.self] : [])];
      where.employeeId = q.employeeId
        ? ids.includes(q.employeeId)
          ? q.employeeId
          : '00000000-0000-0000-0000-000000000000'
        : { in: ids };
    }
    const rows = await this.prisma.db.leaveRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }],
      take: 300,
    });
    const shaped = rows.map((r) => this.present(r, v));
    return q.toDecide ? shaped.filter((r) => r.canDecide) : shaped;
  }

  async create(input: CreateLeaveRequestInput) {
    const v = await this.viewer();
    const employeeId = input.employeeId ?? v.self;
    if (!employeeId)
      throw new BadRequestException('Your login is not linked to an employee record');
    const onBehalf = employeeId !== v.self;
    if (onBehalf && !v.manage) throw new ForbiddenException('Only HR can apply for someone else');

    const employee = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, status: true },
    });
    if (!employee || employee.status === 'EXITED')
      throw new NotFoundException('Employee not found');
    const type = await this.prisma.db.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!type || !type.active) throw new NotFoundException('Leave type not found');

    const days = input.halfDay ? 0.5 : workingDays(input.startDate, input.endDate);
    if (days === 0)
      throw new BadRequestException('Those dates are all weekends, so no leave is needed');
    await this.assertNoOverlap(employeeId, input.startDate, input.endDate);
    await this.assertBalance(employeeId, type, input.startDate, days);

    // HR applying on someone's behalf is recorded as already approved.
    const approved = onBehalf && v.manage;
    const request = await this.prisma.db.leaveRequest.create({
      data: {
        employeeId,
        leaveTypeId: type.id,
        startDate: toDate(input.startDate),
        endDate: toDate(input.endDate),
        halfDay: input.halfDay,
        days,
        reason: input.reason ?? null,
        status: approved ? 'APPROVED' : 'PENDING',
        requestedById: currentContext().userId ?? null,
        ...(approved
          ? { decidedById: currentContext().userId ?? null, decidedAt: new Date() }
          : {}),
      } as Prisma.LeaveRequestUncheckedCreateInput,
      include: requestInclude,
    });
    await this.audit.record('leave.requested', 'LeaveRequest', request.id, {
      employeeId,
      type: type.code,
      days,
      onBehalf,
    });
    return {
      ...this.present(request, v),
      needsDocument: type.documentAfterDays !== null && days > type.documentAfterDays,
    };
  }

  async decide(id: string, input: DecideLeaveInput) {
    const v = await this.viewer();
    const request = await this.prisma.db.leaveRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!request || !this.canSee(v, request.employeeId))
      throw new NotFoundException('Leave request not found');
    if (request.status !== 'PENDING')
      throw new BadRequestException('This request was already decided');
    if (!this.canDecide(v, request)) throw new ForbiddenException('You can’t decide this request');

    const updated = await this.prisma.db.leaveRequest.update({
      where: { id },
      data: {
        status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decidedById: currentContext().userId ?? null,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      },
      include: requestInclude,
    });
    await this.audit.record(
      input.decision === 'APPROVE' ? 'leave.approved' : 'leave.rejected',
      'LeaveRequest',
      id,
      { employeeId: request.employeeId },
    );
    return this.present(updated, v);
  }

  /** The employee withdraws a pending request; HR can also cancel an approved one. */
  async cancel(id: string) {
    const v = await this.viewer();
    const request = await this.prisma.db.leaveRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!request || !this.canSee(v, request.employeeId))
      throw new NotFoundException('Leave request not found');
    const own = request.employeeId === v.self;
    const allowed =
      (own && request.status === 'PENDING') ||
      (v.manage && (request.status === 'PENDING' || request.status === 'APPROVED'));
    if (!allowed) throw new ForbiddenException('Ask HR to cancel this leave');
    const updated = await this.prisma.db.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: requestInclude,
    });
    await this.audit.record('leave.cancelled', 'LeaveRequest', id, {
      employeeId: request.employeeId,
    });
    return this.present(updated, v);
  }

  /** Approved leave overlapping a date range, for the register. */
  approvedBetween(employeeIds: string[], start: string, end: string) {
    return this.prisma.db.leaveRequest.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        startDate: { lte: toDate(end) },
        endDate: { gte: toDate(start) },
      },
      include: { leaveType: { select: { code: true, countsAsPresent: true, tone: true } } },
    });
  }

  async ensureDefaults() {
    if (await this.prisma.db.leaveType.count()) return;
    await this.prisma.db.leaveType.createMany({
      data: DEFAULT_LEAVE_TYPES.map((t, position) => ({
        ...t,
        position,
        tenantId: requireTenantId(),
      })) as Prisma.LeaveTypeCreateManyInput[],
      skipDuplicates: true,
    });
  }

  async assertNoOverlap(employeeId: string, start: string, end: string, ignoreId?: string) {
    const clash = await this.prisma.db.leaveRequest.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: toDate(end) },
        endDate: { gte: toDate(start) },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException('There is already leave on some of these days');
  }

  private async assertBalance(employeeId: string, type: LeaveType, start: string, days: number) {
    if (type.daysPerYear === null) return;
    const balances = await this.balancesUnchecked(employeeId, Number(start.slice(0, 4)));
    const left = balances.find((b) => b.id === type.id)?.left ?? 0;
    if (days > left)
      throw new BadRequestException(
        `Only ${left} ${left === 1 ? 'day' : 'days'} of ${type.name.toLowerCase()} left`,
      );
  }

  /** Balance maths without the visibility check (used when applying). */
  private async balancesUnchecked(employeeId: string, year: number) {
    const types = await this.prisma.db.leaveType.findMany({ where: { active: true } });
    const requests = await this.prisma.db.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) },
      },
      select: { leaveTypeId: true, days: true },
    });
    const months = Number(todayIst().slice(0, 4)) > year ? 12 : Number(todayIst().slice(5, 7));
    return types.map((t) => {
      const taken = requests
        .filter((r) => r.leaveTypeId === t.id)
        .reduce((n, r) => n + Number(r.days), 0);
      const entitled =
        t.daysPerYear === null
          ? Infinity
          : t.accrual === 'MONTHLY'
            ? Math.round(((t.daysPerYear * months) / 12) * 2) / 2
            : t.daysPerYear;
      return { id: t.id, left: Math.max(0, entitled - taken) };
    });
  }

  private canDecide(v: Viewer, r: RequestRow) {
    if (r.employeeId === v.self) return false;
    if (v.manage) return true;
    return r.leaveType.approver === 'MANAGER' && v.team.has(r.employeeId);
  }

  private present(r: RequestRow, v: Viewer) {
    const { startDate, endDate, days, ...rest } = r;
    return {
      ...rest,
      startDate: isoDay(startDate),
      endDate: isoDay(endDate),
      days: Number(days),
      canDecide: r.status === 'PENDING' && this.canDecide(v, r),
      canCancel:
        (r.employeeId === v.self && r.status === 'PENDING') ||
        (v.manage && (r.status === 'PENDING' || r.status === 'APPROVED')),
    };
  }
}
