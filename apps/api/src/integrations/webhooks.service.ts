import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateWebhookInput, UpdateWebhookInput, WEBHOOK_EVENTS, WebhookEvent } from '@hrms/shared';
import { DeliveryStatus, Prisma, WebhookFormat } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AuditService, RecordedAction } from '../audit/audit.service';
import { currentContext, requireTenantId } from '../common/request-context';
import type { Env } from '../config';
import { FieldCrypto } from '../crypto/field-crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Wait before each retry: 1 min, 5 min, 30 min, 2 h, 12 h; then the delivery is given up. */
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
const TIMEOUT_MS = 10_000;
const TICK_MS = 15_000;

/** Addresses a webhook must never reach: this machine, the private network, cloud metadata. */
function privateAddress(ip: string) {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return (
      v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')
    );
  }
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export const signBody = (secret: string, timestamp: number, body: string) =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');

/**
 * Sends workspace events to other apps. Every audited action in WEBHOOK_EVENTS becomes a
 * delivery for each active endpoint subscribed to it; a background loop sends them and retries
 * failures with backoff. JSON endpoints are signed; Slack and Teams get a readable message.
 */
@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhooksService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: FieldCrypto,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    this.audit.onRecord((a) => this.enqueue(a));
    this.timer = setInterval(() => void this.dispatch(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private get production() {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }

  // ---------- managing endpoints ----------

  async list() {
    const rows = await this.prisma.db.webhookEndpoint.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { status: true, createdAt: true, responseCode: true },
        },
      },
    });
    return rows.map(({ secretEnc: _s, deliveries, ...e }) => ({
      ...e,
      url: this.maskUrl(e.url, e.format),
      last: deliveries[0] ?? null,
    }));
  }

  /** Slack and Teams URLs are themselves the secret, so only their start is shown back. */
  private maskUrl(url: string, format: WebhookFormat) {
    if (format === 'JSON') return url;
    const u = new URL(url);
    return `${u.origin}/…${u.pathname.slice(-4)}`;
  }

  async create(input: CreateWebhookInput) {
    await this.assertSafeUrl(input.url);
    if (input.format === 'SLACK' && !/^https:\/\/hooks\.slack\.com\//.test(input.url))
      throw new BadRequestException(
        'That isn’t a Slack webhook address. It starts with https://hooks.slack.com/',
      );
    const tenantId = requireTenantId();
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.db.webhookEndpoint.create({
      data: {
        tenantId,
        name: input.name,
        url: input.url,
        format: input.format,
        events: input.events,
        secretEnc: this.crypto.encrypt(tenantId, 'webhookSecret', secret),
        createdById: currentContext().userId ?? null,
      },
    });
    await this.audit.record('integration.webhook_added', 'WebhookEndpoint', row.id, {
      name: row.name,
      format: row.format,
    });
    const { secretEnc: _s, ...safe } = row;
    // The signing secret is shown once, for JSON endpoints that verify signatures.
    return { ...safe, url: this.maskUrl(row.url, row.format), secret };
  }

  async update(id: string, input: UpdateWebhookInput) {
    await this.get(id);
    const { secretEnc: _s, ...row } = await this.prisma.db.webhookEndpoint.update({
      where: { id },
      data: input,
    });
    await this.audit.record('integration.webhook_updated', 'WebhookEndpoint', id, {
      fields: Object.keys(input),
    });
    return { ...row, url: this.maskUrl(row.url, row.format) };
  }

  async remove(id: string) {
    const e = await this.get(id);
    await this.prisma.db.webhookEndpoint.delete({ where: { id } });
    await this.audit.record('integration.webhook_removed', 'WebhookEndpoint', id, {
      name: e.name,
    });
  }

  private async get(id: string) {
    const e = await this.prisma.db.webhookEndpoint.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Webhook not found');
    return e;
  }

  /** Sends a sample event now and reports what the other app answered. */
  async test(id: string) {
    const e = await this.get(id);
    const delivery = await this.prisma.db.webhookDelivery.create({
      data: {
        tenantId: e.tenantId,
        endpointId: e.id,
        event: 'test',
        summary: 'Test message from HRMS. If you can see this, the connection works.',
        payload: { test: true } as Prisma.InputJsonValue,
      },
    });
    return this.send(delivery.id);
  }

  async deliveries(endpointId?: string) {
    return this.prisma.db.webhookDelivery.findMany({
      where: endpointId ? { endpointId } : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        endpointId: true,
        event: true,
        summary: true,
        status: true,
        attempts: true,
        responseCode: true,
        error: true,
        createdAt: true,
        sentAt: true,
        endpoint: { select: { name: true, format: true } },
      },
    });
  }

  async retry(deliveryId: string) {
    const d = await this.prisma.db.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!d) throw new NotFoundException('Delivery not found');
    return this.send(d.id);
  }

  /** Real addresses only: https in production, and never this server or a private network. */
  private async assertSafeUrl(raw: string) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Enter the full web address, starting with https://');
    }
    if (this.production && url.protocol !== 'https:')
      throw new BadRequestException('Webhook addresses must start with https://');
    if (!['https:', 'http:'].includes(url.protocol))
      throw new BadRequestException('Webhook addresses must start with https://');
    if (!this.production) return;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const ips = isIP(host)
      ? [host]
      : await lookup(host, { all: true })
          .then((r) => r.map((x) => x.address))
          .catch(() => {
            throw new BadRequestException(`Couldn’t find ${host}. Check the address.`);
          });
    if (ips.some(privateAddress))
      throw new BadRequestException('Webhooks can’t point at a private or internal address');
  }

  // ---------- sending ----------

  /** Called for every audited action; queues a delivery per subscribed endpoint. */
  private async enqueue(a: RecordedAction) {
    if (!(a.action in WEBHOOK_EVENTS)) return;
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId: a.tenantId, active: true, events: { has: a.action } },
      select: { id: true },
    });
    if (!endpoints.length) return;
    const label = WEBHOOK_EVENTS[a.action as WebhookEvent];
    const summary = (await this.audit.describe(a)) ?? label;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: a.tenantId },
      select: { slug: true, name: true },
    });
    const payload = {
      id: a.id,
      event: a.action,
      description: label,
      summary,
      occurredAt: a.at.toISOString(),
      workspace: tenant,
      entity: { type: a.entity, id: a.entityId },
      data: a.data,
    };
    await this.prisma.webhookDelivery.createMany({
      data: endpoints.map((e) => ({
        tenantId: a.tenantId,
        endpointId: e.id,
        event: a.action,
        summary,
        payload: payload as Prisma.InputJsonValue,
      })),
    });
    setImmediate(() => void this.dispatch());
  }

  /** Sends every delivery that is due. Runs on a timer and right after new events. */
  async dispatch() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.webhookDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: 'asc' },
        take: 25,
        select: { id: true },
      });
      for (const d of due) await this.send(d.id);
    } catch (err) {
      this.logger.error('Webhook dispatch failed', err);
    } finally {
      this.running = false;
    }
  }

  /** One attempt at one delivery. Returns the delivery's new state. */
  private async send(id: string) {
    const d = await this.prisma.webhookDelivery.findUniqueOrThrow({
      where: { id },
      include: { endpoint: true },
    });
    const e = d.endpoint;
    const body = JSON.stringify(this.bodyFor(e.format, d.summary, d.payload));
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'HRMS-Webhooks/1.0',
    };
    if (e.format === 'JSON') {
      const ts = Math.floor(Date.now() / 1000);
      const secret = this.crypto.decrypt(e.tenantId, 'webhookSecret', e.secretEnc);
      headers['X-HRMS-Event'] = d.event;
      headers['X-HRMS-Delivery'] = d.id;
      headers['X-HRMS-Signature'] = `t=${ts},v1=${signBody(secret, ts, body)}`;
    }

    let responseCode: number | null = null;
    let error: string | null = null;
    try {
      await this.assertSafeUrl(e.url);
      const res = await fetch(e.url, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      responseCode = res.status;
      if (!res.ok) error = (await res.text().catch(() => '')).slice(0, 300) || res.statusText;
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 300) : 'Could not connect';
    }

    const attempts = d.attempts + 1;
    const ok = error === null;
    const status: DeliveryStatus = ok
      ? 'SENT'
      : attempts > BACKOFF_MS.length || d.event === 'test'
        ? 'FAILED'
        : 'PENDING';
    return this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status,
        attempts,
        responseCode,
        error,
        sentAt: ok ? new Date() : null,
        nextAttemptAt: new Date(Date.now() + (BACKOFF_MS[attempts - 1] ?? 0)),
      },
      select: { id: true, status: true, attempts: true, responseCode: true, error: true },
    });
  }

  private bodyFor(format: WebhookFormat, summary: string, payload: Prisma.JsonValue) {
    const link = this.config.get('APP_URL', { infer: true });
    if (format === 'SLACK') return { text: `${summary}\n<${link}|Open HRMS>` };
    if (format === 'TEAMS')
      return {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [{ type: 'TextBlock', text: summary, wrap: true }],
              actions: [{ type: 'Action.OpenUrl', title: 'Open HRMS', url: link }],
            },
          },
        ],
      };
    return payload;
  }
}
