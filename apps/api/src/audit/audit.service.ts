import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { currentContext, requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records an action by the current user in the current workspace. */
  async record(action: string, entity: string, entityId?: string | null, data?: unknown) {
    const ctx = currentContext();
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: requireTenantId(),
        actorId: ctx.userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: ctx.ip ?? null,
      },
    });
  }

  list(take = 50, cursor?: string) {
    return this.prisma.db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }
}
