/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- supertest response bodies are untyped */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuditLog } from '../src/common/audit/audit-log.schema';
import { periodEnd } from '../src/common/dates/calendar';
import { todayIST } from '../src/common/dates/ist';
import { MailService } from '../src/common/mail/mail.service';
import { isGstin } from '../src/common/validation/validators';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserStatus } from '../src/modules/auth/schemas/user.schema';
import { OrgUser } from '../src/modules/organization/schemas/org-user.schema';
import { Organization } from '../src/modules/organization/schemas/organization.schema';
import { Warehouse } from '../src/modules/organization/schemas/warehouse.schema';
import { SaasSubscription } from '../src/modules/platform/schemas/saas-subscription.schema';
import { dropTestDb, testDbConfig } from './helpers/test-db';

const PASSWORD = 'correct-horse-battery';
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** A GSTIN with the right check character for a 14 character base. */
const gstin = (base: string) =>
  base + [...CHARSET].find((c) => isGstin(base + c))!;

const GSTIN_1 = '27AAPFU0939F1ZV';
const GSTIN_2 = gstin('29ABCDE1234F1Z');
const GSTIN_3 = gstin('33FGHIJ5678K1Z');

const onboardBody = (over: Record<string, unknown> = {}) => ({
  slug: 'acme-traders',
  legalName: 'Acme Traders Pvt Ltd',
  tradeName: 'Acme',
  gstin: GSTIN_1,
  email: 'info@acme.test',
  phone: '98765 00001',
  address: {
    line1: '12 Market Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
  },
  invoicePrefix: 'acm',
  subscription: {
    planCode: 'growth',
    billingCycle: 'YEARLY',
    recurringAmount: '48000',
    startDate: '2026-12-01',
  },
  adminUser: {
    fullName: 'Asha Admin',
    email: 'Asha@Acme.test',
    phone: '98765 00002',
  },
  ...over,
});

describe('Platform: plans and onboarding (real MongoDB)', () => {
  const db = testDbConfig();
  let app: INestApplication<App>;
  let sent: { to: string; text: string }[];
  let sa: string; // Super Admin access token
  let users: Model<User>;
  let orgs: Model<Organization>;
  let warehouses: Model<Warehouse>;
  let orgUsers: Model<OrgUser>;
  let subs: Model<SaasSubscription>;
  let audits: Model<AuditLog>;
  let auth: AuthService;

  const http = () => request(app.getHttpServer());
  const asSA = (r: request.Test) => r.set('Authorization', `Bearer ${sa}`);
  const post = (path: string, body: object) =>
    asSA(http().post(`/api/v1${path}`).send(body));
  const patch = (path: string, body: object) =>
    asSA(http().patch(`/api/v1${path}`).send(body));
  const get = (path: string) => asSA(http().get(`/api/v1${path}`));
  const login = (identifier: string, organizationId?: string) =>
    http()
      .post('/api/v1/auth/login')
      .send({ email: identifier, password: PASSWORD, organizationId });
  const tokenFromLink = (link: string) => /token=([\w-]+)/.exec(link)![1];

  beforeAll(async () => {
    process.env.MONGODB_URI = db.uri;
    process.env.MONGODB_DB_NAME = db.dbName;
    process.env.JWT_SECRET = 'e2e-secret-e2e-secret-e2e-secret';
    process.env.DISABLE_THROTTLE = '1';
    sent = [];

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        send: (m: { to: string; text: string }) => void sent.push(m),
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const m = <T>(c: { name: string }) =>
      app.get<Model<T>>(getModelToken(c.name));
    users = m(User);
    orgs = m(Organization);
    warehouses = m(Warehouse);
    orgUsers = m(OrgUser);
    subs = m(SaasSubscription);
    audits = m(AuditLog);
    auth = app.get(AuthService);
    for (const model of [users, orgs, warehouses, orgUsers, subs])
      await model.syncIndexes();

    await users.create({
      email: 'root@platform.test',
      fullName: 'Root',
      passwordHash: await auth.hashPassword(PASSWORD),
      isPlatformAdmin: true,
      status: UserStatus.ACTIVE,
    });
    sa = (await login('root@platform.test').expect(200)).body.data
      .accessToken as string;
  });

  afterAll(async () => {
    await app.close();
    await dropTestDb(db);
  });

  describe('plans (PLT-01)', () => {
    let planId: string;

    it('needs a login and the Super Admin role', async () => {
      await http().get('/api/v1/super/plans').expect(401);
      await http().post('/api/v1/super/plans').send({}).expect(401);
    });

    it('creates a plan: code upper-cased, money as decimal strings, defaults applied, no limits = unlimited', async () => {
      const res = await post('/super/plans', {
        code: ' growth ',
        name: 'Growth',
        monthlyPrice: '4999',
        yearlyPrice: '49990.5',
      }).expect(201);
      planId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        code: 'GROWTH',
        monthlyPrice: '4999.00',
        yearlyPrice: '49990.50',
        gstRate: '18.00',
        graceDays: 7,
        maxStaff: null,
        maxBuyers: null,
        maxSkus: null,
        maxOrdersPerMonth: null,
        isActive: true,
      });
    });

    it('refuses a duplicate code, bad money and unknown fields', async () => {
      const base = {
        code: 'GROWTH',
        name: 'Again',
        monthlyPrice: '1',
        yearlyPrice: '1',
      };
      await post('/super/plans', base).expect(409);
      await post('/super/plans', {
        ...base,
        code: 'X1',
        monthlyPrice: 4999,
      }).expect(400); // a JSON number is a float
      await post('/super/plans', {
        ...base,
        code: 'X2',
        monthlyPrice: '12.345',
      }).expect(400);
      await post('/super/plans', {
        ...base,
        code: 'X3',
        monthlyPrice: '-5',
      }).expect(400);
      await post('/super/plans', {
        ...base,
        code: 'X4',
        gstRate: '101',
      }).expect(400);
      await post('/super/plans', { ...base, code: 'x y' }).expect(400);
      await post('/super/plans', {
        ...base,
        code: 'X5',
        graceDays: 2.5,
      }).expect(400);
      await post('/super/plans', {
        ...base,
        code: 'X6',
        isActive: false,
      }).expect(400);
    });

    it('lists and reads plans; a malformed or unknown id is 404', async () => {
      const list = await get('/super/plans').expect(200);
      expect(
        (list.body.data as { code: string }[]).map((p) => p.code),
      ).toContain('GROWTH');
      await get(`/super/plans/${planId}`).expect(200);
      await get('/super/plans/not-an-id').expect(404);
      await get('/super/plans/64b000000000000000000001').expect(404);
    });

    it('edits a plan; null removes a limit; the code cannot change', async () => {
      const a = await patch(`/super/plans/${planId}`, {
        monthlyPrice: '5999.00',
        maxStaff: 5,
        maxBuyers: 50,
        graceDays: 10,
      }).expect(200);
      expect(a.body.data).toMatchObject({
        monthlyPrice: '5999.00',
        maxStaff: 5,
        maxBuyers: 50,
        graceDays: 10,
      });
      const b = await patch(`/super/plans/${planId}`, {
        maxStaff: null,
      }).expect(200);
      expect(b.body.data.maxStaff).toBeNull();
      expect(b.body.data.maxBuyers).toBe(50); // untouched
      await patch(`/super/plans/${planId}`, { code: 'NEWCODE' }).expect(400);
      await patch(`/super/plans/${planId}`, { monthlyPrice: 'abc' }).expect(
        400,
      );
      await patch('/super/plans/64b000000000000000000001', {
        name: 'xx',
      }).expect(404);
    });

    it('records plan changes in the audit trail with before and after', async () => {
      const row = await audits.findOne({ action: 'PLAN_UPDATED' }).lean();
      expect(row?.before).toMatchObject({ monthlyPrice: '4999.00' });
      expect(row?.after).toMatchObject({ monthlyPrice: '5999.00' });
      expect(row?.actorRole).toBe('SUPER_ADMIN');
    });
  });

  describe('onboarding (PLT-03)', () => {
    let org1Id: string;
    let adminLink: string;

    it('needs the Super Admin role', async () => {
      await http()
        .post('/api/v1/super/organizations')
        .send(onboardBody())
        .expect(401);
    });

    it('creates organization, warehouse, subscription and an invited admin in one go', async () => {
      const res = await post('/super/organizations', onboardBody()).expect(201);
      const d = res.body.data;
      org1Id = d.organizationId;
      adminLink = d.adminInviteLink;
      expect(d).toMatchObject({
        slug: 'acme-traders',
        billingCycle: 'YEARLY',
        startDate: '2026-12-01',
        endDate: '2027-11-30', // 12 calendar months, last day inclusive
        adminAlreadyHadAccount: false,
      });
      expect(adminLink).toMatch(/\/set-password\?token=/);

      const org = await orgs.findById(org1Id).lean();
      expect(org).toMatchObject({
        slug: 'acme-traders',
        stateCode: '27',
        pan: 'AAPFU0939F',
        invoicePrefix: 'ACM',
        phone: '+919876500001',
        status: 'ACTIVE',
      });

      const wh = await warehouses.find({ organizationId: org1Id }).lean();
      expect(wh).toHaveLength(1);
      expect(wh[0]).toMatchObject({ name: 'Main warehouse', isDefault: true });

      const sub = await subs.findOne({ organizationId: org1Id }).lean();
      expect(sub).toMatchObject({
        billingCycle: 'YEARLY',
        startDate: '2026-12-01',
        endDate: '2027-11-30',
        status: 'ACTIVE',
        graceDays: 10,
      }); // grace copied from the plan
      expect(sub?.recurringAmount.toString()).toBe('48000');

      const admin = await users.findById(d.adminUserId).lean();
      expect(admin).toMatchObject({
        email: 'asha@acme.test',
        status: 'INVITED',
        phone: '+919876500002',
      });
      expect(admin?.passwordHash).toBeUndefined();
      expect(
        await orgUsers.findOne({
          organizationId: org1Id,
          userId: d.adminUserId,
        }),
      ).toMatchObject({ role: 'ORG_ADMIN', isActive: true });
    });

    it('e-mails the set-password link after the commit and audits the onboarding', async () => {
      const mail = sent.find((m) => m.to === 'asha@acme.test');
      expect(mail?.text).toContain(adminLink);
      const row = await audits
        .findOne({ action: 'ORGANIZATION_ONBOARDED' })
        .lean();
      expect(row).toMatchObject({
        entityType: 'Organization',
        actorRole: 'SUPER_ADMIN',
      });
      expect(String(row?.organizationId)).toBe(org1Id);
      expect(row?.after).toMatchObject({
        slug: 'acme-traders',
        plan: 'GROWTH',
        endDate: '2027-11-30',
      });
    });

    it('the admin sets a password from the link, logs in and lands in their organization', async () => {
      await http()
        .post('/api/v1/auth/set-password')
        .send({ token: tokenFromLink(adminLink), password: PASSWORD })
        .expect(200);
      const res = await login('asha@acme.test').expect(200);
      expect(res.body.data).toMatchObject({
        role: 'ORG_ADMIN',
        organizationId: org1Id,
      });
      const me = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);
      expect(me.body.data.organization).toMatchObject({ slug: 'acme-traders' });
    });

    it('a tenant admin cannot use the Super Admin routes', async () => {
      const token = (await login('asha@acme.test').expect(200)).body.data
        .accessToken as string;
      await http()
        .get('/api/v1/super/plans')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await http()
        .post('/api/v1/super/organizations')
        .set('Authorization', `Bearer ${token}`)
        .send(onboardBody())
        .expect(403);
    });

    it('validates every field', async () => {
      const slug = (n: number) => ({ slug: `bad-co-${n}`, gstin: GSTIN_2 });
      const bad = async (over: Record<string, unknown>) =>
        post(
          '/super/organizations',
          onboardBody({ ...slug(1), ...over }),
        ).expect(400);
      await bad({ gstin: '27AAPFU0939F1ZX' }); // wrong check character
      await bad({ pan: 'AAPFU0939F' }); // derived from the GSTIN, not accepted
      await bad({ stateCode: '27' });
      await bad({ slug: 'admin' }); // reserved
      await bad({ slug: 'a' });
      await bad({ slug: 'Has Spaces' });
      await bad({ invoicePrefix: 'A' });
      await bad({ invoicePrefix: 'TOOLONG' });
      await bad({
        address: {
          line1: '12 Market Road',
          city: 'Mumbai',
          state: 'MH',
          pincode: '040001',
        },
      });
      await bad({
        subscription: {
          planCode: 'GROWTH',
          billingCycle: 'YEARLY',
          recurringAmount: 48000,
        },
      }); // number, not string
      await bad({
        subscription: {
          planCode: 'GROWTH',
          billingCycle: 'WEEKLY',
          recurringAmount: '1',
        },
      });
      await bad({
        subscription: {
          planCode: 'GROWTH',
          billingCycle: 'YEARLY',
          recurringAmount: '1',
          startDate: '2026-02-30',
        },
      });
      await bad({ adminUser: { fullName: 'A', email: 'not-an-email' } });
      await bad({
        adminUser: { fullName: 'Asha', email: 'x@y.test', phone: '12345' },
      });
      await bad({
        adminUser: {
          fullName: 'Asha',
          email: 'x@y.test',
          password: 'secret-123',
        },
      }); // no passwords in the request
      expect(await orgs.countDocuments({ slug: /^bad-co-/ })).toBe(0);
    });

    it('rejects an unknown or deactivated plan', async () => {
      await post(
        '/super/organizations',
        onboardBody({
          slug: 'no-plan-co',
          gstin: GSTIN_2,
          subscription: {
            planCode: 'NOPE',
            billingCycle: 'MONTHLY',
            recurringAmount: '1',
          },
        }),
      ).expect(400);
      const inactive = (
        await post('/super/plans', {
          code: 'OLD',
          name: 'Old',
          monthlyPrice: '1',
          yearlyPrice: '1',
        })
      ).body.data.id as string;
      await patch(`/super/plans/${inactive}`, { isActive: false }).expect(200);
      await post(
        '/super/organizations',
        onboardBody({
          slug: 'old-plan-co',
          gstin: GSTIN_2,
          subscription: {
            planCode: 'OLD',
            billingCycle: 'MONTHLY',
            recurringAmount: '1',
          },
        }),
      ).expect(400);
      expect(
        await orgs.countDocuments({
          slug: { $in: ['no-plan-co', 'old-plan-co'] },
        }),
      ).toBe(0);
    });

    it('refuses a duplicate slug or GSTIN with 409', async () => {
      const dupSlug = await post(
        '/super/organizations',
        onboardBody({ gstin: GSTIN_2 }),
      ).expect(409);
      expect(dupSlug.body.error.message).toMatch(/slug/);
      const dupGstin = await post(
        '/super/organizations',
        onboardBody({ slug: 'other-slug' }),
      ).expect(409);
      expect(dupGstin.body.error.message).toMatch(/GSTIN/);
    });

    it('is all-or-nothing: a failure late in the transaction leaves nothing behind', async () => {
      const before = {
        orgs: await orgs.countDocuments(),
        wh: await warehouses.countDocuments(),
        subs: await subs.countDocuments(),
        users: await users.countDocuments(),
        links: sent.length,
      };
      // The organization and warehouse are created first; a platform admin as first admin is refused afterwards.
      const clash = await post(
        '/super/organizations',
        onboardBody({
          slug: 'rollback-two',
          gstin: GSTIN_3,
          adminUser: {
            fullName: 'Rita',
            email: 'root@platform.test',
          },
        }),
      ).expect(400);
      expect(clash.body.error.message).toMatch(/platform admin/);
      expect(await orgs.countDocuments({ slug: 'rollback-two' })).toBe(0);
      expect(await users.countDocuments()).toBe(before.users);
      expect(await warehouses.countDocuments()).toBeGreaterThanOrEqual(
        before.wh,
      );
      expect(sent).toHaveLength(before.links); // no mail for a failed onboarding
    });

    it('an existing person can administer a second business: no new account, no invite link', async () => {
      const mailsBefore = sent.length;
      const res = await post(
        '/super/organizations',
        onboardBody({
          slug: 'beta-foods',
          gstin: GSTIN_2,
          phone: undefined,
          adminUser: { fullName: 'Asha Admin', email: 'asha@acme.test' },
          subscription: {
            planCode: 'GROWTH',
            billingCycle: 'MONTHLY',
            recurringAmount: '5000',
          },
        }),
      ).expect(201);
      expect(res.body.data).toMatchObject({
        adminAlreadyHadAccount: true,
        adminInviteLink: null,
        adminInviteExpiresAt: null,
      });
      expect(sent).toHaveLength(mailsBefore); // nothing to set up, nothing to mail
      expect(await users.countDocuments({ email: 'asha@acme.test' })).toBe(1);

      // she picks which business to enter at login
      const secondOrg = res.body.data.organizationId as string;
      const second = await login('asha@acme.test', secondOrg).expect(200);
      expect(second.body.data.organizationId).toBe(secondOrg);
      const first = await login('asha@acme.test', org1Id).expect(200);
      expect(first.body.data.organizationId).toBe(org1Id);
    });

    it('defaults the start date to today in India and keeps month-end maths right', async () => {
      const res = await post(
        '/super/organizations',
        onboardBody({
          slug: 'gamma-mart',
          gstin: gstin('07KLMNO9012P1Z'),
          phone: undefined,
          adminUser: { fullName: 'Gita', email: 'gita@gamma.test' },
          subscription: {
            planCode: 'GROWTH',
            billingCycle: 'MONTHLY',
            recurringAmount: '1',
          },
        }),
      ).expect(201);
      expect(res.body.data.startDate).toBe(todayIST());
      expect(res.body.data.endDate).toBe(periodEnd(todayIST(), 1));
    });

    it('a platform admin cannot be made a tenant admin', async () => {
      await post(
        '/super/organizations',
        onboardBody({
          slug: 'delta-co',
          gstin: gstin('19PQRST3456U1Z'),
          phone: undefined,
          adminUser: { fullName: 'Root', email: 'root@platform.test' },
        }),
      ).expect(400);
      expect(await orgs.countDocuments({ slug: 'delta-co' })).toBe(0);
    });
  });
});
