import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DecideRegularisationInput, RegularisationInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { WorkCalendarService } from './calendar';
import { addDays, isoDay, todayIst, toDate } from './days';
import { LeaveService, Viewer } from './leave.service';

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    employeeCode: true,
    department: { select: { name: true } },
  },
} satisfies Prisma.EmployeeDefaultArgs;

/** "09:12" on a day in India as a timestamp. */
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);
const hhmm = (d: Date | null) =>
  d ? new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(11, 16) : null;

/** How far back someone can ask to fix a day. */
export const REGULARISE_WITHIN_DAYS = 30;

/**
 * Requests to fix a day's attendance: a missed punch, a forgotten check-out or a wrong time.
 * The person's manager (anyone above them) or HR decides; nobody decides their own. An approved
 * request writes the times onto the day, replacing what was there.
 */
@Injectable()
export class RegularisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly attendance: AttendanceService,
    private readonly calendar: WorkCalendarService,
    private readonly audit: AuditService,
  ) {}

  private canDecide(v: Viewer, employeeId: string) {
    if (employeeId === v.self) return false;
    return v.manage || v.team.has(employeeId);
  }

  async list(q: { status?: string; mine?: boolean }) {
    const v = await this.leave.viewer();
    const where: Prisma.AttendanceRegularisationWhereInput = {
      ...(q.status ? { status: q.status as Prisma.EnumRegularisationStatusFilter['equals'] } : {}),
    };
    if (q.mine) where.employeeId = v.self ?? '00000000-0000-0000-0000-000000000000';
    else if (!v.manage && !v.readAll)
      where.employeeId = { in: [...v.team, ...(v.self ? [v.self] : [])] };
    const rows = await this.prisma.db.attendanceRegularisation.findMany({
      where,
      include: { employee: person },
      orderBy: [{ status: 'asc' }, { date: 'desc' }],
      take: 300,
    });
    const records = await this.prisma.db.attendanceRecord.findMany({
      where: { OR: rows.map((r) => ({ employeeId: r.employeeId, date: r.date })) },
      select: { employeeId: true, date: true, checkIn: true, checkOut: true },
    });
    return rows.map((r) => {
      const rec = records.find(
        (x) => x.employeeId === r.employeeId && isoDay(x.date) === isoDay(r.date),
      );
      return {
        id: r.id,
        employee: r.employee,
        date: isoDay(r.date),
        checkIn: hhmm(r.checkIn),
        checkOut: hhmm(r.checkOut),
        recorded: { checkIn: hhmm(rec?.checkIn ?? null), checkOut: hhmm(rec?.checkOut ?? null) },
        reason: r.reason,
        status: r.status,
        decisionNote: r.decisionNote,
        createdAt: r.createdAt.toISOString(),
        canDecide: r.status === 'PENDING' && this.canDecide(v, r.employeeId),
        canCancel: r.status === 'PENDING' && r.employeeId === v.self,
      };
    });
  }

  async create(input: RegularisationInput) {
    const v = await this.leave.viewer();
    const employeeId = input.employeeId ?? v.self;
    if (!employeeId)
      throw new BadRequestException('Your login is not linked to an employee record');
    if (employeeId !== v.self && !v.manage)
      throw new ForbiddenException('You can only ask to fix your own days');
    const employee = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { dateOfJoining: true, status: true },
    });
    if (!employee || employee.status === 'EXITED')
      throw new NotFoundException('Employee not found');
    const today = todayIst();
    if (input.date > today)
      throw new BadRequestException('You can’t fix a day that hasn’t happened');
    if (input.date < addDays(today, -REGULARISE_WITHIN_DAYS))
      throw new BadRequestException(
        `Fixes can be asked for up to ${REGULARISE_WITHIN_DAYS} days back`,
      );
    if (input.date < isoDay(employee.dateOfJoining))
      throw new BadRequestException('That is before they joined');
    const cal = await this.calendar.load([employeeId], input.date, input.date);
    if (cal.dayOff(employeeId, input.date))
      throw new BadRequestException('That day is a weekly off or holiday');
    const pending = await this.prisma.db.attendanceRegularisation.findFirst({
      where: { employeeId, date: toDate(input.date), status: 'PENDING' },
    });
    if (pending) throw new ConflictException('There is already a request waiting for that day');
    const r = await this.prisma.db.attendanceRegularisation.create({
      data: {
        tenantId: requireTenantId(),
        employeeId,
        date: toDate(input.date),
        checkIn: input.checkIn ? at(input.date, input.checkIn) : null,
        checkOut: input.checkOut ? at(input.date, input.checkOut) : null,
        reason: input.reason,
      },
    });
    await this.audit.record('attendance.fix_requested', 'AttendanceRegularisation', r.id, {
      employeeId,
      date: input.date,
    });
    return r;
  }

  async decide(id: string, input: DecideRegularisationInput) {
    const v = await this.leave.viewer();
    const r = await this.prisma.db.attendanceRegularisation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    if (!this.canDecide(v, r.employeeId))
      throw new ForbiddenException(
        r.employeeId === v.self
          ? 'Someone else has to decide your own request'
          : 'Only their manager or HR can decide this',
      );
    if (r.status !== 'PENDING')
      throw new ConflictException('This request has already been decided');
    const approve = input.decision === 'APPROVE';
    const updated = await this.prisma.db.attendanceRegularisation.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        decidedById: currentContext().userId ?? null,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      },
    });
    if (approve)
      await this.attendance.applyTimes(
        r.employeeId,
        isoDay(r.date),
        { checkIn: r.checkIn, checkOut: r.checkOut },
        'REGULARISED',
        r.reason,
      );
    await this.audit.record(
      approve ? 'attendance.fix_approved' : 'attendance.fix_rejected',
      'AttendanceRegularisation',
      id,
      {
        employeeId: r.employeeId,
        date: isoDay(r.date),
      },
    );
    return updated;
  }

  async cancel(id: string) {
    const v = await this.leave.viewer();
    const r = await this.prisma.db.attendanceRegularisation.findUnique({ where: { id } });
    if (!r || r.employeeId !== v.self) throw new NotFoundException('Request not found');
    if (r.status !== 'PENDING')
      throw new ConflictException('Only a waiting request can be cancelled');
    return this.prisma.db.attendanceRegularisation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
