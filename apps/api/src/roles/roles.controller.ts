import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { assignRolesSchema, createRoleSchema, PERMISSIONS, updateRoleSchema } from '@hrms/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** The permission catalogue, for building custom roles in the UI. */
  @Get('permissions')
  @RequirePermissions('role.read')
  permissions() {
    return Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description }));
  }

  @Get('roles')
  @RequirePermissions('role.read')
  list() {
    return this.roles.list();
  }

  @Post('roles')
  @RequirePermissions('role.manage')
  create(@Body(new ZodPipe(createRoleSchema)) body: z.infer<typeof createRoleSchema>) {
    return this.roles.create(body);
  }

  @Patch('roles/:id')
  @RequirePermissions('role.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateRoleSchema)) body: z.infer<typeof updateRoleSchema>,
  ) {
    return this.roles.update(id, body);
  }

  @Put('users/:id/roles')
  @RequirePermissions('role.manage')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assignRolesSchema)) body: z.infer<typeof assignRolesSchema>,
  ) {
    return this.roles.assign(id, body.roleIds);
  }
}
