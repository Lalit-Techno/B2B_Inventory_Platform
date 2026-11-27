/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest response bodies are untyped */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuditLog } from '../src/common/audit/audit-log.schema';
import { addDays } from '../src/common/dates/calendar';
import { todayIST } from '../src/common/dates/ist';
import { MailService } from '../src/common/mail/mail.service';
import { isGstin } from '../src/common/validation/validators';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserStatus } from '../src/modules/auth/schemas/user.schema';
import { Notification } from '../src/modules/notifications/schemas/notification.schema';
import {
  SaasSubscription,
  SubscriptionStatus,
} from '../src/modules/platform/schemas/saas-subscription.schema';
import { SubscriptionJobs } from '../src/modules/platform/subscription-jobs.service';
import { dropTestDb, testDbConfig } from './helpers/test-db';

const PASSWORD = 'correct-horse-battery';
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstin = (base: string) =>
  base + [...CHARSET].find((c) => isGstin(base + c))!;
const GSTINS = [
  '27AAPFU0939F1ZV',
  gstin('29ABCDE1234F1Z'),
  gstin('33FGHIJ5678K1Z'),
  gstin('07KLMNO9012P1Z'),
  gstin('19PQRST3456U1Z'),
  gstin('24UVWXY7890Z1Z'),
  gstin('06ABCDE1234F1Z'),
];
const today = todayIST();

describe('Subscription status job and tenant subscription view (real MongoDB)', () => {
  const db = testDbConfig();
  let app: INestApplication<App>;
  let sent: { to: string; subject: string }[];
  let sa: string;
  let subs: Model<SaasSubscription>;
  let notes: Model<Notification>;
  let audits: Model<AuditLog>;
  let jobs: SubscriptionJobs;

  const http = () => request(app.getHttpServer());
  const login = (identifier: string) =>
    http()
      .post('/api/v1/auth/login')
      .send({ email: identifier, password: PASSWORD });

  const onboard = async (n: number, start: string) => {
    const res = await http()
      .post('/api/v1/super/organizations')
      .set('Authorization', `Bearer ${sa}`)
      .send({
        slug: `org-${n}`,
        legalName: `Org ${n} Pvt Ltd`,
        gstin: GSTINS[n],
        address: {
          line1: '1 Test Road',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411001',
        },
        invoicePrefix: `O${n}`,
        subscription: {
          planCode: 'GROWTH',
          billingCycle: 'MONTHLY',
          recurringAmount: '5000',
          startDate: start,
        },
        adminUser: { fullName: `Admin ${n}`, email: `admin${n}@org.test` },
      })
      .expect(201);
    return res.body.data as {
      organizationId: string;
      subscriptionId: string;
      adminInviteLink: string;
    };
  };
  const adminToken = async (
    o: Awaited<ReturnType<typeof onboard>>,
    n: number,
  ) => {
    await http()
      .post('/api/v1/auth/set-password')
      .send({
        token: /token=([\w-]+)/.exec(o.adminInviteLink)![1],
        password: PASSWORD,
      })
      .expect(200);
    return (await login(`admin${n}@org.test`).expect(200)).body.data
      .accessToken as string;
  };
  const sub = async (o: { organizationId: string }) =>
    (await subs.findOne({ organizationId: o.organizationId }).lean())!;
  const set = (o: { subscriptionId: string }, fields: object) =>
    subs.updateOne({ _id: o.subscriptionId }, { $set: fields });
  const notesFor = (o: { organizationId: string }) =>
    notes.find({ organizationId: o.organizationId }).lean();

  beforeAll(async () => {
    process.env.MONGODB_URI = db.uri;
    process.env.MONGODB_DB_NAME = db.dbName;
    process.env.JWT_SECRET = 'e2e-secret-e2e-secret-e2e-secret';
    process.env.DISABLE_THROTTLE = '1';
    process.env.DISABLE_JOBS = '1';
    sent = [];

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        send: (m: { to: string; subject: string }) => void sent.push(m),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    subs = app.get(getModelToken(SaasSubscription.name));
    notes = app.get(getModelToken(Notification.name));
    audits = app.get(getModelToken(AuditLog.name));
    jobs = app.get(SubscriptionJobs);
    const users = app.get<Model<User>>(getModelToken(User.name));
    await Promise.all([
      users.syncIndexes(),
      subs.syncIndexes(),
      notes.syncIndexes(),
    ]);
    await users.create({
      email: 'root@platform.test',
      fullName: 'Root',
      passwordHash: await app.get(AuthService).hashPassword(PASSWORD),
      isPlatformAdmin: true,
      status: UserStatus.ACTIVE,
    });
    sa = (await login('root@platform.test').expect(200)).body.data
      .accessToken as string;
    await http()
      .post('/api/v1/super/plans')
      .set('Authorization', `Bearer ${sa}`)
      .send({
        code: 'GROWTH',
        name: 'Growth',
        monthlyPrice: '5000',
        yearlyPrice: '50000',
      })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await dropTestDb(db);
  });

  describe('GET /subscription (PLT-05)', () => {
    it('an org admin sees their own subscription, also after it has expired; /me still works', async () => {
      const ok = await onboard(0, today);
      const old = await onboard(1, addDays(today, -200));
      const okToken = await adminToken(ok, 0);
      const oldToken = await adminToken(old, 1);

      const a = await http()
        .get('/api/v1/subscription')
        .set('Authorization', `Bearer ${okToken}`)
        .expect(200);
      expect(a.body.data).toMatchObject({
        plan: { code: 'GROWTH', name: 'Growth' },
        billingCycle: 'MONTHLY',
        recurringAmount: '5000.00',
        status: 'ACTIVE',
        startDate: today,
        graceDays: 7,
      });
      expect(a.body.data.daysLeft).toBeGreaterThan(25);

      const b = await http()
        .get('/api/v1/subscription')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(200);
      expect(b.body.data).toMatchObject({
        status: 'EXPIRED',
        daysLeft: 0,
        graceDaysLeft: 0,
      });
      const me = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(200);
      expect(me.body.data.subscriptionStatus).toBe('EXPIRED');
    });

    it('needs a login and is refused for the Super Admin (no tenant)', async () => {
      await http().get('/api/v1/subscription').expect(401);
      await http()
        .get('/api/v1/subscription')
        .set('Authorization', `Bearer ${sa}`)
        .expect(403);
    });
  });

  describe('daily job', () => {
    let F: Awaited<ReturnType<typeof onboard>>; // stale ACTIVE, ended yesterday
    let G: Awaited<ReturnType<typeof onboard>>; // stale GRACE, long past
    let H: Awaited<ReturnType<typeof onboard>>; // ends in 7 days
    let I: Awaited<ReturnType<typeof onboard>>; // reminders switched off
    let J: Awaited<ReturnType<typeof onboard>>; // suspended and past its date

    beforeAll(async () => {
      F = await onboard(2, today);
      G = await onboard(3, today);
      H = await onboard(4, today);
      I = await onboard(5, today);
      J = await onboard(6, today);
      // keep the three clear of every reminder day until their own test sets one
      for (const o of [H, I, J]) await set(o, { endDate: addDays(today, 100) });
    });

    it('moves stale subscriptions on, once, with audit rows and notices to the admins', async () => {
      await set(F, { endDate: addDays(today, -1) });
      await set(G, {
        endDate: addDays(today, -20),
        status: SubscriptionStatus.GRACE_PERIOD,
      });
      sent.length = 0;

      const first = await jobs.run();
      expect(first.statusChanges).toBe(2);
      expect((await sub(F)).status).toBe('GRACE_PERIOD');
      expect((await sub(G)).status).toBe('EXPIRED');

      const fNotes = await notesFor(F);
      expect(fNotes).toHaveLength(1);
      expect(fNotes[0]).toMatchObject({
        type: 'SUB_GRACE_PERIOD',
        link: '/subscription',
      });
      expect(sent.map((m) => m.to).sort()).toEqual([
        'admin2@org.test',
        'admin3@org.test',
      ]);
      expect(
        await audits.countDocuments({
          action: 'SUBSCRIPTION_STATUS_CHANGED',
          entityId: String((await sub(F))._id),
        }),
      ).toBe(1);

      // running again changes and sends nothing
      sent.length = 0;
      const second = await jobs.run();
      expect(second.statusChanges).toBe(0);
      expect(second.reminders).toBe(0);
      expect(sent).toHaveLength(0);
      expect(await notesFor(F)).toHaveLength(1);
    });

    it('sends a reminder 7 days before the end, once, and not when reminders are off', async () => {
      await set(H, { endDate: addDays(today, 7) });
      await set(I, { endDate: addDays(today, 7), renewalReminders: false });
      sent.length = 0;

      const run = await jobs.run();
      expect(run.reminders).toBe(1);
      const hNotes = await notesFor(H);
      expect(hNotes).toHaveLength(1);
      expect(hNotes[0]).toMatchObject({
        type: 'SUB_REMINDER',
        title: 'Subscription ends in 7 days',
      });
      expect(await notesFor(I)).toHaveLength(0);

      expect((await jobs.run()).reminders).toBe(0);
      expect(await notesFor(H)).toHaveLength(1);
    });

    it('leaves a suspended subscription alone, however old', async () => {
      await set(J, {
        endDate: addDays(today, -90),
        status: SubscriptionStatus.SUSPENDED,
      });
      await jobs.run();
      expect((await sub(J)).status).toBe('SUSPENDED');
      expect(await notesFor(J)).toHaveLength(0);
    });
  });
});
