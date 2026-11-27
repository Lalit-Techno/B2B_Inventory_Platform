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
import { addDays, addMonths, periodEnd } from '../src/common/dates/calendar';
import { financialYear, todayIST } from '../src/common/dates/ist';
import { MailService } from '../src/common/mail/mail.service';
import { isGstin } from '../src/common/validation/validators';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserStatus } from '../src/modules/auth/schemas/user.schema';
import { Organization } from '../src/modules/organization/schemas/organization.schema';
import { SaasSubscription } from '../src/modules/platform/schemas/saas-subscription.schema';
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
];
const today = todayIST();
const fy = financialYear(today);

describe('Platform billing and organizations (real MongoDB)', () => {
  const db = testDbConfig();
  let app: INestApplication<App>;
  let sent: { to: string; text: string }[];
  let sa: string;
  let users: Model<User>;
  let orgs: Model<Organization>;
  let subs: Model<SaasSubscription>;
  let audits: Model<AuditLog>;
  let auth: AuthService;
  let keyCounter = 0;
  let refCounter = 0;

  const http = () => request(app.getHttpServer());
  const asSA = (r: request.Test) => r.set('Authorization', `Bearer ${sa}`);
  const post = (path: string, body: object = {}) =>
    asSA(http().post(`/api/v1${path}`).send(body));
  const get = (path: string) => asSA(http().get(`/api/v1${path}`));
  const login = (identifier: string, organizationId?: string) =>
    http()
      .post('/api/v1/auth/login')
      .send({ email: identifier, password: PASSWORD, organizationId });

  const PAY = {
    taxableAmount: '5000.00',
    gstAmount: '900.00',
    amount: '5900.00',
    paymentMode: 'BANK_TRANSFER',
  };
  const pay = (
    subId: string,
    over: Record<string, unknown> = {},
    key = `key-${++keyCounter}`,
  ) =>
    post(`/super/subscriptions/${subId}/record-payment`, {
      ...PAY,
      transactionReference: `REF-${++refCounter}`,
      ...over,
    }).set('Idempotency-Key', key);
  const reverse = (id: string, reason = 'Entered against the wrong tenant') =>
    post(`/super/subscription-transactions/${id}/reverse`, { reason });
  const ledger = (query = '') =>
    get(`/super/subscription-transactions${query}`);

  const onboard = async (n: number, start: string, cycle = 'MONTHLY') => {
    const res = await post('/super/organizations', {
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
        recurringAmount: '5000',
        startDate: start,
      },
      adminUser: { fullName: `Admin ${n}`, email: `admin${n}@org.test` },
    }).expect(201);
    return res.body.data as {
      organizationId: string;
      subscriptionId: string;
      endDate: string;
      adminInviteLink: string;
    };
  };
  const sub = async (orgId: string) =>
    (await subs.findOne({ organizationId: orgId }).lean())!;

  // orgs: A on time, B long expired, C in grace, D for suspend tests, E for the invite test
  let A: Awaited<ReturnType<typeof onboard>>;
  let B: Awaited<ReturnType<typeof onboard>>;
  let C: Awaited<ReturnType<typeof onboard>>;
  let D: Awaited<ReturnType<typeof onboard>>;
  let E: Awaited<ReturnType<typeof onboard>>;

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

    users = app.get(getModelToken(User.name));
    orgs = app.get(getModelToken(Organization.name));
    subs = app.get(getModelToken(SaasSubscription.name));
    audits = app.get(getModelToken(AuditLog.name));
    auth = app.get(AuthService);
    await Promise.all([
      users.syncIndexes(),
      orgs.syncIndexes(),
      subs.syncIndexes(),
    ]);
    await app
      .get<Model<unknown>>(getModelToken('SaasTransaction'))
      .syncIndexes();

    await users.create({
      email: 'root@platform.test',
      fullName: 'Root',
      passwordHash: await auth.hashPassword(PASSWORD),
      isPlatformAdmin: true,
      status: UserStatus.ACTIVE,
    });
    sa = (await login('root@platform.test').expect(200)).body.data
      .accessToken as string;

    await post('/super/plans', {
      code: 'GROWTH',
      name: 'Growth',
      monthlyPrice: '5000',
      yearlyPrice: '50000',
    }).expect(201); // 18% GST, 7 grace days
    A = await onboard(0, addDays(today, -10)); // paid until about 20 days from now
    B = await onboard(1, addMonths(today, -6)); // long expired
    C = await onboard(2, addDays(addMonths(today, -1), -2)); // ended 1-4 days ago: in grace
    D = await onboard(3, addDays(today, -5));
    E = await onboard(4, today);
  });

  afterAll(async () => {
    await app.close();
    await dropTestDb(db);
  });

  // ------------------------------------------------------------------ onboarding status
  it('onboarding sets the status from the dates (a past start can already be in grace or expired)', async () => {
    expect((await sub(A.organizationId)).status).toBe('ACTIVE');
    expect((await sub(B.organizationId)).status).toBe('EXPIRED');
    expect((await sub(C.organizationId)).status).toBe('GRACE_PERIOD');
  });

  // ------------------------------------------------------------------ record payment
  describe('record payment (PLT-08)', () => {
    let first: { id: string; transactionNumber: string };
    let adminToken: string;

    it('needs the Super Admin role and an Idempotency-Key', async () => {
      await http()
        .post(`/api/v1/super/subscriptions/${A.subscriptionId}/record-payment`)
        .send(PAY)
        .expect(401);
      await post(`/super/subscriptions/${A.subscriptionId}/record-payment`, {
        ...PAY,
        transactionReference: 'REF-X1',
      }).expect(400); // no key

      await http()
        .post('/api/v1/auth/set-password')
        .send({
          token: /token=([\w-]+)/.exec(A.adminInviteLink)![1],
          password: PASSWORD,
        })
        .expect(200);
      adminToken = (await login('admin0@org.test').expect(200)).body.data
        .accessToken as string;
      await http()
        .post(`/api/v1/super/subscriptions/${A.subscriptionId}/record-payment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', 'tenant-try')
        .send({ ...PAY, transactionReference: 'REF-X2' })
        .expect(403);
    });

    it('a payment before the end extends from the old end: no lost days, ACTIVE, gapless number', async () => {
      const before = await sub(A.organizationId);
      const res = await pay(A.subscriptionId, {
        transactionReference: 'ref-a1',
        notes: '=HYPERLINK("http://x")',
      }).expect(200);
      first = res.body.data;
      expect(res.body.data).toMatchObject({
        previousEndDate: before.endDate,
        periodStart: addDays(before.endDate, 1),
        newEndDate: periodEnd(addDays(before.endDate, 1), 1),
        status: 'ACTIVE',
        transactionNumber: `SAAS-${fy}-0001`,
      });
      expect((await sub(A.organizationId)).endDate).toBe(
        res.body.data.newEndDate,
      );

      const row = (await ledger().expect(200)).body.data[0];
      expect(row).toMatchObject({
        number: `SAAS-${fy}-0001`,
        entryType: 'PAYMENT',
        reference: 'REF-A1', // stored upper-case
        taxableAmount: '5000.00',
        gstAmount: '900.00',
        amount: '5900.00',
        tdsAmount: '0.00',
        mode: 'BANK_TRANSFER',
        paymentDate: today,
        previousEndDate: before.endDate,
        reversedByNumber: null,
      });
      expect(row.organization).toMatchObject({ slug: 'org-0' });
    });

    it('a retry with the same Idempotency-Key repeats the answer and records nothing twice', async () => {
      const before = await sub(B.organizationId);
      const a = await pay(
        B.subscriptionId,
        { transactionReference: 'REF-RETRY' },
        'retry-key',
      ).expect(200);
      const b = await pay(
        B.subscriptionId,
        { transactionReference: 'REF-RETRY' },
        'retry-key',
      ).expect(200);
      expect(b.body).toEqual(a.body);
      expect(
        (await ledger(`?organizationId=${B.organizationId}`)).body.data,
      ).toHaveLength(1);
      const after = await sub(B.organizationId);
      expect(after.endDate).not.toBe(before.endDate);
      // same key, different body
      await pay(
        B.subscriptionId,
        {
          transactionReference: 'REF-RETRY',
          amount: '5900.00',
          taxableAmount: '1000.00',
          gstAmount: '180.00',
        },
        'retry-key',
      ).expect(400);
    });

    it('rejects inconsistent or invalid payments and changes nothing', async () => {
      const before = (await sub(A.organizationId)).endDate;
      const count = (await ledger('?limit=100')).body.data.length;
      const bad = (over: Record<string, unknown>) =>
        pay(A.subscriptionId, over).expect(400);
      const wrongTotal = await bad({ amount: '5901.00' });
      expect(wrongTotal.body.error.message).toMatch(
        /taxableAmount \+ gstAmount/,
      );
      const wrongGst = await bad({ gstAmount: '800.00', amount: '5800.00' });
      expect(wrongGst.body.error.message).toMatch(/900\.00 \(18\.00%/);
      await bad({ tdsAmount: '5000.01' });
      await bad({ paymentDate: addDays(today, 1) });
      await bad({ transactionReference: undefined }); // not cash: reference required
      await bad({ periods: 0 });
      await bad({ periods: 61 });
      await bad({ paymentMode: 'BITCOIN' });
      await bad({ amount: 5900 }); // a number, not a decimal string
      await bad({ taxableAmount: '5000.001' });
      await bad({ transactionReference: '=cmd|calc' });
      await bad({ unexpected: true });
      expect((await sub(A.organizationId)).endDate).toBe(before);
      expect((await ledger('?limit=100')).body.data).toHaveLength(
        count as number,
      );
    });

    it('the same mode + reference cannot be entered twice, and a failure leaves no gap in the numbers', async () => {
      await pay(A.subscriptionId, { transactionReference: 'REF-A1' }).expect(
        409,
      ); // same as the first payment above
      const next = await pay(A.subscriptionId, {
        transactionReference: 'REF-NEXT',
      }).expect(200);
      // numbers so far: 0001 (A), 0002 (B retry), then this one; the failed attempt consumed nothing
      expect(next.body.data.transactionNumber).toBe(`SAAS-${fy}-0003`);
    });

    it('paid after the grace period: the new period starts on the payment date', async () => {
      // B was paid above, so use a fresh long-expired org: E started today, make it old through the database
      await subs.updateOne(
        { organizationId: E.organizationId },
        { $set: { endDate: addDays(today, -30), status: 'EXPIRED' } },
      );
      const res = await pay(E.subscriptionId).expect(200);
      expect(res.body.data).toMatchObject({
        periodStart: today,
        newEndDate: periodEnd(today, 1),
        status: 'ACTIVE',
      });
    });

    it('paid inside the grace period: still extends from the old end', async () => {
      const before = await sub(C.organizationId);
      const res = await pay(C.subscriptionId).expect(200);
      expect(res.body.data.periodStart).toBe(addDays(before.endDate, 1));
      expect(res.body.data.newEndDate).toBe(
        periodEnd(addDays(before.endDate, 1), 1),
      );
    });

    it('several periods at once; CASH needs no reference and may repeat', async () => {
      const before = await sub(D.organizationId);
      const res = await pay(D.subscriptionId, {
        periods: 3,
        paymentMode: 'CASH',
        transactionReference: undefined,
      }).expect(200);
      expect(res.body.data.newEndDate).toBe(
        periodEnd(addDays(before.endDate, 1), 3),
      );
      await pay(D.subscriptionId, {
        paymentMode: 'CASH',
        transactionReference: undefined,
      }).expect(200); // no unique rule without a reference
    });

    it('records TDS and keeps the ledger values as decimal strings', async () => {
      await pay(A.subscriptionId, { tdsAmount: '500.00' }).expect(200);
      const row = (await ledger()).body.data[0];
      expect(row).toMatchObject({ tdsAmount: '500.00', amount: '5900.00' });
    });

    it('is audited with before and after', async () => {
      const row = await audits
        .findOne({ action: 'SAAS_PAYMENT_RECORDED', entityId: first.id })
        .lean();
      expect(row?.before).toMatchObject({ status: 'ACTIVE' });
      expect(row?.after).toMatchObject({
        number: first.transactionNumber,
        mode: 'BANK_TRANSFER',
        reference: 'REF-A1',
      });
      expect(row?.actorRole).toBe('SUPER_ADMIN');
    });
  });

  // ------------------------------------------------------------------ reversal
  describe('reverse (PLT-09)', () => {
    it('only the most recent payment can be reversed; the end date and status are restored', async () => {
      const entries = (await ledger(`?organizationId=${A.organizationId}`)).body
        .data as { id: string; previousEndDate: string; periodEnd: string }[];
      expect(entries.length).toBeGreaterThanOrEqual(3);
      const [latest, , oldest] = entries; // newest first
      await reverse(oldest.id).expect(409); // later payments exist

      const res = await reverse(latest.id).expect(200);
      expect(res.body.data).toMatchObject({
        restoredEndDate: latest.previousEndDate,
        reverses: expect.any(String),
      });
      expect((await sub(A.organizationId)).endDate).toBe(
        latest.previousEndDate,
      );
    });

    it('adds a negative REVERSAL row and leaves the original untouched', async () => {
      const rows = (await ledger(`?organizationId=${A.organizationId}`)).body
        .data as {
        id: string;
        number: string;
        entryType: string;
        amount: string;
        reversesNumber: string | null;
        reversedByNumber: string | null;
        reason: string | null;
      }[];
      const reversal = rows.find((r) => r.entryType === 'REVERSAL')!;
      expect(reversal).toMatchObject({
        amount: '-5900.00',
        reason: 'Entered against the wrong tenant',
      });
      const original = rows.find((r) => r.number === reversal.reversesNumber)!;
      expect(original).toMatchObject({
        entryType: 'PAYMENT',
        amount: '5900.00',
        reversedByNumber: reversal.number,
      });
    });

    it('cannot be reversed twice, a reversal cannot be reversed, and a reason is required', async () => {
      const rows = (await ledger(`?organizationId=${A.organizationId}`)).body
        .data as {
        id: string;
        entryType: string;
        reversedByNumber: string | null;
      }[];
      const reversed = rows.find(
        (r) => r.entryType === 'PAYMENT' && r.reversedByNumber,
      )!;
      await reverse(reversed.id).expect(409);
      await reverse(rows.find((r) => r.entryType === 'REVERSAL')!.id).expect(
        409,
      );
      const fresh = rows.find(
        (r) => r.entryType === 'PAYMENT' && !r.reversedByNumber,
      )!;
      await reverse(fresh.id, 'too short').expect(400);
      await post(
        `/super/subscription-transactions/${fresh.id}/reverse`,
        {},
      ).expect(400);
      await reverse('64b000000000000000000001').expect(404);
      await reverse('nope').expect(404);
    });

    it('reversing a payment that revived an expired tenant sends it back to EXPIRED', async () => {
      const latest = (await ledger(`?organizationId=${E.organizationId}`)).body
        .data[0] as { id: string };
      expect((await sub(E.organizationId)).status).toBe('ACTIVE');
      await reverse(latest.id).expect(200);
      expect((await sub(E.organizationId)).status).toBe('EXPIRED');
    });

    it('a reversed reference stays blocked: re-enter a corrected payment under a new reference', async () => {
      const rows = (
        await ledger(`?organizationId=${A.organizationId}&entryType=PAYMENT`)
      ).body.data as { reference: string; reversedByNumber: string | null }[];
      const reversed = rows.find((r) => r.reversedByNumber)!;
      await pay(A.subscriptionId, {
        transactionReference: reversed.reference,
      }).expect(409);
      await pay(A.subscriptionId, {
        transactionReference: `${reversed.reference}-FIX`,
      }).expect(200);
    });

    it('is audited', async () => {
      const row = await audits
        .findOne({ action: 'SAAS_PAYMENT_REVERSED' })
        .lean();
      expect(row?.after).toMatchObject({
        reason: 'Entered against the wrong tenant',
      });
    });
  });

  // ------------------------------------------------------------------ ledger list + export
  describe('ledger list and CSV (PLT-07)', () => {
    it('filters by organization, mode, type, dates and text', async () => {
      const total = (await ledger('?limit=100')).body.data as {
        organization: { slug: string };
        mode: string;
        entryType: string;
        number: string;
        reference: string;
      }[];
      expect(total.length).toBeGreaterThan(5);

      const orgOnly = (await ledger(`?organizationId=${D.organizationId}`)).body
        .data as { organization: { slug: string } }[];
      expect(orgOnly.length).toBeGreaterThan(0);
      expect(orgOnly.every((r) => r.organization.slug === 'org-3')).toBe(true);

      const cash = (await ledger('?mode=CASH')).body.data as { mode: string }[];
      expect(cash.length).toBe(2);
      expect(cash.every((r) => r.mode === 'CASH')).toBe(true);

      const reversals = (await ledger('?entryType=REVERSAL')).body.data as {
        entryType: string;
      }[];
      expect(reversals.length).toBe(2);
      expect(reversals.every((r) => r.entryType === 'REVERSAL')).toBe(true);

      expect(
        (await ledger(`?from=${addDays(today, 1)}`)).body.data,
      ).toHaveLength(0);
      expect(
        (await ledger(`?from=${today}&to=${today}&limit=100`)).body.data.length,
      ).toBe(total.length);

      const byNumber = (await ledger(`?q=${total[0].number.toLowerCase()}`))
        .body.data as { number: string }[];
      expect(byNumber.map((r) => r.number)).toContain(total[0].number);
      const byRef = (await ledger('?q=ref-retry')).body.data as {
        reference: string;
      }[];
      expect(byRef).toHaveLength(1);
      expect(byRef[0].reference).toBe('REF-RETRY');
    });

    it('pages with a cursor: every row once, newest first', async () => {
      const all = (await ledger('?limit=100')).body.data as { id: string }[];
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 20; page++) {
        const res: request.Response = await ledger(
          `?limit=3${cursor ? `&cursor=${cursor}` : ''}`,
        ).expect(200);
        expect(res.body.data.length).toBeLessThanOrEqual(3);
        seen.push(...(res.body.data as { id: string }[]).map((r) => r.id));
        cursor = res.body.meta.nextCursor as string | null;
        if (!cursor) break;
      }
      expect(seen).toEqual(all.map((r) => r.id));
    });

    it('rejects bad filters', async () => {
      await ledger('?limit=101').expect(400);
      await ledger('?limit=0').expect(400);
      await ledger('?cursor=abc').expect(400);
      await ledger('?mode=BITCOIN').expect(400);
      await ledger('?from=2026-02-30').expect(400);
      await ledger(`?from=${addDays(today, 1)}&to=${today}`).expect(400);
      await ledger('?q=a').expect(400);
      await ledger('?organizationId=xyz').expect(400);
    });

    it('exports the same rows as a CSV file, safe for spreadsheets, and audits the export', async () => {
      const res = await get('/super/subscription-transactions/export')
        .buffer(true)
        .expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="saas-ledger-\d{4}-\d{2}-\d{2}\.csv"/,
      );
      const text = res.text;
      expect(text.charCodeAt(0)).toBe(0xfeff);
      const lines = text.slice(1).trim().split('\r\n');
      const rowCount = (await ledger('?limit=100')).body.data.length as number;
      expect(lines.length).toBe(rowCount + 1); // header + rows
      expect(lines[0]).toMatch(
        /^Number,Type,Organization,GSTIN,Payment date,Mode,Reference/,
      );
      expect(text).toContain("'=HYPERLINK"); // the formula in the notes was neutralised
      expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
      expect(text).toMatch(/,-5900\.00,/); // negative amounts of reversals stay plain numbers
      expect(
        await audits.countDocuments({ action: 'SAAS_LEDGER_EXPORTED' }),
      ).toBe(1);

      const filtered = await get(
        '/super/subscription-transactions/export?mode=CASH',
      )
        .buffer(true)
        .expect(200);
      expect(filtered.text.slice(1).trim().split('\r\n')).toHaveLength(3);
    });

    it('a tenant admin cannot read the ledger or export it', async () => {
      const token = (await login('admin0@org.test').expect(200)).body.data
        .accessToken as string;
      for (const path of [
        '/super/subscription-transactions',
        '/super/subscription-transactions/export',
      ]) {
        await http()
          .get(`/api/v1${path}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
      await http()
        .post(
          '/api/v1/super/subscription-transactions/64b000000000000000000001/reverse',
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'trying it out here' })
        .expect(403);
    });
  });

  // ------------------------------------------------------------------ organizations
  describe('organizations (PLT-03, PLT-04)', () => {
    it('lists tenants newest first with plan and subscription, filtered and paged', async () => {
      const all = (await get('/super/organizations?limit=100').expect(200)).body
        .data as {
        slug: string;
        plan: { code: string };
        subscription: { status: string; recurringAmount: string };
      }[];
      expect(all.map((o) => o.slug)).toEqual([
        'org-4',
        'org-3',
        'org-2',
        'org-1',
        'org-0',
      ]);
      expect(all[0]).toMatchObject({
        plan: { code: 'GROWTH' },
        subscription: { recurringAmount: '5000.00' },
      });

      const bySlug = (await get('/super/organizations?q=ORG-2').expect(200))
        .body.data as { slug: string }[];
      expect(bySlug.map((o) => o.slug)).toEqual(['org-2']);
      const byGstin = (
        await get(
          `/super/organizations?q=${GSTINS[3].slice(0, 6).toLowerCase()}`,
        ).expect(200)
      ).body.data as { slug: string }[];
      expect(byGstin.map((o) => o.slug)).toEqual(['org-3']);
      expect(
        (await get('/super/organizations?q=(.*)+$').expect(200)).body.data,
      ).toHaveLength(0); // regex characters are plain text

      const expired = (
        await get('/super/organizations?subscriptionStatus=EXPIRED').expect(200)
      ).body.data as { slug: string }[];
      expect(expired.map((o) => o.slug)).toEqual(['org-4']); // E was reversed back to expired; B was paid
      await get('/super/organizations?status=BOGUS').expect(400);

      const page1 = (await get('/super/organizations?limit=2').expect(200))
        .body;
      expect(page1.data).toHaveLength(2);
      const page2 = (
        await get(
          `/super/organizations?limit=2&cursor=${page1.meta.nextCursor}`,
        ).expect(200)
      ).body;
      expect(
        [...page1.data, ...page2.data].map((o: { slug: string }) => o.slug),
      ).toEqual(['org-4', 'org-3', 'org-2', 'org-1']);
    });

    it('shows one tenant: profile, plan, subscription, admins, and no business or bank data', async () => {
      const d = (
        await get(`/super/organizations/${A.organizationId}`).expect(200)
      ).body.data;
      expect(d).toMatchObject({
        slug: 'org-0',
        stateCode: '27',
        pan: 'AAPFU0939F',
        invoicePrefix: 'O0',
        plan: { code: 'GROWTH' },
        subscription: { billingCycle: 'MONTHLY' },
        staffCount: 1,
      });
      expect(d.admins).toEqual([
        expect.objectContaining({ email: 'admin0@org.test', status: 'ACTIVE' }),
      ]);
      expect(Object.keys(d as object)).not.toEqual(
        expect.arrayContaining(['bankDetails', 'settings']),
      );
      await get('/super/organizations/64b000000000000000000001').expect(404);
      await get('/super/organizations/not-an-id').expect(404);
    });

    it('suspend needs a reason; it freezes organization and subscription together; staff can still sign in', async () => {
      await post(`/super/organizations/${D.organizationId}/suspend`, {
        reason: 'short',
      }).expect(400);
      const res = await post(
        `/super/organizations/${D.organizationId}/suspend`,
        { reason: 'Unpaid invoices, two reminders sent' },
      ).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'SUSPENDED',
        subscription: { status: 'SUSPENDED' },
      });
      await post(`/super/organizations/${D.organizationId}/suspend`, {
        reason: 'Suspending it once more',
      }).expect(409);

      const row = await audits
        .findOne({ action: 'ORGANIZATION_SUSPENDED' })
        .lean();
      expect(row?.before).toMatchObject({ status: 'ACTIVE' });
      expect(row?.after).toMatchObject({
        status: 'SUSPENDED',
        reason: 'Unpaid invoices, two reminders sent',
      });
      expect(String(row?.organizationId)).toBe(D.organizationId);
    });

    it('a payment on a suspended tenant extends the date but it stays suspended', async () => {
      const before = await sub(D.organizationId);
      const res = await pay(D.subscriptionId).expect(200);
      expect(res.body.data.status).toBe('SUSPENDED');
      expect((await sub(D.organizationId)).endDate).not.toBe(before.endDate);
    });

    it('reactivate lifts the suspension and recomputes the status from the dates', async () => {
      await post(`/super/organizations/${A.organizationId}/reactivate`, {
        reason: 'Not suspended at all',
      }).expect(409);
      const res = await post(
        `/super/organizations/${D.organizationId}/reactivate`,
        { reason: 'Payment received in full' },
      ).expect(200);
      expect(res.body.data).toMatchObject({
        status: 'ACTIVE',
        subscription: { status: 'ACTIVE' },
      }); // D was paid up for months

      // an expired tenant that was suspended returns as EXPIRED, not ACTIVE
      await post(`/super/organizations/${E.organizationId}/suspend`, {
        reason: 'Expired and not responding',
      }).expect(200);
      const back = await post(
        `/super/organizations/${E.organizationId}/reactivate`,
        { reason: 'Asked to reactivate' },
      ).expect(200);
      expect(back.body.data).toMatchObject({
        status: 'ACTIVE',
        subscription: { status: 'EXPIRED' },
      });
    });

    it('re-issues the set-password link for an admin who has not set a password yet', async () => {
      const mails = sent.length;
      const res = await post(
        `/super/organizations/${E.organizationId}/admin-invite`,
      ).expect(200);
      expect(res.body.data).toHaveLength(1);
      const [invite] = res.body.data as { email: string; link: string }[];
      expect(invite.email).toBe('admin4@org.test');
      expect(sent).toHaveLength(mails + 1);
      expect(sent[sent.length - 1].text).toContain(invite.link);

      // the link from onboarding no longer works, the new one does
      await http()
        .post('/api/v1/auth/set-password')
        .send({
          token: /token=([\w-]+)/.exec(E.adminInviteLink)![1],
          password: PASSWORD,
        })
        .expect(400);
      await http()
        .post('/api/v1/auth/set-password')
        .send({
          token: /token=([\w-]+)/.exec(invite.link)![1],
          password: PASSWORD,
        })
        .expect(200);

      // nobody is waiting any more
      await post(
        `/super/organizations/${E.organizationId}/admin-invite`,
      ).expect(409);
      const audit = await audits
        .findOne({ action: 'ADMIN_INVITE_REISSUED' })
        .lean();
      expect(JSON.stringify(audit)).not.toContain('token=');
    });

    it('a tenant admin cannot use any of these routes', async () => {
      const token = (await login('admin0@org.test').expect(200)).body.data
        .accessToken as string;
      const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
      await as(http().get('/api/v1/super/organizations')).expect(403);
      await as(
        http().get(`/api/v1/super/organizations/${A.organizationId}`),
      ).expect(403);
      await as(
        http()
          .post(`/api/v1/super/organizations/${A.organizationId}/suspend`)
          .send({ reason: 'I would like to' }),
      ).expect(403);
      await as(
        http().post(
          `/api/v1/super/organizations/${A.organizationId}/admin-invite`,
        ),
      ).expect(403);
    });
  });
});
