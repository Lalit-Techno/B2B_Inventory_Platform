import mongoose, { Connection, Model, Types } from 'mongoose';
import { Role } from '../src/common/rbac/roles';
import { TenantDb, tenantDb } from '../src/common/tenancy/tenant-db';
import {
  Warehouse,
  WarehouseSchema,
} from '../src/modules/organization/schemas/warehouse.schema';
import { dropTestDb, testDbConfig } from './helpers/test-db';

/**
 * Isolation test on a real database: two tenants, same collection. Whatever tenant A does,
 * tenant B's data must be invisible and untouched.
 */
describe('TenantDb isolation (real MongoDB)', () => {
  const cfg = testDbConfig();
  let conn: Connection;
  let model: Model<Warehouse>;
  let a: TenantDb<Warehouse>;
  let b: TenantDb<Warehouse>;
  let bMain: Types.ObjectId;

  beforeAll(async () => {
    conn = await mongoose
      .createConnection(cfg.uri, { dbName: cfg.dbName })
      .asPromise();
    model = conn.model(Warehouse.name, WarehouseSchema);
    await model.syncIndexes();
    a = new TenantDb(model, new Types.ObjectId());
    b = new TenantDb(model, new Types.ObjectId());

    await a.create({ name: 'Main' });
    await a.create({ name: 'Cold store' });
    bMain = (await b.create({ name: 'Main' }))._id; // same name in another tenant is fine
  });

  afterAll(async () => {
    await conn.close();
    await dropTestDb(cfg);
  });

  it('lists only the caller tenant rows', async () => {
    expect((await a.find()).map((w) => w.name).sort()).toEqual([
      'Cold store',
      'Main',
    ]);
    expect(await a.countDocuments()).toBe(2);
    expect(await b.countDocuments()).toBe(1);
  });

  it("a foreign id behaves as 'not found' for read and update (the API turns this into 404)", async () => {
    expect(await a.findById(bMain)).toBeNull();
    expect(await a.exists({ _id: bMain })).toBeNull();
    const res = await a.updateOne({ _id: bMain }, { $set: { name: 'hacked' } });
    expect(res.matchedCount).toBe(0);
    expect((await model.findById(bMain))?.name).toBe('Main');
  });

  it('cannot be widened with a foreign organizationId or an $or', async () => {
    expect(await a.find({ organizationId: b.organizationId })).toEqual([]);
    expect(await a.find({ $or: [{ name: 'Main' }, {}] })).toHaveLength(2);
  });

  it('bulk updates only touch the caller tenant', async () => {
    await a.updateMany({}, { $set: { isActive: false } });
    expect((await b.find())[0].isActive).toBe(true);
    expect((await a.find()).every((w) => !w.isActive)).toBe(true);
    await a.updateMany({}, { $set: { isActive: true } });
  });

  it('aggregates only the caller tenant', async () => {
    const [row] = await a.aggregate<{ n: number }>([
      { $group: { _id: null, n: { $sum: 1 } } },
    ]);
    expect(row.n).toBe(2);
  });

  it('stamps the caller tenant on inserts even if another is sent', async () => {
    const w = await a.create({
      name: 'Annex',
      organizationId: b.organizationId,
    });
    expect(w.organizationId.equals(a.organizationId)).toBe(true);
    expect(await b.countDocuments()).toBe(1);
  });

  it('keeps tenant-scoped unique indexes: a duplicate inside one tenant fails', async () => {
    await expect(a.create({ name: 'Main' })).rejects.toThrow(/duplicate key/);
  });

  it('a platform user can never get a TenantDb', () => {
    expect(() =>
      tenantDb(model, { userId: 'u', sessionId: 's', role: Role.SUPER_ADMIN }),
    ).toThrow(/Not allowed/);
  });
});
