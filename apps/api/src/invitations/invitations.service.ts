import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AcceptInviteInput } from '@hrms/shared';
import { passwordProblem } from '@hrms/shared';
import { requestContext } from '../common/request-context';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService, ClientInfo } from '../auth/auth.service';
import { currentContext, requireTenantId } from '../common/request-context';
import type { Env } from '../config';
import { PrismaService } from '../prisma/prisma.service';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Gives an employee a login (Employee role) and a one-time link to set their
   * password. Inviting again replaces any earlier link. Email delivery comes
   * later; for now the link is returned for HR to share.
   */
  async invite(employeeId: string) {
    const db = this.prisma.db;
    const tenantId = requireTenantId();
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.status === 'EXITED')
      throw new BadRequestException('This person has left the company');
    if (employee.user?.status === 'ACTIVE')
      throw new ConflictException('This person can already sign in');

    let user = employee.user;
    if (!user) {
      const sameEmail = await db.user.findFirst({
        where: { email: employee.workEmail },
        include: { employee: { select: { id: true } } },
      });
      if (sameEmail?.employee) {
        throw new ConflictException('Another employee already signs in with this work email');
      }
      const role = await db.role.findFirst({ where: { key: 'employee' } });
      user =
        sameEmail ??
        (await db.user.create({
          data: {
            tenantId,
            email: employee.workEmail,
            fullName: `${employee.firstName} ${employee.lastName}`.trim(),
            status: 'INVITED',
            ...(role ? { roles: { create: { tenantId, roleId: role.id } } } : {}),
          },
        }));
      await db.employee.update({ where: { id: employee.id }, data: { userId: user.id } });
    }

    await db.invitation.updateMany({
      where: { userId: user.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const token = randomBytes(32).toString('base64url');
    const days = this.config.get('INVITE_TTL_DAYS', { infer: true });
    const invitation = await db.invitation.create({
      data: {
        tenantId,
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        createdById: currentContext().userId ?? null,
      },
    });
    await this.audit.record('employee.invited', 'Employee', employee.id, { userId: user.id });
    const appUrl = this.config.get('APP_URL', { infer: true }).replace(/\/$/, '');
    return {
      userId: user.id,
      inviteUrl: `${appUrl}/accept-invite?token=${token}`,
      expiresAt: invitation.expiresAt,
    };
  }

  /** Public: what the accept page shows before the person sets a password. */
  async describe(token: string) {
    const invitation = await this.findUsable(token);
    return {
      companyName: invitation.user.tenant.name,
      workspace: invitation.user.tenant.slug,
      email: invitation.user.email,
      fullName: invitation.user.fullName,
    };
  }

  /** Public: sets the password, activates the login and signs the person in. */
  async accept(input: AcceptInviteInput, client: ClientInfo) {
    const invitation = await this.findUsable(input.token);
    const problem = passwordProblem(input.password, {
      email: invitation.user.email,
      name: invitation.user.fullName,
      workspace: invitation.user.tenant.slug,
      company: invitation.user.tenant.name,
    });
    if (problem) throw new BadRequestException(problem);
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      // Conditional update so a link can only ever be used once, even under concurrent requests.
      const { count } = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw new GoneException('This invite link has already been used');
      await tx.user.update({
        where: { id: invitation.userId },
        // Following the emailed link proves the address, so it counts as verified.
        data: {
          passwordHash,
          status: 'ACTIVE',
          lastLoginAt: new Date(),
          passwordChangedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: invitation.tenantId,
          actorId: invitation.userId,
          action: 'user.invite_accepted',
          entity: 'User',
          entityId: invitation.userId,
          ip: client.ip ?? null,
        },
      });
    });
    const store = requestContext.getStore();
    if (store) store.tenantId = invitation.tenantId;
    return this.auth.issueTokens(invitation.userId, invitation.tenantId, client, {
      persistent: true,
    });
  }

  private async findUsable(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { tenant: true } } },
    });
    if (!invitation || invitation.revokedAt)
      throw new NotFoundException('This invite link is not valid');
    if (invitation.acceptedAt) throw new GoneException('This invite link has already been used');
    if (invitation.expiresAt < new Date()) {
      throw new GoneException('This invite link has expired. Ask HR to send a new one.');
    }
    if (invitation.user.status !== 'INVITED' || invitation.user.tenant.status === 'SUSPENDED') {
      throw new NotFoundException('This invite link is not valid');
    }
    return invitation;
  }
}
