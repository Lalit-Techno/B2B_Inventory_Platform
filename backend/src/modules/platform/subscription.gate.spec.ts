/* eslint-disable @typescript-eslint/unbound-method -- decorator metadata is read from the prototype methods */
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Model } from 'mongoose';
import { addDays } from '../../common/dates/calendar';
import { todayIST } from '../../common/dates/ist';
import { AllowInactive, Public } from '../../common/rbac/authorize.decorator';
import { SaasSubscription } from './schemas/saas-subscription.schema';
import { SubscriptionGate } from './subscription.gate';

class Routes {
  business() {}
  @AllowInactive()
  profile() {}
  @Public()
  login() {}
}

describe('SubscriptionGate', () => {
  const today = todayIST();
  const gate = (sub: object | null) =>
    new SubscriptionGate(new Reflector(), {
      findOne: () => ({ select: () => ({ lean: () => Promise.resolve(sub) }) }),
    } as unknown as Model<SaasSubscription>);
  const ctx = (handler: () => void, user: object | undefined) =>
    ({
      getHandler: () => handler,
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;
  const tenant = { organizationId: '64b000000000000000000001' };
  const sub = (status: string, endDate: string) => ({
    status,
    endDate,
    graceDays: 7,
  });
  const run = (g: SubscriptionGate, h: () => void, user: object = tenant) =>
    Promise.resolve(g.canActivate(ctx(h, user)));

  it.each([
    ['ACTIVE', addDays(today, 5)],
    ['ACTIVE', addDays(today, -3)], // stale status, still inside grace
    ['GRACE_PERIOD', addDays(today, -3)],
    ['TRIAL', addDays(today, 5)],
  ])('lets a %s tenant (ends %s) through', async (status, end) => {
    await expect(
      run(gate(sub(status, end)), Routes.prototype.business),
    ).resolves.toBe(true);
  });

  it.each([
    ['ACTIVE', addDays(today, -30)], // stale: the job has not run yet
    ['EXPIRED', addDays(today, -30)],
    ['SUSPENDED', addDays(today, 30)],
    ['CANCELLED', addDays(today, 30)],
  ])('refuses a %s tenant (ends %s) with 402', async (status, end) => {
    await expect(
      run(gate(sub(status, end)), Routes.prototype.business),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
  });

  it('refuses a tenant that has no subscription row', async () => {
    await expect(
      run(gate(null), Routes.prototype.business),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
  });

  it('lets @AllowInactive and @Public routes and platform users through', async () => {
    const dead = gate(sub('SUSPENDED', addDays(today, -30)));
    await expect(run(dead, Routes.prototype.profile)).resolves.toBe(true);
    await expect(run(dead, Routes.prototype.login)).resolves.toBe(true);
    await expect(run(dead, Routes.prototype.business, {})).resolves.toBe(true);
  });
});
