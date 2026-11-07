import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { PoliciesModule } from '../policies/policies.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { WorkCalendarService } from './calendar';
import { DevicesService } from './devices.service';
import { LeaveService } from './leave.service';
import { LeaveRulesController, MonthCloseService } from './month-close';
import { AttendancePeriods } from './periods';
import { RegularisationService } from './regularisation.service';
import { AttendanceSetupController, IclockController } from './setup.controller';
import { AttendanceSetupService } from './setup.service';

@Module({
  imports: [AuditModule, EmployeesModule, PoliciesModule],
  controllers: [
    AttendanceController,
    AttendanceSetupController,
    IclockController,
    LeaveRulesController,
  ],
  providers: [
    AttendanceService,
    LeaveService,
    WorkCalendarService,
    AttendanceSetupService,
    RegularisationService,
    DevicesService,
    AttendancePeriods,
    MonthCloseService,
  ],
  exports: [
    AttendanceService,
    LeaveService,
    WorkCalendarService,
    RegularisationService,
    AttendancePeriods,
  ],
})
export class AttendanceModule {}
