import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@hrms/shared';

export const IS_PUBLIC = 'isPublic';
/** Route needs no login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
/** Caller needs every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const ANY_PERMISSIONS_KEY = 'anyPermissions';
/** Caller needs at least one of the listed permissions; the service narrows what they see. */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  permissions: Permission[];
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
