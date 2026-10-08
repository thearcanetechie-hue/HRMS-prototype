import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createEmployeeSchema,
  CreateEmployeeInput,
  listEmployeesQuerySchema,
  ListEmployeesQuery,
  updateEmployeeSchema,
  UpdateEmployeeInput,
} from '@hrms/shared';
import { RequireAnyPermission, RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequireAnyPermission('employee.read', 'directory.read')
  list(@Query(new ZodPipe(listEmployeesQuerySchema)) query: ListEmployeesQuery) {
    return this.employees.list(query);
  }

  /** Everyone in the caller's reporting line. Declared before :id so "team" isn't read as an id. */
  @Get('team')
  @RequirePermissions('team.read')
  team() {
    return this.employees.team();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(id);
  }

  @Post()
  @RequirePermissions('employee.manage')
  create(@Body(new ZodPipe(createEmployeeSchema)) body: CreateEmployeeInput) {
    return this.employees.create(body);
  }

  @Patch(':id')
  @RequirePermissions('employee.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateEmployeeSchema)) body: UpdateEmployeeInput,
  ) {
    return this.employees.update(id, body);
  }
}
