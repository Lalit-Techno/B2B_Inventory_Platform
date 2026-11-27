import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Model } from 'mongoose';
import { CurrentUser, type Principal } from '../../common/auth/principal';
import { addDays } from '../../common/dates/calendar';
import { todayIST } from '../../common/dates/ist';
import { AppError } from '../../common/errors/app-error';
import { fromDecimal128 } from '../../common/money/decimal128';
import {
  AllowInactive,
  Authorize,
  Limited,
} from '../../common/rbac/authorize.decorator';
import { tenantDb } from '../../common/tenancy/tenant-db';
import { SaasPlan } from './schemas/saas-plan.schema';
import { SaasSubscription } from './schemas/saas-subscription.schema';
import { evaluateStatus } from './subscription-status';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** A tenant's own subscription, read-only (PLT-05). Stays reachable when the subscription has lapsed. */
@ApiTags('subscription')
@Controller('subscription')
export class TenantSubscriptionController {
  constructor(
    @InjectModel(SaasSubscription.name)
    private readonly subs: Model<SaasSubscription>,
    @InjectModel(SaasPlan.name) private readonly plans: Model<SaasPlan>,
  ) {}

  // Limited: the service reads only the caller's own organization (tenantDb), so L grants may pass.
  @Authorize('PLT-05')
  @Limited()
  @AllowInactive()
  @Get()
  async get(@CurrentUser() p: Principal) {
    // Platform users have no tenant: tenantDb refuses them.
    const sub = await tenantDb(this.subs, p).findOne({});
    if (!sub) throw new AppError('NOT_FOUND', 'No subscription');
    const plan = await this.plans.findById(sub.planId).select('code name');
    const today = todayIST();
    const status = evaluateStatus(
      today,
      sub.endDate,
      sub.graceDays,
      sub.status,
    );
    const graceEndsOn = addDays(sub.endDate, sub.graceDays);
    return {
      plan: plan ? { code: plan.code, name: plan.name } : null,
      billingCycle: sub.billingCycle,
      recurringAmount: fromDecimal128(sub.recurringAmount).toFixed(2),
      status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      graceDays: sub.graceDays,
      graceEndsOn,
      daysLeft: Math.max(0, daysBetween(today, sub.endDate)),
      graceDaysLeft: Math.max(0, daysBetween(today, graceEndsOn)),
    };
  }
}
