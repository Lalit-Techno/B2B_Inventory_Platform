import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Principal } from '../../common/auth/principal';
import { todayIST } from '../../common/dates/ist';
import { AppError } from '../../common/errors/app-error';
import {
  ALLOW_INACTIVE_KEY,
  PUBLIC_KEY,
} from '../../common/rbac/authorize.decorator';
import {
  SaasSubscription,
  SubscriptionStatus,
} from './schemas/saas-subscription.schema';
import { evaluateStatus } from './subscription-status';

const BLOCKED = new Set([
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.SUSPENDED,
  SubscriptionStatus.CANCELLED,
]);

/**
 * Tenant sessions get 402 SUBSCRIPTION_INACTIVE on every route not marked @AllowInactive() once the
 * subscription is EXPIRED / SUSPENDED / CANCELLED. The status is re-evaluated from the dates here, so the
 * gate is right even if the daily job has not run yet. GRACE_PERIOD still passes (the UI shows a banner).
 */
@Injectable()
export class SubscriptionGate implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(SaasSubscription.name)
    private readonly subs: Model<SaasSubscription>,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_KEY, targets)
    )
      return true;
    const user = ctx.switchToHttp().getRequest<{ user?: Principal }>().user;
    if (!user?.organizationId) return true; // platform users are not subject to a tenant subscription

    const sub = await this.subs
      .findOne({ organizationId: new Types.ObjectId(user.organizationId) })
      .select('status endDate graceDays')
      .lean();
    const status = sub
      ? evaluateStatus(todayIST(), sub.endDate, sub.graceDays, sub.status)
      : SubscriptionStatus.EXPIRED; // a tenant without a subscription must not run
    if (BLOCKED.has(status)) {
      throw new AppError('SUBSCRIPTION_INACTIVE', 'Subscription is not active');
    }
    return true;
  }
}
