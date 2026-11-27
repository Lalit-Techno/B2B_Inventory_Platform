import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  OrgUser,
  OrgUserSchema,
} from '../organization/schemas/org-user.schema';
import {
  Organization,
  OrganizationSchema,
} from '../organization/schemas/organization.schema';
import {
  Warehouse,
  WarehouseSchema,
} from '../organization/schemas/warehouse.schema';
import { BillingService } from './billing.service';
import {
  LedgerController,
  SubscriptionsController,
} from './billing.controller';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { OnboardingService } from './onboarding.service';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { SubscriptionJobs } from './subscription-jobs.service';
import { SubscriptionGate } from './subscription.gate';
import { TenantSubscriptionController } from './tenant-subscription.controller';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { SaasPlan, SaasPlanSchema } from './schemas/saas-plan.schema';
import {
  SaasTransaction,
  SaasTransactionSchema,
} from './schemas/saas-transaction.schema';
import {
  SaasSubscription,
  SaasSubscriptionSchema,
} from './schemas/saas-subscription.schema';

/** Super Admin (platform) features. These never read tenant business data (products, orders, invoices...). */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: SaasPlan.name, schema: SaasPlanSchema },
      { name: SaasSubscription.name, schema: SaasSubscriptionSchema },
      { name: SaasTransaction.name, schema: SaasTransactionSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: User.name, schema: UserSchema },
      { name: OrgUser.name, schema: OrgUserSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [
    PlansController,
    OrganizationsController,
    SubscriptionsController,
    LedgerController,
    DashboardController,
    TenantSubscriptionController,
  ],
  providers: [
    PlansService,
    OnboardingService,
    OrganizationsService,
    BillingService,
    DashboardService,
    SubscriptionJobs,
    // Runs after the auth guards (AuthModule is imported first), so request.user is set.
    { provide: APP_GUARD, useClass: SubscriptionGate },
  ],
})
export class PlatformModule {}
