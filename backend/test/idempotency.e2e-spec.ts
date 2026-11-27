/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest response bodies are untyped */
import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/app.setup';
import { CommonModule } from '../src/common/common.module';
import { AppError } from '../src/common/errors/app-error';
import {
  IdempotencyKey,
  IdempotencyStatus,
} from '../src/common/idempotency/idempotency-key.schema';
import { Idempotent } from '../src/common/idempotency/idempotency.interceptor';
import { dropTestDb, testDbConfig } from './helpers/test-db';

/** Stand-in for checkout / record-payment: counts how many times the real work ran. */
@Controller('pay')
class PayController {
  static runs = 0;
  static failuresLeft = 0;

  @Idempotent()
  @Post()
  async pay(@Body() body: { amount: number }) {
    PayController.runs++;
    await new Promise((r) => setTimeout(r, 150)); // slow enough for parallel requests to overlap
    if (PayController.failuresLeft-- > 0)
      throw new AppError('INSUFFICIENT_STOCK', 'Out of stock');
    return { paid: body.amount, run: PayController.runs };
  }
}

describe('Idempotency-Key (real MongoDB)', () => {
  const cfg = testDbConfig();
  let app: INestApplication<App>;
  let keys: Model<IdempotencyKey>;
  const org = new Types.ObjectId().toString();
  const userA = new Types.ObjectId().toString();
  const userB = new Types.ObjectId().toString();

  const pay = (
    key: string | undefined,
    body: object = { amount: 100 },
    user = userA,
  ) => {
    const req = request(app.getHttpServer())
      .post('/api/v1/pay')
      .set('x-user', user)
      .send(body);
    return key ? req.set('Idempotency-Key', key) : req;
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(cfg.uri, { dbName: cfg.dbName }),
        CommonModule,
      ],
      controllers: [PayController],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    // Stand-in for the login guard: take the caller from a header.
    app.use(
      (
        req: Request & { user?: unknown },
        _res: Response,
        next: NextFunction,
      ) => {
        const id = req.header('x-user');
        if (id)
          req.user = {
            userId: id,
            sessionId: 's',
            role: 'ORG_ADMIN',
            organizationId: org,
          };
        next();
      },
    );
    await app.init();
    keys = app.get(getModelToken(IdempotencyKey.name));
    await keys.syncIndexes();
  });

  beforeEach(() => {
    PayController.runs = 0;
    PayController.failuresLeft = 0;
  });

  afterAll(async () => {
    await app.close();
    await dropTestDb(cfg);
  });

  it('requires an Idempotency-Key in the right format', async () => {
    await pay(undefined).expect(400);
    await pay('has spaces!').expect(400);
    await pay('x'.repeat(65)).expect(400);
    expect(PayController.runs).toBe(0);
  });

  it('a retry with the same key and body does the work once and returns the same answer', async () => {
    const first = await pay('retry-1').expect(201);
    const again = await pay('retry-1').expect(201);
    expect(PayController.runs).toBe(1);
    expect(again.body).toEqual(first.body);
    expect(first.body.data.paid).toBe(100);
  });

  it('body key order does not matter, but a different body with the same key is refused', async () => {
    await pay('order-1', { amount: 5, note: 'x' }).expect(201);
    await pay('order-1', { note: 'x', amount: 5 }).expect(201); // same content: replayed
    expect(PayController.runs).toBe(1);
    const clash = await pay('order-1', { amount: 6 }).expect(400);
    expect(clash.body.error.message).toMatch(/different request/);
    expect(PayController.runs).toBe(1);
  });

  it('keys are per user: the same key from another user is a separate request', async () => {
    await pay('shared', { amount: 1 }, userA).expect(201);
    await pay('shared', { amount: 1 }, userB).expect(201);
    expect(PayController.runs).toBe(2);
  });

  it('5 identical requests at the same moment run the work once', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => pay('parallel-1')),
    );
    expect(PayController.runs).toBe(1);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toContain(201); // the one that ran (late arrivals may also get the stored 201)
    // the others were told to retry (409) or, if they arrived late, got the stored answer (201)
    expect(codes.every((c) => c === 201 || c === 409)).toBe(true);
    // after it finished, a retry returns the stored result
    const later = await pay('parallel-1').expect(201);
    expect(later.body.data.paid).toBe(100);
    expect(PayController.runs).toBe(1);
  });

  it('a failed request frees the key so the retry can succeed', async () => {
    PayController.failuresLeft = 1;
    const failed = await pay('fail-1').expect(409);
    expect(failed.body.error.code).toBe('INSUFFICIENT_STOCK');
    await pay('fail-1').expect(201);
    expect(PayController.runs).toBe(2);
  });

  it('an abandoned in-progress request (server crashed) can be taken over after its lock expires', async () => {
    await pay('crash-1').expect(201);
    await keys.collection.updateOne(
      { key: 'crash-1' },
      {
        $set: {
          status: IdempotencyStatus.IN_PROGRESS,
          lockedUntil: new Date(Date.now() - 1000),
        },
      },
    );
    await pay('crash-1').expect(201);
    expect(PayController.runs).toBe(2);
  });

  it('while a request is genuinely in progress, a retry is told to wait', async () => {
    await pay('busy-1').expect(201);
    await keys.collection.updateOne(
      { key: 'busy-1' },
      {
        $set: {
          status: IdempotencyStatus.IN_PROGRESS,
          lockedUntil: new Date(Date.now() + 30_000),
        },
      },
    );
    const busy = await pay('busy-1').expect(409);
    expect(busy.body.error.code).toBe('DUPLICATE');
  });
});
