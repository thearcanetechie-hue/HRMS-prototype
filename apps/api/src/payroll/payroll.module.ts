import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  createPayrollRunSchema,
  CreatePayrollRunInput,
  markFiledSchema,
  MarkFiledInput,
  salaryStructureSchema,
  SalaryStructureInput,
} from '@hrms/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AuditModule } from '../audit/audit.module';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { PayrollService } from './payroll.service';

const monthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });

@Controller('payroll')
class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('salaries')
  @RequirePermissions('payroll.manage')
  salaries() {
    return this.payroll.salaries();
  }

  /** One person's salary: for payroll.manage, or the person themselves. */
  @Get('salaries/:employeeId')
  salaryOf(@Param('employeeId', ParseUUIDPipe) id: string) {
    return this.payroll.salaryOf(id);
  }

  @Put('salaries/:employeeId')
  @RequirePermissions('payroll.manage')
  setSalary(
    @Param('employeeId', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(salaryStructureSchema)) body: SalaryStructureInput,
  ) {
    return this.payroll.setSalary(id, body);
  }

  @Get('runs')
  @RequirePermissions('payroll.manage')
  runs() {
    return this.payroll.runs();
  }

  /** Starts (or returns) the run for a month. */
  @Post('runs')
  @RequirePermissions('payroll.manage')
  createRun(@Body(new ZodPipe(createPayrollRunSchema)) body: CreatePayrollRunInput) {
    return this.payroll.createRun(body.month);
  }

  @Get('runs/:id')
  @RequirePermissions('payroll.manage')
  run(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.run(id);
  }

  @Post('runs/:id/recalculate')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  recalculate(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.recalculate(id);
  }

  @Post('runs/:id/payslips/:payslipId/review')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('payslipId', ParseUUIDPipe) payslipId: string,
  ) {
    return this.payroll.review(id, payslipId);
  }

  @Post('runs/:id/lock')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  lock(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.lock(id);
  }

  @Post('runs/:id/unlock')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  unlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.unlock(id);
  }

  @Post('runs/:id/paid')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  paid(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.markPaid(id);
  }

  @Get('runs/:id/bank-file')
  @RequirePermissions('payroll.manage')
  async bankFile(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { csv, fileName, missing } = await this.payroll.bankFile(id);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Missing-Bank-Details': String(missing),
    });
    res.end(csv);
  }

  @Get('my-payslips')
  myPayslips() {
    return this.payroll.myPayslips();
  }

  @Get('payslips/:id')
  payslip(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.payslip(id);
  }

  @Get('compliance')
  @RequirePermissions('payroll.manage')
  compliance(@Query(new ZodPipe(monthQuery)) q: z.infer<typeof monthQuery>) {
    return this.payroll.compliance(q.month);
  }

  @Post('compliance/filed')
  @RequirePermissions('payroll.manage')
  markFiled(@Body(new ZodPipe(markFiledSchema)) body: MarkFiledInput) {
    return this.payroll.markFiled(body);
  }
}

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
