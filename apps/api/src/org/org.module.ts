import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrgController } from './org.controller';

@Module({ imports: [AuditModule], controllers: [OrgController] })
export class OrgModule {}
