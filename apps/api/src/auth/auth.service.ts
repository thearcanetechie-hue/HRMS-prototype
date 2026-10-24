import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  LoginInput,
  passwordProblem,
  SignupInput,
  SYSTEM_ROLES,
  SystemRoleKey,
} from '@hrms/shared';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { requestContext } from '../common/request-context';
import type { Env } from '../config';
import { FieldCrypto } from '../crypto/field-crypto';
import { PolicyService } from '../policies/policies.module';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessTokenPayload } from './auth.guard';
import { MailService } from './mail.service';
import * as totp from './totp';

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  /** false: a browser-session cookie that ends when the browser closes. */
  persistent: boolean;
}

export type LoginResult = IssuedTokens | { mfaRequired: true; challenge: string };

export const TERMS_VERSION = '2026-10';
const VERIFY_HOURS = 48;
const RESET_MINUTES = 30;
const CHALLENGE_MINUTES = 5;
const RECOVERY_CODES = 10;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');
const normaliseRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');
const minutesFrom = (d: Date) => Math.max(1, Math.ceil((d.getTime() - Date.now()) / 60_000));

/** Permissions that make someone an admin for the "two-step sign-in for admins" policy. */
const ADMIN_PERMISSIONS = ['tenant.manage', 'role.manage', 'employee.manage', 'payroll.manage'];

/**
 * Sign-up, sign-in and account security.
 *
 * - Passwords: argon2id, NIST-style rules (length, no common or personal passwords).
 * - Lockout: too many wrong passwords in a row lock the login for a while (security policy),
 *   and the owner is told by email. Unknown emails take the same time to answer.
 * - Two-step sign-in with an authenticator app, and one-time recovery codes.
 * - Sessions: rotating refresh tokens in an httpOnly cookie; reusing a rotated token revokes
 *   every session. "Keep me signed in" off gives a short browser-session cookie.
 * - Email verification, password reset and "find my workspace" by email. Responses never
 *   reveal whether an email or workspace exists.
 */
@Injectable()
export class AuthService {
  /** Verified against when the user does not exist, so timing doesn't reveal which emails are registered. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
  ) {}

  private appUrl(path: string) {
    return `${this.config.get('APP_URL', { infer: true }).replace(/\/$/, '')}${path}`;
  }

  /** Requests without a login (sign-in, reset) act inside the workspace once it's known. */
  private enter(tenantId: string, userId?: string) {
    const store = requestContext.getStore();
    if (store) {
      store.tenantId = tenantId;
      if (userId) store.userId = userId;
    }
  }

  private async safeAudit(action: string, entity: string, entityId: string | null, data?: unknown) {
    try {
      await this.audit.record(action, entity, entityId, data);
    } catch {
      // Auditing must never block signing in.
    }
  }

  // ---------- sign-up ----------

  /** Creates a workspace with its system roles, the owner's login and their employee record. */
  async signup(input: SignupInput, client: ClientInfo): Promise<IssuedTokens> {
    if (input.website) throw new BadRequestException('Could not create the workspace');
    const problem = passwordProblem(input.password, {
      email: input.email,
      name: input.fullName,
      workspace: input.workspace,
      company: input.companyName,
    });
    if (problem) throw new BadRequestException(problem);
    if (RESERVED_WORKSPACES.has(input.workspace))
      throw new ConflictException('That workspace name is taken');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
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
        const created = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.email,
            fullName: input.fullName,
            passwordHash,
            passwordChangedAt: new Date(),
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
            roles: { create: { tenantId: tenant.id, roleId: owner.id } },
          },
        });
        const [firstName, ...rest] = input.fullName.split(/\s+/);
        await tx.employee.create({
          data: {
            tenantId: tenant.id,
            userId: created.id,
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
            actorId: created.id,
            action: 'workspace.created',
            entity: 'Tenant',
            entityId: tenant.id,
            data: { termsVersion: TERMS_VERSION },
            ip: client.ip ?? null,
          },
        });
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ConflictException('That workspace name is taken');
      throw err;
    }
    this.enter(user.tenantId, user.id);
    await this.sendVerification(user);
    return this.issueTokens(user.id, user.tenantId, client, { persistent: true });
  }

  // ---------- sign-in ----------

  async login(input: LoginInput, client: ClientInfo): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, tenant: { slug: input.workspace } },
      include: { tenant: { select: { status: true, name: true } } },
    });
    // Always run the hash check, so a missing account takes as long as a wrong password.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await argon2.verify(hash, input.password);
    const wrong = () => new UnauthorizedException('Wrong workspace, email or password');
    if (!user) throw wrong();
    this.enter(user.tenantId);

    if (user.lockedUntil && user.lockedUntil > new Date())
      throw new HttpException(
        `Too many wrong passwords. Try again in ${minutesFrom(user.lockedUntil)} minutes, or reset your password.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (!valid || !user.passwordHash) {
      await this.failedAttempt(user, client);
      throw wrong();
    }
    if (user.status !== 'ACTIVE' || user.tenant.status === 'SUSPENDED') throw wrong();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
    if (user.mfaEnabledAt) return this.challenge(user.id, user.tenantId, input.remember);
    return this.completeLogin(user.id, user.tenantId, client, input.remember, 'password');
  }

  private async completeLogin(
    userId: string,
    tenantId: string,
    client: ClientInfo,
    persistent: boolean,
    method: string,
  ) {
    this.enter(tenantId, userId);
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await this.safeAudit('auth.login', 'User', userId, { method, ip: client.ip });
    return this.issueTokens(userId, tenantId, client, { persistent });
  }

  private async failedAttempt(
    user: { id: string; tenantId: string; email: string; failedLogins: number; fullName: string },
    client: ClientInfo,
  ) {
    const policy = (await this.policies.get('security')).lockout;
    const failures = user.failedLogins + 1;
    const lock = failures >= policy.attempts;
    const lockedUntil = lock ? new Date(Date.now() + policy.minutes * 60_000) : null;
    await this.prisma.user.update({
      where: { id: user.id },
      data: lock ? { failedLogins: 0, lockedUntil } : { failedLogins: failures },
    });
    await this.safeAudit(lock ? 'auth.locked' : 'auth.login_failed', 'User', user.id, {
      ip: client.ip,
      failures,
    });
    if (lock)
      await this.mail.send({
        tenantId: user.tenantId,
        to: user.email,
        subject: 'Your HRMS login was locked',
        text: `Hi ${user.fullName},\n\nSomeone entered the wrong password for your login ${policy.attempts} times in a row${client.ip ? ` (from ${client.ip})` : ''}, so it is locked for ${policy.minutes} minutes.\n\nIf this was you, wait or reset your password: ${this.appUrl('/forgot-password')}\nIf it wasn't, reset your password now and tell your HR or IT team.\n`,
      });
  }

  /** Two-step sign-in, step one: the password was right; hold a short-lived challenge. */
  private async challenge(
    userId: string,
    tenantId: string,
    persistent: boolean,
  ): Promise<LoginResult> {
    const token = newToken();
    await this.prisma.authToken.create({
      data: {
        tenantId,
        userId,
        kind: 'MFA_CHALLENGE',
        tokenHash: hashToken(token),
        persistent,
        expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000),
      },
    });
    return { mfaRequired: true, challenge: token };
  }

  /** Two-step sign-in, step two: an authenticator code or a recovery code. */
  async verifyMfa(challenge: string, code: string, client: ClientInfo): Promise<IssuedTokens> {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(challenge) },
      include: { user: true },
    });
    if (!row || row.kind !== 'MFA_CHALLENGE' || row.usedAt || row.expiresAt < new Date())
      throw new UnauthorizedException('That sign-in has expired. Start again.');
    const user = row.user;
    this.enter(user.tenantId);
    if (user.lockedUntil && user.lockedUntil > new Date())
      throw new HttpException(
        `Too many wrong codes. Try again in ${minutesFrom(user.lockedUntil)} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const ok = (await this.checkTotp(user, code)) || (await this.useRecoveryCode(user.id, code));
    if (!ok) {
      await this.failedAttempt(user, client);
      throw new UnauthorizedException('That code isn’t right');
    }
    await this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0 } });
    return this.completeLogin(user.id, user.tenantId, client, row.persistent, 'password+mfa');
  }

  /** Signs in someone whose identity a provider (Google, Microsoft) has confirmed. */
  async loginExternal(
    userId: string,
    tenantId: string,
    client: ClientInfo,
    persistent: boolean,
    provider: string,
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabledAt) return this.challenge(userId, tenantId, persistent);
    return this.completeLogin(userId, tenantId, client, persistent, provider);
  }

  // ---------- sessions ----------

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
    if (session.expiresAt < new Date() || session.user.status !== 'ACTIVE')
      throw new UnauthorizedException();
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException(); // lost a race with a concurrent refresh
    this.enter(session.tenantId);
    return this.issueTokens(session.userId, session.tenantId, client, {
      persistent: session.persistent,
      familyId: session.familyId ?? session.id,
      // A rotation keeps the session's original end, so refreshing can't extend it forever.
      expiresAt: session.expiresAt,
    });
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async issueTokens(
    userId: string,
    tenantId: string,
    client: ClientInfo,
    opts: { persistent: boolean; familyId?: string; expiresAt?: Date },
  ): Promise<IssuedTokens> {
    const policy = await this.policies.get('security');
    const refreshToken = newToken();
    const lifetime = opts.persistent
      ? policy.rememberDays * 86_400_000
      : policy.sessionHours * 3_600_000;
    const refreshExpiresAt = opts.expiresAt ?? new Date(Date.now() + lifetime);
    const session = await this.prisma.session.create({
      data: {
        tenantId,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        persistent: opts.persistent,
        familyId: opts.familyId ?? null,
        ip: client.ip ?? null,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
      },
    });
    const familyId = opts.familyId ?? session.id;
    if (!opts.familyId)
      await this.prisma.session.update({ where: { id: session.id }, data: { familyId } });
    const payload: AccessTokenPayload = { sub: userId, tid: tenantId, sid: familyId };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, refreshToken, refreshExpiresAt, persistent: opts.persistent };
  }

  /** Signed-in devices: one row per sign-in, however many times it has refreshed. */
  async sessions(userId: string, currentFamily: string | undefined) {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    const families = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const f = r.familyId ?? r.id;
      if (!families.has(f)) families.set(f, r);
    }
    return [...families.entries()].map(([familyId, r]) => ({
      id: familyId,
      device: describeDevice(r.userAgent),
      ip: r.ip,
      lastActiveAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      persistent: r.persistent,
      current: familyId === currentFamily,
    }));
  }

  async revokeSession(userId: string, familyId: string) {
    const res = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, OR: [{ familyId }, { id: familyId }] },
      data: { revokedAt: new Date() },
    });
    if (!res.count) throw new BadRequestException('That session has already ended');
    await this.safeAudit('auth.session_revoked', 'User', userId);
  }

  async revokeOtherSessions(userId: string, keepFamily: string | undefined) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(keepFamily ? { NOT: { familyId: keepFamily } } : {}) },
      data: { revokedAt: new Date() },
    });
    await this.safeAudit('auth.sessions_revoked', 'User', userId);
  }

  // ---------- email verification, reset, find workspace ----------

  private async issueToken(
    user: { id: string; tenantId: string },
    kind: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
    minutes: number,
  ) {
    // Only the newest link of a kind works.
    await this.prisma.authToken.updateMany({
      where: { userId: user.id, kind, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = newToken();
    await this.prisma.authToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        kind,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + minutes * 60_000),
      },
    });
    return token;
  }

  private async sendVerification(user: {
    id: string;
    tenantId: string;
    email: string;
    fullName: string;
  }) {
    const token = await this.issueToken(user, 'EMAIL_VERIFY', VERIFY_HOURS * 60);
    await this.mail.send({
      tenantId: user.tenantId,
      to: user.email,
      subject: 'Confirm your email for HRMS',
      text: `Hi ${user.fullName},\n\nConfirm this is your email address:\n${this.appUrl(`/verify-email?token=${token}`)}\n\nThe link works for ${VERIFY_HOURS} hours. If you didn't sign up, ignore this email.\n`,
    });
  }

  async resendVerification(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return { verified: true };
    const recent = await this.prisma.authToken.findFirst({
      where: { userId, kind: 'EMAIL_VERIFY', createdAt: { gt: new Date(Date.now() - 60_000) } },
    });
    if (recent)
      throw new HttpException(
        'We just sent one. Check your inbox, or try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    await this.sendVerification(user);
    return { sent: true };
  }

  async verifyEmail(token: string) {
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.kind !== 'EMAIL_VERIFY' || row.usedAt || row.expiresAt < new Date())
      throw new BadRequestException(
        'That link has expired or was already used. Sign in and send a new one.',
      );
    await this.prisma.$transaction([
      this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
    this.enter(row.tenantId, row.userId);
    await this.safeAudit('auth.email_verified', 'User', row.userId);
    return { verified: true };
  }

  /** Always answers the same, whether or not the account exists. */
  async forgotPassword(workspace: string, email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, tenant: { slug: workspace }, status: 'ACTIVE' },
    });
    if (!user) return { sent: true };
    this.enter(user.tenantId);
    const token = await this.issueToken(user, 'PASSWORD_RESET', RESET_MINUTES);
    await this.mail.send({
      tenantId: user.tenantId,
      to: user.email,
      subject: 'Reset your HRMS password',
      text: `Hi ${user.fullName},\n\nUse this link to choose a new password:\n${this.appUrl(`/reset-password?token=${token}`)}\n\nIt works once, for ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email; your password stays the same.\n`,
    });
    await this.safeAudit('auth.reset_requested', 'User', user.id);
    return { sent: true };
  }

  async resetPassword(token: string, password: string) {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { tenant: { select: { slug: true, name: true } } } } },
    });
    if (!row || row.kind !== 'PASSWORD_RESET' || row.usedAt || row.expiresAt < new Date())
      throw new BadRequestException(
        'That link has expired or was already used. Ask for a new one.',
      );
    const user = row.user;
    const problem = passwordProblem(password, {
      email: user.email,
      name: user.fullName,
      workspace: user.tenant.slug,
      company: user.tenant.name,
    });
    if (problem) throw new BadRequestException(problem);
    this.enter(user.tenantId, user.id);
    await this.setPassword(user.id, password);
    await this.prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    // A reset proves control of the email, so it also verifies it.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.passwordChangedEmail(user);
    await this.safeAudit('auth.password_reset', 'User', user.id);
    return { workspace: user.tenant.slug };
  }

  async findWorkspaces(email: string) {
    const users = await this.prisma.user.findMany({
      where: { email, status: 'ACTIVE', tenant: { status: { not: 'SUSPENDED' } } },
      include: { tenant: { select: { slug: true, name: true } } },
    });
    if (users.length)
      await this.mail.send({
        to: email,
        subject: 'Your HRMS workspaces',
        text: `You can sign in to:\n\n${users.map((u) => `${u.tenant.name}: workspace "${u.tenant.slug}", ${this.appUrl(`/login?workspace=${u.tenant.slug}`)}`).join('\n')}\n\nIf you didn't ask for this, ignore this email.\n`,
      });
    return { sent: true };
  }

  // ---------- account security (signed in) ----------

  private async setPassword(userId: string, password: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        passwordChangedAt: new Date(),
        failedLogins: 0,
        lockedUntil: null,
      },
    });
  }

  private async passwordChangedEmail(user: { tenantId: string; email: string; fullName: string }) {
    await this.mail.send({
      tenantId: user.tenantId,
      to: user.email,
      subject: 'Your HRMS password was changed',
      text: `Hi ${user.fullName},\n\nYour password was just changed and you were signed out everywhere else. If this wasn't you, reset your password now (${this.appUrl('/forgot-password')}) and tell your HR or IT team.\n`,
    });
  }

  async changePassword(
    userId: string,
    current: string,
    password: string,
    keepFamily: string | undefined,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { tenant: { select: { slug: true, name: true } } },
    });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, current)))
      throw new BadRequestException('Your current password isn’t right');
    if (current === password)
      throw new BadRequestException('Choose a password you haven’t used here');
    const problem = passwordProblem(password, {
      email: user.email,
      name: user.fullName,
      workspace: user.tenant.slug,
      company: user.tenant.name,
    });
    if (problem) throw new BadRequestException(problem);
    await this.setPassword(userId, password);
    await this.revokeOtherSessions(userId, keepFamily);
    await this.passwordChangedEmail(user);
    await this.safeAudit('auth.password_changed', 'User', userId);
    return { changed: true };
  }

  /** Whether the security policy makes two-step sign-in compulsory for this person. */
  async mfaRequired(permissions: readonly string[]) {
    const p = await this.policies.get('security');
    return (
      p.mfaForEveryone || (p.mfaForAdmins && permissions.some((x) => ADMIN_PERMISSIONS.includes(x)))
    );
  }

  async account(userId: string, permissions: readonly string[], currentFamily: string | undefined) {
    const [user, codes, identities, sessions, required] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
      this.prisma.externalIdentity.findMany({
        where: { userId },
        select: { provider: true, email: true, createdAt: true },
      }),
      this.sessions(userId, currentFamily),
      this.mfaRequired(permissions),
    ]);
    return {
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      mfaEnabled: Boolean(user.mfaEnabledAt),
      mfaRequired: required,
      recoveryCodesLeft: codes,
      identities,
      sessions,
    };
  }

  async mfaSetup(userId: string, email: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { tenant: { select: { name: true } } },
    });
    if (user.mfaEnabledAt) throw new ConflictException('Two-step sign-in is already on');
    const secret = totp.newSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: this.crypto.encrypt(user.tenantId, 'mfaSecret', secret) },
    });
    return { secret, otpauthUrl: totp.otpauthUrl(secret, email, `HRMS (${user.tenant.name})`) };
  }

  private async checkTotp(
    user: { id: string; tenantId: string; mfaSecretEnc: string | null; mfaLastStep: number | null },
    code: string,
  ) {
    if (!user.mfaSecretEnc) return false;
    const secret = this.crypto.decrypt(user.tenantId, 'mfaSecret', user.mfaSecretEnc);
    const step = totp.verify(secret, code.replace(/\s+/g, ''));
    // A code can't be used twice.
    if (step === null || (user.mfaLastStep !== null && step <= user.mfaLastStep)) return false;
    await this.prisma.user.update({ where: { id: user.id }, data: { mfaLastStep: step } });
    return true;
  }

  private async useRecoveryCode(userId: string, code: string) {
    const hash = hashToken(normaliseRecovery(code));
    const res = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: hash, usedAt: null },
      data: { usedAt: new Date() },
    });
    return res.count > 0;
  }

  private async newRecoveryCodes(user: { id: string; tenantId: string }) {
    const codes = Array.from({ length: RECOVERY_CODES }, () => {
      const raw = totp.base32Encode(randomBytes(7)).toLowerCase().slice(0, 10);
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((c) => ({
          tenantId: user.tenantId,
          userId: user.id,
          codeHash: hashToken(normaliseRecovery(c)),
        })),
      }),
    ]);
    return codes;
  }

  async mfaEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabledAt) throw new ConflictException('Two-step sign-in is already on');
    if (!user.mfaSecretEnc) throw new BadRequestException('Start the set-up first');
    if (!(await this.checkTotp(user, code)))
      throw new BadRequestException('That code isn’t right. Check the time on your phone.');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date() } });
    const codes = await this.newRecoveryCodes(user);
    await this.mail.send({
      tenantId: user.tenantId,
      to: user.email,
      subject: 'Two-step sign-in is on',
      text: `Hi ${user.fullName},\n\nTwo-step sign-in is now on for your HRMS login. Keep your recovery codes somewhere safe.\n`,
    });
    await this.safeAudit('auth.mfa_enabled', 'User', userId);
    return { recoveryCodes: codes };
  }

  async mfaDisable(userId: string, permissions: readonly string[], password: string, code: string) {
    if (await this.mfaRequired(permissions))
      throw new ForbiddenException('Your company requires two-step sign-in for your login');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabledAt) throw new BadRequestException('Two-step sign-in is already off');
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, password)))
      throw new BadRequestException('Your password isn’t right');
    if (!(await this.checkTotp(user, code)) && !(await this.useRecoveryCode(userId, code)))
      throw new BadRequestException('That code isn’t right');
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: null, mfaSecretEnc: null, mfaLastStep: null },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
    await this.mail.send({
      tenantId: user.tenantId,
      to: user.email,
      subject: 'Two-step sign-in was turned off',
      text: `Hi ${user.fullName},\n\nTwo-step sign-in was turned off for your HRMS login. If this wasn't you, reset your password now: ${this.appUrl('/forgot-password')}\n`,
    });
    await this.safeAudit('auth.mfa_disabled', 'User', userId);
    return { disabled: true };
  }

  async regenerateRecoveryCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabledAt) throw new BadRequestException('Turn on two-step sign-in first');
    if (!(await this.checkTotp(user, code))) throw new BadRequestException('That code isn’t right');
    await this.safeAudit('auth.recovery_codes_renewed', 'User', userId);
    return { recoveryCodes: await this.newRecoveryCodes(user) };
  }

  private getDummyHash() {
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
    return this.dummyHash;
  }
}

/** Workspace names kept for the product's own pages and look-alikes. */
const RESERVED_WORKSPACES = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'demo-admin',
  'help',
  'hrms',
  'login',
  'mail',
  'root',
  'security',
  'signup',
  'status',
  'support',
  'system',
  'www',
]);

/** "Chrome on Windows" from a user-agent string. */
export function describeDevice(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'an unknown system';
  return /supertest|node|curl/i.test(ua) && browser === 'A browser'
    ? 'An app or script'
    : `${browser} on ${os}`;
}
