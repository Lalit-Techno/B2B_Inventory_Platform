// Seeds the development database: Super Admin, 3 plans, one demo tenant with a ready-to-use admin.
// Safe to run repeatedly (anything that exists is left alone). Refuses to run in production.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import type { Principal } from '../src/common/auth/principal';
import { Role } from '../src/common/rbac/roles';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserStatus } from '../src/modules/auth/schemas/user.schema';
import { Organization } from '../src/modules/organization/schemas/organization.schema';
import type { CreatePlanDto } from '../src/modules/platform/dto/plan.dto';
import { OnboardingService } from '../src/modules/platform/onboarding.service';
import { PlansService } from '../src/modules/platform/plans.service';
import { SaasPlan } from '../src/modules/platform/schemas/saas-plan.schema';
import { BillingCycle } from '../src/modules/platform/schemas/saas-subscription.schema';

const PLANS: CreatePlanDto[] = [
  {
    code: 'STARTER',
    name: 'Starter',
    monthlyPrice: '999',
    yearlyPrice: '9999',
    maxStaff: 5,
    maxBuyers: 25,
    maxSkus: 500,
    maxOrdersPerMonth: 200,
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    monthlyPrice: '2999',
    yearlyPrice: '29999',
    maxStaff: 20,
    maxBuyers: 200,
    maxSkus: 5000,
    maxOrdersPerMonth: 2000,
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    monthlyPrice: '9999',
    yearlyPrice: '99999',
  }, // no limits
];

const DEMO_SLUG = 'demo';
const DEMO_ADMIN_EMAIL = 'admin@demo.test';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!process.env.MONGODB_URI || !email || !password) {
    throw new Error(
      'Set MONGODB_URI, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env',
    );
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed in production');

  process.env.DISABLE_JOBS = '1';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const users = app.get<Model<User>>(getModelToken(User.name));
    const orgs = app.get<Model<Organization>>(getModelToken(Organization.name));
    const planModel = app.get<Model<SaasPlan>>(getModelToken(SaasPlan.name));
    const auth = app.get(AuthService);
    await Promise.all([users.syncIndexes(), orgs.syncIndexes()]);

    // 1. Super Admin
    let admin = await users.findOne({ email });
    if (admin) {
      console.log(`Super Admin ${email} already exists.`);
    } else {
      admin = await users.create({
        email,
        fullName: 'Platform Admin',
        passwordHash: await auth.hashPassword(password),
        isPlatformAdmin: true,
        status: UserStatus.ACTIVE,
      });
      console.log(`Created Super Admin ${email}.`);
    }
    const actor: Principal = {
      userId: admin.id as string,
      sessionId: 'seed',
      role: Role.SUPER_ADMIN,
    };

    // 2. Plans
    const plansService = app.get(PlansService);
    for (const plan of PLANS) {
      if (await planModel.exists({ code: plan.code })) continue;
      await plansService.create(plan, actor);
      console.log(`Created plan ${plan.code}.`);
    }

    // 3. Demo tenant (its admin gets the Super Admin's seed password so you can sign in at once)
    if (await orgs.exists({ slug: DEMO_SLUG })) {
      console.log('Demo organization already exists.');
    } else {
      await app.get(OnboardingService).onboard(
        {
          slug: DEMO_SLUG,
          legalName: 'Demo Traders Private Limited',
          tradeName: 'Demo Traders',
          gstin: '27AAPFU0939F1ZV',
          address: {
            line1: '12 Market Road',
            city: 'Pune',
            state: 'Maharashtra',
            pincode: '411001',
          },
          invoicePrefix: 'DEMO',
          subscription: {
            planCode: 'GROWTH',
            billingCycle: BillingCycle.YEARLY,
            recurringAmount: '29999',
          },
          adminUser: { fullName: 'Demo Admin', email: DEMO_ADMIN_EMAIL },
        },
        actor,
      );
      await users.updateOne(
        { email: DEMO_ADMIN_EMAIL },
        {
          $set: {
            passwordHash: await auth.hashPassword(password),
            status: UserStatus.ACTIVE,
          },
        },
      );
      console.log(`Created demo organization; admin ${DEMO_ADMIN_EMAIL}.`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
