import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LoginInput, SignupInput, SYSTEM_ROLES, SystemRoleKey } from '@hrms/shared';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './auth.guard';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  /** Verified against when the user does not exist, so timing doesn't reveal which emails are registered. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Creates a workspace with its system roles, the owner's login and their employee record. */
  async signup(input: SignupInput, client: ClientInfo): Promise<IssuedTokens> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: input.companyName, slug: input.workspace },
        });
        const roles = await Promise.all(
          (Object.keys(SYSTEM_ROLES) as SystemRoleKey[]).map((key) =>
            tx.role.create({
              data: {
                tenantId: tenant.id,
                key,
                name: SYSTEM_ROLES[key].name,
                isSystem: true,
                permissions: SYSTEM_ROLES[key].permissions,
              },
            }),
          ),
        );
        const owner = roles.find((r) => r.key === 'owner')!;
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.email,
            fullName: input.fullName,
            passwordHash,
            roles: { create: { tenantId: tenant.id, roleId: owner.id } },
          },
        });
        const [firstName, ...rest] = input.fullName.split(/\s+/);
        await tx.employee.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            employeeCode: 'EMP-0001',
            firstName: firstName ?? input.fullName,
            lastName: rest.join(' '),
            workEmail: input.email,
            dateOfJoining: new Date(),
            status: 'ACTIVE',
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            actorId: user.id,
            action: 'workspace.created',
            entity: 'Tenant',
            entityId: tenant.id,
            ip: client.ip ?? null,
          },
        });
        return user;
      });
      return this.issueTokens(user.id, user.tenantId, client);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('That workspace name is taken');
      }
      throw err;
    }
  }

  async login(input: LoginInput, client: ClientInfo): Promise<IssuedTokens> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, tenant: { slug: input.workspace } },
      include: { tenant: { select: { status: true } } },
    });
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, input.password);
    if (!user || !valid || user.status !== 'ACTIVE' || user.tenant.status === 'SUSPENDED') {
      throw new UnauthorizedException('Wrong workspace, email or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user.id, user.tenantId, client);
  }

  /**
   * Rotates the refresh token. Presenting an already-rotated token means it was
   * copied, so every session for that user is revoked.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<IssuedTokens> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: { status: true } } },
    });
    if (!session) throw new UnauthorizedException();
    if (session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    if (session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException(); // lost a race with a concurrent refresh
    return this.issueTokens(session.userId, session.tenantId, client);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async issueTokens(userId: string, tenantId: string, client: ClientInfo): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = { sub: userId, tid: tenantId };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(32).toString('base64url');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({
      data: {
        tenantId,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: client.ip ?? null,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
      },
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  private getDummyHash() {
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
    return this.dummyHash;
  }
}
