import { Injectable } from '@nestjs/common';
import { requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { eachDay, istMinutes, isoDay, toDate } from './days';

export interface ShiftRule {
  id: string;
  name: string;
  /** Minutes past midnight in India. */
  start: number;
  end: number;
  grace: number;
  fullDay: number;
  halfDay: number;
  offs: Set<number>;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export function toRule(s: {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  fullDayMinutes: number;
  halfDayMinutes: number;
  weeklyOffs: number[];
}): ShiftRule {
  return {
    id: s.id,
    name: s.name,
    start: minutes(s.startTime),
    end: minutes(s.endTime),
    grace: s.graceMinutes,
    fullDay: s.fullDayMinutes,
    halfDay: s.halfDayMinutes,
    offs: new Set(s.weeklyOffs),
  };
}

/**
 * Which days people work, from their shift's weekly offs and the holiday list, for a set of
 * employees and dates loaded up front so lookups stay synchronous.
 */
export class WorkCalendar {
  constructor(
    private readonly fallback: ShiftRule,
    private readonly shifts: Map<string, ShiftRule>,
    private readonly locations: Map<string, string | null>,
    private readonly holidays: { date: string; name: string; locationId: string | null }[],
  ) {}

  shiftOf(employeeId: string): ShiftRule {
    return this.shifts.get(employeeId) ?? this.fallback;
  }

  /** The holiday a person has off on a day, if any. Optional holidays are not days off. */
  holiday(employeeId: string, day: string) {
    const loc = this.locations.get(employeeId) ?? null;
    return (
      this.holidays.find((h) => h.date === day && (!h.locationId || h.locationId === loc)) ?? null
    );
  }

  /** 'W' for a weekly off, 'H' for a holiday, or null on a working day. */
  dayOff(employeeId: string, day: string): 'W' | 'H' | null {
    if (this.shiftOf(employeeId).offs.has(toDate(day).getUTCDay())) return 'W';
    return this.holiday(employeeId, day) ? 'H' : null;
  }

  isWorking(employeeId: string, day: string) {
    return this.dayOff(employeeId, day) === null;
  }

  workingDays(employeeId: string, start: string, end: string) {
    return eachDay(start, end).filter((d) => this.isWorking(employeeId, d)).length;
  }

  isLate(employeeId: string, checkIn: Date) {
    const s = this.shiftOf(employeeId);
    return istMinutes(checkIn) > s.start + s.grace;
  }

  /** P for a full day's work, HD for less. */
  statusFor(employeeId: string, checkIn: Date, checkOut: Date) {
    const worked = (checkOut.getTime() - checkIn.getTime()) / 60_000;
    return worked >= this.shiftOf(employeeId).fullDay ? 'P' : 'HD';
  }
}

@Injectable()
export class WorkCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** The workspace's default shift, created on first use for workspaces made after it existed. */
  async defaultShift() {
    const found = await this.prisma.db.shift.findFirst({ where: { isDefault: true } });
    if (found) return found;
    return this.prisma.db.shift.upsert({
      where: { tenantId_name: { tenantId: requireTenantId(), name: 'General' } },
      create: {
        tenantId: requireTenantId(),
        name: 'General',
        startTime: '09:30',
        endTime: '18:30',
        graceMinutes: 30,
        isDefault: true,
      },
      update: { isDefault: true },
    });
  }

  async load(employeeIds: string[], from: string, to: string) {
    const [fallback, employees, holidays] = await Promise.all([
      this.defaultShift(),
      this.prisma.db.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, locationId: true, shift: true },
      }),
      this.prisma.db.holiday.findMany({
        where: { optional: false, date: { gte: toDate(from), lte: toDate(to) } },
        select: { date: true, name: true, locationId: true },
      }),
    ]);
    return new WorkCalendar(
      toRule(fallback),
      new Map(employees.filter((e) => e.shift).map((e) => [e.id, toRule(e.shift!)])),
      new Map(employees.map((e) => [e.id, e.locationId])),
      holidays.map((h) => ({ ...h, date: isoDay(h.date) })),
    );
  }
}
