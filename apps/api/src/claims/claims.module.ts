import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  claimCategorySchema,
  ClaimCategoryInput,
  createExpenseSchema,
  CreateExpenseInput,
  createOvertimeSchema,
  CreateOvertimeInput,
  decideClaimsSchema,
  DecideClaimsInput,
  listClaimsQuerySchema,
  ListClaimsQuery,
} from '@hrms/shared';
import { z } from 'zod';
import { AuditModule } from '../audit/audit.module';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesModule } from '../employees/employees.module';
import { ClaimsService } from './claims.service';

const monthQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

@Controller('claims')
class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Get('summary')
  summary(@Query(new ZodPipe(monthQuery)) q: z.infer<typeof monthQuery>) {
    return this.claims.summary(q.month);
  }

  @Get('categories')
  categories() {
    return this.claims.categories();
  }

  @Post('categories')
  @RequirePermissions('claims.manage')
  createCategory(@Body(new ZodPipe(claimCategorySchema)) body: ClaimCategoryInput) {
    return this.claims.createCategory(body);
  }

  @Patch('categories/:id')
  @RequirePermissions('claims.manage')
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(claimCategorySchema.partial())) body: Partial<ClaimCategoryInput>,
  ) {
    return this.claims.updateCategory(id, body);
  }

  @Get('overtime')
  overtime(@Query(new ZodPipe(listClaimsQuerySchema)) q: ListClaimsQuery) {
    return this.claims.listOvertime(q);
  }

  @Post('overtime')
  createOvertime(@Body(new ZodPipe(createOvertimeSchema)) body: CreateOvertimeInput) {
    return this.claims.createOvertime(body);
  }

  @Post('overtime/decision')
  @HttpCode(200)
  decideOvertime(@Body(new ZodPipe(decideClaimsSchema)) body: DecideClaimsInput) {
    return this.claims.decide('overtime', body);
  }

  @Get('expenses')
  expenses(@Query(new ZodPipe(listClaimsQuerySchema)) q: ListClaimsQuery) {
    return this.claims.listExpenses(q);
  }

  @Post('expenses')
  createExpense(@Body(new ZodPipe(createExpenseSchema)) body: CreateExpenseInput) {
    return this.claims.createExpense(body);
  }

  @Post('expenses/decision')
  @HttpCode(200)
  decideExpenses(@Body(new ZodPipe(decideClaimsSchema)) body: DecideClaimsInput) {
    return this.claims.decide('expense', body);
  }
}

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
})
export class ClaimsModule {}
