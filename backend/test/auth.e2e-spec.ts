/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest response bodies are untyped */
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService } from '../src/common/mail/mail.service';
import { Role } from '../src/common/rbac/roles';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthTokenType } from '../src/modules/auth/schemas/auth-token.schema';
import { AuditLog } from '../src/common/audit/audit-log.schema';
import { Session } from '../src/modules/auth/schemas/session.schema';
import {
  User,
  UserDocument,
  UserStatus,
} from '../src/modules/auth/schemas/user.schema';
import { OrgUser } from '../src/modules/organization/schemas/org-user.schema';
import { Organization } from '../src/modules/organization/schemas/organization.schema';
import { dropTestDb, testDbConfig } from './helpers/test-db';

const PASSWORD = 'correct-horse-battery';
const refreshCookie = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith('refresh_token='))
    ?.split(';')[0];

describe('Auth (e2e)', () => {
  const db = testDbConfig();
  let app: INestApplication<App>;
  let sent: { to: string; text: string }[];
  let users: Model<User>;
  let sessions: Model<Session>;
  let audits: Model<AuditLog>;
  let auth: AuthService;
  let user: UserDocument;

  const lastToken = () => /token=([\w-]+)/.exec(sent[sent.length - 1].text)![1];
  const login = (email = 'owner@acme.test', password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });

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
    await users.syncIndexes(); // make sure the unique indexes exist before the tests run
    sessions = app.get(getModelToken(Session.name));
    audits = app.get(getModelToken(AuditLog.name));
    auth = app.get(AuthService);
    const org = await app
      .get<Model<Organization>>(getModelToken(Organization.name))
      .create({
        slug: 'acme',
        legalName: 'Acme Traders',
      });
    user = await users.create({
      email: 'owner@acme.test',
      phone: '+91 98765 43210', // stored as +919876543210
      fullName: 'Acme Owner',
      status: UserStatus.INVITED,
    });
    await app.get<Model<OrgUser>>(getModelToken(OrgUser.name)).create({
      organizationId: org._id,
      userId: user._id,
      role: Role.ORG_ADMIN,
    });
  });

  afterAll(async () => {
    await app.close();
    await dropTestDb(db);
  });

  it('cannot log in before the invite is accepted', async () => {
    await login().expect(401);
  });

  it('invite link sets the password once, then the link is dead', async () => {
    await auth.sendLink(user, AuthTokenType.SET_PASSWORD);
    const token = lastToken();
    const http = request(app.getHttpServer());
    await http
      .post('/api/v1/auth/set-password')
      .send({ token, password: 'short' })
      .expect(400);
    await http
      .post('/api/v1/auth/set-password')
      .send({ token, password: PASSWORD })
      .expect(200);
    await http
      .post('/api/v1/auth/set-password')
      .send({ token, password: PASSWORD })
      .expect(400);
  });

  it('rejects wrong password and unknown e-mail with the same message', async () => {
    const wrong = await login('owner@acme.test', 'wrong-password-123').expect(
      401,
    );
    const unknown = await login(
      'nobody@acme.test',
      'wrong-password-123',
    ).expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('logs in, calls /me without leaking secrets, and needs a token for it', async () => {
    const res = await login().expect(200);
    expect(res.body.data).toMatchObject({
      role: 'ORG_ADMIN',
      user: { email: 'owner@acme.test' },
    });
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(refreshCookie(res)).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data).toMatchObject({
      email: 'owner@acme.test',
      role: 'ORG_ADMIN',
    });
    expect(me.body.data.organization).toMatchObject({ slug: 'acme' });
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
  });

  it('rotates the refresh token; replaying an old one later revokes the session', async () => {
    const first = await login().expect(200);
    const oldCookie = refreshCookie(first)!;

    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(200);
    const newCookie = refreshCookie(second)!;
    expect(newCookie).not.toBe(oldCookie);

    // Immediate replay is treated as a double submit: refused, but the session survives.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', newCookie)
      .expect(200);

    // Replay after the grace window = theft: the whole session is revoked.
    await sessions.collection.updateMany(
      {},
      { $set: { updatedAt: new Date(Date.now() - 60_000) } },
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', newCookie)
      .expect(401);
  });

  it('logout revokes the session so its access token stops working', async () => {
    const res = await login().expect(200);
    const token = res.body.data.accessToken as string;
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', refreshCookie(res)!)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('forgot-password does not reveal whether an e-mail exists; reset works once', async () => {
    const http = request(app.getHttpServer());
    const before = sent.length;
    const known = await http
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'owner@acme.test' })
      .expect(200);
    const unknown = await http
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ghost@acme.test' })
      .expect(200);
    expect(known.body).toEqual(unknown.body);
    expect(sent.length).toBe(before + 1); // only the real account got a mail

    const token = lastToken();
    await http
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'a-brand-new-password' })
      .expect(200);
    await http
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'another-new-password' })
      .expect(400);
    await login('owner@acme.test', PASSWORD).expect(401);
    await login('owner@acme.test', 'a-brand-new-password').expect(200);
  });

  it('change-password needs the current password and ends other sessions', async () => {
    const a = await login('owner@acme.test', 'a-brand-new-password').expect(
      200,
    );
    const b = await login('owner@acme.test', 'a-brand-new-password').expect(
      200,
    );
    const tokenA = a.body.data.accessToken as string;
    const tokenB = b.body.data.accessToken as string;

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        currentPassword: 'not-my-password',
        newPassword: 'yet-another-password',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        currentPassword: 'a-brand-new-password',
        newPassword: 'yet-another-password',
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(401);
  });

  it('stores the mobile number in one canonical form', async () => {
    expect((await users.findById(user._id).lean())?.phone).toBe(
      '+919876543210',
    );
  });

  it('a mobile number is not a login', async () => {
    for (const phone of ['9876543210', '+91 98765 43210'])
      await login(phone, 'yet-another-password').expect(401);
    await login('owner@acme.test', 'yet-another-password').expect(200);
    await login('OWNER@Acme.test ', 'yet-another-password').expect(200); // case and spaces do not matter
  });

  it('a wrong password or an unknown / malformed login look identical (no account probing)', async () => {
    const real = await login('owner@acme.test', 'wrong-password-123').expect(
      401,
    );
    const unknownPhone = await login('9123456789', 'wrong-password-123').expect(
      401,
    );
    const malformed = await login('not a login', 'wrong-password-123').expect(
      401,
    );
    expect(real.body.error.message).toBe(unknownPhone.body.error.message);
    expect(real.body.error.message).toBe(malformed.body.error.message);
  });

  it('forgot-password works by e-mail only: a mobile number gets the same answer and no mail', async () => {
    const before = sent.length;
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: '+91 98765 43210' })
      .expect(200);
    expect(sent).toHaveLength(before);
  });

  it('profile: the optional phone is normalised and validated, and need not be unique', async () => {
    const token = (
      await login('owner@acme.test', 'yet-another-password').expect(200)
    ).body.data.accessToken as string;
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    await patch({ phone: '097000 00001' })
      .expect(200)
      .then((r) => expect(r.body.data.phone).toBe('+919700000001'));
    await patch({ phone: '12345' }).expect(400);

    // a contact number is not a login, so two accounts may carry the same one
    await users.create({
      email: 'other@acme.test',
      fullName: 'Other',
      phone: '9700000001',
    });
    await patch({ phone: '097000 00001' }).expect(200);
  });

  it('records login and password events in the audit trail without any secret', async () => {
    const actions = (await audits.find().lean()).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'LOGIN',
        'PASSWORD_SET',
        'PASSWORD_RESET',
        'PASSWORD_CHANGED',
      ]),
    );
    const login = await audits.findOne({ action: 'LOGIN' }).lean();
    expect(login).toMatchObject({ entityType: 'User', actorRole: 'ORG_ADMIN' });
    expect(login?.organizationId).toBeDefined();
    expect(JSON.stringify(await audits.find().lean())).not.toMatch(
      /passwordw*\s*:s*[^[]|refresh|token/i,
    );
  });

  it('unknown body fields are rejected (whitelist)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'owner@acme.test',
        password: 'x',
        isPlatformAdmin: true,
      })
      .expect(400);
  });

  it('rate-limits login attempts (429 after 10 a minute)', async () => {
    process.env.DISABLE_THROTTLE = '';
    const codes: number[] = [];
    for (let i = 0; i < 12; i++)
      codes.push((await login('owner@acme.test', 'nope-nope-nope')).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    process.env.DISABLE_THROTTLE = '1';
  });
});
