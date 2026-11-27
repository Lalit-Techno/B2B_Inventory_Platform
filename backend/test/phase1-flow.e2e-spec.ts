/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- supertest response bodies are untyped */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays, periodEnd } from '../src/common/dates/calendar';
import { todayIST } from '../src/common/dates/ist';
import { isGstin } from '../src/common/validation/validators';
import { MailService } from '../src/common/mail/mail.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserStatus } from '../src/modules/auth/schemas/user.schema';
import { SaasTransaction } from '../src/modules/platform/schemas/saas-transaction.schema';
import { dropTestDb, testDbConfig } from './helpers/test-db';

const PASSWORD = 'correct-horse-battery';
const today = todayIST();

// P1-QA-02: the whole Phase 1 journey in one go.
describe('Phase 1 flow: onboard -> set password -> login -> record payment twice with one key (real MongoDB)', () => {
  const db = testDbConfig();
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());
  const login = (identifier: string) =>
    http()
      .post('/api/v1/auth/login')
      .send({ email: identifier, password: PASSWORD });

  it('works end to end and records the payment once', async () => {
    process.env.MONGODB_URI = db.uri;
    process.env.MONGODB_DB_NAME = db.dbName;
    process.env.JWT_SECRET = 'e2e-secret-e2e-secret-e2e-secret';
    process.env.DISABLE_THROTTLE = '1';
    process.env.DISABLE_JOBS = '1';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ send: () => Promise.resolve() })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    try {
      const users = app.get<Model<User>>(getModelToken(User.name));
      const ledger = app.get<Model<SaasTransaction>>(
        getModelToken(SaasTransaction.name),
      );
      await Promise.all([users.syncIndexes(), ledger.syncIndexes()]);
      await users.create({
        email: 'root@platform.test',
        fullName: 'Root',
        passwordHash: await app.get(AuthService).hashPassword(PASSWORD),
        isPlatformAdmin: true,
        status: UserStatus.ACTIVE,
      });
      const sa = (await login('root@platform.test').expect(200)).body.data
        .accessToken as string;
      const asSA = (r: request.Test) => r.set('Authorization', `Bearer ${sa}`);

      await asSA(http().post('/api/v1/super/plans'))
        .send({
          code: 'GROWTH',
          name: 'Growth',
          monthlyPrice: '5000',
          yearlyPrice: '50000',
        })
        .expect(201);

      // 1. onboard
      const org = (
        await asSA(http().post('/api/v1/super/organizations'))
          .send({
            slug: 'flow-co',
            legalName: 'Flow Co Pvt Ltd',
            gstin: '27AAPFU0939F1ZV',
            address: {
              line1: '1 Test Road',
              city: 'Pune',
              state: 'Maharashtra',
              pincode: '411001',
            },
            invoicePrefix: 'FLOW',
            subscription: {
              planCode: 'GROWTH',
              billingCycle: 'MONTHLY',
              recurringAmount: '5000',
            },
            adminUser: { fullName: 'Flow Admin', email: 'admin@flow.test' },
          })
          .expect(201)
      ).body.data as {
        adminInviteLink: string;
        endDate: string;
        subscriptionId: string;
      };

      // a not-yet-activated admin cannot sign in
      await login('admin@flow.test').expect(401);

      // 2. set password from the invite link
      await http()
        .post('/api/v1/auth/set-password')
        .send({
          token: /token=([\w-]+)/.exec(org.adminInviteLink)![1],
          password: PASSWORD,
        })
        .expect(200);

      // 3. login (tenant admin)
      const tenant = (await login('admin@flow.test').expect(200)).body.data;
      expect(tenant.role).toBe('ORG_ADMIN');
      const asTenant = (r: request.Test) =>
        r.set('Authorization', `Bearer ${tenant.accessToken}`);
      await asTenant(http().get('/api/v1/me')).expect(200);
      const before = (
        await asTenant(http().get('/api/v1/subscription')).expect(200)
      ).body.data;
      expect(before).toMatchObject({ status: 'ACTIVE', endDate: org.endDate });
      await asTenant(http().get('/api/v1/super/dashboard')).expect(403);

      // 4. record a payment twice with the same Idempotency-Key
      const pay = () =>
        asSA(
          http().post(
            `/api/v1/super/subscriptions/${org.subscriptionId}/record-payment`,
          ),
        )
          .set('Idempotency-Key', 'flow-key-1')
          .send({
            taxableAmount: '5000.00',
            gstAmount: '900.00',
            amount: '5900.00',
            paymentMode: 'BANK_TRANSFER',
            transactionReference: 'FLOW-REF-1',
          });
      const first = await pay().expect(200);
      const second = await pay().expect(200);
      expect(second.body.data).toEqual(first.body.data);

      expect(await ledger.countDocuments({ entryType: 'PAYMENT' })).toBe(1);
      const expectedEnd = periodEnd(addDays(org.endDate, 1), 1);
      expect(first.body.data.newEndDate).toBe(expectedEnd);

      // the tenant sees the extended validity
      const after = (
        await asTenant(http().get('/api/v1/subscription')).expect(200)
      ).body.data;
      expect(after.endDate).toBe(expectedEnd);
      expect(today <= after.endDate).toBe(true);

      // a YEARLY organization: one payment buys twelve months
      const base = '29ABCDE1234F1Z';
      const gstin2 =
        base +
        [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) =>
          isGstin(base + c),
        )!;
      const yearly = (
        await asSA(http().post('/api/v1/super/organizations'))
          .send({
            slug: 'flow-yearly',
            legalName: 'Flow Yearly Pvt Ltd',
            gstin: gstin2,
            address: {
              line1: '1 Test Road',
              city: 'Pune',
              state: 'Maharashtra',
              pincode: '411001',
            },
            invoicePrefix: 'FLY',
            subscription: {
              planCode: 'GROWTH',
              billingCycle: 'YEARLY',
              recurringAmount: '50000',
            },
            adminUser: { fullName: 'Yearly Admin', email: 'admin@yearly.test' },
          })
          .expect(201)
      ).body.data as { endDate: string; subscriptionId: string };
      const paid = await asSA(
        http().post(
          `/api/v1/super/subscriptions/${yearly.subscriptionId}/record-payment`,
        ),
      )
        .set('Idempotency-Key', 'flow-key-2')
        .send({
          taxableAmount: '50000.00',
          gstAmount: '9000.00',
          amount: '59000.00',
          paymentMode: 'UPI',
          transactionReference: 'FLOW-REF-2',
        })
        .expect(200);
      expect(paid.body.data.newEndDate).toBe(
        periodEnd(addDays(yearly.endDate, 1), 12),
      );

      // dashboard: MRR = 5000 (monthly) + 50000 / 12
      const dash = (
        await asSA(http().get('/api/v1/super/dashboard')).expect(200)
      ).body.data;
      expect(dash.mrr).toBe('9166.67');
      expect(dash.arr).toBe('110000.00');
    } finally {
      await app.close();
      await dropTestDb(db);
    }
  });
});
