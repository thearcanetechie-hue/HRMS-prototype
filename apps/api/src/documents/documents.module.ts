import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmployeesModule } from '../employees/employees.module';
import { DocumentStorage } from './document-storage';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuditModule, EmployeesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentStorage],
})
export class DocumentsModule {}
