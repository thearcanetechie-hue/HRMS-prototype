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
  LeaveAdjustmentInput,
  LeaveTypeInput,
  LeaveYearEndInput,
  ListLeaveQuery,
  UpdateLeaveTypeInput,
} from '@hrms/shared';
import { LeaveType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PolicyService } from '../policies/policies.module';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_LEAVE_TYPES } from './default-leave-types';
import { WorkCalendarService } from './calendar';
import { eachDay, isoDay, todayIst, toDate } from './days';
import {
  compOffBalance,
  entitlement,
  half,
  leaveDays,
  yearEnd,
  yearlyBalance,
} from './leave-balance';
import { AttendancePeriods } from './periods';

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
 * - Balances follow ./leave-balance.ts: yearly or monthly accrual, prorated for joiners and
 *   leavers, plus the leave ledger (opening balances, adjustments, carry forward, comp-off,
 *   encashed and lapsed days). Approved and pending requests both count against what is left,
 *   so two requests can't together overdraw it.
 * - Days in a closed attendance month can't gain, change or lose leave.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
    private readonly calendar: WorkCalendarService,
    private readonly policies: PolicyService,
    private readonly periods: AttendancePeriods,
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
    return (await this.computeBalances(employeeId, year)).map((b) => ({
      leaveType: { id: b.type.id, name: b.type.name, code: b.type.code, tone: b.type.tone },
      entitled: b.entitled,
      total: b.type.isCompOff ? null : b.type.daysPerYear,
      used: b.used,
      pending: b.pending,
      left: b.left,
      isCompOff: b.type.isCompOff,
    }));
  }

  /** Every active type's balance for a person and year, without a visibility check. */
  async computeBalances(employeeId: string, year: number) {
    const [types, employee, requests, ledger, policy] = await Promise.all([
      this.types(false),
      this.prisma.db.employee.findUniqueOrThrow({
        where: { id: employeeId },
        select: { dateOfJoining: true, dateOfExit: true },
      }),
      this.prisma.db.leaveRequest.findMany({
        where: { employeeId, status: { in: ['APPROVED', 'PENDING'] } },
        select: { leaveTypeId: true, status: true, days: true, startDate: true },
      }),
      this.prisma.db.leaveLedger.findMany({ where: { employeeId } }),
      this.policies.get('leave'),
    ]);
    const today = todayIst();
    const tenure = {
      joined: isoDay(employee.dateOfJoining),
      exited: employee.dateOfExit ? isoDay(employee.dateOfExit) : null,
    };
    return types.map((t) => {
      const mine = requests.filter((r) => r.leaveTypeId === t.id);
      if (t.isCompOff) {
        const line = compOffBalance(
          ledger
            .filter((l) => l.leaveTypeId === t.id && l.kind === 'COMP_OFF')
            .map((l) => ({
              days: Number(l.days),
              sourceDate: l.sourceDate ? isoDay(l.sourceDate) : isoDay(l.createdAt),
              expiresOn: l.expiresOn ? isoDay(l.expiresOn) : null,
            })),
          mine.map((r) => ({
            date: isoDay(r.startDate),
            days: Number(r.days),
            status: r.status as 'APPROVED' | 'PENDING',
          })),
          today,
        );
        return { type: t, ...line };
      }
      const inYear = mine.filter((r) => r.startDate.getUTCFullYear() === year);
      const sum = (st: string) =>
        inYear.filter((r) => r.status === st).reduce((n, r) => n + Number(r.days), 0);
      const fromLedger = ledger
        .filter((l) => l.leaveTypeId === t.id && l.year === year && l.kind !== 'COMP_OFF')
        .reduce((n, l) => n + Number(l.days), 0);
      const line = yearlyBalance(
        entitlement(t, year, today, tenure, policy),
        fromLedger,
        sum('APPROVED'),
        sum('PENDING'),
      );
      return { type: t, ...line };
    });
  }

  // ---------- ledger: opening balances, adjustments, year end ----------

  async ledger(employeeId: string, year: number) {
    const v = await this.viewer();
    if (!this.canSee(v, employeeId)) throw new NotFoundException('Employee not found');
    const rows = await this.prisma.db.leaveLedger.findMany({
      where: { employeeId, OR: [{ year }, { kind: 'COMP_OFF' }] },
      include: { leaveType: { select: { name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      leaveType: r.leaveType,
      year: r.year,
      days: Number(r.days),
      kind: r.kind,
      note: r.note,
      sourceDate: r.sourceDate ? isoDay(r.sourceDate) : null,
      expiresOn: r.expiresOn ? isoDay(r.expiresOn) : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** HR sets an opening balance (moving from another system) or corrects a balance. */
  async adjust(input: LeaveAdjustmentInput) {
    const [employee, type] = await Promise.all([
      this.prisma.db.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } }),
      this.prisma.db.leaveType.findUnique({ where: { id: input.leaveTypeId } }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!type) throw new NotFoundException('Leave type not found');
    if (type.daysPerYear === null && !type.isCompOff)
      throw new BadRequestException(`${type.name} has no limit, so there is no balance to adjust`);
    if (input.kind === 'OPENING') {
      const dup = await this.prisma.db.leaveLedger.findFirst({
        where: {
          employeeId: input.employeeId,
          leaveTypeId: type.id,
          year: input.year,
          kind: 'OPENING',
        },
      });
      if (dup)
        throw new ConflictException(
          'An opening balance is already set. Add an adjustment instead.',
        );
    }
    const row = await this.prisma.db.leaveLedger.create({
      data: {
        tenantId: requireTenantId(),
        employeeId: input.employeeId,
        leaveTypeId: type.id,
        year: input.year,
        days: input.days,
        // Comp-off given by HR behaves like earned comp-off.
        kind: type.isCompOff ? 'COMP_OFF' : input.kind,
        note: input.note,
        ...(type.isCompOff
          ? {
              sourceDate: toDate(todayIst()),
              expiresOn: type.validityDays
                ? toDate(addDaysIso(todayIst(), type.validityDays))
                : null,
            }
          : {}),
        createdById: currentContext().userId ?? null,
      },
    });
    await this.audit.record('leave.adjusted', 'LeaveLedger', row.id, {
      employeeId: input.employeeId,
      type: type.code,
      days: input.days,
    });
    return { ...row, days: Number(row.days) };
  }

  /**
   * Closes a leave year for everyone: unused days carry forward up to each type's limit; the
   * rest lapse, or with `encash` are marked for payout (encashable types only, up to the
   * policy's yearly maximum) in the next payroll. A year can be closed once.
   */
  async yearEnd(input: LeaveYearEndInput) {
    const tenantId = requireTenantId();
    if (input.year >= Number(todayIst().slice(0, 4)))
      throw new BadRequestException('A leave year can be closed once it has ended');
    const done = await this.prisma.db.leaveYearClose.findUnique({
      where: { tenantId_year: { tenantId, year: input.year } },
    });
    if (done) throw new ConflictException(`${input.year} is already closed`);
    const policy = await this.policies.get('leave');
    const people = await this.prisma.db.employee.findMany({
      where: {
        dateOfJoining: { lte: toDate(`${input.year}-12-31`) },
        OR: [{ dateOfExit: null }, { dateOfExit: { gt: toDate(`${input.year}-12-31`) } }],
        status: { not: 'EXITED' },
      },
      select: { id: true },
    });
    const userId = currentContext().userId ?? null;
    const lastDay = toDate(`${input.year}-12-31`);
    const rows: Prisma.LeaveLedgerCreateManyInput[] = [];
    const summary = { people: people.length, carried: 0, lapsed: 0, encashed: 0 };
    for (const p of people) {
      for (const b of await this.computeBalances(p.id, input.year)) {
        if (b.type.isCompOff || b.left === null || b.left <= 0) continue;
        const { carry, leftover } = yearEnd(b.left, b.type.carryForward);
        const base = {
          tenantId,
          employeeId: p.id,
          leaveTypeId: b.type.id,
          sourceDate: lastDay,
          createdById: userId,
        };
        if (carry > 0) {
          rows.push({
            ...base,
            year: input.year + 1,
            days: carry,
            kind: 'CARRY_FORWARD',
            note: `Carried from ${input.year}`,
          });
          summary.carried += carry;
        }
        if (leftover > 0) {
          const encash =
            input.encash && b.type.encashable
              ? Math.min(leftover, policy.encashment.maxDaysPerYear)
              : 0;
          if (encash > 0) {
            rows.push({
              ...base,
              year: input.year,
              days: -encash,
              kind: 'ENCASHED',
              note: `Encashed at the end of ${input.year}`,
            });
            summary.encashed += encash;
          }
          if (leftover - encash > 0) {
            rows.push({
              ...base,
              year: input.year,
              days: -half(leftover - encash),
              kind: 'LAPSED',
              note: `Lapsed at the end of ${input.year}`,
            });
            summary.lapsed += half(leftover - encash);
          }
        }
      }
    }
    await this.prisma.db.$transaction([
      this.prisma.db.leaveLedger.createMany({ data: rows }),
      this.prisma.db.leaveYearClose.create({
        data: { tenantId, year: input.year, encashed: input.encash, summary, closedById: userId },
      }),
    ]);
    await this.audit.record('leave.year_closed', 'LeaveYearClose', String(input.year), summary);
    return summary;
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

    await this.periods.assertOpen(input.startDate, input.endDate);
    const [cal, policy] = await Promise.all([
      this.calendar.load([employeeId], input.startDate, input.endDate),
      this.policies.get('leave'),
    ]);
    const days = input.halfDay
      ? cal.isWorking(employeeId, input.startDate)
        ? 0.5
        : 0
      : leaveDays(
          eachDay(input.startDate, input.endDate).map((date) => ({
            date,
            working: cal.isWorking(employeeId, date),
          })),
          policy.sandwich,
        );
    if (days === 0)
      throw new BadRequestException(
        'Those dates are all weekly offs or holidays, so no leave is needed',
      );
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
    if (input.decision === 'APPROVE')
      await this.periods.assertOpen(isoDay(request.startDate), isoDay(request.endDate));

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
    if (request.status === 'APPROVED')
      await this.periods.assertOpen(isoDay(request.startDate), isoDay(request.endDate));
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
    if (type.daysPerYear === null && !type.isCompOff) return;
    const balances = await this.computeBalances(employeeId, Number(start.slice(0, 4)));
    const left = balances.find((b) => b.type.id === type.id)?.left ?? 0;
    if (days > left)
      throw new BadRequestException(
        `Only ${left} ${left === 1 ? 'day' : 'days'} of ${type.name.toLowerCase()} left`,
      );
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

const addDaysIso = (iso: string, n: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
