import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    /** 32 random bytes, base64. Losing it makes encrypted fields unreadable, so back it up. */
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, 'base64').length === 32,
        'DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)',
      ),
    /** Where invite links point; the web app's public URL. */
    APP_URL: z.string().url().default('http://localhost:3000'),
    INVITE_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    API_PORT: z.coerce.number().int().default(4000),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    /** Folder for uploaded documents (encrypted at rest). Swap for object storage in production. */
    STORAGE_DIR: z.string().default('storage'),
    /** Email: "log" keeps emails on this machine (dev mailbox); the others send through their API. */
    EMAIL_PROVIDER: z.enum(['log', 'resend', 'postmark', 'sendgrid']).default('log'),
    EMAIL_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('HRMS <no-reply@example.com>'),
    /** Sign in with Google / Microsoft: OAuth client ids and secrets. Leave empty to hide the buttons. */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.EMAIL_PROVIDER !== 'log', {
    message:
      'Set EMAIL_PROVIDER (resend, postmark or sendgrid) and EMAIL_API_KEY in production, so reset and verification emails are delivered',
    path: ['EMAIL_PROVIDER'],
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
