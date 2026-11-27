import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../common/auth/permission.guard';
import { TenantGuard } from '../../common/tenancy/tenant.guard';
import {
  OrgUser,
  OrgUserSchema,
} from '../organization/schemas/org-user.schema';
import {
  Organization,
  OrganizationSchema,
} from '../organization/schemas/organization.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthToken, AuthTokenSchema } from './schemas/auth-token.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { User, UserSchema } from './schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Session.name, schema: SessionSchema },
      { name: AuthToken.name, schema: AuthTokenSchema },
      { name: OrgUser.name, schema: OrgUserSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    // In-memory rate limit; moves to Redis with U2.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.DISABLE_THROTTLE === '1', // e2e tests only
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Order matters: rate limit, then who are you, then are you allowed.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
