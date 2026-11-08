import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateApiKeyInput, isPermission } from '@hrms/shared';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export const API_KEY_PREFIX = 'hrms_';
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');

/**
 * Keys for scripts and other apps. A key works as a bearer token and acts as the person who made
 * it, with only the permissions picked, and never more than that person can do at the time.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.apiKey.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { fullName: true } },
      },
    });
  }

  async create(input: CreateApiKeyInput) {
    const mine = currentContext().permissions ?? new Set();
    const bad = input.permissions.filter((p) => !isPermission(p) || !mine.has(p));
    if (bad.length)
      throw new BadRequestException(
        `A key can only have permissions you have yourself: ${bad.join(', ')}`,
      );
    const key = `${API_KEY_PREFIX}${randomBytes(30).toString('base64url')}`;
    const row = await this.prisma.db.apiKey.create({
      data: {
        tenantId: requireTenantId(),
        name: input.name,
        keyHash: hashApiKey(key),
        keyPrefix: key.slice(0, 12),
        permissions: input.permissions,
        createdById: currentContext().userId!,
        expiresAt: input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 86_400_000)
          : null,
      },
    });
    await this.audit.record('integration.api_key_created', 'ApiKey', row.id, {
      name: row.name,
      permissions: row.permissions,
    });
    const { keyHash: _h, ...safe } = row;
    return { ...safe, key };
  }

  async revoke(id: string) {
    const row = await this.prisma.db.apiKey.findFirst({ where: { id, revokedAt: null } });
    if (!row) throw new NotFoundException('API key not found');
    await this.prisma.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record('integration.api_key_revoked', 'ApiKey', id, { name: row.name });
  }
}
