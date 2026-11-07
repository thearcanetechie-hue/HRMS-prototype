import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  payItemSchema,
  PayItemInput,
  settlementSchema,
  SettlementInput,
  taxDeclarationSchema,
  TaxDeclarationInput,
} from '@hrms/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { todayIst } from '../attendance/days';
import { StatutoryService } from './statutory.service';

const currentFy = () => {
  const [y, m] = todayIst().split('-').map(Number) as [number, number];
  return m >= 4 ? y : y - 1;
};
const fyQuery = z.object({
  fyStart: z.coerce.number().int().min(2000).max(2100).optional(),
  employeeId: z.string().uuid().optional(),
});
const monthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) });
const quarterQuery = z.object({
  fyStart: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
});
const bonusSchema = z.object({
  fyStart: z.number().int().min(2000).max(2100),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  preview: z.boolean().default(true),
});

/** Declarations, pay items, bonus, settlements and statutory files. */
@Controller('payroll')
export class StatutoryController {
  constructor(private readonly statutory: StatutoryService) {}

  // ---------- Form 12BB ----------

  @Get('declarations/mine')
  mine(@Query(new ZodPipe(fyQuery)) q: z.infer<typeof fyQuery>) {
    return this.statutory.declaration(q.employeeId, q.fyStart ?? currentFy());
  }

  @Get('declarations/compare')
  compare(@Query(new ZodPipe(fyQuery)) q: z.infer<typeof fyQuery>) {
    return this.statutory.compareRegimes(q.employeeId, q.fyStart ?? currentFy());
  }

  @Get('declarations')
  @RequirePermissions('payroll.manage')
  all(@Query(new ZodPipe(fyQuery)) q: z.infer<typeof fyQuery>) {
    return this.statutory.declarations(q.fyStart ?? currentFy());
  }

  @Put('declarations')
  declare(@Body(new ZodPipe(taxDeclarationSchema)) body: TaxDeclarationInput) {
    return this.statutory.declare(body);
  }

  @Post('declarations/:id/verify')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.statutory.verifyDeclaration(id);
  }

  // ---------- pay items ----------

  @Get('items')
  @RequirePermissions('payroll.manage')
  items(@Query(new ZodPipe(monthQuery)) q: z.infer<typeof monthQuery>) {
    return this.statutory.items(q.month);
  }

  @Post('items')
  @RequirePermissions('payroll.manage')
  addItem(@Body(new ZodPipe(payItemSchema)) body: PayItemInput) {
    return this.statutory.addItem(body);
  }

  @Delete('items/:id')
  @RequirePermissions('payroll.manage')
  @HttpCode(204)
  removeItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.statutory.removeItem(id);
  }

  @Post('bonus')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  bonus(@Body(new ZodPipe(bonusSchema)) body: z.infer<typeof bonusSchema>) {
    return this.statutory.bonus(body.fyStart, body.month, body.preview);
  }

  // ---------- full and final ----------

  @Get('settlements/:employeeId')
  @RequirePermissions('payroll.manage')
  settlement(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.statutory.settlement(employeeId);
  }

  @Post('settlements')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  settle(@Body(new ZodPipe(settlementSchema)) body: SettlementInput) {
    return this.statutory.settle(body);
  }

  @Post('settlements/:employeeId/finalise')
  @RequirePermissions('payroll.manage')
  @HttpCode(200)
  finalise(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.statutory.finalise(employeeId);
  }

  // ---------- statutory files ----------

  @Get('runs/:id/ecr')
  @RequirePermissions('payroll.manage')
  ecr(@Param('id', ParseUUIDPipe) id: string) {
    return this.statutory.ecr(id);
  }

  @Get('runs/:id/esi')
  @RequirePermissions('payroll.manage')
  esi(@Param('id', ParseUUIDPipe) id: string) {
    return this.statutory.esi(id);
  }

  @Get('runs/:id/state-levies')
  @RequirePermissions('payroll.manage')
  levies(@Param('id', ParseUUIDPipe) id: string) {
    return this.statutory.stateLevies(id);
  }

  @Get('returns/24q')
  @RequirePermissions('payroll.manage')
  form24Q(@Query(new ZodPipe(quarterQuery)) q: z.infer<typeof quarterQuery>) {
    return this.statutory.form24Q(q.fyStart, q.quarter);
  }

  @Get('form16')
  form16(@Query(new ZodPipe(fyQuery)) q: z.infer<typeof fyQuery>) {
    return this.statutory.form16(q.employeeId, q.fyStart ?? currentFy());
  }
}
