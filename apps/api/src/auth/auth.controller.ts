import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  emailOnlySchema,
  forgotPasswordSchema,
  loginSchema,
  LoginInput,
  mfaCodeSchema,
  mfaDisableSchema,
  mfaVerifySchema,
  resetPasswordSchema,
  signupSchema,
  SignupInput,
  verifyEmailSchema,
} from '@hrms/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import type { Env } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, ClientInfo, IssuedTokens, LoginResult } from './auth.service';
import { AuthUser, CurrentUser, Public } from './decorators';
import { MailService } from './mail.service';
import { OAuthService, Provider } from './oauth.service';

export const REFRESH_COOKIE = 'hrms_rt';
const COOKIE_PATH = '/api/auth';
const OAUTH_COOKIE = 'hrms_oauth';
const OAUTH_PATH = '/api/auth/oauth';

/** Sign-up and login attempts allowed per IP per minute. */
const authLimit = () => Number(process.env.AUTH_RATE_LIMIT ?? 10);
const secure = () => process.env.NODE_ENV === 'production';

const clientInfo = (req: Request): ClientInfo => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});
const providerParam = z.enum(['google', 'microsoft']);
const oauthStart = z.object({
  workspace: z.string().trim().toLowerCase().min(3).max(40),
  remember: z.enum(['true', 'false']).default('true'),
});

@Controller('auth')
@Throttle({ default: { limit: authLimit, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('signup')
  async signup(
    @Body(new ZodPipe(signupSchema)) body: SignupInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return AuthController.respond(res, await this.auth.signup(body, clientInfo(req)));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return AuthController.respondLogin(res, await this.auth.login(body, clientInfo(req)));
  }

  /** Second step of two-step sign-in. */
  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Body(new ZodPipe(mfaVerifySchema)) body: z.infer<typeof mfaVerifySchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return AuthController.respond(
      res,
      await this.auth.verifyMfa(body.challenge, body.code, clientInfo(req)),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: () => authLimit() * 3, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException();
    try {
      return AuthController.respond(res, await this.auth.refresh(token, clientInfo(req)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  // ---------- recovery and verification (no login) ----------

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgot(@Body(new ZodPipe(forgotPasswordSchema)) body: z.infer<typeof forgotPasswordSchema>) {
    return this.auth.forgotPassword(body.workspace, body.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body(new ZodPipe(resetPasswordSchema)) body: z.infer<typeof resetPasswordSchema>) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) body: z.infer<typeof verifyEmailSchema>) {
    return this.auth.verifyEmail(body.token);
  }

  @Public()
  @Post('find-workspaces')
  @HttpCode(200)
  findWorkspaces(@Body(new ZodPipe(emailOnlySchema)) body: z.infer<typeof emailOnlySchema>) {
    return this.auth.findWorkspaces(body.email);
  }

  // ---------- Google and Microsoft ----------

  @Public()
  @Get('providers')
  providers() {
    return this.oauth.available();
  }

  @Public()
  @Get('oauth/:provider/start')
  start(
    @Param('provider', new ZodPipe(providerParam)) provider: Provider,
    @Query(new ZodPipe(oauthStart)) q: z.infer<typeof oauthStart>,
    @Res() res: Response,
  ) {
    const { url, cookie } = this.oauth.start(provider, q.workspace, q.remember === 'true');
    // Lax, not strict: the provider sends the browser back with a top-level GET.
    res.cookie(OAUTH_COOKIE, cookie, {
      httpOnly: true,
      secure: secure(),
      sameSite: 'lax',
      path: OAUTH_PATH,
      maxAge: 10 * 60_000,
    });
    res.redirect(url);
  }

  @Public()
  @Get('oauth/:provider/callback')
  async callback(
    @Param('provider', new ZodPipe(providerParam)) provider: Provider,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const app = this.config.get('APP_URL', { infer: true }).replace(/\/$/, '');
    res.clearCookie(OAUTH_COOKIE, { path: OAUTH_PATH });
    const fail = (reason: string) => res.redirect(`${app}/login?sso_error=${reason}`);
    if (error || !code) return fail('cancelled');
    try {
      const flow = this.oauth.readFlow(req.cookies?.[OAUTH_COOKIE], provider, state);
      const identity = await this.oauth.identity(provider, code, flow);
      const user = await this.oauth.findLogin(flow.workspace, provider, identity);
      if (!user) return fail('no_account');
      const result = await this.auth.loginExternal(
        user.id,
        user.tenantId,
        clientInfo(req),
        flow.remember,
        provider,
      );
      if ('mfaRequired' in result) return res.redirect(`${app}/login?mfa=${result.challenge}`);
      AuthController.respond(res, result);
      return res.redirect(`${app}/login?sso=done`);
    } catch {
      return fail('failed');
    }
  }

  // ---------- who am I, and account security ----------

  /** Who am I: the signed-in user, their workspace, permissions, employee record and security. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const [tenant, employee, row, mfaRequired] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { id: true, name: true, slug: true, status: true, settings: true },
      }),
      this.prisma.db.employee.findFirst({
        where: { userId: user.id },
        select: { id: true, employeeCode: true, firstName: true, lastName: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { emailVerifiedAt: true, mfaEnabledAt: true },
      }),
      this.auth.mfaRequired(user.permissions),
    ]);
    const { sessionId: _s, ...publicUser } = user;
    return {
      user: publicUser,
      tenant,
      employee,
      security: {
        emailVerified: Boolean(row.emailVerifiedAt),
        mfaEnabled: Boolean(row.mfaEnabledAt),
        mfaRequired,
      },
    };
  }

  @Get('account')
  account(@CurrentUser() user: AuthUser) {
    return this.auth.account(user.id, user.permissions, user.sessionId);
  }

  @Post('verify-email/resend')
  @HttpCode(200)
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ) {
    return this.auth.changePassword(user.id, body.current, body.password, user.sessionId);
  }

  @Post('mfa/setup')
  @HttpCode(200)
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user.id, user.email);
  }

  @Post('mfa/enable')
  @HttpCode(200)
  mfaEnable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(mfaCodeSchema)) body: z.infer<typeof mfaCodeSchema>,
  ) {
    return this.auth.mfaEnable(user.id, body.code);
  }

  @Post('mfa/disable')
  @HttpCode(200)
  mfaDisable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(mfaDisableSchema)) body: z.infer<typeof mfaDisableSchema>,
  ) {
    return this.auth.mfaDisable(user.id, user.permissions, body.password, body.code);
  }

  @Post('mfa/recovery-codes')
  @HttpCode(200)
  recoveryCodes(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(mfaCodeSchema)) body: z.infer<typeof mfaCodeSchema>,
  ) {
    return this.auth.regenerateRecoveryCodes(user.id, body.code);
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.sessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.revokeSession(user.id, id);
  }

  @Post('sessions/revoke-others')
  @HttpCode(204)
  revokeOthers(@CurrentUser() user: AuthUser) {
    return this.auth.revokeOtherSessions(user.id, user.sessionId);
  }

  /** Sets the refresh cookie and returns the access token. Shared with invite acceptance. */
  static respond(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: secure(),
      sameSite: 'strict',
      path: COOKIE_PATH,
      // Without "Keep me signed in" the cookie ends with the browser.
      ...(tokens.persistent ? { expires: tokens.refreshExpiresAt } : {}),
    });
    return { accessToken: tokens.accessToken };
  }

  static respondLogin(res: Response, result: LoginResult) {
    if ('mfaRequired' in result) return result;
    return AuthController.respond(res, result);
  }
}

/** The development mailbox: emails the "log" sender kept. Empty in production. */
@Controller('dev')
export class DevMailController {
  constructor(private readonly mail: MailService) {}

  @Public()
  @Get('emails')
  emails() {
    return this.mail.devMailbox();
  }
}
