import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createApiKeySchema,
  CreateApiKeyInput,
  createWebhookSchema,
  CreateWebhookInput,
  updateWebhookSchema,
  UpdateWebhookInput,
  WEBHOOK_EVENTS,
} from '@hrms/shared';
import { AuditModule } from '../audit/audit.module';
import { RequirePermissions } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { Env } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';
import { WebhooksService } from './webhooks.service';

/** What's set up, in one call, for the Integrations page. */
@Injectable()
class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly webhooks: WebhooksService,
    private readonly keys: ApiKeysService,
  ) {}

  async overview() {
    const recent = new Date(Date.now() - 30 * 60_000);
    const [webhooks, apiKeys, deliveries, devices, devicesOnline] = await Promise.all([
      this.webhooks.list(),
      this.keys.list(),
      this.webhooks.deliveries(),
      this.prisma.db.biometricDevice.count({ where: { active: true } }),
      this.prisma.db.biometricDevice.count({
        where: { active: true, lastSeenAt: { gte: recent } },
      }),
    ]);
    const c = (k: keyof Env) => Boolean(this.config.get(k, { infer: true }));
    return {
      events: WEBHOOK_EVENTS,
      webhooks,
      apiKeys,
      deliveries: deliveries.slice(0, 20),
      devices: { total: devices, online: devicesOnline },
      signIn: {
        google: c('GOOGLE_CLIENT_ID') && c('GOOGLE_CLIENT_SECRET'),
        microsoft: c('MICROSOFT_CLIENT_ID') && c('MICROSOFT_CLIENT_SECRET'),
      },
      email: this.config.get('EMAIL_PROVIDER', { infer: true }),
    };
  }
}

@Controller('integrations')
@RequirePermissions('integrations.manage')
class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly webhooks: WebhooksService,
    private readonly keys: ApiKeysService,
  ) {}

  @Get()
  overview() {
    return this.integrations.overview();
  }

  @Post('webhooks')
  createWebhook(@Body(new ZodPipe(createWebhookSchema)) body: CreateWebhookInput) {
    return this.webhooks.create(body);
  }

  @Patch('webhooks/:id')
  updateWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateWebhookSchema)) body: UpdateWebhookInput,
  ) {
    return this.webhooks.update(id, body);
  }

  @Delete('webhooks/:id')
  @HttpCode(204)
  removeWebhook(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.remove(id);
  }

  @Post('webhooks/:id/test')
  @HttpCode(200)
  test(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.test(id);
  }

  @Get('webhooks/:id/deliveries')
  deliveries(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.deliveries(id);
  }

  @Post('deliveries/:id/retry')
  @HttpCode(200)
  retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhooks.retry(id);
  }

  @Post('api-keys')
  createKey(@Body(new ZodPipe(createApiKeySchema)) body: CreateApiKeyInput) {
    return this.keys.create(body);
  }

  @Delete('api-keys/:id')
  @HttpCode(204)
  revokeKey(@Param('id', ParseUUIDPipe) id: string) {
    return this.keys.revoke(id);
  }
}

@Module({
  imports: [AuditModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WebhooksService, ApiKeysService],
})
export class IntegrationsModule {}
