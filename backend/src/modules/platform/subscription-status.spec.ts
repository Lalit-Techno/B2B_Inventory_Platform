import { SubscriptionStatus as S } from './schemas/saas-subscription.schema';
import { evaluateStatus, paymentPeriod } from './subscription-status';

describe('evaluateStatus', () => {
  const end = '2026-11-30';
  it('ACTIVE through the end date, GRACE for graceDays after, then EXPIRED', () => {
    expect(evaluateStatus('2026-11-01', end, 7)).toBe(S.ACTIVE);
    expect(evaluateStatus('2026-11-30', end, 7)).toBe(S.ACTIVE); // last paid day (inclusive)
    expect(evaluateStatus('2026-12-01', end, 7)).toBe(S.GRACE_PERIOD);
    expect(evaluateStatus('2026-12-07', end, 7)).toBe(S.GRACE_PERIOD); // last grace day
    expect(evaluateStatus('2026-12-08', end, 7)).toBe(S.EXPIRED);
  });

  it('zero grace days means expired the day after the end date', () => {
    expect(evaluateStatus('2026-12-01', end, 0)).toBe(S.EXPIRED);
  });

  it('grace crossing a month and year end', () => {
    expect(evaluateStatus('2026-12-31', '2026-12-30', 3)).toBe(S.GRACE_PERIOD);
    expect(evaluateStatus('2027-01-02', '2026-12-30', 3)).toBe(S.GRACE_PERIOD); // 3rd and last grace day
    expect(evaluateStatus('2027-01-03', '2026-12-30', 3)).toBe(S.EXPIRED);
  });

  it('manual states are never changed by the dates', () => {
    expect(evaluateStatus('2030-01-01', end, 7, S.SUSPENDED)).toBe(S.SUSPENDED);
    expect(evaluateStatus('2026-01-01', end, 7, S.SUSPENDED)).toBe(S.SUSPENDED);
    expect(evaluateStatus('2030-01-01', end, 7, S.CANCELLED)).toBe(S.CANCELLED);
  });

  it('a trial stays a trial until its end date', () => {
    expect(evaluateStatus('2026-11-10', end, 7, S.TRIAL)).toBe(S.TRIAL);
    expect(evaluateStatus('2026-12-02', end, 7, S.TRIAL)).toBe(S.GRACE_PERIOD);
  });
});

describe('paymentPeriod', () => {
  const sub = { endDate: '2026-11-30', graceDays: 7 };

  it('paid before the end: the new month follows the old end, no lost days', () => {
    expect(paymentPeriod(sub, '2026-11-10', 1)).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
    });
    expect(paymentPeriod(sub, '2026-11-30', 1)).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
    });
  });

  it('paid early, long before the end: still extends from the old end', () => {
    expect(paymentPeriod(sub, '2026-01-05', 1)).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2026-12-31',
    });
  });

  it('paid inside the grace period (last grace day included): extends from the old end', () => {
    expect(paymentPeriod(sub, '2026-12-03', 1).periodStart).toBe('2026-12-01');
    expect(paymentPeriod(sub, '2026-12-07', 1).periodStart).toBe('2026-12-01');
  });

  it('paid after the grace period: the new period starts on the payment date', () => {
    expect(paymentPeriod(sub, '2026-12-08', 1)).toEqual({
      periodStart: '2026-12-08',
      periodEnd: '2027-01-07',
    });
    expect(paymentPeriod(sub, '2027-03-15', 12)).toEqual({
      periodStart: '2027-03-15',
      periodEnd: '2028-03-14',
    });
  });

  it('several periods at once', () => {
    expect(paymentPeriod(sub, '2026-11-10', 3)).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2027-02-28',
    });
    expect(paymentPeriod(sub, '2026-11-10', 12)).toEqual({
      periodStart: '2026-12-01',
      periodEnd: '2027-11-30',
    });
  });

  it('leap year and month-end', () => {
    expect(
      paymentPeriod({ endDate: '2028-01-31', graceDays: 7 }, '2028-01-20', 1),
    ).toEqual({
      periodStart: '2028-02-01',
      periodEnd: '2028-02-29',
    });
    expect(
      paymentPeriod({ endDate: '2027-02-28', graceDays: 7 }, '2027-02-20', 1),
    ).toEqual({
      periodStart: '2027-03-01',
      periodEnd: '2027-03-31',
    });
  });
});
