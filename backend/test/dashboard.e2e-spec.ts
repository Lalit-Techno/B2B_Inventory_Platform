/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- supertest response bodies are untyped */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { addDays } from '../src/common/dates/calendar';
import { todayIST } from '../src/common/dates/ist';
import { MailService } from '../src/common/mail/mail.service';
import { isGstin } from '../src/common/validation/validators';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserStatus } from '../src/modules/auth/schemas/user.schema';
import { dropTestDb, testDbConfig } from './helpers/test-db';

const PASSWORD = 'correct-horse-battery';
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const gstin = (base: string) =>
  base + [...CHARSET].find((c) => isGstin(base + c))!;
const GSTINS = [
  '27AAPFU0939F1ZV',
  gstin('29ABCDE1234F1Z'),
  gstin('33FGHIJ5678K1Z'),
];
const today = todayIST();

describe('Super Admin dashboard (real MongoDB)', () => {
  const db = testDbConfig();
  let app: INestApplication<App>;
  let sa: string;
  let invite: { adminInviteLink: string };

  const http = () => request(app.getHttpServer());
  const login = (identifier: string) =>
    http()
      .post('/api/v1/auth/login')
      .send({ email: identifier, password: PASSWORD });
  const onboard = async (
    n: number,
    cycle: string,
    amount: string,
    start: string,
  ) =>
    (
      await http()
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
            billingCycle: cycle,
            recurringAmount: amount,
            startDate: start,
          },
          adminUser: { fullName: `Admin ${n}`, email: `admin${n}@org.test` },
        })
        .expect(201)
    ).body.data as { adminInviteLink: string };

  beforeAll(async () => {
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
    const users = app.get<Model<User>>(getModelToken(User.name));
    await users.syncIndexes();
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

  it('is empty-safe before any tenant exists', async () => {
    const res = await http()
      .get('/api/v1/super/dashboard')
      .set('Authorization', `Bearer ${sa}`)
      .expect(200);
    expect(res.body.data).toMatchObject({
      mrr: '0.00',
      arr: '0.00',
      organizations: 0,
      renewals: { within30: 0, within60: 0, within90: 0, upcoming: [] },
    });
  });

  it('adds monthly + yearly/12 over paying tenants only, and lists renewals due', async () => {
    invite = await onboard(0, 'MONTHLY', '5000', today); // ends in ~30 days
    await onboard(1, 'YEARLY', '12000', today); // ends in a year: not due
    await onboard(2, 'MONTHLY', '7000', addDays(today, -200)); // expired: no revenue

    const res = await http()
      .get('/api/v1/super/dashboard')
      .set('Authorization', `Bearer ${sa}`)
      .expect(200);
    const d = res.body.data;
    expect(d.mrr).toBe('6000.00'); // 5000 + 12000 / 12
    expect(d.arr).toBe('72000.00');
    expect(d.organizations).toBe(3);
    expect(d.statusCounts).toMatchObject({
      ACTIVE: 2,
      EXPIRED: 1,
      SUSPENDED: 0,
    });
    expect(d.renewals.within90).toBe(1);
    expect(d.renewals.within30 + d.renewals.within60).toBeGreaterThanOrEqual(1);
    expect(d.renewals.upcoming).toHaveLength(1);
    expect(d.renewals.upcoming[0]).toMatchObject({
      slug: 'org-0',
      billingCycle: 'MONTHLY',
      recurringAmount: '5000.00',
      status: 'ACTIVE',
    });
  });

  it('is Super Admin only', async () => {
    await http().get('/api/v1/super/dashboard').expect(401);
    await http()
      .post('/api/v1/auth/set-password')
      .send({
        token: /token=([\w-]+)/.exec(invite.adminInviteLink)![1],
        password: PASSWORD,
      })
      .expect(200);
    const tenant = (await login('admin0@org.test').expect(200)).body.data
      .accessToken as string;
    await http()
      .get('/api/v1/super/dashboard')
      .set('Authorization', `Bearer ${tenant}`)
      .expect(403);
  });
});
