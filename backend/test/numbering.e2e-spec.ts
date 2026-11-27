import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import {
  DocumentSequence,
  DocumentSequenceSchema,
} from '../src/common/numbering/document-sequence.schema';
import { DocumentSequenceService } from '../src/common/numbering/document-sequence.service';
import { dropTestDb, testDbConfig } from './helpers/test-db';

/** Real MongoDB: the numbering guarantees (unique, gapless, rolled back with the transaction). */
describe('DocumentSequenceService (real MongoDB)', () => {
  const cfg = testDbConfig();
  let seq: DocumentSequenceService;
  let conn: Connection;
  let rows: Model<DocumentSequence>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(cfg.uri, { dbName: cfg.dbName }),
        MongooseModule.forFeature([
          { name: DocumentSequence.name, schema: DocumentSequenceSchema },
        ]),
      ],
      providers: [DocumentSequenceService],
    }).compile();
    await mod.init();
    seq = mod.get(DocumentSequenceService);
    conn = mod.get(getConnectionToken());
    rows = mod.get(getModelToken(DocumentSequence.name));
    await rows.syncIndexes();
  });

  afterAll(async () => {
    await conn.close();
    await dropTestDb(cfg);
  });

  it('50 parallel callers get 50 different numbers with no gap, even for a brand new counter', async () => {
    const org = new Types.ObjectId();
    const numbers = await Promise.all(
      Array.from({ length: 50 }, () => seq.next('invoice', '2026-27', org)),
    );
    expect([...numbers].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it('keeps separate counters per tenant, document type, year and the platform', async () => {
    const a = new Types.ObjectId();
    const b = new Types.ObjectId();
    expect(await seq.next('INVOICE', '2026-27', a)).toBe(1);
    expect(await seq.next('INVOICE', '2026-27', a)).toBe(2);
    expect(await seq.next('INVOICE', '2026-27', b)).toBe(1); // other tenant
    expect(await seq.next('RECEIPT', '2026-27', a)).toBe(1); // other type
    expect(await seq.next('INVOICE', '2027-28', a)).toBe(1); // new financial year restarts
    expect(await seq.next('SAAS', '2026-27')).toBe(1); // platform scope (no tenant)
    expect(await seq.next('SAAS', '2026-27')).toBe(2);
  });

  it('a transaction that aborts gives its number back: no gap', async () => {
    const org = new Types.ObjectId();
    await seq.ensure('invoice', '2026-27', org);
    expect(await seq.next('invoice', '2026-27', org)).toBe(1);

    const session = await conn.startSession();
    await expect(
      session.withTransaction(async () => {
        expect(await seq.next('invoice', '2026-27', org, session)).toBe(2);
        throw new Error('invoice could not be saved');
      }),
    ).rejects.toThrow('invoice could not be saved');
    await session.endSession();

    expect(await seq.next('invoice', '2026-27', org)).toBe(2); // 2 was never used, so it is reused
  });

  it('a committed transaction keeps its number', async () => {
    const org = new Types.ObjectId();
    await seq.ensure('invoice', '2026-27', org);
    const session = await conn.startSession();
    const n = await session.withTransaction(async () =>
      seq.next('invoice', '2026-27', org, session),
    );
    await session.endSession();
    expect(n).toBeDefined();
    expect(await seq.next('invoice', '2026-27', org)).toBe(2);
  });

  it('ensure() can run in parallel and never resets a counter', async () => {
    const org = new Types.ObjectId();
    await Promise.all(
      Array.from({ length: 10 }, () => seq.ensure('order', '2026', org)),
    );
    expect(await seq.next('order', '2026', org)).toBe(1);
    await seq.ensure('order', '2026', org);
    expect(await seq.next('order', '2026', org)).toBe(2);
  });
});
