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
import { WorkCalendar, WorkCalendarService } from './calendar';
import { eachDay, isoDay, monthRange, todayIst, toDate } from './days';
import { LeaveService, Viewer } from './leave.service';

/**
 * What a register cell shows: a mark, a leave code, W for a weekly off, H for a holiday (with its
 * name), or '' when nothing is recorded.
 */
type Cell = { code: string; late?: boolean; halfDay?: boolean; title?: string };

/**
 * The attendance register, today's numbers, self check-in and HR's marks.
 *
 * A day's code comes from, in order: the person's weekly off or a holiday, approved leave
 * covering it, then the attendance record (a check-in, a device punch, an approved fix or HR's
 * mark). Leave always wins over a record so the register and leave balances can't disagree.
 * Weekly offs, start times and grace come from the person's shift.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly audit: AuditService,
    private readonly calendar: WorkCalendarService,
  ) {}

  async register(q: RegisterQuery) {
    const v = await this.leave.viewer();
    await this.leave.ensureDefaults();
    const { start, end } = monthRange(q.month);
    const today = todayIst();
    const employees = await this.visibleEmployees(v, start, q.departmentId);
    const ids = employees.map((e) => e.id);
    const [records, leaves, types, cal, holidays] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where: { employeeId: { in: ids }, date: { gte: toDate(start), lte: toDate(end) } },
      }),
      this.leave.approvedBetween(ids, start, end),
      this.leave.types(),
      this.calendar.load(ids, start, end),
      this.prisma.db.holiday.findMany({
        where: { date: { gte: toDate(start), lte: toDate(end) } },
        select: { date: true, name: true, optional: true, location: { select: { name: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);
    const days = eachDay(start, end);

    const rows = employees.map((e) => {
      const joined = isoDay(e.dateOfJoining);
      // Days before someone joined stay blank whatever was recorded.
      const cells: Cell[] = days.map((d) =>
        d < joined && cal.isWorking(e.id, d)
          ? { code: '' }
          : this.cell(cal, e.id, d, records, leaves),
      );
      const counted = days
        .map((d, i) => ({ d, c: cells[i]! }))
        .filter(({ d }) => d <= today && cal.isWorking(e.id, d) && d >= isoDay(e.dateOfJoining));
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
      holidays: holidays.map((h) => ({
        date: isoDay(h.date),
        name: h.name,
        optional: h.optional,
        location: h.location?.name ?? null,
      })),
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
    const [records, leaves, cal] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where: { employeeId: { in: ids }, date: toDate(today) },
      }),
      this.leave.approvedBetween(ids, today, today),
      this.calendar.load([...ids, ...(v.self ? [v.self] : [])], today, today),
    ]);
    let present = 0,
      late = 0,
      absent = 0,
      onLeave = 0,
      field = 0,
      off = 0;
    for (const id of ids) {
      if (!cal.isWorking(id, today) && !records.some((r) => r.employeeId === id)) {
        off++;
        continue;
      }
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
        if (r.checkIn && cal.isLate(id, r.checkIn)) late++;
      }
    }
    const self = v.self ? records.find((r) => r.employeeId === v.self) : undefined;
    const myShift = v.self ? cal.shiftOf(v.self) : null;
    const myOff = v.self ? cal.dayOff(v.self, today) : null;
    const hhmm = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return {
      date: today,
      weekend: myOff === 'W',
      holiday: v.self ? (cal.holiday(v.self, today)?.name ?? null) : null,
      off,
      headcount: ids.length,
      present,
      late,
      absent,
      onLeave,
      field,
      notMarked: ids.length - present - absent - onLeave - field - off,
      me: v.self
        ? {
            employeeId: v.self,
            checkIn: self?.checkIn ?? null,
            checkOut: self?.checkOut ?? null,
            status: self?.status ?? null,
            late: Boolean(self?.checkIn && cal.isLate(v.self, self.checkIn)),
            shift: myShift
              ? { name: myShift.name, start: hhmm(myShift.start), end: hhmm(myShift.end) }
              : null,
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
    const now = new Date();
    const cal = await this.calendar.load([v.self], todayIst(), todayIst());
    const record = await this.prisma.db.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        checkOut: now,
        // HR's mark stands; otherwise hours worked decide a full or half day.
        ...(existing.source === 'HR'
          ? {}
          : { status: cal.statusFor(v.self, existing.checkIn, now) }),
      },
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
      select: { id: true, dateOfJoining: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (input.date < isoDay(employee.dateOfJoining))
      throw new BadRequestException('That is before they joined');
    const cal = await this.calendar.load([input.employeeId], input.date, input.date);
    const off = cal.dayOff(input.employeeId, input.date);
    if (off)
      throw new BadRequestException(
        off === 'W' ? 'That day is a weekly off for them' : 'That day is a holiday for them',
      );
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

  /**
   * Writes a day's record from times (device punches or an approved fix). HR's own marks are
   * left alone unless `override` is set, which an approved fix does.
   */
  async applyTimes(
    employeeId: string,
    day: string,
    times: { checkIn: Date | null; checkOut: Date | null },
    source: 'BIOMETRIC' | 'REGULARISED',
    note?: string,
  ) {
    const date = toDate(day);
    const existing = await this.prisma.db.attendanceRecord.findFirst({
      where: { employeeId, date },
    });
    if (existing && existing.source === 'HR' && source !== 'REGULARISED') return existing;
    const checkIn = times.checkIn ?? existing?.checkIn ?? null;
    const checkOut = times.checkOut ?? existing?.checkOut ?? null;
    const cal = await this.calendar.load([employeeId], day, day);
    const status = checkIn && checkOut ? cal.statusFor(employeeId, checkIn, checkOut) : 'P';
    const data = { checkIn, checkOut, status, source, ...(note ? { note } : {}) };
    return existing
      ? this.prisma.db.attendanceRecord.update({ where: { id: existing.id }, data })
      : this.prisma.db.attendanceRecord.create({
          data: { ...data, employeeId, date } as Prisma.AttendanceRecordUncheckedCreateInput,
        });
  }

  private cell(
    cal: WorkCalendar,
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
    const off = cal.dayOff(employeeId, day);
    if (off === 'W') return { code: 'W' };
    if (off === 'H') return { code: 'H', title: cal.holiday(employeeId, day)?.name };
    const leave = leaves.find(
      (l) => l.employeeId === employeeId && isoDay(l.startDate) <= day && isoDay(l.endDate) >= day,
    );
    if (leave) return { code: leave.leaveType.code, ...(leave.halfDay ? { halfDay: true } : {}) };
    const r = records.find((x) => x.employeeId === employeeId && isoDay(x.date) === day);
    if (!r) return { code: '' };
    return {
      code: r.status,
      ...(r.checkIn && cal.isLate(employeeId, r.checkIn) ? { late: true } : {}),
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
