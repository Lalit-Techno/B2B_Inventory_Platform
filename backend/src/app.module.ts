import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { MeModule } from './modules/me/me.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PlatformModule } from './modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        dbName: config.get<string>('MONGODB_DB_NAME'), // set by e2e tests only
        serverSelectionTimeoutMS: 5000,
        retryAttempts: 2,
        retryDelay: 1000,
      }),
    }),
    CommonModule,
    AuthModule,
    MeModule,
    OrganizationModule,
    PlatformModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
