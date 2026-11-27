import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { addDays } from '../../common/dates/calendar';
import { todayIST } from '../../common/dates/ist';
import { fromDecimal128 } from '../../common/money/decimal128';
import { Decimal, toMoneyString } from '../../common/money/money';
import { Organization } from '../organization/schemas/organization.schema';
import {
  BillingCycle,
  SaasSubscription,
  SubscriptionStatus,
} from './schemas/saas-subscription.schema';

const PAYING = [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD];
/** Monthly recurring revenue, ex-GST: monthly amounts plus yearly amounts / 12 (unrounded, so ARR = MRR x 12 stays exact). */
export function monthlyRecurring(
  subs: { billingCycle: BillingCycle; recurringAmount: Types.Decimal128 }[],
): Decimal {
  return subs.reduce((mrr, s) => {
    const amount = fromDecimal128(s.recurringAmount);
    return mrr.add(
      s.billingCycle === BillingCycle.YEARLY ? amount.div(12) : amount,
    );
  }, new Decimal(0));
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(SaasSubscription.name)
    private readonly subs: Model<SaasSubscription>,
    @InjectModel(Organization.name) private readonly orgs: Model<Organization>,
  ) {}

  /**
   * Platform numbers only (PLT-11). MRR = monthly amounts + yearly amounts / 12, ex-GST, over paying
   * subscriptions (ACTIVE or in GRACE_PERIOD; trials, expired, suspended and cancelled are not revenue).
   * ARR = MRR x 12. Renewals: paying subscriptions whose end date falls within 30 / 60 / 90 days
   * (cumulative; ones already in grace count as due now).
   */
  async summary(today = todayIST()) {
    const counts = Object.fromEntries(
      Object.values(SubscriptionStatus).map((s) => [s, 0]),
    );
    for (const row of await this.subs.aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ])) {
      counts[row._id] = row.n;
    }

    const paying = await this.subs
      .find({ status: { $in: PAYING } })
      .sort({ endDate: 1 });
    const mrr = monthlyRecurring(paying);

    const horizon = addDays(today, 90);
    const due = paying.filter((s) => s.endDate <= horizon);
    const within = (days: number) => {
      const limit = addDays(today, days);
      return due.filter((s) => s.endDate <= limit).length;
    };
    const names = new Map(
      (
        await this.orgs
          .find({ _id: { $in: due.map((s) => s.organizationId) } })
          .select('slug legalName tradeName')
      ).map((o) => [String(o._id), o]),
    );

    return {
      asOf: today,
      organizations: await this.orgs.countDocuments(),
      mrr: toMoneyString(mrr),
      arr: toMoneyString(mrr.mul(12)),
      statusCounts: counts,
      renewals: {
        within30: within(30),
        within60: within(60),
        within90: within(90),
        upcoming: due.slice(0, 100).map((s) => {
          const org = names.get(String(s.organizationId));
          return {
            organizationId: String(s.organizationId),
            slug: org?.slug ?? null,
            name: org ? (org.tradeName ?? org.legalName) : null,
            endDate: s.endDate,
            daysLeft: daysBetween(today, s.endDate), // negative = already past its end date (grace)
            status: s.status,
            billingCycle: s.billingCycle,
            recurringAmount: toMoneyString(fromDecimal128(s.recurringAmount)),
          };
        }),
      },
    };
  }
}
