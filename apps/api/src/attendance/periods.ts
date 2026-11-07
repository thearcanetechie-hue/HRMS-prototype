import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const label = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Months between two dates, inclusive, as YYYY-MM. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number) as [number, number];
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) return out;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

/**
 * Closed attendance months. Once HR closes a month (before payroll), nothing that changes its
 * days is accepted: marks, fixes, device punches and leave all have to wait for a reopen.
 */
@Injectable()
export class AttendancePeriods {
  constructor(private readonly prisma: PrismaService) {}

  async closedIn(from: string, to: string) {
    const rows = await this.prisma.db.attendanceMonth.findMany({
      where: { status: 'CLOSED', month: { in: monthsBetween(from, to) } },
      select: { month: true },
    });
    return rows.map((r) => r.month);
  }

  async isClosed(day: string) {
    return (await this.closedIn(day, day)).length > 0;
  }

  async assertOpen(from: string, to = from) {
    const closed = await this.closedIn(from, to);
    if (closed.length)
      throw new BadRequestException(
        `${label(closed[0]!)} attendance is closed for payroll. Ask HR to reopen it to change these days.`,
      );
  }
}
