import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateEmployeeInput, ListEmployeesQuery, UpdateEmployeeInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const employeeInclude = {
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  legalEntity: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListEmployeesQuery) {
    const where: Prisma.EmployeeWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.search
        ? {
            OR: ['firstName', 'lastName', 'workEmail', 'employeeCode'].map((field) => ({
              [field]: { contains: q.search, mode: 'insensitive' },
            })),
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.db.employee.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    const employee = await this.prisma.db.employee.findUnique({
      where: { id },
      include: employeeInclude,
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async create(input: CreateEmployeeInput) {
    await this.assertReferences(input);
    const employee = await this.prisma.db.employee.create({
      data: {
        ...input,
        tenantId: requireTenantId(),
        customFields: input.customFields as Prisma.InputJsonValue,
      },
      include: employeeInclude,
    });
    await this.audit.record('employee.created', 'Employee', employee.id, {
      employeeCode: employee.employeeCode,
    });
    return employee;
  }

  async update(id: string, input: UpdateEmployeeInput) {
    await this.get(id);
    if (input.managerId === id)
      throw new BadRequestException('An employee cannot manage themselves');
    await this.assertReferences(input);
    const employee = await this.prisma.db.employee.update({
      where: { id },
      data: {
        ...input,
        customFields: input.customFields as Prisma.InputJsonValue | undefined,
      },
      include: employeeInclude,
    });
    await this.audit.record('employee.updated', 'Employee', id, { fields: Object.keys(input) });
    return employee;
  }

  /**
   * Foreign keys alone don't stop one workspace pointing at another's rows, so
   * every referenced id is looked up through the tenant-scoped client first.
   */
  private async assertReferences(input: UpdateEmployeeInput) {
    const db = this.prisma.db;
    const checks: [string, string | null | undefined, (id: string) => Promise<unknown>][] = [
      ['departmentId', input.departmentId, (id) => db.department.findUnique({ where: { id } })],
      ['designationId', input.designationId, (id) => db.designation.findUnique({ where: { id } })],
      ['locationId', input.locationId, (id) => db.location.findUnique({ where: { id } })],
      ['legalEntityId', input.legalEntityId, (id) => db.legalEntity.findUnique({ where: { id } })],
      ['managerId', input.managerId, (id) => db.employee.findUnique({ where: { id } })],
    ];
    const missing: string[] = [];
    await Promise.all(
      checks.map(async ([field, id, find]) => {
        if (id && !(await find(id))) missing.push(field);
      }),
    );
    if (missing.length) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: Object.fromEntries(missing.map((f) => [f, ['Not found in this workspace']])),
      });
    }
  }
}
