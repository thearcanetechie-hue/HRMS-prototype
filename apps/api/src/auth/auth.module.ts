import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import type { Env } from '../config';
import { PoliciesModule } from '../policies/policies.module';
import { AuthController, DevMailController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { OAuthService } from './oauth.service';

@Module({
  imports: [
    AuditModule,
    PoliciesModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) as `${number}m`,
          algorithm: 'HS256',
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController, DevMailController],
  providers: [AuthService, MailService, OAuthService],
  exports: [AuthService, MailService],
})
export class AuthModule {}
