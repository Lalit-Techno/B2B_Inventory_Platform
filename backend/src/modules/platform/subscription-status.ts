import { addDays, periodEnd } from '../../common/dates/calendar';
import { SubscriptionStatus } from './schemas/saas-subscription.schema';

/**
 * Status from the dates (spec "Status evaluation"):
 *   ACTIVE        while today <= endDate
 *   GRACE_PERIOD  for the next `graceDays` days
 *   EXPIRED       afterwards
 * SUSPENDED (set by the Super Admin) and CANCELLED are manual and never changed by the dates.
 */
export function evaluateStatus(
  today: string,
  endDate: string,
  graceDays: number,
  current: SubscriptionStatus = SubscriptionStatus.ACTIVE,
): SubscriptionStatus {
  if (
    current === SubscriptionStatus.SUSPENDED ||
    current === SubscriptionStatus.CANCELLED
  )
    return current;
  if (today <= endDate)
    return current === SubscriptionStatus.TRIAL
      ? SubscriptionStatus.TRIAL
      : SubscriptionStatus.ACTIVE;
  if (today <= addDays(endDate, graceDays))
    return SubscriptionStatus.GRACE_PERIOD;
  return SubscriptionStatus.EXPIRED;
}

/**
 * Which days does a payment buy? (spec "Validity dates")
 *  - paid on or before the end of the grace period: the new period starts the day after the old end (no lost days);
 *  - paid later: the new period starts on the payment date.
 * `months` is cycle months x number of periods. The end date is inclusive.
 */
export function paymentPeriod(
  sub: { endDate: string; graceDays: number },
  paymentDate: string,
  months: number,
): { periodStart: string; periodEnd: string } {
  const inTime = paymentDate <= addDays(sub.endDate, sub.graceDays);
  const periodStart = inTime ? addDays(sub.endDate, 1) : paymentDate;
  return { periodStart, periodEnd: periodEnd(periodStart, months) };
}
