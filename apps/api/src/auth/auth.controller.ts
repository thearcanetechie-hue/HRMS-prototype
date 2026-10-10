import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, LoginInput, signupSchema, SignupInput } from '@hrms/shared';
import type { Request, Response } from 'express';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, ClientInfo, IssuedTokens } from './auth.service';
import { AuthUser, CurrentUser, Public } from './decorators';

export const REFRESH_COOKIE = 'hrms_rt';
const COOKIE_PATH = '/api/auth';

/** Sign-up and login attempts allowed per IP per minute. */
const authLimit = () => Number(process.env.AUTH_RATE_LIMIT ?? 10);

const clientInfo = (req: Request): ClientInfo => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@Controller('auth')
@Throttle({ default: { limit: authLimit, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
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
    return AuthController.respond(res, await this.auth.login(body, clientInfo(req)));
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

  /** Who am I: the signed-in user, their workspace, permissions and employee record. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const [tenant, employee] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { id: true, name: true, slug: true, status: true, settings: true },
      }),
      this.prisma.db.employee.findFirst({
        where: { userId: user.id },
        select: { id: true, employeeCode: true, firstName: true, lastName: true },
      }),
    ]);
    return { user, tenant, employee };
  }

  /** Sets the refresh cookie and returns the access token. Shared with invite acceptance. */
  static respond(res: Response, tokens: IssuedTokens) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: tokens.refreshExpiresAt,
    });
    return { accessToken: tokens.accessToken };
  }
}
