import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config';
import { FieldCrypto } from './field-crypto';

@Global()
@Module({
  providers: [
    {
      provide: FieldCrypto,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new FieldCrypto(String(config.get('DATA_ENCRYPTION_KEY', { infer: true }))),
    },
  ],
  exports: [FieldCrypto],
})
export class CryptoModule {}
