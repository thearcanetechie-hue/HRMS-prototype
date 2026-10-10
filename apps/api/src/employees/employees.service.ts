import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateEmployeeInput, ListEmployeesQuery, UpdateEmployeeInput } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { EmployeeAccess } from './employee-access.service';
import { requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const employeeInclude = {
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  legalEntity: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  user: { select: { id: true, status: true } },
} satisfies Prisma.EmployeeInclude;

/** What the company directory shows to people who can't see full records. */
const directorySelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  workEmail: true,
  phone: true,
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  manager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: EmployeeAccess,
  ) {}

  /** Full records for `employee.read`; otherwise the directory, which leaves out people who have left. */
  async list(q: ListEmployeesQuery) {
    const full = this.access.can('employee.read');
    const status: Prisma.EmployeeWhereInput['status'] = full
      ? q.status
      : q.status === 'EXITED'
        ? { in: [] }
        : (q.status ?? { not: 'EXITED' });
    const where: Prisma.EmployeeWhereInput = {
      ...(status ? { status } : {}),
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
        ...(full ? { include: employeeInclude } : { select: directorySelect }),
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.db.employee.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(id: string) {
    if (await this.access.canSeeFull(id)) {
      const employee = await this.prisma.db.employee.findUnique({
        where: { id },
        include: employeeInclude,
      });
      if (employee) return employee;
    } else if (this.access.can('directory.read')) {
      const employee = await this.prisma.db.employee.findFirst({
        where: { id, status: { not: 'EXITED' } },
        select: directorySelect,
      });
      if (employee) return employee;
    }
    throw new NotFoundException('Employee not found');
  }

  /** The caller's reporting line, direct reports first. */
  async team() {
    const self = await this.access.selfEmployeeId();
    if (!self) return { items: [] };
    const ids = await this.access.reportingLine(self);
    const items = await this.prisma.db.employee.findMany({
      where: { id: { in: ids } },
      include: employeeInclude,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    items.sort((a, b) => Number(b.managerId === self) - Number(a.managerId === self));
    return { items: items.map((e) => ({ ...e, direct: e.managerId === self })) };
  }

  private async getFull(id: string) {
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
    await this.getFull(id);
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
