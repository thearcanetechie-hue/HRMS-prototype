import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InvitationsController } from '../invitations/invitations.controller';
import { InvitationsService } from '../invitations/invitations.service';
import { ProfilesController } from '../profiles/profiles.controller';
import { ProfilesService } from '../profiles/profiles.service';
import { EmployeeAccess } from './employee-access.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [EmployeesController, ProfilesController, InvitationsController],
  providers: [EmployeesService, EmployeeAccess, ProfilesService, InvitationsService],
})
export class EmployeesModule {}
