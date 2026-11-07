import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Post,
  Query,
} from '@nestjs/common';
import {
  leaveAdjustmentSchema,
  LeaveAdjustmentInput,
  leaveYearEndSchema,
  LeaveYearEndInput,
  monthCloseSchema,
  MonthCloseInput,
} from '@hrms/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../auth/decorators';
import { currentContext, requireTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PolicyService } from '../policies/policies.module';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { isoDay, toDate, todayIst } from './days';
import { LeaveService } from './leave.service';

const monthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });
const ledgerQuery = z.object({
  employeeId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

/**
 * Closing a month's attendance before payroll: HR sees every working day nobody marked,
 * decides what they become (absent by default, per policy), and closes the month. A closed
 * month can't change until it is reopened, and it can't be reopened once its payroll is locked.
 */
@Injectable()
export class MonthCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
  ) {}

  async status(month: string) {
    const [row, register, policy] = await Promise.all([
      this.prisma.db.attendanceMonth.findUnique({
        where: { tenantId_month: { tenantId: requireTenantId(), month } },
      }),
      this.attendance.register({ month }),
      this.policies.get('attendance'),
    ]);
    const today = todayIst();
    // Days before someone joined or after they left are blank on the register but not unmarked.
    const people = await this.prisma.db.employee.findMany({
      where: { id: { in: register.rows.map((r) => r.employee.id) } },
      select: { id: true, dateOfJoining: true, dateOfExit: true },
    });
    const employed = (id: string, d: string) => {
      const p = people.find((x) => x.id === id);
      return Boolean(
        p && d >= isoDay(p.dateOfJoining) && (!p.dateOfExit || d <= isoDay(p.dateOfExit)),
      );
    };
    const unmarked = register.rows
      .map((r) => ({
        employee: r.employee,
        days: register.days.filter(
          (d, i) => d <= today && r.cells[i]?.code === '' && employed(r.employee.id, d),
        ),
        lates: r.lates,
        latePenaltyDays: r.latePenaltyDays,
      }))
      .filter((r) => r.days.length || r.latePenaltyDays);
    return {
      month,
      status: row?.status ?? 'OPEN',
      closedAt: row?.closedAt?.toISOString() ?? null,
      canClose: month < today.slice(0, 7),
      unmarkedAs: policy.unmarkedDays,
      unmarked,
      unmarkedDays: unmarked.reduce((n, r) => n + r.days.length, 0),
    };
  }

  async close(input: MonthCloseInput) {
    const tenantId = requireTenantId();
    if (input.month >= todayIst().slice(0, 7))
      throw new BadRequestException('A month can be closed once it has ended');
    const current = await this.status(input.month);
    if (current.status === 'CLOSED') throw new ConflictException('This month is already closed');
    const userId = currentContext().userId ?? null;
    const rows = current.unmarked.flatMap((r) =>
      r.days.map((d) => ({
        tenantId,
        employeeId: r.employee.id,
        date: toDate(d),
        status: input.unmarkedAs,
        source: 'HR' as const,
        note: 'Unmarked when the month was closed',
        markedById: userId,
      })),
    );
    await this.prisma.db.$transaction([
      this.prisma.db.attendanceRecord.createMany({ data: rows, skipDuplicates: true }),
      this.prisma.db.attendanceMonth.upsert({
        where: { tenantId_month: { tenantId, month: input.month } },
        create: {
          tenantId,
          month: input.month,
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: userId,
        },
        update: { status: 'CLOSED', closedAt: new Date(), closedById: userId },
      }),
    ]);
    await this.audit.record('attendance.month_closed', 'AttendanceMonth', input.month, {
      month: input.month,
      unmarked: rows.length,
      as: input.unmarkedAs,
    });
    return { month: input.month, status: 'CLOSED', marked: rows.length };
  }

  async reopen(month: string) {
    const run = await this.prisma.db.payrollRun.findFirst({
      where: { month, status: { in: ['LOCKED', 'PAID'] } },
    });
    if (run)
      throw new BadRequestException('Payroll for this month is locked. Unlock payroll first.');
    const res = await this.prisma.db.attendanceMonth.updateMany({
      where: { month, status: 'CLOSED' },
      data: { status: 'OPEN', closedAt: null, closedById: null },
    });
    if (!res.count) throw new BadRequestException('This month isn’t closed');
    await this.audit.record('attendance.month_reopened', 'AttendanceMonth', month, { month });
    return { month, status: 'OPEN' };
  }
}

@Controller()
export class LeaveRulesController {
  constructor(
    private readonly close: MonthCloseService,
    private readonly leave: LeaveService,
  ) {}

  @Get('attendance/close')
  @RequirePermissions('attendance.manage')
  status(@Query(new ZodPipe(monthQuery)) q: z.infer<typeof monthQuery>) {
    return this.close.status(q.month);
  }

  @Post('attendance/close')
  @RequirePermissions('attendance.manage')
  @HttpCode(200)
  closeMonth(@Body(new ZodPipe(monthCloseSchema)) body: MonthCloseInput) {
    return this.close.close(body);
  }

  @Post('attendance/close/reopen')
  @RequirePermissions('attendance.manage')
  @HttpCode(200)
  reopen(@Body(new ZodPipe(monthQuery)) body: z.infer<typeof monthQuery>) {
    return this.close.reopen(body.month);
  }

  @Get('leave/ledger')
  ledger(@Query(new ZodPipe(ledgerQuery)) q: z.infer<typeof ledgerQuery>) {
    return this.leave.ledger(q.employeeId, q.year ?? Number(todayIst().slice(0, 4)));
  }

  @Post('leave/adjustments')
  @RequirePermissions('attendance.manage')
  adjust(@Body(new ZodPipe(leaveAdjustmentSchema)) body: LeaveAdjustmentInput) {
    return this.leave.adjust(body);
  }

  @Post('leave/year-end')
  @RequirePermissions('attendance.manage')
  @HttpCode(200)
  yearEnd(@Body(new ZodPipe(leaveYearEndSchema)) body: LeaveYearEndInput) {
    return this.leave.yearEnd(body);
  }
}
