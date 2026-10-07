import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createRoleSchema, updateRoleSchema } from '@hrms/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { users: true } } },
    });
  }

  async create(input: z.infer<typeof createRoleSchema>) {
    const role = await this.prisma.db.role.create({
      data: { ...input, tenantId: requireTenantId(), isSystem: false },
    });
    await this.audit.record('role.created', 'Role', role.id, input);
    return role;
  }

  async update(id: string, input: z.infer<typeof updateRoleSchema>) {
    const role = await this.prisma.db.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.key === 'owner') throw new ForbiddenException('The Owner role cannot be changed');
    const updated = await this.prisma.db.role.update({ where: { id }, data: input });
    await this.audit.record('role.updated', 'Role', id, input);
    return updated;
  }

  /** Replaces a user's roles. The workspace always keeps at least one owner. */
  async assign(userId: string, roleIds: string[]) {
    const db = this.prisma.db;
    const tenantId = requireTenantId();
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    const roles = await db.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== new Set(roleIds).size) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { roleIds: ['Unknown role'] },
      });
    }

    const wasOwner = user.roles.some((r) => r.role.key === 'owner');
    const staysOwner = roles.some((r) => r.key === 'owner');
    if (wasOwner && !staysOwner) {
      const owners = await db.userRole.count({ where: { role: { key: 'owner' } } });
      if (owners <= 1) throw new BadRequestException('The workspace needs at least one owner');
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { tenantId, userId } }),
      this.prisma.userRole.createMany({
        data: roles.map((r) => ({ tenantId, userId, roleId: r.id })),
      }),
    ]);
    await this.audit.record('user.roles_assigned', 'User', userId, {
      roles: roles.map((r) => r.key),
    });
    return { userId, roles: roles.map(({ id, key, name }) => ({ id, key, name })) };
  }
}
