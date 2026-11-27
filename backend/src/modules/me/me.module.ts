import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  Organization,
  OrganizationSchema,
} from '../organization/schemas/organization.schema';
import {
  SaasSubscription,
  SaasSubscriptionSchema,
} from '../platform/schemas/saas-subscription.schema';
import { MeController } from './me.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: SaasSubscription.name, schema: SaasSubscriptionSchema },
    ]),
  ],
  controllers: [MeController],
})
export class MeModule {}
