import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import {
  createDepartmentSchema,
  createDesignationSchema,
  createLegalEntitySchema,
  createLocationSchema,
} from '@hrms/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../auth/decorators';
import { requireTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

/** Organisation structure: departments, designations, locations and legal entities. */
@Controller('org')
export class OrgController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('departments')
  @RequirePermissions('org.read')
  departments() {
    return this.prisma.db.department.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('departments')
  @RequirePermissions('org.manage')
  async createDepartment(
    @Body(new ZodPipe(createDepartmentSchema)) body: z.infer<typeof createDepartmentSchema>,
  ) {
    if (
      body.parentId &&
      !(await this.prisma.db.department.findUnique({ where: { id: body.parentId } }))
    ) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { parentId: ['Not found in this workspace'] },
      });
    }
    const row = await this.prisma.db.department.create({
      data: { ...body, tenantId: requireTenantId() },
    });
    await this.audit.record('department.created', 'Department', row.id, { name: row.name });
    return row;
  }

  @Get('designations')
  @RequirePermissions('org.read')
  designations() {
    return this.prisma.db.designation.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }] });
  }

  @Post('designations')
  @RequirePermissions('org.manage')
  async createDesignation(
    @Body(new ZodPipe(createDesignationSchema)) body: z.infer<typeof createDesignationSchema>,
  ) {
    const row = await this.prisma.db.designation.create({
      data: { ...body, tenantId: requireTenantId() },
    });
    await this.audit.record('designation.created', 'Designation', row.id, { name: row.name });
    return row;
  }

  @Get('locations')
  @RequirePermissions('org.read')
  locations() {
    return this.prisma.db.location.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('locations')
  @RequirePermissions('org.manage')
  async createLocation(
    @Body(new ZodPipe(createLocationSchema)) body: z.infer<typeof createLocationSchema>,
  ) {
    const row = await this.prisma.db.location.create({
      data: { ...body, tenantId: requireTenantId() },
    });
    await this.audit.record('location.created', 'Location', row.id, { name: row.name });
    return row;
  }

  @Get('legal-entities')
  @RequirePermissions('org.read')
  legalEntities() {
    return this.prisma.db.legalEntity.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('legal-entities')
  @RequirePermissions('org.manage')
  async createLegalEntity(
    @Body(new ZodPipe(createLegalEntitySchema)) body: z.infer<typeof createLegalEntitySchema>,
  ) {
    const row = await this.prisma.db.legalEntity.create({
      data: { ...body, tenantId: requireTenantId() },
    });
    await this.audit.record('legal_entity.created', 'LegalEntity', row.id, { name: row.name });
    return row;
  }
}
