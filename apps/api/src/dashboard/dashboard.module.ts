import { Controller, ForbiddenException, Get, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditModule } from '../audit/audit.module';
import { AuditService } from '../audit/audit.service';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeeAccess } from '../employees/employee-access.service';
import { EmployeesModule } from '../employees/employees.module';
import { DashboardService } from './dashboard.service';

const activityQuery = z.object({
  employeeId: z.string().uuid().optional(),
  take: z.coerce.number().int().min(1).max(100).default(30),
});

@Controller('dashboard')
class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly audit: AuditService,
    private readonly access: EmployeeAccess,
  ) {}

  /** Home screen numbers for the signed-in person. */
  @Get('home')
  home() {
    return this.dashboard.home();
  }

  /**
   * Recent changes in plain words. The whole company's for `employee.read`; one person's for
   * anyone who can see that person in full (themselves, their managers, HR).
   */
  @Get('activity')
  async activity(@Query(new ZodPipe(activityQuery)) q: z.infer<typeof activityQuery>) {
    const allowed = q.employeeId
      ? this.access.can('employee.read') || (await this.access.canSeeFull(q.employeeId))
      : this.access.can('employee.read');
    if (!allowed) throw new ForbiddenException('You can’t see this activity');
    return this.audit.feed(q);
  }
}

@Module({
  imports: [AttendanceModule, EmployeesModule, AuditModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
