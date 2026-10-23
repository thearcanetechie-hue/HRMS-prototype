import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { WorkCalendarService } from './calendar';
import { DevicesService } from './devices.service';
import { LeaveService } from './leave.service';
import { RegularisationService } from './regularisation.service';
import { AttendanceSetupController, IclockController } from './setup.controller';
import { AttendanceSetupService } from './setup.service';

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [AttendanceController, AttendanceSetupController, IclockController],
  providers: [
    AttendanceService,
    LeaveService,
    WorkCalendarService,
    AttendanceSetupService,
    RegularisationService,
    DevicesService,
  ],
  exports: [AttendanceService, LeaveService, WorkCalendarService, RegularisationService],
})
export class AttendanceModule {}
