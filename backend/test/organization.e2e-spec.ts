/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- supertest response bodies are untyped */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuditLog } from '../src/common/audit/audit-log.schema';
import { MailService } from '../src/common/mail/mail.service';
import { Role } from '../src/common/rbac/roles';
import { isGstin } from '../src/common/validation/validators';
import { AuthService } from '../src/modules/auth/auth.service';
import { User, UserStatus } from '../src/modules/auth/schemas/user.schema';
import { OrgUser } from '../src/modules/organization/schemas/org-user.schema';
import { dropTestDb, testDbConfig } from './helpers/test-db';

const PASSWORD = 'correct-horse-battery';
const gstin2 =
  '29ABCDE1234F1Z' +
  [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((c) =>
    isGstin('29ABCDE1234F1Z' + c),
  )!;

// P2-BE-02: own organization profile, branding, bank details, settings, public tenant config.
describe('Organization profile, branding and settings (real MongoDB)', () => {
  const db = testDbConfig();
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());
  const login = (identifier: string) =>
    http()
      .post('/api/v1/auth/login')
      .send({ email: identifier, password: PASSWORD });

  it('applies section rights, validation, audit and tenant isolation', async () => {
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
      const orgUsers = app.get<Model<OrgUser>>(getModelToken(OrgUser.name));
      const audits = app.get<Model<AuditLog>>(getModelToken(AuditLog.name));
      await users.syncIndexes();
      const hash = await app.get(AuthService).hashPassword(PASSWORD);
      await users.create({
        email: 'root@platform.test',
        fullName: 'Root',
        passwordHash: hash,
        isPlatformAdmin: true,
        status: UserStatus.ACTIVE,
      });
      const sa = (await login('root@platform.test').expect(200)).body.data
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

      const onboard = async (slug: string, gstin: string, email: string) => {
        const org = (
          await http()
            .post('/api/v1/super/organizations')
            .set('Authorization', `Bearer ${sa}`)
            .send({
              slug,
              legalName: `${slug} Pvt Ltd`,
              gstin,
              address: {
                line1: '1 Test Road',
                city: 'Pune',
                state: 'Maharashtra',
                pincode: '411001',
              },
              invoicePrefix: slug.slice(0, 3).toUpperCase(),
              subscription: {
                planCode: 'GROWTH',
                billingCycle: 'MONTHLY',
                recurringAmount: '5000',
              },
              adminUser: { fullName: `${slug} Admin`, email },
            })
            .expect(201)
        ).body.data as { organizationId: string; adminInviteLink: string };
        await http()
          .post('/api/v1/auth/set-password')
          .send({
            token: /token=([\w-]+)/.exec(org.adminInviteLink)![1],
            password: PASSWORD,
          })
          .expect(200);
        return org.organizationId;
      };
      const orgA = await onboard(
        'alpha-co',
        '27AAPFU0939F1ZV',
        'admin@alpha.test',
      );
      await onboard('beta-co', gstin2, 'admin@beta.test');

      const staff = async (email: string, role: Role) => {
        const u = await users.create({
          email,
          fullName: email,
          passwordHash: hash,
          status: UserStatus.ACTIVE,
        });
        await orgUsers.create({
          organizationId: new Types.ObjectId(orgA),
          userId: u._id,
          role,
        });
      };
      await staff('im@alpha.test', Role.INVENTORY_MANAGER);
      await staff('sm@alpha.test', Role.SALES_MANAGER);
      await staff('fm@alpha.test', Role.FINANCE_MANAGER);

      const as = async (email: string) => {
        const t = (await login(email).expect(200)).body.data
          .accessToken as string;
        return (r: request.Test) => r.set('Authorization', `Bearer ${t}`);
      };
      const [oa, im, sm, fm, oaB] = await Promise.all([
        as('admin@alpha.test'),
        as('im@alpha.test'),
        as('sm@alpha.test'),
        as('fm@alpha.test'),
        as('admin@beta.test'),
      ]);

      // profile: everyone reads their own organization; bank details only for OA and FM
      const profile = (await oa(http().get('/api/v1/organization')).expect(200))
        .body.data;
      expect(profile).toMatchObject({
        slug: 'alpha-co',
        gstin: '27AAPFU0939F1ZV',
        stateCode: '27',
      });
      expect(profile.bankDetails).toBeNull();
      expect(
        (await im(http().get('/api/v1/organization')).expect(200)).body.data,
      ).not.toHaveProperty('bankDetails');
      await http().get('/api/v1/organization').expect(401);

      // contact (TEN-03): OA only; unknown or identity fields are refused
      await oa(http().patch('/api/v1/organization/contact'))
        .send({
          tradeName: 'Alpha Traders',
          phone: '9876543210',
          email: 'Sales@Alpha.test',
        })
        .expect(200);
      const edited = (await oa(http().get('/api/v1/organization')).expect(200))
        .body.data;
      expect(edited).toMatchObject({
        tradeName: 'Alpha Traders',
        phone: '+919876543210',
        email: 'sales@alpha.test',
      });
      await im(http().patch('/api/v1/organization/contact'))
        .send({ tradeName: 'X' })
        .expect(403);
      await oa(http().patch('/api/v1/organization/contact'))
        .send({ gstin: gstin2 })
        .expect(400);
      await oa(http().patch('/api/v1/organization/contact'))
        .send({ organizationId: orgA })
        .expect(400);
      await oa(http().patch('/api/v1/organization/contact'))
        .send({})
        .expect(400);

      // branding (TEN-04): hex only, and the primary colour must be readable against white
      await oa(http().patch('/api/v1/organization/branding'))
        .send({
          displayName: 'Alpha Shop',
          primaryColor: '#003A3E',
          accentColor: '#E8A33D',
        })
        .expect(200);
      await oa(http().patch('/api/v1/organization/branding'))
        .send({ primaryColor: 'teal' })
        .expect(400);
      const light = await oa(http().patch('/api/v1/organization/branding'))
        .send({ primaryColor: '#F5F5F5' })
        .expect(400);
      expect(light.body.error.message).toMatch(/too light/);
      await sm(http().patch('/api/v1/organization/branding'))
        .send({ displayName: 'Nope' })
        .expect(403);
      // a partial patch keeps the other colours
      await oa(http().patch('/api/v1/organization/branding'))
        .send({ secondaryColor: '#112233' })
        .expect(200);
      expect(
        (await oa(http().get('/api/v1/organization')).expect(200)).body.data
          .branding,
      ).toMatchObject({
        displayName: 'Alpha Shop',
        primaryColor: '#003A3E',
        secondaryColor: '#112233',
      });

      // bank (TEN-09): OA and FM; IM and SM refused; the account number comes back masked
      const bank = {
        accountName: 'Alpha Traders',
        accountNumber: '123456789012',
        ifsc: 'hdfc0001234',
        bankName: 'HDFC Bank',
      };
      await fm(http().patch('/api/v1/organization/bank'))
        .send(bank)
        .expect(200);
      await im(http().patch('/api/v1/organization/bank'))
        .send(bank)
        .expect(403);
      await sm(http().patch('/api/v1/organization/bank'))
        .send(bank)
        .expect(403);
      await oa(http().patch('/api/v1/organization/bank'))
        .send({ ...bank, ifsc: 'BAD' })
        .expect(400);
      const seen = (await fm(http().get('/api/v1/organization')).expect(200))
        .body.data.bankDetails;
      expect(seen).toMatchObject({
        ifsc: 'HDFC0001234',
        accountNumber: 'XXXXXXXX9012',
      });
      const log = await audits
        .findOne({ action: 'organization.bank.updated' })
        .lean();
      expect(JSON.stringify(log)).not.toContain('123456789012');

      // settings: view (TEN-06) for OA / IM / SM / FM, sections edited by their own permission
      const settings = (
        await sm(http().get('/api/v1/organization/settings')).expect(200)
      ).body.data;
      expect(settings.credit.overdueBlockDays).toBe(45);
      expect(settings.commercial.stockVisibility).toBe('EXACT');
      await oa(http().patch('/api/v1/organization/settings/commercial'))
        .send({ minOrderValue: '2500.50', stockVisibility: 'BANDED' })
        .expect(200);
      await im(http().patch('/api/v1/organization/settings/commercial'))
        .send({ minOrderValue: '1' })
        .expect(403);
      await oa(http().patch('/api/v1/organization/settings/commercial'))
        .send({ minOrderValue: 2500 })
        .expect(400);
      await oa(http().patch('/api/v1/organization/settings/commercial'))
        .send({ stockVisibility: 'ALL' })
        .expect(400);
      await fm(http().patch('/api/v1/organization/settings/credit'))
        .send({ overdueBlockDays: 30 })
        .expect(200);
      await sm(http().patch('/api/v1/organization/settings/credit'))
        .send({ overdueBlockDays: 30 })
        .expect(403);
      await fm(http().patch('/api/v1/organization/settings/invoice'))
        .send({ roundOff: false })
        .expect(200);
      await im(http().patch('/api/v1/organization/settings/stock'))
        .send({ lowStockRoles: ['ORG_ADMIN', 'INVENTORY_MANAGER'] })
        .expect(200);
      await fm(http().patch('/api/v1/organization/settings/stock'))
        .send({ lowStockRoles: ['ORG_ADMIN'] })
        .expect(403);
      await oa(http().patch('/api/v1/organization/settings/stock'))
        .send({ lowStockRoles: ['BUYER_USER'] })
        .expect(400);
      const after = (
        await oa(http().get('/api/v1/organization/settings')).expect(200)
      ).body.data;
      expect(after).toMatchObject({
        commercial: {
          minOrderValue: '2500.50',
          stockVisibility: 'BANDED',
          autoAckHours: 72,
        },
        credit: { overdueBlockDays: 30 },
        invoice: { roundOff: false, creditNoteApprovalValue: '25000' },
        stock: { lowStockRoles: ['ORG_ADMIN', 'INVENTORY_MANAGER'] },
      });
      expect(
        await audits.countDocuments({ action: /^organization\.settings\./ }),
      ).toBe(4);

      // public tenant config: branding only, no login, nothing private
      const pub = (
        await http().get('/api/v1/public/tenant-config/Alpha-Co').expect(200)
      ).body.data;
      expect(pub).toEqual({
        slug: 'alpha-co',
        name: 'Alpha Shop',
        primaryColor: '#003A3E',
        secondaryColor: '#112233',
        accentColor: '#E8A33D',
      });
      await http().get('/api/v1/public/tenant-config/nobody').expect(404);

      // isolation: org B sees and changes only its own data
      const b = (await oaB(http().get('/api/v1/organization')).expect(200)).body
        .data;
      expect(b).toMatchObject({
        slug: 'beta-co',
        tradeName: null,
        branding: {},
        bankDetails: null,
      });
      await oaB(http().patch('/api/v1/organization/branding'))
        .send({ displayName: 'Beta Shop' })
        .expect(200);
      expect(
        (await oaB(http().get('/api/v1/organization/settings')).expect(200))
          .body.data.credit.overdueBlockDays,
      ).toBe(45);
      expect(
        (await oa(http().get('/api/v1/organization')).expect(200)).body.data
          .branding.displayName,
      ).toBe('Alpha Shop');
      // a Super Admin has no organization of their own
      await http()
        .get('/api/v1/organization')
        .set('Authorization', `Bearer ${sa}`)
        .expect(403);
    } finally {
      await app.close();
      await dropTestDb(db);
    }
  });
});
