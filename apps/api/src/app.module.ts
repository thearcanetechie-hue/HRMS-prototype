import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { requestContext } from './common/request-context';
import { validateEnv } from './config';
import { CryptoModule } from './crypto/crypto.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health/health.controller';
import { OrgModule } from './org/org.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CryptoModule,
    AuthModule,
    AuditModule,
    OrgModule,
    EmployeesModule,
    RolesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: throttle before auth so brute-force attempts are cut off early.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: Request, _res: Response, next: NextFunction) =>
        requestContext.run({ ip: req.ip }, next),
      )
      .forRoutes('*');
  }
}
