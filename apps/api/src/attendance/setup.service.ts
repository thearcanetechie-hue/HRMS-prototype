import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HolidayInput, ShiftInput, UpdateShiftInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { WorkCalendarService } from './calendar';
import { isoDay, toDate } from './days';

const conflict = (err: unknown, message: string) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
    throw new ConflictException(message);
  throw err;
};

/** Holidays every Indian workspace observes on fixed dates. Others vary by state and year. */
const NATIONAL = [
  ['01-26', 'Republic Day'],
  ['08-15', 'Independence Day'],
  ['10-02', 'Gandhi Jayanti'],
] as const;

/** Shifts (working hours and weekly offs) and the holiday calendar. HR edits both. */
@Injectable()
export class AttendanceSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: WorkCalendarService,
    private readonly audit: AuditService,
  ) {}

  // ---------- shifts ----------

  async shifts() {
    await this.calendar.defaultShift();
    const rows = await this.prisma.db.shift.findMany({
      include: { _count: { select: { employees: { where: { status: { not: 'EXITED' } } } } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    const unassigned = await this.prisma.db.employee.count({
      where: { shiftId: null, status: { not: 'EXITED' } },
    });
    return rows.map(({ _count, ...s }) => ({
      ...s,
      // Everyone without a shift follows the default one.
      people: _count.employees + (s.isDefault ? unassigned : 0),
    }));
  }

  private check(s: {
    startTime?: string;
    endTime?: string;
    halfDayMinutes?: number;
    fullDayMinutes?: number;
    weeklyOffs?: number[];
  }) {
    if (
      s.halfDayMinutes !== undefined &&
      s.fullDayMinutes !== undefined &&
      s.halfDayMinutes > s.fullDayMinutes
    )
      throw new BadRequestException('A half day can’t be longer than a full day');
    if (s.weeklyOffs && new Set(s.weeklyOffs).size === 7)
      throw new BadRequestException('A shift needs at least one working day');
  }

  async createShift(input: ShiftInput) {
    this.check(input);
    const tenantId = requireTenantId();
    try {
      const shift = await this.prisma.db.$transaction(async (tx) => {
        if (input.isDefault)
          await tx.shift.updateMany({
            where: { tenantId, isDefault: true },
            data: { isDefault: false },
          });
        return tx.shift.create({
          data: { ...input, weeklyOffs: [...new Set(input.weeklyOffs)].sort(), tenantId },
        });
      });
      await this.audit.record('attendance.shift_created', 'Shift', shift.id, { name: shift.name });
      return shift;
    } catch (err) {
      return conflict(err, `A shift called ${input.name} already exists`);
    }
  }

  async updateShift(id: string, input: UpdateShiftInput) {
    const shift = await this.prisma.db.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    this.check({ ...shift, ...input });
    if (input.isDefault === false && shift.isDefault)
      throw new BadRequestException('Make another shift the default instead');
    const tenantId = requireTenantId();
    try {
      const updated = await this.prisma.db.$transaction(async (tx) => {
        if (input.isDefault)
          await tx.shift.updateMany({
            where: { tenantId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        return tx.shift.update({
          where: { id },
          data: {
            ...input,
            ...(input.weeklyOffs ? { weeklyOffs: [...new Set(input.weeklyOffs)].sort() } : {}),
          },
        });
      });
      await this.audit.record('attendance.shift_updated', 'Shift', id, { name: updated.name });
      return updated;
    } catch (err) {
      return conflict(err, `A shift called ${input.name} already exists`);
    }
  }

  async deleteShift(id: string) {
    const shift = await this.prisma.db.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.isDefault) throw new BadRequestException('The default shift can’t be removed');
    // People on it fall back to the default shift.
    await this.prisma.db.shift.delete({ where: { id } });
    await this.audit.record('attendance.shift_deleted', 'Shift', id, { name: shift.name });
  }

  async assignShift(id: string, employeeIds: string[]) {
    const shift = await this.prisma.db.shift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Shift not found');
    const res = await this.prisma.db.employee.updateMany({
      where: { id: { in: employeeIds } },
      data: { shiftId: shift.isDefault ? null : id },
    });
    if (res.count !== new Set(employeeIds).size) throw new NotFoundException('Employee not found');
    await this.audit.record('attendance.shift_assigned', 'Shift', id, {
      name: shift.name,
      people: res.count,
    });
    return { assigned: res.count };
  }

  // ---------- holidays ----------

  async holidays(year: number) {
    const rows = await this.prisma.db.holiday.findMany({
      where: { date: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });
    return rows.map(({ date, ...h }) => ({ ...h, date: isoDay(date) }));
  }

  async createHoliday(input: HolidayInput) {
    if (input.locationId) {
      const loc = await this.prisma.db.location.findUnique({ where: { id: input.locationId } });
      if (!loc) throw new NotFoundException('Location not found');
    }
    try {
      const h = await this.prisma.db.holiday.create({
        data: {
          tenantId: requireTenantId(),
          date: toDate(input.date),
          name: input.name,
          optional: input.optional,
          locationId: input.locationId ?? null,
        },
      });
      await this.audit.record('attendance.holiday_added', 'Holiday', h.id, {
        name: h.name,
        date: input.date,
      });
      return { ...h, date: input.date };
    } catch (err) {
      return conflict(err, `${input.name} is already on ${input.date}`);
    }
  }

  async deleteHoliday(id: string) {
    const h = await this.prisma.db.holiday.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('Holiday not found');
    await this.prisma.db.holiday.delete({ where: { id } });
    await this.audit.record('attendance.holiday_removed', 'Holiday', id, { name: h.name });
  }

  /** Adds the fixed-date national holidays for a year, skipping any already there. */
  async addNational(year: number) {
    const tenantId = requireTenantId();
    const res = await this.prisma.db.holiday.createMany({
      data: NATIONAL.map(([md, name]) => ({ tenantId, date: toDate(`${year}-${md}`), name })),
      skipDuplicates: true,
    });
    return { added: res.count };
  }
}
