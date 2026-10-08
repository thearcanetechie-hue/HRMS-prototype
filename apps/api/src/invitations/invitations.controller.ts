import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { acceptInviteSchema, AcceptInviteInput } from '@hrms/shared';
import type { Request, Response } from 'express';
import { AuthController } from '../auth/auth.controller';
import { Public, RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { InvitationsService } from './invitations.service';

const authLimit = () => Number(process.env.AUTH_RATE_LIMIT ?? 10);

@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('employees/:id/invite')
  @RequirePermissions('employee.manage')
  invite(@Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.invite(id);
  }

  @Public()
  @Get('auth/invitations/:token')
  @Throttle({ default: { limit: () => authLimit() * 3, ttl: 60_000 } })
  describe(@Param('token') token: string) {
    return this.invitations.describe(token);
  }

  @Public()
  @Post('auth/accept-invite')
  @HttpCode(200)
  @Throttle({ default: { limit: authLimit, ttl: 60_000 } })
  async accept(
    @Body(new ZodPipe(acceptInviteSchema)) body: AcceptInviteInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.invitations.accept(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return AuthController.respond(res, tokens);
  }
}
