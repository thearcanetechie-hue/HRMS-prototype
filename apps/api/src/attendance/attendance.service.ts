import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MarkAttendanceInput, RegisterQuery } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import {
  eachDay,
  isoDay,
  isWeekend,
  istMinutes,
  LATE_AFTER_MINUTES,
  monthRange,
  todayIst,
  toDate,
} from './days';
import { LeaveService, Viewer } from './leave.service';

/** What a register cell shows: a mark, a leave code, W for weekend, or '' when nothing is recorded. */
type Cell = { code: string; late?: boolean; halfDay?: boolean };

/**
 * The attendance register, today's numbers, self check-in and HR's marks.
 *
 * A day's code comes from, in order: the weekend, approved leave covering it, then the
 * attendance record (a check-in or HR's mark). Leave always wins over a record so the register
 * and leave balances can't disagree.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly audit: AuditService,
  ) {}

  async register(q: RegisterQuery) {
    const v = await this.leave.viewer();
    await this.leave.ensureDefaults();
    const { start, end } = monthRange(q.month);
    const today = todayIst();
    const employees = await this.visibleEmployees(v, start, q.departmentId);
    const ids = employees.map((e) => e.id);
    const [records, leaves, types] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where: { employeeId: { in: ids }, date: { gte: toDate(start), lte: toDate(end) } },
      }),
      this.leave.approvedBetween(ids, start, end),
      this.leave.types(),
    ]);
    const days = eachDay(start, end);

    const rows = employees.map((e) => {
      const cells: Cell[] = days.map((d) => this.cell(e.id, d, records, leaves));
      const counted = days
        .map((d, i) => ({ d, c: cells[i]! }))
        .filter(({ d }) => d <= today && !isWeekend(d) && d >= isoDay(e.dateOfJoining));
      const presentCodes = new Set([
        'P',
        ...types.filter((t) => t.countsAsPresent).map((t) => t.code),
      ]);
      const present = counted.reduce(
        (n, { c }) => n + (c.code === 'HD' || c.halfDay ? 0.5 : presentCodes.has(c.code) ? 1 : 0),
        0,
      );
      return {
        employee: {
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          employeeCode: e.employeeCode,
          department: e.department,
        },
        cells,
        present,
        workingDays: counted.length,
      };
    });

    return {
      month: q.month,
      days,
      today,
      canMark: v.manage,
      leaveTypes: types.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        tone: t.tone,
        countsAsPresent: t.countsAsPresent,
        active: t.active,
      })),
      rows,
    };
  }

  /** Today's numbers for the people the caller can see. */
  async summary() {
    const v = await this.leave.viewer();
    const today = todayIst();
    const employees = await this.visibleEmployees(v, today);
    const ids = employees.map((e) => e.id);
    const [records, leaves] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where: { employeeId: { in: ids }, date: toDate(today) },
      }),
      this.leave.approvedBetween(ids, today, today),
    ]);
    let present = 0,
      late = 0,
      absent = 0,
      onLeave = 0,
      field = 0;
    for (const id of ids) {
      const l = leaves.find((x) => x.employeeId === id);
      if (l) {
        if (l.leaveType.countsAsPresent) field++;
        else onLeave++;
        continue;
      }
      const r = records.find((x) => x.employeeId === id);
      if (!r) continue;
      if (r.status === 'A') absent++;
      else {
        present++;
        if (r.checkIn && istMinutes(r.checkIn) > LATE_AFTER_MINUTES) late++;
      }
    }
    const self = v.self ? records.find((r) => r.employeeId === v.self) : undefined;
    return {
      date: today,
      weekend: isWeekend(today),
      headcount: ids.length,
      present,
      late,
      absent,
      onLeave,
      field,
      notMarked: ids.length - present - absent - onLeave - field,
      me: v.self
        ? {
            employeeId: v.self,
            checkIn: self?.checkIn ?? null,
            checkOut: self?.checkOut ?? null,
            status: self?.status ?? null,
          }
        : null,
    };
  }

  async checkIn() {
    const v = await this.leave.viewer();
    if (!v.self) throw new BadRequestException('Your login is not linked to an employee record');
    const today = todayIst();
    const existing = await this.prisma.db.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: v.self, date: toDate(today) } },
    });
    if (existing?.checkIn) throw new ConflictException('You have already checked in today');
    const record = existing
      ? await this.prisma.db.attendanceRecord.update({
          where: { id: existing.id },
          data: { status: 'P', checkIn: new Date(), source: 'WEB' },
        })
      : await this.prisma.db.attendanceRecord.create({
          data: {
            employeeId: v.self,
            date: toDate(today),
            status: 'P',
            checkIn: new Date(),
            source: 'WEB',
          } as Prisma.AttendanceRecordUncheckedCreateInput,
        });
    await this.audit.record('attendance.check_in', 'AttendanceRecord', record.id, {});
    return record;
  }

  async checkOut() {
    const v = await this.leave.viewer();
    if (!v.self) throw new BadRequestException('Your login is not linked to an employee record');
    const existing = await this.prisma.db.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: v.self, date: toDate(todayIst()) } },
    });
    if (!existing?.checkIn) throw new BadRequestException('Check in first');
    const record = await this.prisma.db.attendanceRecord.update({
      where: { id: existing.id },
      data: { checkOut: new Date() },
    });
    await this.audit.record('attendance.check_out', 'AttendanceRecord', record.id, {});
    return record;
  }

  /**
   * HR's mark for one person and day: P, A or HD; or a leave code, which records a one-day
   * approved leave (counted against the balance like any other).
   */
  async mark(input: MarkAttendanceInput) {
    const employee = await this.prisma.db.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (isWeekend(input.date)) throw new BadRequestException('That day is a weekend');
    if (input.date > todayIst())
      throw new BadRequestException('You can’t mark a day in the future');
    const date = toDate(input.date);
    const userId = currentContext().userId ?? null;

    // Clear any one-day leave on that day first; longer leave has to be changed as a request.
    const covering = await this.prisma.db.leaveRequest.findMany({
      where: {
        employeeId: input.employeeId,
        status: 'APPROVED',
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (covering.some((l) => isoDay(l.startDate) !== isoDay(l.endDate)))
      throw new BadRequestException(
        'They are on leave that day. Change or cancel the leave request.',
      );

    if (['P', 'A', 'HD'].includes(input.code)) {
      await this.prisma.$transaction(async (tx) => {
        if (covering.length)
          await tx.leaveRequest.updateMany({
            where: { id: { in: covering.map((l) => l.id) } },
            data: { status: 'CANCELLED' },
          });
        const existing = await tx.attendanceRecord.findFirst({
          where: { employeeId: input.employeeId, date },
        });
        if (existing)
          await tx.attendanceRecord.update({
            where: { id: existing.id },
            data: {
              status: input.code,
              source: 'HR',
              note: input.note ?? null,
              markedById: userId,
            },
          });
        else
          await tx.attendanceRecord.create({
            data: {
              tenantId: (await tx.employee.findUniqueOrThrow({ where: { id: input.employeeId } }))
                .tenantId,
              employeeId: input.employeeId,
              date,
              status: input.code,
              source: 'HR',
              note: input.note ?? null,
              markedById: userId,
            },
          });
      });
    } else {
      const type = await this.prisma.db.leaveType.findFirst({
        where: { code: input.code, active: true },
      });
      if (!type) throw new BadRequestException(`Unknown code ${input.code}`);
      if (covering.length)
        await this.prisma.db.leaveRequest.updateMany({
          where: { id: { in: covering.map((l) => l.id) } },
          data: { status: 'CANCELLED' },
        });
      await this.leave.create({
        employeeId: input.employeeId,
        leaveTypeId: type.id,
        startDate: input.date,
        endDate: input.date,
        halfDay: false,
        reason: input.note ?? 'Marked by HR',
      });
      // A leave on the day replaces any present/absent mark.
      await this.prisma.db.attendanceRecord.deleteMany({
        where: { employeeId: input.employeeId, date },
      });
    }
    await this.audit.record('attendance.marked', 'Employee', input.employeeId, {
      date: input.date,
      code: input.code,
    });
    return { ok: true };
  }

  private cell(
    employeeId: string,
    day: string,
    records: { employeeId: string; date: Date; status: string; checkIn: Date | null }[],
    leaves: {
      employeeId: string;
      startDate: Date;
      endDate: Date;
      halfDay: boolean;
      leaveType: { code: string };
    }[],
  ): Cell {
    if (isWeekend(day)) return { code: 'W' };
    const leave = leaves.find(
      (l) => l.employeeId === employeeId && isoDay(l.startDate) <= day && isoDay(l.endDate) >= day,
    );
    if (leave) return { code: leave.leaveType.code, ...(leave.halfDay ? { halfDay: true } : {}) };
    const r = records.find((x) => x.employeeId === employeeId && isoDay(x.date) === day);
    if (!r) return { code: '' };
    return {
      code: r.status,
      ...(r.checkIn && istMinutes(r.checkIn) > LATE_AFTER_MINUTES ? { late: true } : {}),
    };
  }

  /** People on the register: everyone for HR, the team for managers, otherwise just yourself. */
  private async visibleEmployees(v: Viewer, from: string, departmentId?: string) {
    const where: Prisma.EmployeeWhereInput = {
      OR: [{ status: { not: 'EXITED' } }, { dateOfExit: { gte: toDate(from) } }],
      ...(departmentId ? { departmentId } : {}),
    };
    if (!v.manage && !v.readAll) where.id = { in: [...v.team, ...(v.self ? [v.self] : [])] };
    return this.prisma.db.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        dateOfJoining: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
    });
  }
}
