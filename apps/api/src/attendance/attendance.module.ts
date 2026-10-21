import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { LeaveService } from './leave.service';

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, LeaveService],
})
export class AttendanceModule {}
