import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config';
import { PrismaService } from '../prisma/prisma.service';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  tenantId?: string | null;
}

/**
 * Sends email through the provider set in EMAIL_PROVIDER, over its HTTP API (no SMTP needed):
 * Resend, Postmark or SendGrid. With "log" (the default outside production) nothing leaves the
 * machine: the email is printed and kept in the outbox, where the dev mailbox page shows it.
 * Every send is recorded in the outbox; the body is stored only for "log".
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  get provider() {
    return this.config.get('EMAIL_PROVIDER', { infer: true });
  }

  async send(mail: Mail) {
    const provider = this.provider;
    let status = 'SENT';
    let error: string | null = null;
    try {
      if (provider === 'log') {
        status = 'LOGGED';
        this.logger.log(`To ${mail.to}: ${mail.subject}\n${mail.text}`);
      } else {
        await this.deliver(provider, mail);
      }
    } catch (err) {
      status = 'FAILED';
      error = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error';
      this.logger.error(`Could not send "${mail.subject}" to ${mail.to}: ${error}`);
    }
    await this.prisma.outboxEmail.create({
      data: {
        tenantId: mail.tenantId ?? null,
        to: mail.to,
        subject: mail.subject,
        text: provider === 'log' ? mail.text : null,
        provider,
        status,
        error,
      },
    });
    return status !== 'FAILED';
  }

  private async deliver(provider: Env['EMAIL_PROVIDER'], mail: Mail) {
    const key = this.config.get('EMAIL_API_KEY', { infer: true });
    const from = this.config.get('EMAIL_FROM', { infer: true });
    if (!key) throw new Error('EMAIL_API_KEY is not set');
    const call = async (url: string, headers: Record<string, string>, body: unknown) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok)
        throw new Error(`${provider} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    };
    if (provider === 'resend')
      return call(
        'https://api.resend.com/emails',
        { Authorization: `Bearer ${key}` },
        { from, to: [mail.to], subject: mail.subject, text: mail.text },
      );
    if (provider === 'postmark')
      return call(
        'https://api.postmarkapp.com/email',
        { 'X-Postmark-Server-Token': key, Accept: 'application/json' },
        {
          From: from,
          To: mail.to,
          Subject: mail.subject,
          TextBody: mail.text,
          MessageStream: 'outbound',
        },
      );
    if (provider === 'sendgrid')
      return call(
        'https://api.sendgrid.com/v3/mail/send',
        { Authorization: `Bearer ${key}` },
        {
          personalizations: [{ to: [{ email: mail.to }] }],
          from: { email: from },
          subject: mail.subject,
          content: [{ type: 'text/plain', value: mail.text }],
        },
      );
    throw new Error(`Unknown email provider ${provider}`);
  }

  /** Emails kept by the "log" sender, newest first, for the dev mailbox. Never in production. */
  async devMailbox() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') return [];
    return this.prisma.outboxEmail.findMany({
      where: { provider: 'log' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, to: true, subject: true, text: true, createdAt: true },
    });
  }
}
