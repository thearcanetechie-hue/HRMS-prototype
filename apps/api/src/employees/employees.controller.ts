import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  createEmployeeSchema,
  CreateEmployeeInput,
  listEmployeesQuerySchema,
  ListEmployeesQuery,
  updateEmployeeSchema,
  UpdateEmployeeInput,
} from '@hrms/shared';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employee.read')
  list(@Query(new ZodPipe(listEmployeesQuerySchema)) query: ListEmployeesQuery) {
    return this.employees.list(query);
  }

  @Get(':id')
  @RequirePermissions('employee.read')
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
