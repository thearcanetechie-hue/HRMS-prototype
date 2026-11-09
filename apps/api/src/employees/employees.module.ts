import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InvitationsController } from '../invitations/invitations.controller';
import { LifecycleController } from '../lifecycle/lifecycle.controller';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { InvitationsService } from '../invitations/invitations.service';
import { ProfilesController } from '../profiles/profiles.controller';
import { ProfilesService } from '../profiles/profiles.service';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { EmployeeAccess } from './employee-access.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    EmployeesController,
    CustomFieldsController,
    ProfilesController,
    InvitationsController,
    LifecycleController,
  ],
  providers: [
    EmployeesService,
    CustomFieldsService,
    EmployeeAccess,
    ProfilesService,
    InvitationsService,
    LifecycleService,
  ],
  exports: [EmployeeAccess, LifecycleService],
})
export class EmployeesModule {}
