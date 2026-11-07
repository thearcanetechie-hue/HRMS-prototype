import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayItemInput, SettlementInput, TaxDeclarationInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { isoDay, todayIst, toDate } from '../attendance/days';
import { LeaveService } from '../attendance/leave.service';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { FieldCrypto } from '../crypto/field-crypto';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PolicyService } from '../policies/policies.module';
import { PrismaService } from '../prisma/prisma.service';
import { gratuity, incomeTax, professionalTax, statutoryWages, structure } from './calc';
import { monthsOfFy } from './payroll.service';

const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const fyLabel = (fyStart: number) => `FY ${fyStart}-${String(fyStart + 1).slice(2)}`;
const QUARTERS: Record<number, string[]> = {
  1: ['04', '05', '06'],
  2: ['07', '08', '09'],
  3: ['10', '11', '12'],
  4: ['01', '02', '03'],
};

/**
 * Everything payroll needs besides the monthly run: Form 12BB declarations, one-off pay items,
 * the yearly statutory bonus, full and final settlements, and the files for statutory returns
 * (EPF ECR, ESI contributions, PT, LWF, TDS 24Q and Form 16 Part B figures).
 *
 * Files carrying full PAN, UAN or ESI numbers need employee.sensitive.read as well as
 * payroll.manage, and every download is logged.
 */
@Injectable()
export class StatutoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
    private readonly policies: PolicyService,
    private readonly leave: LeaveService,
  ) {}

  private manage() {
    return this.access.can('payroll.manage');
  }

  private requireSensitive() {
    if (!this.access.can('employee.sensitive.read'))
      throw new ForbiddenException('You need permission to see PAN, UAN and ESI numbers');
  }

  private decrypt(field: 'pan' | 'uan' | 'esicNumber', value: string | null | undefined) {
    return value ? this.crypto.decrypt(requireTenantId(), field, value) : '';
  }

  // ---------- declarations (Form 12BB) ----------

  async declaration(employeeId: string | undefined, fyStart: number) {
    const self = await this.access.selfEmployeeId();
    const id = employeeId ?? self;
    if (!id) throw new BadRequestException('Your login is not linked to an employee record');
    if (id !== self && !this.manage()) throw new NotFoundException('Declaration not found');
    const [row, policy] = await Promise.all([
      this.prisma.db.taxDeclaration.findUnique({
        where: { employeeId_fyStart: { employeeId: id, fyStart } },
      }),
      this.policies.get('payroll'),
    ]);
    return (
      row ?? {
        employeeId: id,
        fyStart,
        regime: policy.tds.defaultRegime,
        verified: false,
        id: null,
      }
    );
  }

  async declarations(fyStart: number) {
    if (!this.manage())
      throw new ForbiddenException('Only payroll can see everyone’s declarations');
    const rows = await this.prisma.db.employee.findMany({
      where: { status: { not: 'EXITED' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        taxDeclarations: { where: { fyStart } },
      },
      orderBy: { firstName: 'asc' },
    });
    return rows.map(({ taxDeclarations, ...e }) => ({
      employee: e,
      declaration: taxDeclarations[0] ?? null,
    }));
  }

  async declare(input: TaxDeclarationInput) {
    const self = await this.access.selfEmployeeId();
    const employeeId = input.employeeId ?? self;
    if (!employeeId)
      throw new BadRequestException('Your login is not linked to an employee record');
    if (employeeId !== self && !this.manage())
      throw new ForbiddenException('You can only declare for yourself');
    const rentYearly = input.rentMonthly * 12;
    // Rule 26C: the landlord's PAN is needed when rent is over ₹ 1 lakh a year.
    if (input.regime === 'OLD' && rentYearly > 1_00_000 && !input.landlordPan)
      throw new BadRequestException('Add your landlord’s PAN: rent is over ₹ 1 lakh a year');
    const existing = await this.prisma.db.taxDeclaration.findUnique({
      where: { employeeId_fyStart: { employeeId, fyStart: input.fyStart } },
    });
    // Once payroll verifies proofs, only payroll can change the declaration.
    if (existing?.verified && !this.manage())
      throw new ForbiddenException('Payroll has verified this declaration. Ask them to change it.');
    const { employeeId: _e, landlordPan, ...rest } = input;
    const data = {
      ...rest,
      landlordPan: landlordPan || null,
      updatedById: currentContext().userId ?? null,
      verified: false,
    };
    const row = await this.prisma.db.taxDeclaration.upsert({
      where: { employeeId_fyStart: { employeeId, fyStart: input.fyStart } },
      create: { ...data, tenantId: requireTenantId(), employeeId },
      update: data,
    });
    // Amounts stay out of the audit log.
    await this.audit.record('payroll.declaration_saved', 'Employee', employeeId, {
      fy: input.fyStart,
      regime: input.regime,
    });
    return row;
  }

  async verifyDeclaration(id: string) {
    const row = await this.prisma.db.taxDeclaration.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Declaration not found');
    await this.prisma.db.taxDeclaration.update({ where: { id }, data: { verified: true } });
    await this.audit.record('payroll.declaration_verified', 'Employee', row.employeeId, {
      fy: row.fyStart,
    });
    return { verified: true };
  }

  /** What a person's tax would be under each regime, to help them choose. */
  async compareRegimes(employeeId: string | undefined, fyStart: number) {
    const decl = await this.declaration(employeeId, fyStart);
    const id = decl.employeeId;
    const [policy, salary, employee] = await Promise.all([
      this.policies.get('payroll'),
      this.prisma.db.salaryStructure.findFirst({
        where: { employeeId: id, effectiveFrom: { lte: toDate(todayIst()) } },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.db.employee.findUniqueOrThrow({
        where: { id },
        select: { location: { select: { state: true } } },
      }),
    ]);
    if (!salary) return null;
    const s = structure(
      { annualCtc: salary.annualCtc, basicShare: salary.basicPercent / 100, metro: salary.metro },
      policy,
    );
    const d = decl as Partial<TaxDeclarationInput>;
    const annualGross = s.gross * 12 + (d.previousEmployerIncome ?? 0);
    const pf =
      Math.round(
        Math.min(s.wages, policy.pf.restrictToCeiling ? policy.pf.wageCeiling : s.wages) *
          policy.pf.employeeRate,
      ) * 12;
    const rent = (d.rentMonthly ?? 0) * 12;
    const hraExempt =
      rent > 0
        ? Math.max(
            0,
            Math.min(
              s.hra * 12,
              rent - 0.1 * s.basic * 12,
              s.basic * 12 * (salary.metro ? 0.5 : 0.4),
            ),
          )
        : 0;
    const oldDeductions =
      50_000 +
      professionalTax(employee.location?.state ?? null, s.gross, `${fyStart}-04`) * 12 +
      hraExempt +
      Math.min(1_50_000, (d.sec80C ?? 0) + pf) +
      Math.min(25_000, d.sec80D ?? 0) +
      Math.min(d.parentsSenior ? 50_000 : 25_000, d.sec80DParents ?? 0) +
      Math.min(50_000, d.sec80CCD1B ?? 0) +
      Math.min(2_00_000, d.homeLoanInterest ?? 0) +
      (d.otherDeductions ?? 0);
    const newTax = incomeTax(Math.max(0, annualGross - 75_000), 'NEW');
    const oldTax = incomeTax(Math.max(0, annualGross - oldDeductions), 'OLD');
    return {
      annualGross,
      newTax,
      oldTax,
      better: newTax <= oldTax ? 'NEW' : 'OLD',
      saving: Math.abs(newTax - oldTax),
    };
  }

  // ---------- pay items ----------

  async items(month: string) {
    const rows = await this.prisma.db.payItem.findMany({
      where: { month },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows;
  }

  private async assertDraftMonth(month: string) {
    const run = await this.prisma.db.payrollRun.findFirst({
      where: { month, status: { in: ['LOCKED', 'PAID'] } },
    });
    if (run)
      throw new BadRequestException(
        'Payroll for that month is locked. Unlock it or use next month.',
      );
  }

  async addItem(input: PayItemInput) {
    await this.assertDraftMonth(input.month);
    const e = await this.prisma.db.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true },
    });
    if (!e) throw new NotFoundException('Employee not found');
    const deduction = ['ADVANCE_RECOVERY', 'LOAN_RECOVERY', 'OTHER_DEDUCTION'].includes(input.kind);
    const row = await this.prisma.db.payItem.create({
      data: {
        tenantId: requireTenantId(),
        employeeId: input.employeeId,
        month: input.month,
        kind: input.kind,
        label: input.label,
        amount: input.amount,
        taxable: deduction ? false : input.taxable,
        exempt: deduction ? 0 : Math.min(input.exempt, input.amount),
        // Statutory bonus isn't ESI wages (ESI Act s.2(22)); incentives and other pay are.
        esiWages: !deduction && input.kind !== 'BONUS',
        note: input.note ?? null,
        createdById: currentContext().userId ?? null,
      },
    });
    await this.audit.record('payroll.item_added', 'Employee', input.employeeId, {
      month: input.month,
      kind: input.kind,
    });
    return row;
  }

  async removeItem(id: string) {
    const row = await this.prisma.db.payItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pay item not found');
    await this.assertDraftMonth(row.month);
    if (row.settlementId)
      throw new BadRequestException('This came from a settlement. Change the settlement instead.');
    await this.prisma.db.payItem.delete({ where: { id } });
  }

  // ---------- statutory bonus (Payment of Bonus Act, 1965) ----------

  /**
   * The year's bonus for eligible staff: wages (Basic) up to the eligibility ceiling, at least
   * 30 working days in the year (s.8), worked out on wages up to the calculation ceiling (s.12)
   * at the policy rate (8.33% to 20%, s.10/11). Added as a pay item in the month chosen.
   */
  async bonus(fyStart: number, payInMonth: string, preview: boolean) {
    const policy = await this.policies.get('payroll');
    if (!policy.bonus.enabled)
      throw new BadRequestException('Statutory bonus is switched off in the payroll policy');
    if (policy.bonus.payout === 'MONTHLY')
      throw new BadRequestException(
        'Bonus is paid monthly with salary under your policy, so there is nothing to add',
      );
    const slips = await this.prisma.db.payslip.findMany({
      where: { run: { month: { in: monthsOfFy(fyStart) }, status: { in: ['LOCKED', 'PAID'] } } },
      select: {
        employeeId: true,
        payableDays: true,
        lines: true,
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
    });
    const byPerson = new Map<
      string,
      {
        employee: { firstName: string; lastName: string; employeeCode: string };
        days: number;
        base: number;
        maxWage: number;
      }
    >();
    for (const s of slips) {
      const basic =
        (s.lines as { key: string; amount: number }[]).find((l) => l.key === 'basic')?.amount ?? 0;
      const row = byPerson.get(s.employeeId) ?? {
        employee: s.employee,
        days: 0,
        base: 0,
        maxWage: 0,
      };
      row.days += Number(s.payableDays);
      row.base += Math.min(basic, policy.bonus.calculationCeiling);
      row.maxWage = Math.max(row.maxWage, basic);
      byPerson.set(s.employeeId, row);
    }
    const rows = [...byPerson.entries()]
      .filter(([, r]) => r.days >= 30 && r.maxWage <= policy.bonus.eligibilityCeiling)
      .map(([employeeId, r]) => ({
        employeeId,
        employee: r.employee,
        days: r.days,
        amount: Math.round(r.base * policy.bonus.rate),
      }))
      .filter((r) => r.amount > 0);
    if (!preview) {
      await this.assertDraftMonth(payInMonth);
      const done = await this.prisma.db.payItem.findFirst({
        where: { kind: 'BONUS', note: `Statutory bonus ${fyLabel(fyStart)}` },
      });
      if (done) throw new ConflictException(`Bonus for ${fyLabel(fyStart)} has already been added`);
      await this.prisma.db.payItem.createMany({
        data: rows.map((r) => ({
          tenantId: requireTenantId(),
          employeeId: r.employeeId,
          month: payInMonth,
          kind: 'BONUS' as const,
          label: `Statutory bonus ${fyLabel(fyStart)}`,
          amount: r.amount,
          esiWages: false,
          note: `Statutory bonus ${fyLabel(fyStart)}`,
          createdById: currentContext().userId ?? null,
        })),
      });
      await this.audit.record('payroll.bonus_added', 'PayrollRun', payInMonth, {
        fy: fyStart,
        people: rows.length,
      });
    }
    return {
      fy: fyLabel(fyStart),
      rate: policy.bonus.rate,
      people: rows,
      total: rows.reduce((n, r) => n + r.amount, 0),
    };
  }

  // ---------- full and final settlement ----------

  async settlement(employeeId: string) {
    const row = await this.prisma.db.settlement.findUnique({
      where: { employeeId },
      include: { items: true },
    });
    return row ? { ...row, lastWorkingDay: isoDay(row.lastWorkingDay) } : null;
  }

  /**
   * Works out (or re-works) a leaver's settlement: gratuity, encashment of unused encashable
   * leave, and notice pay recovery. Salary for the last month comes from the normal payroll run.
   */
  async settle(input: SettlementInput) {
    const [policy, leavePolicy, employee] = await Promise.all([
      this.policies.get('payroll'),
      this.policies.get('leave'),
      this.prisma.db.employee.findUnique({
        where: { id: input.employeeId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfJoining: true,
          salaries: {
            where: { effectiveFrom: { lte: toDate(input.lastWorkingDay) } },
            orderBy: { effectiveFrom: 'desc' },
            take: 1,
          },
        },
      }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    const existing = await this.prisma.db.settlement.findUnique({
      where: { employeeId: input.employeeId },
    });
    if (existing?.status === 'FINAL') throw new ConflictException('This settlement is final');
    const salary = employee.salaries[0];
    if (!salary) throw new BadRequestException('Set a salary before working out the settlement');
    const s = structure(
      { annualCtc: salary.annualCtc, basicShare: salary.basicPercent / 100, metro: salary.metro },
      policy,
    );
    const wages = statutoryWages(s.basic, s.gross, policy);
    const g = gratuity(wages, isoDay(employee.dateOfJoining), input.lastWorkingDay, policy, input);

    const balances = await this.leave.computeBalances(
      employee.id,
      Number(input.lastWorkingDay.slice(0, 4)),
    );
    const encashDays = balances
      .filter((b) => b.type.encashable && (b.left ?? 0) > 0)
      .reduce((n, b) => n + (b.left ?? 0), 0);
    const perDay =
      (leavePolicy.encashment.basis === 'BASIC' ? s.basic : s.gross) /
      leavePolicy.encashment.divisor;
    const encashment = Math.round(encashDays * perDay);

    const shortDays = input.waiveNoticeRecovery
      ? 0
      : Math.max(0, policy.notice.days - input.noticeServedDays);
    const noticeRecovery = Math.round(
      (shortDays * (policy.notice.basis === 'BASIC' ? s.basic : s.gross)) / 30,
    );

    const lines = [
      ...(g.amount
        ? [
            {
              kind: 'GRATUITY' as const,
              label: `Gratuity (${g.years} years)`,
              amount: g.amount,
              taxable: true,
              exempt: g.amount,
              esiWages: false,
            },
          ]
        : []),
      ...(encashment
        ? [
            {
              kind: 'LEAVE_ENCASHMENT' as const,
              label: `Leave encashment (${encashDays} days)`,
              amount: encashment,
              // s.10(10AA)(ii): exempt at retirement or resignation up to ₹ 25 lakh over a lifetime.
              taxable: true,
              exempt: Math.min(encashment, 25_00_000),
              esiWages: false,
            },
          ]
        : []),
      ...(noticeRecovery
        ? [
            {
              kind: 'NOTICE_RECOVERY' as const,
              label: `Notice pay recovery (${shortDays} days)`,
              amount: noticeRecovery,
              taxable: false,
              exempt: 0,
              esiWages: false,
            },
          ]
        : []),
    ];
    const data = {
      input,
      wages,
      gratuity: g,
      encashDays,
      encashment,
      shortDays,
      noticeRecovery,
      lines,
      net: lines.reduce((n, l) => n + (l.kind === 'NOTICE_RECOVERY' ? -l.amount : l.amount), 0),
    } as unknown as Prisma.InputJsonValue;
    const row = existing
      ? await this.prisma.db.settlement.update({
          where: { id: existing.id },
          data: { lastWorkingDay: toDate(input.lastWorkingDay), data },
        })
      : await this.prisma.db.settlement.create({
          data: {
            tenantId: requireTenantId(),
            employeeId: employee.id,
            lastWorkingDay: toDate(input.lastWorkingDay),
            data,
            createdById: currentContext().userId ?? null,
          },
        });
    await this.audit.record('payroll.settlement_worked_out', 'Employee', employee.id, {
      lastWorkingDay: input.lastWorkingDay,
    });
    return this.settlement(row.employeeId);
  }

  /** Makes a settlement final: its lines join the leaving month's payroll and the exit date is set. */
  async finalise(employeeId: string) {
    const st = await this.prisma.db.settlement.findUnique({ where: { employeeId } });
    if (!st) throw new NotFoundException('Work out the settlement first');
    if (st.status === 'FINAL') throw new ConflictException('This settlement is already final');
    const month = isoDay(st.lastWorkingDay).slice(0, 7);
    await this.assertDraftMonth(month);
    const lines = (
      st.data as {
        lines: {
          kind: string;
          label: string;
          amount: number;
          taxable: boolean;
          exempt: number;
          esiWages: boolean;
        }[];
      }
    ).lines;
    const tenantId = requireTenantId();
    await this.prisma.db.$transaction([
      this.prisma.db.payItem.createMany({
        data: lines.map((l) => ({
          tenantId,
          employeeId,
          month,
          kind: l.kind as Prisma.PayItemCreateManyInput['kind'],
          label: l.label,
          amount: l.amount,
          taxable: l.taxable,
          exempt: l.exempt,
          esiWages: l.esiWages,
          settlementId: st.id,
          createdById: currentContext().userId ?? null,
        })),
      }),
      this.prisma.db.settlement.update({
        where: { id: st.id },
        data: { status: 'FINAL', finalisedAt: new Date() },
      }),
      this.prisma.db.employee.update({
        where: { id: employeeId },
        data: { dateOfExit: st.lastWorkingDay },
      }),
    ]);
    await this.audit.record('payroll.settlement_final', 'Employee', employeeId, { month });
    return this.settlement(employeeId);
  }

  // ---------- statutory files ----------

  private async lockedRun(id: string) {
    const run = await this.prisma.db.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'DRAFT') throw new BadRequestException('Lock the run first');
    return run;
  }

  /**
   * EPFO Electronic Challan cum Return (ECR 2.0) text file: one member per line, fields joined
   * by #~#: UAN, name, gross wages, EPF wages, EPS wages, EDLI wages, EE share, EPS share,
   * ER share (EPF − EPS), NCP days, refund of advances.
   */
  async ecr(runId: string) {
    this.requireSensitive();
    const run = await this.lockedRun(runId);
    const slips = await this.prisma.db.payslip.findMany({
      where: { runId, pfWages: { gt: 0 } },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            profile: { select: { uanEnc: true } },
          },
        },
      },
    });
    const missing: string[] = [];
    const lines = slips.map((p) => {
      const uan = this.decrypt('uan', p.employee.profile?.uanEnc);
      if (!uan) missing.push(p.employee.employeeCode);
      return [
        uan,
        name(p.employee).toUpperCase(),
        p.gross,
        p.pfWages,
        p.epsWages,
        p.epsWages,
        p.pf,
        p.eps,
        p.employerPf - p.eps,
        Math.round(Number(p.lopDays)),
        0,
      ].join('#~#');
    });
    await this.audit.record('payroll.ecr_downloaded', 'PayrollRun', runId, { month: run.month });
    return { text: lines.join('\n') + '\n', fileName: `ECR-${run.month}.txt`, missing };
  }

  /** ESIC monthly contribution upload: IP number, name, days paid, wages, reason code, last day. */
  async esi(runId: string) {
    this.requireSensitive();
    const run = await this.lockedRun(runId);
    const slips = await this.prisma.db.payslip.findMany({
      where: { runId, esiWages: { gt: 0 } },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            dateOfExit: true,
            profile: { select: { esicNumberEnc: true } },
          },
        },
      },
    });
    const missing: string[] = [];
    const rows: (string | number)[][] = [
      [
        'IP Number',
        'IP Name',
        'No of Days for which wages paid',
        'Total Monthly Wages',
        'Reason Code for Zero workings days',
        'Last Working Day',
      ],
    ];
    for (const p of slips) {
      const ip = this.decrypt('esicNumber', p.employee.profile?.esicNumberEnc);
      if (!ip) missing.push(p.employee.employeeCode);
      const exit =
        p.employee.dateOfExit && isoDay(p.employee.dateOfExit).startsWith(run.month)
          ? isoDay(p.employee.dateOfExit)
          : '';
      // Reason code 2 is "left service"; 0 when there were working days.
      rows.push([
        ip,
        name(p.employee),
        Number(p.payableDays),
        p.esiWages,
        Number(p.payableDays) > 0 ? 0 : exit ? 2 : 1,
        exit,
      ]);
    }
    await this.audit.record('payroll.esi_downloaded', 'PayrollRun', runId, { month: run.month });
    return { csv: csv(rows), fileName: `ESI-${run.month}.csv`, missing };
  }

  /** Professional tax and labour welfare fund by state, for the state returns. */
  async stateLevies(runId: string) {
    const run = await this.lockedRun(runId);
    const slips = await this.prisma.db.payslip.findMany({
      where: { runId },
      select: {
        pt: true,
        lwf: true,
        employerLwf: true,
        gross: true,
        employee: { select: { location: { select: { state: true } } } },
      },
    });
    const by = new Map<
      string,
      { people: number; gross: number; pt: number; lwf: number; employerLwf: number }
    >();
    for (const p of slips) {
      const st = p.employee.location?.state ?? 'Not set';
      const row = by.get(st) ?? { people: 0, gross: 0, pt: 0, lwf: 0, employerLwf: 0 };
      row.people += 1;
      row.gross += p.gross;
      row.pt += p.pt;
      row.lwf += p.lwf;
      row.employerLwf += p.employerLwf;
      by.set(st, row);
    }
    const rows: (string | number)[][] = [
      ['State', 'Employees', 'Gross wages', 'Professional tax', 'LWF employee', 'LWF employer'],
    ];
    for (const [st, r] of [...by.entries()].sort())
      rows.push([st, r.people, r.gross, r.pt, r.lwf, r.employerLwf]);
    return { csv: csv(rows), fileName: `PT-LWF-${run.month}.csv` };
  }

  /**
   * Form 24Q Annexure I data for a quarter: one row per employee per month paid, with PAN,
   * amount paid, TDS deducted, the date paid, and whether they opted out of the new regime.
   * Import into a return preparation utility (RPU) to make the FVU file.
   */
  async form24Q(fyStart: number, quarter: number) {
    this.requireSensitive();
    const months = QUARTERS[quarter]!.map((mm) =>
      Number(mm) >= 4 ? `${fyStart}-${mm}` : `${fyStart + 1}-${mm}`,
    );
    const slips = await this.prisma.db.payslip.findMany({
      where: { run: { month: { in: months }, status: 'PAID' } },
      include: {
        run: { select: { month: true, paidAt: true } },
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            profile: { select: { panEnc: true } },
          },
        },
      },
      orderBy: [{ run: { month: 'asc' } }],
    });
    const rows: (string | number)[][] = [
      [
        'Employee code',
        'PAN',
        'Name',
        'Section',
        'Month',
        'Date of payment',
        'Amount paid',
        'TDS deducted',
        'Opted out of new regime (115BAC)',
      ],
    ];
    for (const p of slips)
      rows.push([
        p.employee.employeeCode,
        this.decrypt('pan', p.employee.profile?.panEnc) || 'PANNOTAVBL',
        name(p.employee),
        '192',
        p.run.month,
        p.run.paidAt ? isoDay(p.run.paidAt) : '',
        p.taxableIncome,
        p.tds,
        p.regime === 'OLD' ? 'Y' : 'N',
      ]);
    await this.audit.record('payroll.24q_downloaded', 'PayrollRun', `${fyStart}-Q${quarter}`, {
      fy: fyStart,
      quarter,
    });
    return { csv: csv(rows), fileName: `24Q-${fyLabel(fyStart).replace(' ', '')}-Q${quarter}.csv` };
  }

  /** Form 16 Part B figures for one person and year: salary, deductions, tax and TDS. */
  async form16(employeeId: string | undefined, fyStart: number) {
    const self = await this.access.selfEmployeeId();
    const id = employeeId ?? self;
    if (!id || (id !== self && !this.manage())) throw new NotFoundException('Not found');
    const slips = await this.prisma.db.payslip.findMany({
      where: {
        employeeId: id,
        run: { month: { in: monthsOfFy(fyStart) }, status: { in: ['LOCKED', 'PAID'] } },
      },
      include: { run: { select: { month: true } } },
      orderBy: { run: { month: 'asc' } },
    });
    const sum = (f: (p: (typeof slips)[number]) => number) => slips.reduce((n, p) => n + f(p), 0);
    const regime = slips[slips.length - 1]?.regime ?? 'NEW';
    const decl = await this.prisma.db.taxDeclaration.findUnique({
      where: { employeeId_fyStart: { employeeId: id, fyStart } },
    });
    const gross = sum((p) => p.taxableIncome) + (decl?.previousEmployerIncome ?? 0);
    const standard = Math.min(regime === 'NEW' ? 75_000 : 50_000, gross);
    const pt = regime === 'OLD' ? sum((p) => p.pt) : 0;
    return {
      fy: fyLabel(fyStart),
      regime,
      months: slips.map((p) => ({ month: p.run.month, taxable: p.taxableIncome, tds: p.tds })),
      grossSalary: gross,
      standardDeduction: standard,
      professionalTax: pt,
      employeePf: sum((p) => p.pf),
      declaration: decl,
      taxDeducted: sum((p) => p.tds) + (decl?.previousEmployerTds ?? 0),
      projectedTax: slips[slips.length - 1]?.annualTax ?? 0,
    };
  }
}
