import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';
import type { Permission } from '@hrms/shared';

export interface RequestContext {
  tenantId?: string;
  userId?: string;
  permissions?: ReadonlySet<Permission>;
  ip?: string;
}

/**
 * Per-request store. A middleware opens it for every request and the auth guard
 * fills it in, so services and the Prisma tenant scope can read the caller's
 * workspace without passing it through every function.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext {
  return requestContext.getStore() ?? {};
}

export function requireTenantId(): string {
  const tenantId = requestContext.getStore()?.tenantId;
  if (!tenantId) {
    // Reaching tenant data without an authenticated workspace is a programming error.
    throw new ForbiddenException('No workspace in request context');
  }
  return tenantId;
}
