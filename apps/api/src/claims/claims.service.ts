import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClaimCategoryInput,
  CreateExpenseInput,
  CreateOvertimeInput,
  DecideClaimsInput,
  ListClaimsQuery,
} from '@hrms/shared';
import { ClaimStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { todayIst } from '../attendance/days';
import { currentContext, requireTenantId } from '../common/request-context';
import { EmployeeAccess } from '../employees/employee-access.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_CATEGORIES: ClaimCategoryInput[] = [
  { name: 'Travel', limitPerClaim: 6000, needsReceipt: true, active: true },
  { name: 'Client meals', limitPerClaim: 3000, needsReceipt: true, active: true },
  { name: 'Internet & phone', limitPerClaim: 1000, needsReceipt: true, active: true },
  { name: 'Software', limitPerClaim: null, needsReceipt: true, active: true },
  { name: 'Other', limitPerClaim: null, needsReceipt: false, active: true },
];

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    employeeCode: true,
    department: { select: { id: true, name: true } },
  },
} satisfies Prisma.EmployeeDefaultArgs;

interface Viewer {
  manage: boolean;
  readAll: boolean;
  self: string | null;
  team: Set<string>;
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { gte: day(`${month}-01`), lte: new Date(Date.UTC(y, m, 0)) };
};

/**
 * Overtime and expense claims.
 *
 * - Everyone records their own overtime and expenses (with a receipt where the category
 *   needs one) and sees their own.
 * - Managers see and decide (approve, decline, hold) claims from their reporting line.
 * - `claims.manage` (HR or finance) sees and decides everything, marks approved claims paid,
 *   can file for someone else and sets category limits. Nobody decides their own claim.
 * Overtime pay is worked out by payroll from the approved hours.
 */
@Injectable()
export class ClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeAccess,
    private readonly audit: AuditService,
  ) {}

  private async viewer(): Promise<Viewer> {
    const self = await this.access.selfEmployeeId();
    const team =
      self && this.access.can('team.read')
        ? new Set(await this.access.reportingLine(self))
        : new Set<string>();
    return {
      manage: this.access.can('claims.manage'),
      readAll: this.access.can('employee.read'),
      self,
      team,
    };
  }

  private visible(v: Viewer, employeeId?: string): Prisma.StringFilter | string | undefined {
    if (v.manage || v.readAll) return employeeId;
    const ids = [...v.team, ...(v.self ? [v.self] : [])];
    if (employeeId)
      return ids.includes(employeeId) ? employeeId : '00000000-0000-0000-0000-000000000000';
    return { in: ids };
  }

  private canDecide(v: Viewer, employeeId: string, decision: DecideClaimsInput['decision']) {
    if (employeeId === v.self) return false;
    if (v.manage) return true;
    return decision !== 'PAID' && v.team.has(employeeId);
  }

  /** Who the new claim is for: the caller, or someone else when claims.manage files it. */
  private async subject(v: Viewer, employeeId?: string) {
    const id = employeeId ?? v.self;
    if (!id) throw new BadRequestException('Your login is not linked to an employee record');
    if (id !== v.self && !v.manage) throw new ForbiddenException('You can only claim for yourself');
    const e = await this.prisma.db.employee.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!e || e.status === 'EXITED') throw new NotFoundException('Employee not found');
    return id;
  }

  // ---------- categories ----------

  async categories() {
    if (!(await this.prisma.db.claimCategory.count()))
      await this.prisma.db.claimCategory.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({ ...c, tenantId: requireTenantId() })),
        skipDuplicates: true,
      });
    return this.prisma.db.claimCategory.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async createCategory(input: ClaimCategoryInput) {
    await this.categories();
    const c = await this.prisma.db.claimCategory.create({
      data: { ...input, tenantId: requireTenantId() },
    });
    await this.audit.record('claims.category_created', 'ClaimCategory', c.id, { name: c.name });
    return c;
  }

  async updateCategory(id: string, input: Partial<ClaimCategoryInput>) {
    const existing = await this.prisma.db.claimCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    const c = await this.prisma.db.claimCategory.update({ where: { id }, data: input });
    await this.audit.record('claims.category_updated', 'ClaimCategory', id, {
      fields: Object.keys(input),
    });
    return c;
  }

  // ---------- overtime ----------

  async listOvertime(q: ListClaimsQuery) {
    const v = await this.viewer();
    const rows = await this.prisma.db.overtimeRequest.findMany({
      where: {
        employeeId: this.visible(v, q.employeeId),
        ...(q.status ? { status: q.status } : {}),
        ...(q.month ? { date: monthRange(q.month) } : {}),
      },
      include: { employee: person },
      orderBy: [{ date: 'desc' }],
      take: 500,
    });
    return rows.map(({ hours, date, ...r }) => ({
      ...r,
      date: isoDay(date),
      hours: Number(hours),
      canDecide: r.status === 'PENDING' && this.canDecide(v, r.employeeId, 'APPROVE'),
    }));
  }

  async createOvertime(input: CreateOvertimeInput) {
    const v = await this.viewer();
    const employeeId = await this.subject(v, input.employeeId);
    if (input.date > todayIst())
      throw new BadRequestException('Overtime can only be claimed for past days');
    const row = await this.prisma.db.overtimeRequest
      .create({
        data: {
          tenantId: requireTenantId(),
          employeeId,
          date: day(input.date),
          hours: input.hours,
          reason: input.reason,
          requestedById: currentContext().userId ?? null,
        },
      })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
          throw new ConflictException('There is already overtime recorded for that day');
        throw err;
      });
    await this.audit.record('claims.overtime_requested', 'OvertimeRequest', row.id, {
      employeeId,
      hours: input.hours,
    });
    return row;
  }

  // ---------- expenses ----------

  async listExpenses(q: ListClaimsQuery) {
    const v = await this.viewer();
    const rows = await this.prisma.db.expenseClaim.findMany({
      where: {
        employeeId: this.visible(v, q.employeeId),
        ...(q.status ? { status: q.status } : {}),
        ...(q.month ? { spentOn: monthRange(q.month) } : {}),
      },
      include: {
        employee: person,
        category: { select: { id: true, name: true, limitPerClaim: true, needsReceipt: true } },
      },
      orderBy: [{ spentOn: 'desc' }],
      take: 500,
    });
    return rows.map(({ spentOn, ...r }) => ({
      ...r,
      spentOn: isoDay(spentOn),
      overLimit: r.category.limitPerClaim !== null && r.amount > r.category.limitPerClaim,
      canDecide:
        (r.status === 'PENDING' || r.status === 'ON_HOLD') &&
        this.canDecide(v, r.employeeId, 'APPROVE'),
      canMarkPaid: r.status === 'APPROVED' && this.canDecide(v, r.employeeId, 'PAID'),
    }));
  }

  async createExpense(input: CreateExpenseInput) {
    const v = await this.viewer();
    const employeeId = await this.subject(v, input.employeeId);
    const category = await this.prisma.db.claimCategory.findUnique({
      where: { id: input.categoryId },
    });
    if (!category || !category.active) throw new NotFoundException('Claim category not found');
    if (input.spentOn > todayIst())
      throw new BadRequestException('The spend date is in the future');
    if (category.limitPerClaim !== null && input.amount > category.limitPerClaim)
      throw new BadRequestException(
        `${category.name} claims are limited to ₹ ${category.limitPerClaim.toLocaleString('en-IN')}`,
      );
    if (input.receiptDocumentId) {
      const doc = await this.prisma.db.document.findFirst({
        where: { id: input.receiptDocumentId, employeeId, deletedAt: null },
        select: { id: true },
      });
      if (!doc) throw new BadRequestException('Attach a receipt from this person’s documents');
    } else if (category.needsReceipt) {
      throw new BadRequestException(`${category.name} claims need a receipt`);
    }
    const row = await this.prisma.db.expenseClaim.create({
      data: {
        tenantId: requireTenantId(),
        employeeId,
        categoryId: category.id,
        spentOn: day(input.spentOn),
        amount: input.amount,
        description: input.description,
        receiptDocumentId: input.receiptDocumentId ?? null,
        requestedById: currentContext().userId ?? null,
      },
    });
    await this.audit.record('claims.expense_requested', 'ExpenseClaim', row.id, {
      employeeId,
      amount: input.amount,
      category: category.name,
    });
    return row;
  }

  // ---------- decisions ----------

  async decide(kind: 'overtime' | 'expense', input: DecideClaimsInput) {
    const v = await this.viewer();
    const rows =
      kind === 'overtime'
        ? await this.prisma.db.overtimeRequest.findMany({
            where: { id: { in: input.ids } },
            select: { id: true, employeeId: true, status: true },
          })
        : await this.prisma.db.expenseClaim.findMany({
            where: { id: { in: input.ids } },
            select: { id: true, employeeId: true, status: true },
          });
    const visible = rows.filter(
      (r) => v.manage || v.readAll || r.employeeId === v.self || v.team.has(r.employeeId),
    );
    if (visible.length !== input.ids.length) throw new NotFoundException('Claim not found');

    const next: Record<DecideClaimsInput['decision'], ClaimStatus> = {
      APPROVE: 'APPROVED',
      REJECT: 'REJECTED',
      HOLD: 'ON_HOLD',
      PAID: 'PAID',
    };
    for (const r of visible) {
      if (!this.canDecide(v, r.employeeId, input.decision))
        throw new ForbiddenException('You can’t decide one of these claims');
      const ok =
        input.decision === 'PAID'
          ? r.status === 'APPROVED' && kind === 'expense'
          : r.status === 'PENDING' || r.status === 'ON_HOLD';
      if (!ok) throw new BadRequestException('One of these claims was already decided');
    }
    const data = {
      status: next[input.decision],
      ...(input.decision === 'PAID'
        ? { paidAt: new Date() }
        : {
            decidedById: currentContext().userId ?? null,
            decidedAt: new Date(),
            decisionNote: input.note ?? null,
          }),
    };
    if (kind === 'overtime')
      await this.prisma.db.overtimeRequest.updateMany({
        where: { id: { in: input.ids } },
        data: data as Prisma.OvertimeRequestUpdateManyMutationInput,
      });
    else
      await this.prisma.db.expenseClaim.updateMany({
        where: { id: { in: input.ids } },
        data,
      });
    for (const r of visible)
      await this.audit.record(
        `claims.${kind}_${input.decision.toLowerCase()}`,
        kind === 'overtime' ? 'OvertimeRequest' : 'ExpenseClaim',
        r.id,
        { employeeId: r.employeeId },
      );
    return { updated: input.ids.length };
  }

  // ---------- numbers ----------

  async summary(month = todayIst().slice(0, 7)) {
    const v = await this.viewer();
    const employeeId = this.visible(v);
    const range = monthRange(month);
    const [overtime, expenses, pendingAll, decided] = await Promise.all([
      this.prisma.db.overtimeRequest.findMany({
        where: { employeeId, date: range, status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
        select: { hours: true, status: true },
      }),
      this.prisma.db.expenseClaim.findMany({
        where: {
          employeeId,
          spentOn: range,
          status: { in: ['PENDING', 'APPROVED', 'PAID', 'ON_HOLD'] },
        },
        select: { amount: true, category: { select: { name: true } } },
      }),
      this.prisma.db.expenseClaim.findMany({
        where: { employeeId, status: { in: ['PENDING', 'ON_HOLD'] } },
        select: { amount: true },
      }),
      this.prisma.db.expenseClaim.findMany({
        where: {
          employeeId,
          decidedAt: { not: null, gte: new Date(Date.now() - 90 * 86_400_000) },
        },
        select: { createdAt: true, decidedAt: true },
      }),
    ]);
    const spend = new Map<string, number>();
    for (const e of expenses)
      spend.set(e.category.name, (spend.get(e.category.name) ?? 0) + e.amount);
    const avgDays = decided.length
      ? decided.reduce((n, d) => n + (+d.decidedAt! - +d.createdAt) / 86_400_000, 0) /
        decided.length
      : null;
    return {
      month,
      overtimeHours: overtime.reduce((n, o) => n + Number(o.hours), 0),
      overtimeApprovedHours: overtime
        .filter((o) => o.status !== 'PENDING')
        .reduce((n, o) => n + Number(o.hours), 0),
      pendingClaims: pendingAll.length,
      pendingAmount: pendingAll.reduce((n, e) => n + e.amount, 0),
      monthSpend: expenses.reduce((n, e) => n + e.amount, 0),
      avgApprovalDays: avgDays === null ? null : Math.round(avgDays * 10) / 10,
      spendByCategory: [...spend.entries()]
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.amount - a.amount),
      canManage: v.manage,
      selfEmployeeId: v.self,
    };
  }
}
