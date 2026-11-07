import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the same HTTP stack. */
export function configureApp(app: INestApplication, webOrigin: string) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  // Biometric devices using the ZKTeco/eSSL push protocol call fixed paths under /iclock.
  app.setGlobalPrefix('api', { exclude: ['iclock/cdata', 'iclock/getrequest'] });
  // Those devices send punches as plain text.
  express.useBodyParser('text', { type: 'text/plain', limit: '2mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: webOrigin.split(','), credentials: true });
  app.enableShutdownHooks();
  return app;
}
