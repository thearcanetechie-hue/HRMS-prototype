import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AttendanceService } from '../attendance/attendance.service';
import { addDays, isoDay, isWeekend, todayIst, toDate } from '../attendance/days';
import { LeaveService } from '../attendance/leave.service';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';

const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * Everything the Home screen shows, in one call, from real data. It covers the people the
 * caller can see: the whole company for `employee.read`, otherwise their reporting line and
 * themselves.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly attendance: AttendanceService,
    private readonly lifecycle: LifecycleService,
  ) {}

  async home() {
    const v = await this.leave.viewer();
    const company = v.manage || v.readAll;
    const scope: Prisma.EmployeeWhereInput = company
      ? {}
      : { id: { in: [...v.team, ...(v.self ? [v.self] : [])] } };
    const today = todayIst();
    const monthStart = `${today.slice(0, 7)}-01`;

    const [employees, departments, today_, toDecide, checklists] = await Promise.all([
      this.prisma.db.employee.findMany({
        where: { ...scope, status: { not: 'EXITED' } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfJoining: true,
          status: true,
          departmentId: true,
          profile: { select: { dateOfBirth: true } },
        },
      }),
      this.prisma.db.department.findMany({ select: { id: true, name: true } }),
      this.attendance.summary(),
      this.leave.list({ status: 'PENDING', toDecide: true }),
      this.lifecycle.list({ status: 'OPEN', mine: false }),
    ]);

    // ---- attendance: share of people present each day this week, and by month ----
    const week = await this.presentShare(
      employees.map((e) => e.id),
      this.lastDays(today, 7),
    );
    const months = await this.monthlyShare(
      employees.map((e) => e.id),
      today,
    );

    // ---- what's waiting on the caller ----
    const requests = [
      ...toDecide.map((r) => ({
        kind: 'leave' as const,
        id: r.id,
        employee: {
          id: r.employee.id,
          name: name(r.employee),
          firstName: r.employee.firstName,
          lastName: r.employee.lastName,
        },
        summary: `${r.leaveType.name} · ${this.range(r.startDate, r.endDate)} · ${r.halfDay ? 'half day' : `${r.days} ${r.days === 1 ? 'day' : 'days'}`}`,
        at: r.createdAt,
      })),
      ...checklists.flatMap((c) =>
        c.tasks
          .filter((t) => t.canTick && !t.doneAt && t.dueDate <= addDays(today, 7))
          .map((t) => ({
            kind: 'task' as const,
            id: t.id,
            checklistId: c.id,
            employee: {
              id: c.employee.id,
              name: name(c.employee),
              firstName: c.employee.firstName,
              lastName: c.employee.lastName,
            },
            summary: `${t.title} · ${t.overdue ? 'overdue' : `due ${short(t.dueDate)}`}`,
            at: new Date(`${t.dueDate}T00:00:00Z`),
          })),
      ),
    ];

    // ---- coming up in the next 14 days ----
    const horizon = addDays(today, 14);
    const events: { kind: string; title: string; when: string; date: string }[] = [];
    const nextOccurrence = (d: Date) => {
      const md = isoDay(d).slice(5);
      let iso = `${today.slice(0, 4)}-${md}`;
      if (md === '02-29' && Number(today.slice(0, 4)) % 4 !== 0) iso = `${today.slice(0, 4)}-02-28`;
      if (iso < today) iso = `${Number(today.slice(0, 4)) + 1}-${md}`;
      return iso;
    };
    for (const e of employees) {
      const dob = e.profile?.dateOfBirth;
      if (dob) {
        const d = nextOccurrence(dob);
        if (d <= horizon)
          events.push({
            kind: 'birthday',
            title: `${name(e)}’s birthday`,
            when: `Birthday · ${short(d)}`,
            date: d,
          });
      }
      const joined = isoDay(e.dateOfJoining);
      if (joined > today && joined <= horizon) {
        events.push({
          kind: 'joining',
          title: `${name(e)} joins`,
          when: `Joining · ${short(joined)}`,
          date: joined,
        });
      } else if (joined < today) {
        const d = nextOccurrence(e.dateOfJoining);
        const years = Number(d.slice(0, 4)) - Number(joined.slice(0, 4));
        if (d <= horizon && years >= 1)
          events.push({
            kind: 'anniversary',
            title: `${name(e)} · ${years} ${years === 1 ? 'year' : 'years'}`,
            when: `Work anniversary · ${short(d)}`,
            date: d,
          });
      }
    }
    for (const c of checklists)
      if (c.kind === 'OFFBOARDING' && c.startDate >= today && c.startDate <= horizon)
        events.push({
          kind: 'leaving',
          title: `${name(c.employee)}’s last day`,
          when: `Leaving · ${short(c.startDate)}`,
          date: c.startDate,
        });
    events.sort((a, b) => a.date.localeCompare(b.date));

    // ---- headcount ----
    const byDept = new Map<string, number>();
    for (const e of employees)
      byDept.set(e.departmentId ?? '', (byDept.get(e.departmentId ?? '') ?? 0) + 1);
    const teams = [...byDept.entries()]
      .map(([id, count]) => ({
        name: departments.find((d) => d.id === id)?.name ?? 'No team',
        count,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      scope: company ? 'company' : 'team',
      date: today,
      headcount: employees.length,
      joinedThisMonth: employees.filter(
        (e) => isoDay(e.dateOfJoining) >= monthStart && isoDay(e.dateOfJoining) <= today,
      ).length,
      onNotice: employees.filter((e) => e.status === 'ON_NOTICE').length,
      today: today_,
      attendanceWeek: week,
      attendanceMonths: months,
      requests: requests.sort((a, b) => +a.at - +b.at).slice(0, 8),
      openRequests: requests.length,
      checklists: checklists.slice(0, 5).map((c) => ({
        id: c.id,
        kind: c.kind,
        startDate: c.startDate,
        employee: { id: c.employee.id, name: name(c.employee) },
        progress: c.progress,
        overdue: c.tasks.filter((t) => t.overdue).length,
      })),
      events: events.slice(0, 6),
      teams,
    };
  }

  private lastDays(today: string, n: number) {
    return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
  }

  /** For each day, the percentage of people present (checked in, marked present, or on a field/WFH leave). */
  private async presentShare(ids: string[], days: string[]) {
    const [records, leaves] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where: {
          employeeId: { in: ids },
          date: { gte: toDate(days[0]!), lte: toDate(days.at(-1)!) },
        },
        select: { employeeId: true, date: true, status: true },
      }),
      this.leave.approvedBetween(ids, days[0]!, days.at(-1)!),
    ]);
    return days.map((d) => {
      if (isWeekend(d) || !ids.length)
        return { date: d, label: short(d).split(',')[0]!, pct: 0, weekend: isWeekend(d) };
      let present = 0;
      for (const id of ids) {
        const l = leaves.find(
          (x) => x.employeeId === id && isoDay(x.startDate) <= d && isoDay(x.endDate) >= d,
        );
        if (l) {
          if (l.leaveType.countsAsPresent) present++;
          continue;
        }
        const r = records.find((x) => x.employeeId === id && isoDay(x.date) === d);
        if (r?.status === 'P') present++;
        else if (r?.status === 'HD') present += 0.5;
      }
      return {
        date: d,
        label: new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        }),
        pct: Math.round((present / ids.length) * 100),
        weekend: false,
      };
    });
  }

  /** Average daily attendance for each of the last five months (weekdays up to today). */
  private async monthlyShare(ids: string[], today: string) {
    const out: { label: string; pct: number }[] = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - i);
      const start = isoDay(d);
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      const last = isoDay(end) < today ? isoDay(end) : today;
      const days: string[] = [];
      for (let x = start; x <= last; x = addDays(x, 1)) if (!isWeekend(x)) days.push(x);
      const share = days.length ? await this.presentShare(ids, days) : [];
      const counted = share.filter((s) => !s.weekend);
      out.push({
        label: d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
        pct: counted.length
          ? Math.round(counted.reduce((n, s) => n + s.pct, 0) / counted.length)
          : 0,
      });
    }
    return out;
  }

  private range(start: string, end: string) {
    const f = (d: string) =>
      new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });
    return start === end ? f(start) : `${f(start)} – ${f(end)}`;
  }
}
