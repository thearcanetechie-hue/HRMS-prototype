import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isPermission, Permission } from '@hrms/shared';
import type { Request } from 'express';
import { requestContext } from '../common/request-context';
import { API_KEY_PREFIX, hashApiKey } from '../integrations/api-keys.service';
import { PrismaService } from '../prisma/prisma.service';
import { ANY_PERMISSIONS_KEY, AuthUser, IS_PUBLIC, PERMISSIONS_KEY } from './decorators';

export interface AccessTokenPayload {
  sub: string;
  tid: string;
  /** The sign-in (session family) this token belongs to; signing that device out ends it. */
  sid?: string;
}

/**
 * Global guard: verifies the bearer token, loads the user's current roles (so a
 * role change applies on the next request, not at token expiry), fills the
 * request context, then checks the route's required permissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException();

    let payload: AccessTokenPayload;
    let keyPermissions: string[] | null = null;
    if (token.startsWith(API_KEY_PREFIX)) {
      // Keys can't touch sign-in, passwords, two-step codes or other keys.
      if (/^\/api\/(auth|integrations\/api-keys)(\/|$)/.test(req.path))
        throw new ForbiddenException('API keys can’t be used here');
      // An API key acts as the person who made it, narrowed to the key's permissions.
      const key = await this.prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
      if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date()))
        throw new UnauthorizedException('This API key is not valid');
      payload = { sub: key.createdById, tid: key.tenantId };
      keyPermissions = key.permissions;
      // At most one write a minute per key.
      if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000)
        await this.prisma.apiKey.update({
          where: { id: key.id },
          data: { lastUsedAt: new Date() },
        });
    } else {
      try {
        payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      } catch {
        throw new UnauthorizedException();
      }
    }

    const [user, live] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: payload.sub, tenantId: payload.tid, status: 'ACTIVE' },
        include: { tenant: { select: { status: true } }, roles: { include: { role: true } } },
      }),
      // A signed-out device's access token stops working now, not when it expires.
      payload.sid
        ? this.prisma.session.findFirst({
            where: {
              userId: payload.sub,
              familyId: payload.sid,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          })
        : Promise.resolve({ id: 'legacy' }),
    ]);
    if (!user || !live || user.tenant.status === 'SUSPENDED') throw new UnauthorizedException();

    const permissions = new Set<Permission>();
    for (const { role } of user.roles) {
      for (const p of role.permissions) if (isPermission(p)) permissions.add(p);
    }
    if (keyPermissions)
      for (const p of [...permissions]) if (!keyPermissions.includes(p)) permissions.delete(p);

    const store = requestContext.getStore();
    if (store) {
      store.tenantId = user.tenantId;
      store.userId = user.id;
      store.permissions = permissions;
    }
    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      permissions: [...permissions],
      sessionId: payload.sid,
    };

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, targets);
    const anyOf = this.reflector.getAllAndOverride<Permission[]>(ANY_PERMISSIONS_KEY, targets);
    if (
      required?.some((p) => !permissions.has(p)) ||
      (anyOf && !anyOf.some((p) => permissions.has(p)))
    ) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
