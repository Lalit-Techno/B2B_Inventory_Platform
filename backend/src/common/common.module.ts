import { join } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './audit/audit-log.schema';
import { AuditService } from './audit/audit.service';
import {
  IdempotencyKey,
  IdempotencyKeySchema,
} from './idempotency/idempotency-key.schema';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { IdempotencyService } from './idempotency/idempotency.service';
import {
  DocumentSequence,
  DocumentSequenceSchema,
} from './numbering/document-sequence.schema';
import { DocumentSequenceService } from './numbering/document-sequence.service';
import {
  ConsoleMailDriver,
  MailDriver,
  MailService,
  SmtpMailDriver,
} from './mail/mail.service';
import {
  LocalStorageDriver,
  S3StorageDriver,
  StorageDriver,
  StorageService,
} from './storage/storage.service';

const need = (config: ConfigService, key: string) => {
  const v = config.get<string>(key);
  if (!v) throw new Error(`Missing env var ${key}`);
  return v;
};

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: DocumentSequence.name, schema: DocumentSequenceSchema },
      { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
    ]),
  ],
  providers: [
    AuditService,
    DocumentSequenceService,
    IdempotencyService,
    IdempotencyInterceptor,
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver: StorageDriver =
          config.get('STORAGE_DRIVER', 'local') === 's3'
            ? new S3StorageDriver({
                endpoint: config.get('S3_ENDPOINT'),
                region: config.get('S3_REGION', 'auto'),
                bucket: need(config, 'S3_BUCKET'),
                accessKeyId: need(config, 'S3_ACCESS_KEY_ID'),
                secretAccessKey: need(config, 'S3_SECRET_ACCESS_KEY'),
              })
            : new LocalStorageDriver(join(process.cwd(), 'storage'));
        return new StorageService(driver);
      },
    },
    {
      provide: MailService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver: MailDriver =
          config.get('MAIL_DRIVER', 'console') === 'smtp'
            ? new SmtpMailDriver({
                host: need(config, 'SMTP_HOST'),
                port: Number(config.get('SMTP_PORT', '587')),
                user: need(config, 'SMTP_USER'),
                pass: need(config, 'SMTP_PASS'),
                from: need(config, 'MAIL_FROM'),
              })
            : new ConsoleMailDriver(join(process.cwd(), 'storage', 'mail'));
        return new MailService(driver);
      },
    },
  ],
  exports: [
    StorageService,
    MailService,
    AuditService,
    DocumentSequenceService,
    IdempotencyService,
    IdempotencyInterceptor,
  ],
})
export class CommonModule {}
