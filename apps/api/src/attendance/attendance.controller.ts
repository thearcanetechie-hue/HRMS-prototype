import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createLeaveRequestSchema,
  CreateLeaveRequestInput,
  decideLeaveSchema,
  DecideLeaveInput,
  leaveTypeSchema,
  LeaveTypeInput,
  listLeaveQuerySchema,
  ListLeaveQuery,
  markAttendanceSchema,
  MarkAttendanceInput,
  registerQuerySchema,
  RegisterQuery,
  updateLeaveTypeSchema,
  UpdateLeaveTypeInput,
} from '@hrms/shared';
import { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AttendanceService } from './attendance.service';
import { LeaveService } from './leave.service';

const balanceQuery = z.object({
  employeeId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

@Controller()
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
  ) {}

  // ---------- attendance ----------

  /** Month grid of day codes for the people the caller can see. */
  @Get('attendance/register')
  register(@Query(new ZodPipe(registerQuerySchema)) q: RegisterQuery) {
    return this.attendance.register(q);
  }

  @Get('attendance/today')
  today() {
    return this.attendance.summary();
  }

  @Post('attendance/check-in')
  @HttpCode(200)
  checkIn() {
    return this.attendance.checkIn();
  }

  @Post('attendance/check-out')
  @HttpCode(200)
  checkOut() {
    return this.attendance.checkOut();
  }

  @Put('attendance/marks')
  @RequirePermissions('attendance.manage')
  mark(@Body(new ZodPipe(markAttendanceSchema)) body: MarkAttendanceInput) {
    return this.attendance.mark(body);
  }

  // ---------- leave ----------

  @Get('leave/types')
  types() {
    return this.leave.types();
  }

  @Post('leave/types')
  @RequirePermissions('attendance.manage')
  createType(@Body(new ZodPipe(leaveTypeSchema)) body: LeaveTypeInput) {
    return this.leave.createType(body);
  }

  @Patch('leave/types/:id')
  @RequirePermissions('attendance.manage')
  updateType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateLeaveTypeSchema)) body: UpdateLeaveTypeInput,
  ) {
    return this.leave.updateType(id, body);
  }

  @Get('leave/balances')
  async balances(@Query(new ZodPipe(balanceQuery)) q: z.infer<typeof balanceQuery>) {
    const employeeId = q.employeeId ?? (await this.leave.viewer()).self;
    if (!employeeId) return [];
    return this.leave.balances(employeeId, q.year);
  }

  @Get('leave/requests')
  requests(@Query(new ZodPipe(listLeaveQuerySchema)) q: ListLeaveQuery) {
    return this.leave.list(q);
  }

  @Post('leave/requests')
  apply(@Body(new ZodPipe(createLeaveRequestSchema)) body: CreateLeaveRequestInput) {
    return this.leave.create(body);
  }

  @Post('leave/requests/:id/decision')
  @HttpCode(200)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(decideLeaveSchema)) body: DecideLeaveInput,
  ) {
    return this.leave.decide(id, body);
  }

  @Post('leave/requests/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.leave.cancel(id);
  }
}
