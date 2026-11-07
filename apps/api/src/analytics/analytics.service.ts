import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { REPORT_KEYS, ReportKey, ReportRange, SavedReportInput } from '@hrms/shared';
import { addDays, istMinutes, isoDay, LATE_AFTER_MINUTES, todayIst, toDate } from '../attendance/days';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'detail';
interface Kpi {
  label: string;
  value: string;
  delta?: string;
  tone?: Tone;
  deltaTone?: Tone;
  icon: 'users' | 'trend' | 'exit' | 'clock' | 'alert' | 'wallet' | 'calendar' | 'check';
}
export interface Report {
  key: ReportKey;
  title: string;
  period: string;
  sources: string;
  kpis: Kpi[];
  bars: { title: string; caption: string; unit: string; labels: string[]; values: number[] };
  ranked: { title: string; caption: string; unit: string; rows: { label: string; value: number; tone?: Tone }[] };
  insights: { tone: Tone; text: string }[];
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => `${MONTH[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const monthEnd = (m: string) => {
  const [y, mo] = m.split('-').map(Number) as [number, number];
  return isoDay(new Date(Date.UTC(y, mo, 0)));
};
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const num = (n: number) => n.toLocaleString('en-IN');
const inr = (n: number) =>
  n >= 1_00_00_000
    ? `₹ ${(n / 1_00_00_000).toFixed(2)} Cr`
    : n >= 1_00_000
      ? `₹ ${(n / 1_00_000).toFixed(1)} L`
      : `₹ ${num(Math.round(n))}`;
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

/** The months a range covers, oldest first: the last 12, the last 3, or the Indian financial year so far. */
export function monthsFor(range: ReportRange, today = todayIst()): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const count =
    range === '12m' ? 12 : range === 'q' ? 3 : (m >= 4 ? m - 4 : m + 8) + 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

const KEYWORDS: [ReportKey, RegExp][] = [
  ['attrition', /attrition|exit|leaver|leaving|turnover|retention|resign|quit/i],
  ['payroll', /payroll|salar|pay\b|cost|ctc|wage|gross|net pay/i],
  ['overtime', /overtime|extra hours|\bot\b/i],
  ['claims', /claim|expense|reimburse/i],
  ['leave', /leave|vacation|time off|holiday|sick/i],
  ['attendance', /attendance|absent|late|presence|punctual|check.?in/i],
  ['diversity', /gender|diversity|women|female|inclusion/i],
  ['learning', /learning|training|course|upskill/i],
  ['headcount', /headcount|hiring|joiner|growth|team size|how many|people/i],
];

/** Which built-in report answers a question, or null. */
export function matchReport(question: string): ReportKey | null {
  return KEYWORDS.find(([, re]) => re.test(question))?.[0] ?? null;
}

/**
 * Reports computed from the workspace's own records. Every number comes from the database at
 * the time of asking; nothing is sampled or estimated except where a label says so.
 * Payroll cost needs `payroll.manage` as well, so salary totals stay with the people who run payroll.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
  ) {}

  catalog() {
    const payroll = this.access.can('payroll.manage');
    return REPORT_KEYS.filter((k) => k !== 'payroll' || payroll);
  }

  async ask(question: string, range: ReportRange) {
    const key = matchReport(question);
    if (!key || !this.catalog().includes(key)) return { matched: null, report: null };
    return { matched: key, report: await this.report(key, range) };
  }

  async report(key: ReportKey, range: ReportRange): Promise<Report> {
    if (key === 'payroll' && !this.access.can('payroll.manage'))
      throw new ForbiddenException('Payroll cost needs payroll access');
    const months = monthsFor(range);
    const from = `${months[0]}-01`;
    const to = monthEnd(months[months.length - 1]!);
    const period =
      range === 'fy'
        ? `FY to date · ${monthLabel(months[0]!)} – ${monthLabel(months[months.length - 1]!)}`
        : `${monthLabel(months[0]!)} – ${monthLabel(months[months.length - 1]!)}`;
    const ctx = { months, from, to, period };
    switch (key) {
      case 'headcount':
        return this.headcount(ctx);
      case 'attrition':
        return this.attrition(ctx);
      case 'leave':
        return this.leave(ctx);
      case 'attendance':
        return this.attendance(ctx);
      case 'overtime':
        return this.overtime(ctx);
      case 'claims':
        return this.claims(ctx);
      case 'payroll':
        return this.payroll(ctx);
      case 'diversity':
        return this.diversity(ctx);
      case 'learning':
        return this.learning(ctx);
    }
  }

  // ---------- helpers ----------

  private async people() {
    const rows = await this.prisma.db.employee.findMany({
      select: {
        id: true,
        dateOfJoining: true,
        dateOfExit: true,
        status: true,
        employmentType: true,
        department: { select: { name: true } },
        profile: { select: { gender: true } },
      },
    });
    return rows.map((e) => ({
      id: e.id,
      joined: isoDay(e.dateOfJoining),
      exited: e.dateOfExit ? isoDay(e.dateOfExit) : e.status === 'EXITED' ? isoDay(e.dateOfJoining) : null,
      dept: e.department?.name ?? 'No department',
      type: e.employmentType,
      gender: e.profile?.gender ?? 'UNDISCLOSED',
    }));
  }

  private static onRoll(p: { joined: string; exited: string | null }, day: string) {
    return p.joined <= day && (!p.exited || p.exited > day);
  }

  private ranked(map: Map<string, number>, opts: { top?: number; warnAbove?: number; dangerAbove?: number } = {}) {
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, opts.top ?? 8)
      .map(([label, value]) => ({
        label,
        value: Math.round(value * 10) / 10,
        tone:
          opts.dangerAbove !== undefined && value > opts.dangerAbove
            ? ('danger' as const)
            : opts.warnAbove !== undefined && value > opts.warnAbove
              ? ('warning' as const)
              : undefined,
      }));
  }

  private byMonth<T>(rows: T[], dateOf: (r: T) => string, valueOf: (r: T) => number, months: string[]) {
    const m = new Map(months.map((x) => [x, 0]));
    for (const r of rows) {
      const k = dateOf(r).slice(0, 7);
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + valueOf(r));
    }
    return months.map((x) => Math.round((m.get(x) ?? 0) * 10) / 10);
  }

  // ---------- reports ----------

  private async headcount(c: Ctx): Promise<Report> {
    const people = await this.people();
    const today = todayIst();
    const now = people.filter((p) => AnalyticsService.onRoll(p, today));
    const atStart = people.filter((p) => AnalyticsService.onRoll(p, addDays(c.from, -1))).length;
    const joiners = people.filter((p) => p.joined >= c.from && p.joined <= c.to).length;
    const exits = people.filter((p) => p.exited && p.exited >= c.from && p.exited <= c.to).length;
    const series = c.months.map((m) => people.filter((p) => AnalyticsService.onRoll(p, m === today.slice(0, 7) ? today : monthEnd(m))).length);
    const byDept = new Map<string, number>();
    for (const p of now) byDept.set(p.dept, (byDept.get(p.dept) ?? 0) + 1);
    const top = [...byDept.entries()].sort((a, b) => b[1] - a[1])[0];
    const contractors = now.filter((p) => p.type !== 'FULL_TIME').length;
    const growth = pct(now.length - atStart, atStart);
    return {
      key: 'headcount',
      title: 'Headcount report',
      period: c.period,
      sources: `Built from ${plural(people.length, 'employee record')}`,
      kpis: [
        { label: 'Headcount today', value: num(now.length), delta: atStart ? `${growth >= 0 ? '+' : ''}${growth}% in period` : undefined, icon: 'users' },
        { label: 'Joiners', value: num(joiners), tone: 'success', icon: 'trend' },
        { label: 'Exits', value: num(exits), tone: 'warning', icon: 'exit' },
        { label: 'Net change', value: `${joiners - exits >= 0 ? '+' : ''}${joiners - exits}`, tone: 'info', icon: 'calendar' },
      ],
      bars: { title: 'Headcount by month', caption: 'People on the rolls at month end', unit: 'people', labels: c.months.map(monthLabel), values: series },
      ranked: { title: 'People by department', caption: 'Today', unit: 'people', rows: this.ranked(byDept) },
      insights: [
        ...(top ? [{ tone: 'info' as const, text: `${top[0]} is the largest team with ${plural(top[1], 'person', 'people')}, ${pct(top[1], now.length)}% of the company.` }] : []),
        { tone: joiners >= exits ? 'success' : 'warning', text: `${plural(joiners, 'person', 'people')} joined and ${plural(exits, 'person', 'people')} left in this period.` },
        ...(contractors ? [{ tone: 'detail' as const, text: `${plural(contractors, 'person', 'people')} (${pct(contractors, now.length)}%) are not full-time employees.` }] : []),
      ],
    };
  }

  private async attrition(c: Ctx): Promise<Report> {
    const people = await this.people();
    const exits = people.filter((p) => p.exited && p.exited >= c.from && p.exited <= c.to);
    const avgHead = (people.filter((p) => AnalyticsService.onRoll(p, c.from)).length + people.filter((p) => AnalyticsService.onRoll(p, c.to)).length) / 2;
    const rate = pct(exits.length, avgHead);
    const tenure = exits.length
      ? exits.reduce((n, p) => n + (Date.parse(p.exited!) - Date.parse(p.joined)) / (365.25 * 86_400_000), 0) / exits.length
      : 0;
    const early = exits.filter((p) => Date.parse(p.exited!) - Date.parse(p.joined) < 365 * 86_400_000).length;
    const depts = new Set(people.map((p) => p.dept));
    const byDept = new Map<string, number>();
    for (const d of depts) {
      const inDept = people.filter((p) => p.dept === d);
      const head = (inDept.filter((p) => AnalyticsService.onRoll(p, c.from)).length + inDept.filter((p) => AnalyticsService.onRoll(p, c.to)).length) / 2;
      const out = exits.filter((p) => p.dept === d).length;
      if (head || out) byDept.set(d, pct(out, Math.max(head, out)));
    }
    const worst = [...byDept.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      key: 'attrition',
      title: 'Attrition report',
      period: c.period,
      sources: `Built from ${plural(people.length, 'employee record')} and ${plural(exits.length, 'exit')}`,
      kpis: [
        { label: 'Attrition rate', value: `${rate}%`, delta: 'Exits ÷ average headcount', icon: 'trend' },
        { label: 'Exits', value: num(exits.length), tone: 'warning', icon: 'exit' },
        { label: 'Avg tenure at exit', value: exits.length ? `${tenure.toFixed(1)} yrs` : '–', tone: 'info', icon: 'clock' },
        { label: 'Left in first year', value: num(early), tone: 'danger', deltaTone: 'danger', delta: exits.length ? `${pct(early, exits.length)}% of exits` : undefined, icon: 'alert' },
      ],
      bars: { title: 'Exits by month', caption: 'By last working day', unit: 'exits', labels: c.months.map(monthLabel), values: this.byMonth(exits, (p) => p.exited!, () => 1, c.months) },
      ranked: { title: 'Attrition by department', caption: 'Rate over the period', unit: '%', rows: this.ranked(byDept, { warnAbove: rate, dangerAbove: rate * 1.5 }) },
      insights: exits.length
        ? [
            ...(worst && worst[1] > rate ? [{ tone: 'danger' as const, text: `${worst[0]} has the highest attrition at ${worst[1]}%, against ${rate}% for the company.` }] : []),
            { tone: early ? 'warning' : 'success', text: early ? `${plural(early, 'person', 'people')} left within a year of joining. Look at onboarding and early manager check-ins.` : 'Nobody who left had been here less than a year.' },
          ]
        : [{ tone: 'success', text: 'Nobody left in this period.' }],
    };
  }

  private async leave(c: Ctx): Promise<Report> {
    const rows = await this.prisma.db.leaveRequest.findMany({
      where: { startDate: { gte: toDate(c.from), lte: toDate(c.to) } },
      select: { startDate: true, days: true, status: true, employeeId: true, leaveType: { select: { name: true } }, employee: { select: { department: { select: { name: true } } } } },
    });
    const approved = rows.filter((r) => r.status === 'APPROVED');
    const days = approved.reduce((n, r) => n + Number(r.days), 0);
    const people = new Set(approved.map((r) => r.employeeId)).size;
    const byType = new Map<string, number>();
    for (const r of approved) byType.set(r.leaveType.name, (byType.get(r.leaveType.name) ?? 0) + Number(r.days));
    const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
    const pending = rows.filter((r) => r.status === 'PENDING').length;
    const headcount = await this.prisma.db.employee.count({ where: { status: { not: 'EXITED' } } });
    return {
      key: 'leave',
      title: 'Leave report',
      period: c.period,
      sources: `Built from ${plural(rows.length, 'leave request')}`,
      kpis: [
        { label: 'Days taken', value: num(days), icon: 'calendar' },
        { label: 'Per person', value: headcount ? (days / headcount).toFixed(1) : '–', delta: 'Across everyone on the rolls', tone: 'info', icon: 'users' },
        { label: 'Waiting for a decision', value: num(pending), tone: 'warning', icon: 'clock' },
        { label: 'Most used', value: top?.[0] ?? '–', tone: 'success', icon: 'check' },
      ],
      bars: { title: 'Leave days by month', caption: 'Approved leave, by start date', unit: 'days', labels: c.months.map(monthLabel), values: this.byMonth(approved, (r) => isoDay(r.startDate), (r) => Number(r.days), c.months) },
      ranked: { title: 'Days by leave type', caption: 'Approved', unit: 'days', rows: this.ranked(byType) },
      insights: approved.length
        ? [
            { tone: 'info', text: `${plural(people, 'person', 'people')} took ${plural(days, 'day')} of leave in this period.` },
            ...(top ? [{ tone: 'detail' as const, text: `${top[0]} leave makes up ${pct(top[1], days)}% of days taken.` }] : []),
            ...(pending ? [{ tone: 'warning' as const, text: `${plural(pending, 'request')} still need a decision.` }] : []),
          ]
        : [{ tone: 'info', text: 'No approved leave in this period yet.' }],
    };
  }

  private async attendance(c: Ctx): Promise<Report> {
    const rows = await this.prisma.db.attendanceRecord.findMany({
      where: { date: { gte: toDate(c.from), lte: toDate(c.to) } },
      select: { date: true, status: true, checkIn: true, employee: { select: { department: { select: { name: true } } } } },
    });
    const score = (s: string) => (s === 'P' ? 1 : s === 'HD' ? 0.5 : 0);
    const present = rows.reduce((n, r) => n + score(r.status), 0);
    const late = rows.filter((r) => r.checkIn && istMinutes(r.checkIn) > LATE_AFTER_MINUTES).length;
    const absent = rows.filter((r) => r.status === 'A').length;
    const monthly = c.months.map((m) => {
      const inMonth = rows.filter((r) => isoDay(r.date).startsWith(m));
      return pct(inMonth.reduce((n, r) => n + score(r.status), 0), inMonth.length);
    });
    const byDept = new Map<string, [number, number]>();
    for (const r of rows) {
      const d = r.employee.department?.name ?? 'No department';
      const [p, t] = byDept.get(d) ?? [0, 0];
      byDept.set(d, [p + score(r.status), t + 1]);
    }
    const deptPct = new Map([...byDept.entries()].map(([d, [p, t]]) => [d, pct(p, t)]));
    const lowest = [...deptPct.entries()].sort((a, b) => a[1] - b[1])[0];
    const overall = pct(present, rows.length);
    return {
      key: 'attendance',
      title: 'Attendance report',
      period: c.period,
      sources: `Built from ${plural(rows.length, 'attendance mark')}`,
      kpis: [
        { label: 'Presence', value: rows.length ? `${overall}%` : '–', delta: 'Of marked working days', icon: 'check' },
        { label: 'Late check-ins', value: num(late), delta: 'After 10:00', tone: 'warning', icon: 'clock' },
        { label: 'Absent days', value: num(absent), tone: 'danger', icon: 'alert' },
        { label: 'Days marked', value: num(rows.length), tone: 'info', icon: 'calendar' },
      ],
      bars: { title: 'Presence by month', caption: 'Share of marked days present', unit: '%', labels: c.months.map(monthLabel), values: monthly },
      ranked: { title: 'Presence by department', caption: 'Share of marked days present', unit: '%', rows: this.ranked(deptPct) },
      insights: rows.length
        ? [
            ...(lowest ? [{ tone: lowest[1] < overall ? ('warning' as const) : ('info' as const), text: `${lowest[0]} has the lowest presence at ${lowest[1]}%, against ${overall}% overall.` }] : []),
            { tone: late ? 'warning' : 'success', text: late ? `${plural(late, 'check-in')} came after 10:00 (${pct(late, rows.length)}% of marked days).` : 'No late check-ins in this period.' },
          ]
        : [{ tone: 'info', text: 'No attendance has been marked in this period yet.' }],
    };
  }

  private async overtime(c: Ctx): Promise<Report> {
    const rows = await this.prisma.db.overtimeRequest.findMany({
      where: { date: { gte: toDate(c.from), lte: toDate(c.to) } },
      select: { date: true, hours: true, status: true, employeeId: true, employee: { select: { department: { select: { name: true } } } } },
    });
    const ok = rows.filter((r) => r.status === 'APPROVED' || r.status === 'PAID');
    const hours = ok.reduce((n, r) => n + Number(r.hours), 0);
    const byDept = new Map<string, number>();
    for (const r of ok) {
      const d = r.employee.department?.name ?? 'No department';
      byDept.set(d, (byDept.get(d) ?? 0) + Number(r.hours));
    }
    const top = [...byDept.entries()].sort((a, b) => b[1] - a[1])[0];
    const pending = rows.filter((r) => r.status === 'PENDING').length;
    return {
      key: 'overtime',
      title: 'Overtime report',
      period: c.period,
      sources: `Built from ${plural(rows.length, 'overtime request')}`,
      kpis: [
        { label: 'Approved hours', value: num(hours), icon: 'clock' },
        { label: 'People', value: num(new Set(ok.map((r) => r.employeeId)).size), tone: 'info', icon: 'users' },
        { label: 'Waiting for a decision', value: num(pending), tone: 'warning', icon: 'alert' },
        { label: 'Avg per request', value: ok.length ? `${(hours / ok.length).toFixed(1)} h` : '–', tone: 'detail', icon: 'calendar' },
      ],
      bars: { title: 'Overtime hours by month', caption: 'Approved and paid', unit: 'hours', labels: c.months.map(monthLabel), values: this.byMonth(ok, (r) => isoDay(r.date), (r) => Number(r.hours), c.months) },
      ranked: { title: 'Hours by department', caption: 'Approved and paid', unit: 'hours', rows: this.ranked(byDept) },
      insights: ok.length
        ? [...(top ? [{ tone: 'warning' as const, text: `${top[0]} logged the most overtime: ${num(top[1])} hours, ${pct(top[1], hours)}% of the total.` }] : [])]
        : [{ tone: 'info', text: 'No approved overtime in this period.' }],
    };
  }

  private async claims(c: Ctx): Promise<Report> {
    const rows = await this.prisma.db.expenseClaim.findMany({
      where: { spentOn: { gte: toDate(c.from), lte: toDate(c.to) } },
      select: { spentOn: true, amount: true, status: true, category: { select: { name: true } } },
    });
    const ok = rows.filter((r) => r.status === 'APPROVED' || r.status === 'PAID');
    const total = ok.reduce((n, r) => n + r.amount, 0);
    const byCat = new Map<string, number>();
    for (const r of ok) byCat.set(r.category.name, (byCat.get(r.category.name) ?? 0) + r.amount);
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    const pending = rows.filter((r) => r.status === 'PENDING');
    return {
      key: 'claims',
      title: 'Expense claims report',
      period: c.period,
      sources: `Built from ${plural(rows.length, 'expense claim')}`,
      kpis: [
        { label: 'Approved', value: inr(total), icon: 'wallet' },
        { label: 'Claims', value: num(ok.length), tone: 'info', icon: 'check' },
        { label: 'Average claim', value: ok.length ? inr(total / ok.length) : '–', tone: 'detail', icon: 'trend' },
        { label: 'Waiting', value: inr(pending.reduce((n, r) => n + r.amount, 0)), delta: plural(pending.length, 'claim'), tone: 'warning', icon: 'clock' },
      ],
      bars: { title: 'Approved spend by month', caption: 'By date spent', unit: '₹', labels: c.months.map(monthLabel), values: this.byMonth(ok, (r) => isoDay(r.spentOn), (r) => r.amount, c.months) },
      ranked: { title: 'Spend by category', caption: 'Approved and paid', unit: '₹', rows: this.ranked(byCat) },
      insights: ok.length && top ? [{ tone: 'info', text: `${top[0]} is the biggest category at ${inr(top[1])}, ${pct(top[1], total)}% of approved spend.` }] : [{ tone: 'info', text: 'No approved claims in this period.' }],
    };
  }

  private async payroll(c: Ctx): Promise<Report> {
    const runs = await this.prisma.db.payrollRun.findMany({
      where: { month: { in: c.months } },
      orderBy: { month: 'asc' },
    });
    const slips = await this.prisma.db.payslip.findMany({
      where: { runId: { in: runs.map((r) => r.id) } },
      select: { gross: true, runId: true, employee: { select: { department: { select: { name: true } } } } },
    });
    const latest = runs[runs.length - 1];
    const headLatest = latest ? slips.filter((s) => s.runId === latest.id).length : 0;
    const byDept = new Map<string, number>();
    for (const s of slips) {
      const d = s.employee.department?.name ?? 'No department';
      byDept.set(d, (byDept.get(d) ?? 0) + s.gross);
    }
    const total = runs.reduce((n, r) => n + r.ctc, 0);
    return {
      key: 'payroll',
      title: 'Payroll cost report',
      period: c.period,
      sources: `Built from ${plural(runs.length, 'payroll run')} and ${plural(slips.length, 'payslip')}`,
      kpis: [
        { label: 'Cost to company', value: inr(total), delta: 'Gross plus employer PF and ESI', icon: 'wallet' },
        { label: latest ? `Gross · ${monthLabel(latest.month)}` : 'Latest gross', value: latest ? inr(latest.gross) : '–', tone: 'info', icon: 'calendar' },
        { label: 'Statutory', value: inr(runs.reduce((n, r) => n + r.statutory, 0)), delta: 'PF, ESI, PT and TDS', tone: 'warning', icon: 'check' },
        { label: 'Cost per person', value: latest && headLatest ? inr(latest.ctc / headLatest) : '–', delta: 'Latest month', tone: 'detail', icon: 'users' },
      ],
      bars: { title: 'Gross pay by month', caption: 'Every run, draft or final', unit: '₹', labels: c.months.map(monthLabel), values: c.months.map((m) => runs.find((r) => r.month === m)?.gross ?? 0) },
      ranked: { title: 'Gross pay by department', caption: 'Across the period', unit: '₹', rows: this.ranked(byDept) },
      insights: runs.length
        ? [
            ...(runs.some((r) => r.status === 'DRAFT') ? [{ tone: 'warning' as const, text: 'Some months are still drafts, so totals can change before they are locked.' }] : []),
            { tone: 'info', text: `Statutory deductions and employer contributions are ${pct(runs.reduce((n, r) => n + r.statutory, 0), runs.reduce((n, r) => n + r.gross, 0))}% of gross pay.` },
          ]
        : [{ tone: 'info', text: 'No payroll has been run in this period yet.' }],
    };
  }

  private async diversity(c: Ctx): Promise<Report> {
    const people = (await this.people()).filter((p) => AnalyticsService.onRoll(p, todayIst()));
    const count = (g: string) => people.filter((p) => p.gender === g).length;
    const women = count('FEMALE');
    const byDept = new Map<string, number>();
    for (const d of new Set(people.map((p) => p.dept))) {
      const inDept = people.filter((p) => p.dept === d);
      byDept.set(d, pct(inDept.filter((p) => p.gender === 'FEMALE').length, inDept.length));
    }
    const joiners = (await this.people()).filter((p) => p.joined >= c.from && p.joined <= c.to);
    const undisclosed = count('UNDISCLOSED');
    return {
      key: 'diversity',
      title: 'Gender diversity report',
      period: c.period,
      sources: `Built from ${plural(people.length, 'current employee')}. Gender comes from personal details people fill in.`,
      kpis: [
        { label: 'Women', value: `${pct(women, people.length)}%`, delta: plural(women, 'person', 'people'), icon: 'users' },
        { label: 'Men', value: `${pct(count('MALE'), people.length)}%`, tone: 'info', icon: 'users' },
        { label: 'Non-binary', value: num(count('NON_BINARY')), tone: 'detail', icon: 'users' },
        { label: 'Not given', value: num(undisclosed), tone: 'warning', icon: 'alert' },
      ],
      bars: { title: 'Women among joiners', caption: 'Share of each month’s joiners', unit: '%', labels: c.months.map(monthLabel), values: c.months.map((m) => { const j = joiners.filter((p) => p.joined.startsWith(m)); return pct(j.filter((p) => p.gender === 'FEMALE').length, j.length); }) },
      ranked: { title: 'Women by department', caption: 'Share of current team', unit: '%', rows: this.ranked(byDept) },
      insights: [
        ...(undisclosed ? [{ tone: 'warning' as const, text: `${plural(undisclosed, 'person', 'people')} haven't given their gender, so these figures are incomplete.` }] : []),
        ...[...byDept.entries()].filter(([, v]) => v === 0).slice(0, 1).map(([d]) => ({ tone: 'info' as const, text: `${d} has no women today.` })),
      ],
    };
  }

  private async learning(c: Ctx): Promise<Report> {
    const rows = await this.prisma.db.enrollment.findMany({
      where: { course: { startsOn: { lte: toDate(c.to) }, endsOn: { gte: toDate(c.from) } } },
      select: { progress: true, completedAt: true, course: { select: { title: true, hours: true, mandatory: true, endsOn: true } } },
    });
    const done = rows.filter((r) => r.progress >= 100);
    const overdue = rows.filter((r) => r.course.mandatory && r.progress < 100 && isoDay(r.course.endsOn) < todayIst()).length;
    const byCourse = new Map<string, [number, number]>();
    for (const r of rows) {
      const [d, t] = byCourse.get(r.course.title) ?? [0, 0];
      byCourse.set(r.course.title, [d + (r.progress >= 100 ? 1 : 0), t + 1]);
    }
    const hours = rows.reduce((n, r) => n + (r.progress / 100) * Number(r.course.hours), 0);
    return {
      key: 'learning',
      title: 'Learning report',
      period: c.period,
      sources: `Built from ${plural(rows.length, 'enrolment')}`,
      kpis: [
        { label: 'Completion', value: rows.length ? `${pct(done.length, rows.length)}%` : '–', icon: 'check' },
        { label: 'Enrolments', value: num(rows.length), tone: 'info', icon: 'users' },
        { label: 'Learning hours', value: `${num(Math.round(hours))} h`, tone: 'detail', icon: 'clock' },
        { label: 'Mandatory overdue', value: num(overdue), tone: 'danger', icon: 'alert' },
      ],
      bars: { title: 'Completions by month', caption: 'When people finished a course', unit: 'completions', labels: c.months.map(monthLabel), values: this.byMonth(done.filter((r) => r.completedAt), (r) => r.completedAt!.toISOString(), () => 1, c.months) },
      ranked: { title: 'Completion by course', caption: 'Share of enrolled people who finished', unit: '%', rows: this.ranked(new Map([...byCourse.entries()].map(([k, [d, t]]) => [k, pct(d, t)]))) },
      insights: overdue
        ? [{ tone: 'danger', text: `${plural(overdue, 'person', 'people')} missed the deadline on a mandatory course.` }]
        : [{ tone: 'success', text: 'Nobody is overdue on a mandatory course.' }],
    };
  }

  // ---------- saved reports ----------

  async saved() {
    const rows = await this.prisma.db.savedReport.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const allowed = this.catalog();
    return rows.filter((r) => allowed.includes(r.reportKey as ReportKey));
  }

  async save(input: SavedReportInput) {
    if (!this.catalog().includes(input.reportKey)) throw new ForbiddenException('You can’t see that report');
    return this.prisma.db.savedReport.create({
      data: {
        tenantId: requireTenantId(),
        name: input.name,
        reportKey: input.reportKey,
        range: input.range,
        createdById: currentContext()?.userId ?? null,
      },
    });
  }

  async remove(id: string) {
    const r = await this.prisma.db.savedReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Saved report not found');
    await this.prisma.db.savedReport.delete({ where: { id } });
  }
}

interface Ctx {
  months: string[];
  from: string;
  to: string;
  period: string;
}
