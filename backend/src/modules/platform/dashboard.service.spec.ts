import { toDecimal128 } from '../../common/money/decimal128';
import { toMoneyString } from '../../common/money/money';
import { BillingCycle } from './schemas/saas-subscription.schema';
import { monthlyRecurring } from './dashboard.service';

const sub = (billingCycle: BillingCycle, amount: string) => ({
  billingCycle,
  recurringAmount: toDecimal128(amount),
});

describe('MRR / ARR', () => {
  it('monthly amounts count in full, yearly amounts as one twelfth', () => {
    const mrr = monthlyRecurring([
      sub(BillingCycle.MONTHLY, '5000'),
      sub(BillingCycle.YEARLY, '12000'),
    ]);
    expect(toMoneyString(mrr)).toBe('6000.00');
    expect(toMoneyString(mrr.mul(12))).toBe('72000.00');
  });

  it('ARR is MRR x 12 before rounding: a yearly 29999 gives exactly 29999.00, not 29999.04', () => {
    const mrr = monthlyRecurring([sub(BillingCycle.YEARLY, '29999')]);
    expect(toMoneyString(mrr)).toBe('2499.92'); // 2499.9166...
    expect(toMoneyString(mrr.mul(12))).toBe('29999.00');
  });

  it('no subscriptions means zero', () => {
    expect(toMoneyString(monthlyRecurring([]))).toBe('0.00');
  });
});
