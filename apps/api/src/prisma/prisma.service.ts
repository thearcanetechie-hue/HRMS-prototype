import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { requireTenantId } from '../common/request-context';
import { tenantScoped, TenantPrismaClient } from './tenant-scope';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * The client feature modules should use: scoped to the caller's workspace.
   * The unscoped base client (`this`) is for auth and workspace provisioning only.
   */
  readonly db: TenantPrismaClient = tenantScoped(this, requireTenantId);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
