import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
