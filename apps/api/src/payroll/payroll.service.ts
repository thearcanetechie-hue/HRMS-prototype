import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MarkFiledInput, type PayrollPolicy, SalaryStructureInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { WorkCalendarService } from '../attendance/calendar';
import { eachDay, isoDay, todayIst, toDate } from '../attendance/days';
import { latePenaltyDays } from '../attendance/leave-balance';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { FieldCrypto } from '../crypto/field-crypto';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PolicyService } from '../policies/policies.module';
import { PrismaService } from '../prisma/prisma.service';
import { blend, calculate, daysInMonth, NO_DECLARATION, type PayItem, structure } from './calc';

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
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
const nextMonth = (month: string) => addMonths(month, 1);
const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const num = (n: number) => n.toLocaleString('en-IN');
/** April to March of a financial year. */
export const monthsOfFy = (fyStart: number) =>
  Array.from({ length: 12 }, (_, i) => addMonths(`${fyStart}-04`, i));
/** ESI contribution periods run April–September and October–March. */
export function esiContributionPeriod(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const startM = m >= 4 && m <= 9 ? `${y}-04` : m >= 10 ? `${y}-10` : `${y - 1}-10`;
  return Array.from({ length: 6 }, (_, i) => addMonths(startM, i));
}
const DEDUCTION_KINDS = new Set([
  'ADVANCE_RECOVERY',
  'LOAN_RECOVERY',
  'OTHER_DEDUCTION',
  'NOTICE_RECOVERY',
]);

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
    private readonly policies: PolicyService,
  ) {}

  // ---------- salaries ----------

  async salaries() {
    const policy = await this.policies.get('payroll');
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
      salary: salaries[0] ? this.presentSalary(policy, salaries[0]) : null,
    }));
  }

  async salaryOf(employeeId: string) {
    const self = await this.access.isSelf(employeeId);
    if (!self && !this.access.can('payroll.manage'))
      throw new NotFoundException('Salary not found');
    const policy = await this.policies.get('payroll');
    const rows = await this.prisma.db.salaryStructure.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
    });
    const today = todayIst();
    return {
      current: rows.find((r) => isoDay(r.effectiveFrom) <= today)
        ? this.presentSalary(
            policy,
            rows.find((r) => isoDay(r.effectiveFrom) <= today)!,
          )
        : null,
      history: rows.map((r) => this.presentSalary(policy, r)),
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
    return this.presentSalary(await this.policies.get('payroll'), row);
  }

  private presentSalary(
    policy: PayrollPolicy,
    s: {
      annualCtc: number;
      basicPercent: number;
      metro: boolean;
      effectiveFrom: Date;
      id: string;
    },
  ) {
    const full = structure(
      { annualCtc: s.annualCtc, basicShare: s.basicPercent / 100, metro: s.metro },
      policy,
    );
    return {
      id: s.id,
      annualCtc: s.annualCtc,
      basicPercent: s.basicPercent,
      metro: s.metro,
      effectiveFrom: isoDay(s.effectiveFrom),
      monthlyGross: full.gross,
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
    const attendanceClosed = Boolean(
      await this.prisma.db.attendanceMonth.findFirst({
        where: { month: run.month, status: 'CLOSED' },
      }),
    );
    return {
      ...run,
      attendanceClosed,
      payslips: shaped,
      pendingOvertime,
      pendingClaims,
      flagged: shaped.filter((p) => p.flags.length).length,
      unreviewed: shaped.filter((p) => p.flags.length && !p.reviewed).length,
      split: {
        net: shaped.reduce((n, p) => n + p.net - p.reimbursements, 0),
        tds: shaped.reduce((n, p) => n + p.tds, 0),
        pf: shaped.reduce((n, p) => n + p.pf + p.employerPf + p.edli + p.pfAdmin, 0),
        esiPt: shaped.reduce((n, p) => n + p.esi + p.employerEsi + p.pt + p.lwf + p.employerLwf, 0),
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
    const attendance = await this.prisma.db.attendanceMonth.findFirst({
      where: { month: run.month, status: 'CLOSED' },
    });
    if (!attendance)
      throw new BadRequestException(
        `Close ${monthName(run.month)} attendance first, so payslips match the register`,
      );
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
      select: { claimIds: true, overtimeIds: true, encashmentIds: true },
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
      await tx.leaveLedger.updateMany({
        where: {
          id: { in: payslips.flatMap((p) => p.encashmentIds) },
          tenantId: requireTenantId(),
        },
        data: { paidInRunId: id },
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

  /**
   * Rebuilds every payslip in a draft run from current data: salary (split across a mid-month
   * change), unpaid days (absences, unpaid leave, late-mark penalties), approved overtime and
   * claims, one-off pay items, arrears for back-dated raises, leave encashment, ESI coverage for
   * the contribution period, and TDS from the year so far and the person's declaration.
   */
  private async compute(runId: string, month: string) {
    const { start, end } = monthBounds(month);
    const startD = toDate(start);
    const endD = toDate(end);
    const [policy, attendancePolicy, leavePolicy] = await Promise.all([
      this.policies.get('payroll'),
      this.policies.get('attendance'),
      this.policies.get('leave'),
    ]);
    const fyStart =
      Number(month.slice(5, 7)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1;
    const fyMonths = monthsOfFy(fyStart);
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
        profile: { select: { dateOfBirth: true, uanEnc: true, panEnc: true } },
        salaries: { where: { effectiveFrom: { lte: endD } }, orderBy: { effectiveFrom: 'asc' } },
        taxDeclarations: { where: { fyStart } },
      },
    });
    const ids = employees.map((e) => e.id);
    const esiPeriod = esiContributionPeriod(month);
    const [records, leaves, overtime, claims, items, encash, history, cal] = await Promise.all([
      this.prisma.db.attendanceRecord.findMany({
        where: { employeeId: { in: ids }, date: { gte: startD, lte: endD } },
        select: { employeeId: true, status: true, date: true, checkIn: true },
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
      this.prisma.db.payItem.findMany({ where: { employeeId: { in: ids }, month } }),
      this.prisma.db.leaveLedger.findMany({
        where: { employeeId: { in: ids }, kind: 'ENCASHED', paidInRunId: null },
      }),
      // Earlier payslips: this financial year for TDS, the ESI period, and arrears look-back.
      this.prisma.db.payslip.findMany({
        where: {
          employeeId: { in: ids },
          runId: { not: runId },
          run: {
            month: {
              lt: month,
              gte: [fyMonths[0]!, esiPeriod[0]!, addMonths(month, -12)].sort()[0]!,
            },
          },
        },
        include: { run: { select: { month: true, status: true } } },
      }),
      this.calendar.load(ids, start, end),
    ]);

    const rows: Prisma.PayslipCreateManyInput[] = [];
    const tenantId = requireTenantId();
    const dim = daysInMonth(month);
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
          reason: `Joined ${short(joined)}, pay for ${daysEmployed} of ${dim} days`,
        });
      if (exit && exit <= end)
        flags.push({
          tag: 'Exit',
          tone: 'danger',
          reason: `Last working day ${short(exit)}. Check the full and final settlement.`,
        });

      // ---- unpaid days
      let lop = 0;
      const mine = records.filter((x) => x.employeeId === e.id);
      for (const r of mine)
        if (r.status === 'A' || r.status === 'HD') lop += r.status === 'HD' ? 0.5 : 1;
      for (const l of leaves.filter((x) => x.employeeId === e.id)) {
        if (l.halfDay) lop += 0.5;
        else
          lop += eachDay(
            isoDay(l.startDate) < start ? start : isoDay(l.startDate),
            isoDay(l.endDate) > end ? end : isoDay(l.endDate),
          ).filter((d) => cal.isWorking(e.id, d)).length;
      }
      const lates = mine.filter(
        (r) => r.checkIn && cal.isWorking(e.id, isoDay(r.date)) && cal.isLate(e.id, r.checkIn),
      ).length;
      const latePenalty = latePenaltyDays(
        lates,
        attendancePolicy.latePenalty.latesPerHalfDay,
        attendancePolicy.latePenalty.enabled,
      );
      lop += latePenalty;
      if (lop)
        flags.push({
          tag: 'Loss of pay',
          tone: 'warning',
          reason: `${lop} unpaid ${lop === 1 ? 'day' : 'days'} (absent or unpaid leave${latePenalty ? `, ${latePenalty} for ${lates} late marks` : ''})`,
        });

      const ot = overtime.filter((x) => x.employeeId === e.id);
      const cl = claims.filter((x) => x.employeeId === e.id);
      const overtimeHours = ot.reduce((n, x) => n + Number(x.hours), 0);
      const reimbursements = cl.reduce((n, x) => n + x.amount, 0);
      const base = {
        tenantId,
        runId,
        employeeId: e.id,
        daysInMonth: dim,
        lopDays: lop,
        overtimeHours,
      };

      // ---- salary, split across a change during the month
      const applicable = (day: string) =>
        [...e.salaries].reverse().find((s) => isoDay(s.effectiveFrom) <= day);
      const current = applicable(to);
      if (!current) {
        flags.unshift({ tag: 'No salary', tone: 'danger', reason: 'Set a salary before paying' });
        rows.push({
          ...base,
          lines: [],
          gross: 0,
          deductions: 0,
          net: 0,
          reimbursements: 0,
          payableDays: 0,
          flags,
          claimIds: [],
          overtimeIds: [],
        });
        continue;
      }
      const toInput = (s: typeof current) => ({
        annualCtc: s.annualCtc,
        basicShare: s.basicPercent / 100,
        metro: s.metro,
      });
      const changes = e.salaries.filter(
        (s) => isoDay(s.effectiveFrom) > from && isoDay(s.effectiveFrom) <= to,
      );
      let full = structure(toInput(current), policy);
      if (changes.length) {
        const cuts = [from, ...changes.map((s) => isoDay(s.effectiveFrom))];
        full = blend(
          cuts.map((c, i) => {
            const next = cuts[i + 1];
            const segEnd = next ? isoDay(new Date(toDate(next).getTime() - 86_400_000)) : to;
            return {
              structure: structure(toInput(applicable(c)!), policy),
              days: eachDay(c, segEnd).length,
            };
          }),
        );
        flags.push({
          tag: 'Salary change',
          tone: 'info',
          reason: `New salary from ${short(isoDay(changes[changes.length - 1]!.effectiveFrom))}, paid by days`,
        });
      }

      // ---- one-off items, arrears and leave encashment
      const payItems: PayItem[] = items
        .filter((i) => i.employeeId === e.id)
        .map((i) => ({
          label: i.label,
          amount: i.amount,
          kind: DEDUCTION_KINDS.has(i.kind) ? 'deduction' : 'earning',
          taxable: i.taxable,
          exempt: i.exempt,
          pfWages: i.pfWages,
          esiWages: i.esiWages,
        }));
      const past = history.filter((h) => h.employeeId === e.id);
      const settled = new Set(
        past.flatMap((h) => (h.arrearsPaid as { month: string }[]).map((a) => a.month)),
      );
      const arrearsPaid: { month: string; amount: number }[] = [];
      for (const h of past.filter(
        (x) =>
          x.run.month >= addMonths(month, -12) &&
          x.run.status !== 'DRAFT' &&
          !settled.has(x.run.month),
      )) {
        const now = applicable(`${h.run.month}-01`);
        if (!now || !h.salaryId || now.id === h.salaryId) continue;
        const regularKeys = new Set([
          'basic',
          'hra',
          'special',
          ...policy.components.fixedAllowances.map((a) => a.key),
        ]);
        const paidLines = (h.lines as { key: string; amount: number }[]).filter((l) =>
          regularKeys.has(l.key),
        );
        const paid = paidLines.reduce((n, l) => n + l.amount, 0);
        const paidBasic = paidLines.find((l) => l.key === 'basic')?.amount ?? 0;
        const s = structure(toInput(now), policy);
        const shareThen = Number(h.payableDays) / h.daysInMonth;
        const due = Math.round(s.gross * shareThen) - paid;
        if (due > 0) {
          payItems.push({
            label: `Arrears for ${monthName(h.run.month)}`,
            amount: due,
            kind: 'earning',
            taxable: true,
            exempt: 0,
            pfWages: Math.max(0, Math.round(s.basic * shareThen) - paidBasic),
            esiWages: true,
          });
          arrearsPaid.push({ month: h.run.month, amount: due });
        }
      }
      if (arrearsPaid.length)
        flags.push({
          tag: 'Arrears',
          tone: 'info',
          reason: `Back-dated raise: arrears for ${arrearsPaid.map((a) => monthName(a.month)).join(', ')}`,
        });
      const myEncash = encash.filter((x) => x.employeeId === e.id);
      if (myEncash.length) {
        const days = myEncash.reduce((n, x) => n - Number(x.days), 0);
        const perDay =
          (leavePolicy.encashment.basis === 'BASIC' ? full.basic : full.gross) /
          leavePolicy.encashment.divisor;
        payItems.push({
          label: `Leave encashment (${days} days)`,
          amount: Math.round(days * perDay),
          kind: 'earning',
          taxable: true,
          exempt: 0,
          pfWages: 0,
          esiWages: false,
        });
      }

      // ---- ESI: covered if wages are under the ceiling, or covered earlier in this contribution period
      const coveredEarlier = past.some(
        (h) => esiPeriod.includes(h.run.month) && h.run.month < month && h.esiWages > 0,
      );
      const esiCovered = policy.esi.enabled && (full.esiApplies || coveredEarlier);

      // ---- income tax
      const ytdSlips = past.filter((h) => fyMonths.includes(h.run.month) && h.run.month < month);
      const decl = e.taxDeclarations[0];
      const regime = (decl?.regime ?? policy.tds.defaultRegime) as 'NEW' | 'OLD';
      const fyEnd = `${fyStart + 1}-03`;
      const monthsAfter =
        exit && exit <= end ? 0 : Math.max(0, fyMonths.indexOf(fyEnd) - fyMonths.indexOf(month));
      const dob = e.profile?.dateOfBirth ? isoDay(e.profile.dateOfBirth) : null;
      const age = dob
        ? fyStart +
          1 -
          Number(dob.slice(0, 4)) -
          (`${fyStart + 1}-03-31`.slice(5) < dob.slice(5) ? 1 : 0)
        : 30;

      const p = calculate(
        {
          month,
          full,
          metro: current.metro,
          daysEmployed,
          lopDays: lop,
          overtimeHours,
          reimbursements,
          items: payItems,
          state: e.location?.state ?? null,
          esiCovered,
          tax: {
            regime,
            age,
            ytd: {
              taxable: ytdSlips.reduce((n, h) => n + h.taxableIncome, 0),
              tds: ytdSlips.reduce((n, h) => n + h.tds, 0),
              pt: ytdSlips.reduce((n, h) => n + h.pt, 0),
              pf: ytdSlips.reduce((n, h) => n + h.pf, 0),
              months: ytdSlips.length,
            },
            monthsAfter,
            declaration: decl ? { ...NO_DECLARATION, ...decl } : NO_DECLARATION,
          },
        },
        policy,
      );
      if (p.esiApplies)
        flags.push({
          tag: 'ESI',
          tone: 'warning',
          reason: full.esiApplies
            ? `Wages up to ₹ ${num(policy.esi.wageCeiling)}, so ESI applies`
            : 'Covered earlier in this ESI contribution period',
        });
      if (!e.location?.state)
        flags.push({
          tag: 'No state',
          tone: 'info',
          reason: 'Set their work location’s state for professional tax and LWF',
        });
      if (p.pf > 0 && !e.profile?.uanEnc)
        flags.push({
          tag: 'No UAN',
          tone: 'warning',
          reason: 'Add their UAN for the PF return (ECR)',
        });
      if (p.tds > 0 && !e.profile?.panEnc)
        flags.push({
          tag: 'No PAN',
          tone: 'danger',
          reason: 'Without a PAN, TDS must be at least 20% (s.206AA). Add their PAN.',
        });
      if (!decl && month.slice(5) !== '04' && p.annualTax > 0)
        flags.push({
          tag: 'No declaration',
          tone: 'info',
          reason: `Taxed under the ${regime === 'NEW' ? 'new' : 'old'} regime with no investment declaration`,
        });

      rows.push({
        ...base,
        lines: p.lines as unknown as Prisma.InputJsonValue,
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
        flags,
        claimIds: cl.map((x) => x.id),
        overtimeIds: ot.map((x) => x.id),
        taxableIncome: p.taxableIncome,
        annualTax: p.annualTax,
        regime,
        eps: p.eps,
        edli: p.edli,
        pfAdmin: p.pfAdmin,
        pfWages: p.pfWages,
        epsWages: p.epsWages,
        esiWages: p.esiWages,
        lwf: p.lwf,
        employerLwf: p.employerLwf,
        bonus: p.bonus,
        salaryId: current.id,
        arrearsPaid,
        payItemIds: items.filter((i) => i.employeeId === e.id).map((i) => i.id),
        encashmentIds: myEncash.map((x) => x.id),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { runId } });
      if (rows.length) await tx.payslip.createMany({ data: rows });
      const sum = (f: (r: Prisma.PayslipCreateManyInput) => number) =>
        rows.reduce((n, r) => n + f(r), 0);
      await tx.payrollRun.update({
        where: { id: runId },
        data: {
          gross: sum((r) => r.gross),
          net: sum((r) => r.net),
          statutory: sum(
            (r) =>
              (r.pf ?? 0) +
              (r.employerPf ?? 0) +
              (r.edli ?? 0) +
              (r.pfAdmin ?? 0) +
              (r.esi ?? 0) +
              (r.employerEsi ?? 0) +
              (r.pt ?? 0) +
              (r.lwf ?? 0) +
              (r.employerLwf ?? 0) +
              (r.tds ?? 0),
          ),
          ctc: sum(
            (r) =>
              r.gross +
              (r.employerPf ?? 0) +
              (r.edli ?? 0) +
              (r.pfAdmin ?? 0) +
              (r.employerEsi ?? 0) +
              (r.employerLwf ?? 0),
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
      eps: p.eps,
      edli: p.edli,
      pfAdmin: p.pfAdmin,
      lwf: p.lwf,
      employerLwf: p.employerLwf,
      bonus: p.bonus,
      regime: p.regime,
      annualTax: p.annualTax,
      taxableIncome: p.taxableIncome,
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
