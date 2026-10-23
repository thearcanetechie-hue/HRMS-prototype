import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MarkFiledInput, SalaryStructureInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { WorkCalendarService } from '../attendance/calendar';
import { eachDay, isoDay, todayIst, toDate } from '../attendance/days';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { FieldCrypto } from '../crypto/field-crypto';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculate, daysInMonth } from './calc';

type Flag = { tag: string; reason: string; tone: 'warning' | 'danger' | 'accent' | 'info' };

const monthBounds = (month: string) => ({
  start: `${month}-01`,
  end: `${month}-${String(daysInMonth(month)).padStart(2, '0')}`,
});
const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};

const payslipInclude = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      department: { select: { name: true } },
      designation: { select: { name: true } },
      location: { select: { name: true, state: true } },
    },
  },
  run: { select: { id: true, month: true, status: true } },
} satisfies Prisma.PayslipInclude;

/**
 * Salaries, monthly payroll runs, payslips and statutory filings.
 *
 * A run moves DRAFT → LOCKED → PAID. While DRAFT it can be recalculated from the latest
 * salaries, attendance, leave, approved overtime and approved claims. Locking needs every
 * flagged payslip reviewed. Paying marks the included overtime and claims as paid, and makes
 * payslips visible to employees (they can also see them once locked).
 *
 * The maths lives in calc.ts and must be checked by a chartered accountant before real use.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
    private readonly calendar: WorkCalendarService,
  ) {}

  // ---------- salaries ----------

  async salaries() {
    const today = toDate(todayIst());
    const employees = await this.prisma.db.employee.findMany({
      where: { status: { not: 'EXITED' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        department: { select: { name: true } },
        salaries: {
          where: { effectiveFrom: { lte: today } },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ firstName: 'asc' }],
    });
    return employees.map(({ salaries, ...e }) => ({
      ...e,
      salary: salaries[0] ? this.presentSalary(salaries[0]) : null,
    }));
  }

  async salaryOf(employeeId: string) {
    const self = await this.access.isSelf(employeeId);
    if (!self && !this.access.can('payroll.manage'))
      throw new NotFoundException('Salary not found');
    const rows = await this.prisma.db.salaryStructure.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
    });
    const today = todayIst();
    return {
      current: rows.find((r) => isoDay(r.effectiveFrom) <= today)
        ? this.presentSalary(rows.find((r) => isoDay(r.effectiveFrom) <= today)!)
        : null,
      history: rows.map((r) => this.presentSalary(r)),
    };
  }

  async setSalary(employeeId: string, input: SalaryStructureInput) {
    const employee = await this.prisma.db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const effectiveFrom = toDate(input.effectiveFrom);
    const existing = await this.prisma.db.salaryStructure.findFirst({
      where: { employeeId, effectiveFrom },
    });
    const data = {
      annualCtc: input.annualCtc,
      basicPercent: input.basicPercent,
      metro: input.metro,
      createdById: currentContext().userId ?? null,
    };
    const row = existing
      ? await this.prisma.db.salaryStructure.update({ where: { id: existing.id }, data })
      : await this.prisma.db.salaryStructure.create({
          data: { ...data, tenantId: requireTenantId(), employeeId, effectiveFrom },
        });
    // Salary figures stay out of the audit log; only the fact and the date.
    await this.audit.record('payroll.salary_set', 'Employee', employeeId, {
      effectiveFrom: input.effectiveFrom,
    });
    return this.presentSalary(row);
  }

  private presentSalary(s: {
    annualCtc: number;
    basicPercent: number;
    metro: boolean;
    effectiveFrom: Date;
    id: string;
  }) {
    const p = calculate(
      { annualCtc: s.annualCtc, basicShare: s.basicPercent / 100, metro: s.metro, state: null },
      {
        month: todayIst().slice(0, 7),
        daysEmployed: 31,
        lopDays: 0,
        overtimeHours: 0,
        reimbursements: 0,
      },
    );
    return {
      id: s.id,
      annualCtc: s.annualCtc,
      basicPercent: s.basicPercent,
      metro: s.metro,
      effectiveFrom: isoDay(s.effectiveFrom),
      monthlyGross: p.fullGross,
    };
  }

  // ---------- runs ----------

  async runs() {
    return this.prisma.db.payrollRun.findMany({ orderBy: { month: 'desc' }, take: 24 });
  }

  async createRun(month: string) {
    if (month > todayIst().slice(0, 7))
      throw new BadRequestException('You can’t run payroll for a future month');
    const existing = await this.prisma.db.payrollRun.findFirst({ where: { month } });
    if (existing) return this.run(existing.id);
    const run = await this.prisma.db.payrollRun.create({
      data: { tenantId: requireTenantId(), month },
    });
    await this.compute(run.id, month);
    await this.audit.record('payroll.run_created', 'PayrollRun', run.id, { month });
    return this.run(run.id);
  }

  async recalculate(id: string) {
    const run = await this.getRun(id);
    if (run.status !== 'DRAFT')
      throw new BadRequestException('Only a draft run can be recalculated');
    await this.compute(run.id, run.month);
    await this.audit.record('payroll.run_recalculated', 'PayrollRun', id, { month: run.month });
    return this.run(id);
  }

  async run(id: string) {
    const run = await this.getRun(id);
    const { start, end } = monthBounds(run.month);
    const [payslips, pendingOvertime, pendingClaims] = await Promise.all([
      this.prisma.db.payslip.findMany({
        where: { runId: id },
        include: payslipInclude,
        orderBy: { employee: { firstName: 'asc' } },
      }),
      this.prisma.db.overtimeRequest.count({
        where: {
          status: { in: ['PENDING', 'ON_HOLD'] },
          date: { gte: toDate(start), lte: toDate(end) },
        },
      }),
      this.prisma.db.expenseClaim.count({
        where: { status: { in: ['PENDING', 'ON_HOLD'] }, spentOn: { lte: toDate(end) } },
      }),
    ]);
    const shaped = payslips.map((p) => this.presentPayslip(p));
    return {
      ...run,
      payslips: shaped,
      pendingOvertime,
      pendingClaims,
      flagged: shaped.filter((p) => p.flags.length).length,
      unreviewed: shaped.filter((p) => p.flags.length && !p.reviewed).length,
      split: {
        net: shaped.reduce((n, p) => n + p.net - p.reimbursements, 0),
        tds: shaped.reduce((n, p) => n + p.tds, 0),
        pf: shaped.reduce((n, p) => n + p.pf + p.employerPf, 0),
        esiPt: shaped.reduce((n, p) => n + p.esi + p.employerEsi + p.pt, 0),
        reimbursements: shaped.reduce((n, p) => n + p.reimbursements, 0),
      },
    };
  }

  async review(runId: string, payslipId: string) {
    const run = await this.getRun(runId);
    if (run.status !== 'DRAFT') throw new BadRequestException('This run is already locked');
    const p = await this.prisma.db.payslip.findFirst({ where: { id: payslipId, runId } });
    if (!p) throw new NotFoundException('Payslip not found');
    await this.prisma.db.payslip.update({ where: { id: payslipId }, data: { reviewed: true } });
    await this.audit.record('payroll.payslip_reviewed', 'PayrollRun', runId, {
      employeeId: p.employeeId,
    });
    return this.run(runId);
  }

  async lock(id: string) {
    const run = await this.run(id);
    if (run.status !== 'DRAFT') throw new BadRequestException('This run is already locked');
    if (!run.payslips.length) throw new BadRequestException('There is no one to pay this month');
    if (run.unreviewed)
      throw new BadRequestException(`Review the ${run.unreviewed} flagged payslips first`);
    await this.prisma.db.payrollRun.update({
      where: { id },
      data: { status: 'LOCKED', lockedAt: new Date() },
    });
    await this.audit.record('payroll.run_locked', 'PayrollRun', id, {
      month: run.month,
      net: run.net,
    });
    return this.run(id);
  }

  async unlock(id: string) {
    const run = await this.getRun(id);
    if (run.status !== 'LOCKED')
      throw new BadRequestException('Only a locked, unpaid run can be reopened');
    await this.prisma.db.payrollRun.update({
      where: { id },
      data: { status: 'DRAFT', lockedAt: null },
    });
    await this.audit.record('payroll.run_reopened', 'PayrollRun', id, { month: run.month });
    return this.run(id);
  }

  async markPaid(id: string) {
    const run = await this.getRun(id);
    if (run.status !== 'LOCKED')
      throw new BadRequestException('Lock the run before marking it paid');
    const payslips = await this.prisma.db.payslip.findMany({
      where: { runId: id },
      select: { claimIds: true, overtimeIds: true },
    });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollRun.update({ where: { id }, data: { status: 'PAID', paidAt: now } });
      await tx.expenseClaim.updateMany({
        where: {
          id: { in: payslips.flatMap((p) => p.claimIds) },
          tenantId: requireTenantId(),
          status: 'APPROVED',
        },
        data: { status: 'PAID', paidAt: now },
      });
      await tx.overtimeRequest.updateMany({
        where: {
          id: { in: payslips.flatMap((p) => p.overtimeIds) },
          tenantId: requireTenantId(),
          status: 'APPROVED',
        },
        data: { status: 'PAID' },
      });
    });
    await this.audit.record('payroll.run_paid', 'PayrollRun', id, { month: run.month });
    return this.run(id);
  }

  // ---------- payslips ----------

  async myPayslips() {
    const self = await this.access.selfEmployeeId();
    if (!self) return [];
    const rows = await this.prisma.db.payslip.findMany({
      where: { employeeId: self, run: { status: { in: ['LOCKED', 'PAID'] } } },
      include: payslipInclude,
      orderBy: { run: { month: 'desc' } },
    });
    return rows.map((p) => this.presentPayslip(p));
  }

  async payslip(id: string) {
    const p = await this.prisma.db.payslip.findUnique({ where: { id }, include: payslipInclude });
    if (!p) throw new NotFoundException('Payslip not found');
    const own = await this.access.isSelf(p.employeeId);
    const allowed = this.access.can('payroll.manage') || (own && p.run.status !== 'DRAFT');
    if (!allowed) throw new NotFoundException('Payslip not found');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: requireTenantId() },
      select: { name: true },
    });
    return { ...this.presentPayslip(p), company: tenant?.name ?? '' };
  }

  /**
   * Bank transfer file: one line per person with their full account number. Needs both
   * payroll.manage and employee.sensitive.read, and every download is logged.
   */
  async bankFile(id: string) {
    if (!this.access.can('employee.sensitive.read'))
      throw new ForbiddenException('You need permission to see bank account numbers');
    const run = await this.getRun(id);
    if (run.status === 'DRAFT') throw new BadRequestException('Lock the run first');
    const payslips = await this.prisma.db.payslip.findMany({
      where: { runId: id, net: { gt: 0 } },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            profile: {
              select: { bankAccountNumberEnc: true, bankIfsc: true, bankAccountHolder: true },
            },
          },
        },
      },
    });
    const tenantId = requireTenantId();
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ['Employee code,Name,Account holder,Account number,IFSC,Amount'];
    let missing = 0;
    for (const p of payslips) {
      const prof = p.employee.profile;
      const account = prof?.bankAccountNumberEnc
        ? this.crypto.decrypt(tenantId, 'bankAccountNumber', prof.bankAccountNumberEnc)
        : '';
      if (!account || !prof?.bankIfsc) missing++;
      const name = `${p.employee.firstName} ${p.employee.lastName}`.trim();
      lines.push(
        [
          p.employee.employeeCode,
          name,
          prof?.bankAccountHolder ?? name,
          account,
          prof?.bankIfsc ?? '',
          String(p.net),
        ]
          .map(esc)
          .join(','),
      );
    }
    await this.audit.record('payroll.bank_file_downloaded', 'PayrollRun', id, { month: run.month });
    return { csv: lines.join('\n') + '\n', fileName: `salaries-${run.month}.csv`, missing };
  }

  // ---------- compliance ----------

  async compliance(month: string) {
    const run = await this.prisma.db.payrollRun.findFirst({ where: { month } });
    const totals = run
      ? await this.prisma.db.payslip.aggregate({
          where: { runId: run.id },
          _sum: { pf: true, employerPf: true, esi: true, employerEsi: true, pt: true, tds: true },
        })
      : null;
    const s = totals?._sum;
    const due = nextMonth(month);
    const [y, m] = month.split('-').map(Number) as [number, number];
    const fyStart = m >= 4 ? y : y - 1;
    const fy = `FY${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
    const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4;
    const qDue = {
      1: `${fyStart}-07-31`,
      2: `${fyStart}-10-31`,
      3: `${fyStart + 1}-01-31`,
      4: `${fyStart + 1}-05-31`,
    }[q]!;
    const items = [
      {
        key: 'TDS',
        name: 'TDS payment',
        period: month,
        due: `${due}-07`,
        amount: s ? (s.tds ?? 0) : null,
      },
      {
        key: 'PF',
        name: 'PF ECR & challan',
        period: month,
        due: `${due}-15`,
        amount: s ? (s.pf ?? 0) + (s.employerPf ?? 0) : null,
      },
      {
        key: 'ESI',
        name: 'ESI contribution',
        period: month,
        due: `${due}-15`,
        amount: s ? (s.esi ?? 0) + (s.employerEsi ?? 0) : null,
      },
      {
        key: 'PT',
        name: 'Professional tax',
        period: month,
        due: `${due}-20`,
        amount: s ? (s.pt ?? 0) : null,
      },
      {
        key: '24Q',
        name: `TDS return · Form 24Q Q${q}`,
        period: `${fy}-Q${q}`,
        due: qDue,
        amount: null,
      },
      {
        key: 'FORM16',
        name: 'Form 16 to employees',
        period: fy,
        due: `${fyStart + 1}-06-15`,
        amount: null,
      },
    ];
    const filings = await this.prisma.db.complianceFiling.findMany({
      where: { OR: items.map((i) => ({ key: i.key, period: i.period })) },
    });
    const today = todayIst();
    return items
      .map((i) => {
        const filed = filings.find((f) => f.key === i.key && f.period === i.period);
        const days = Math.round((Date.parse(i.due) - Date.parse(today)) / 86_400_000);
        return {
          ...i,
          dueInDays: days,
          status: filed ? 'filed' : days < 0 ? 'overdue' : days <= 7 ? 'soon' : 'open',
          filedAt: filed?.filedAt ?? null,
          reference: filed?.reference ?? null,
        };
      })
      .sort((a, b) => a.due.localeCompare(b.due));
  }

  async markFiled(input: MarkFiledInput) {
    const row = await this.prisma.db.complianceFiling.upsert({
      where: {
        tenantId_key_period: { tenantId: requireTenantId(), key: input.key, period: input.period },
      },
      create: {
        tenantId: requireTenantId(),
        key: input.key,
        period: input.period,
        reference: input.reference ?? null,
        filedById: currentContext().userId ?? null,
      },
      update: { reference: input.reference ?? null, filedAt: new Date() },
    });
    await this.audit.record('payroll.filing_marked', 'ComplianceFiling', row.id, {
      key: input.key,
      period: input.period,
    });
    return row;
  }

  // ---------- the calculation ----------

  private async getRun(id: string) {
    const run = await this.prisma.db.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  /** Rebuilds every payslip in a draft run from current data. */
  private async compute(runId: string, month: string) {
    const { start, end } = monthBounds(month);
    const startD = toDate(start);
    const endD = toDate(end);
    const employees = await this.prisma.db.employee.findMany({
      where: {
        dateOfJoining: { lte: endD },
        OR: [{ dateOfExit: null }, { dateOfExit: { gte: startD } }],
        NOT: { status: 'EXITED', dateOfExit: null },
      },
      select: {
        id: true,
        firstName: true,
        dateOfJoining: true,
        dateOfExit: true,
        status: true,
        location: { select: { state: true } },
        salaries: {
          where: { effectiveFrom: { lte: endD } },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
    });
    const ids = employees.map((e) => e.id);
    const [records, leaves, overtime, claims] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where: {
          employeeId: { in: ids },
          date: { gte: startD, lte: endD },
          status: { in: ['A', 'HD'] },
        },
        select: { employeeId: true, status: true },
      }),
      this.prisma.db.leaveRequest.findMany({
        where: {
          employeeId: { in: ids },
          status: 'APPROVED',
          leaveType: { paid: false },
          startDate: { lte: endD },
          endDate: { gte: startD },
        },
        select: { employeeId: true, startDate: true, endDate: true, halfDay: true },
      }),
      this.prisma.db.overtimeRequest.findMany({
        where: { employeeId: { in: ids }, status: 'APPROVED', date: { gte: startD, lte: endD } },
        select: { id: true, employeeId: true, hours: true },
      }),
      this.prisma.db.expenseClaim.findMany({
        where: { employeeId: { in: ids }, status: 'APPROVED', spentOn: { lte: endD } },
        select: { id: true, employeeId: true, amount: true },
      }),
    ]);

    const rows: Prisma.PayslipCreateManyInput[] = [];
    // Unpaid leave counts only the person's working days, not weekly offs or holidays.
    const cal = await this.calendar.load(
      employees.map((e) => e.id),
      start,
      end,
    );
    for (const e of employees) {
      const flags: Flag[] = [];
      const joined = isoDay(e.dateOfJoining);
      const exit = e.dateOfExit ? isoDay(e.dateOfExit) : null;
      const from = joined > start ? joined : start;
      const to = exit && exit < end ? exit : end;
      const daysEmployed = eachDay(from, to).length;
      if (joined > start)
        flags.push({
          tag: 'New joiner',
          tone: 'accent',
          reason: `Joined ${short(joined)}, pay for ${daysEmployed} of ${daysInMonth(month)} days`,
        });
      if (exit && exit <= end)
        flags.push({
          tag: 'Exit',
          tone: 'danger',
          reason: `Last working day ${short(exit)}, prorate and settle full and final`,
        });

      let lop = 0;
      for (const r of records.filter((x) => x.employeeId === e.id))
        lop += r.status === 'HD' ? 0.5 : 1;
      for (const l of leaves.filter((x) => x.employeeId === e.id)) {
        if (l.halfDay) lop += 0.5;
        else
          lop += eachDay(
            isoDay(l.startDate) < start ? start : isoDay(l.startDate),
            isoDay(l.endDate) > end ? end : isoDay(l.endDate),
          ).filter((d) => cal.isWorking(e.id, d)).length;
      }
      if (lop)
        flags.push({
          tag: 'Loss of pay',
          tone: 'warning',
          reason: `${lop} unpaid ${lop === 1 ? 'day' : 'days'} (absent or unpaid leave)`,
        });

      const ot = overtime.filter((x) => x.employeeId === e.id);
      const cl = claims.filter((x) => x.employeeId === e.id);
      const overtimeHours = ot.reduce((n, x) => n + Number(x.hours), 0);
      const reimbursements = cl.reduce((n, x) => n + x.amount, 0);
      const salary = e.salaries[0];

      if (!salary) {
        flags.unshift({ tag: 'No salary', tone: 'danger', reason: 'Set a salary before paying' });
        rows.push({
          tenantId: requireTenantId(),
          runId,
          employeeId: e.id,
          lines: [],
          gross: 0,
          deductions: 0,
          net: 0,
          reimbursements: 0,
          payableDays: 0,
          daysInMonth: daysInMonth(month),
          lopDays: lop,
          overtimeHours,
          flags,
          claimIds: [],
          overtimeIds: [],
        });
        continue;
      }
      const p = calculate(
        {
          annualCtc: salary.annualCtc,
          basicShare: salary.basicPercent / 100,
          metro: salary.metro,
          state: e.location?.state ?? null,
        },
        { month, daysEmployed, lopDays: lop, overtimeHours, reimbursements },
      );
      if (p.esiApplies)
        flags.push({ tag: 'ESI', tone: 'warning', reason: `Gross under ₹ 21,000, so ESI applies` });
      if (!e.location?.state)
        flags.push({
          tag: 'No state',
          tone: 'info',
          reason: 'Set their work location’s state for professional tax',
        });
      rows.push({
        tenantId: requireTenantId(),
        runId,
        employeeId: e.id,
        lines: p.lines,
        gross: p.gross,
        deductions: p.deductions,
        net: p.net,
        pf: p.pf,
        esi: p.esi,
        pt: p.pt,
        tds: p.tds,
        employerPf: p.employerPf,
        employerEsi: p.employerEsi,
        reimbursements: p.reimbursements,
        payableDays: p.payableDays,
        daysInMonth: p.daysInMonth,
        lopDays: lop,
        overtimeHours,
        flags,
        claimIds: cl.map((x) => x.id),
        overtimeIds: ot.map((x) => x.id),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { runId } });
      if (rows.length) await tx.payslip.createMany({ data: rows });
      const sum = (k: 'gross' | 'net') => rows.reduce((n, r) => n + (r[k] as number), 0);
      const statutory = rows.reduce(
        (n, r) =>
          n +
          (r.pf ?? 0) +
          (r.employerPf ?? 0) +
          (r.esi ?? 0) +
          (r.employerEsi ?? 0) +
          (r.pt ?? 0) +
          (r.tds ?? 0),
        0,
      );
      await tx.payrollRun.update({
        where: { id: runId },
        data: {
          gross: sum('gross'),
          net: sum('net'),
          statutory,
          ctc: rows.reduce(
            (n, r) => n + (r.gross as number) + (r.employerPf ?? 0) + (r.employerEsi ?? 0),
            0,
          ),
        },
      });
    });
  }

  private presentPayslip(p: Prisma.PayslipGetPayload<{ include: typeof payslipInclude }>) {
    return {
      id: p.id,
      runId: p.runId,
      month: p.run.month,
      runStatus: p.run.status,
      employee: {
        id: p.employee.id,
        name: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
        firstName: p.employee.firstName,
        lastName: p.employee.lastName,
        employeeCode: p.employee.employeeCode,
        department: p.employee.department?.name ?? null,
        designation: p.employee.designation?.name ?? null,
        location: p.employee.location?.name ?? null,
      },
      lines: p.lines as { key: string; label: string; amount: number; kind: string }[],
      gross: p.gross,
      deductions: p.deductions,
      net: p.net,
      pf: p.pf,
      esi: p.esi,
      pt: p.pt,
      tds: p.tds,
      employerPf: p.employerPf,
      employerEsi: p.employerEsi,
      reimbursements: p.reimbursements,
      payableDays: Number(p.payableDays),
      daysInMonth: p.daysInMonth,
      lopDays: Number(p.lopDays),
      overtimeHours: Number(p.overtimeHours),
      flags: p.flags as Flag[],
      reviewed: p.reviewed,
    };
  }
}
