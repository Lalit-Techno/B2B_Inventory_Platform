import { Model, Types } from 'mongoose';
import type { Principal } from '../auth/principal';
import { Role } from '../rbac/roles';
import { TenantDb, tenantDb } from './tenant-db';

const orgId = new Types.ObjectId();

/** First argument of the n-th call to a jest mock. */
const firstArg = (fn: jest.Mock, n: number) =>
  (fn.mock.calls as unknown[][])[n][0];

/** A fake model that records what the wrapper sends to MongoDB. */
function fakeModel() {
  const m = {
    find: jest.fn().mockReturnValue('query'),
    findOne: jest.fn().mockReturnValue('query'),
    countDocuments: jest.fn().mockReturnValue('query'),
    exists: jest.fn().mockReturnValue('query'),
    create: jest.fn().mockResolvedValue([{ ok: true }]),
    insertMany: jest.fn().mockResolvedValue([]),
    updateOne: jest.fn().mockReturnValue('query'),
    updateMany: jest.fn().mockReturnValue('query'),
    findOneAndUpdate: jest.fn().mockReturnValue('query'),
    aggregate: jest.fn().mockReturnValue('agg'),
  };
  return {
    m,
    db: new TenantDb<Record<string, unknown>>(
      m as unknown as Model<Record<string, unknown>>,
      orgId,
    ),
  };
}

describe('TenantDb', () => {
  it('ANDs the tenant onto every filter, so $or or a foreign organizationId cannot widen it', () => {
    const { m, db } = fakeModel();
    const other = new Types.ObjectId();
    db.find({ $or: [{ name: 'a' }, {}], organizationId: other });
    expect(m.find).toHaveBeenCalledWith(
      {
        $and: [
          { $or: [{ name: 'a' }, {}], organizationId: other },
          { organizationId: orgId },
        ],
      },
      undefined,
      undefined,
    );
  });

  it('scopes findOne, findById, count, exists and updates', () => {
    const { m, db } = fakeModel();
    const id = new Types.ObjectId();
    db.findOne({ sku: 'x' });
    db.findById(id);
    db.countDocuments();
    db.exists({ sku: 'x' });
    db.updateOne({ _id: id }, { $set: { name: 'n' } });
    db.updateMany({}, { $set: { isActive: false } });
    db.findOneAndUpdate({ _id: id }, { $inc: { n: 1 } }, { new: true });
    const tenant = { organizationId: orgId };
    expect(firstArg(m.findOne, 0)).toEqual({
      $and: [{ sku: 'x' }, tenant],
    });
    expect(firstArg(m.findOne, 1)).toEqual({ $and: [{ _id: id }, tenant] });
    expect(m.countDocuments).toHaveBeenCalledWith({ $and: [{}, tenant] });
    expect(m.exists).toHaveBeenCalledWith({ $and: [{ sku: 'x' }, tenant] });
    expect(firstArg(m.updateOne, 0)).toEqual({
      $and: [{ _id: id }, tenant],
    });
    expect(firstArg(m.updateMany, 0)).toEqual({ $and: [{}, tenant] });
    expect(firstArg(m.findOneAndUpdate, 0)).toEqual({
      $and: [{ _id: id }, tenant],
    });
  });

  it('stamps organizationId on inserts, overwriting whatever the caller sent', async () => {
    const { m, db } = fakeModel();
    await db.create({ name: 'a', organizationId: new Types.ObjectId() });
    await db.insertMany([{ name: 'b', organizationId: new Types.ObjectId() }]);
    expect(firstArg(m.create, 0)).toEqual([
      { name: 'a', organizationId: orgId },
    ]);
    expect(firstArg(m.insertMany, 0)).toEqual([
      { name: 'b', organizationId: orgId },
    ]);
  });

  it('refuses updates that try to change the tenant', () => {
    const { db } = fakeModel();
    expect(() =>
      db.updateOne({}, { $set: { organizationId: new Types.ObjectId() } }),
    ).toThrow(/organizationId/);
    expect(() =>
      db.updateOne({}, { organizationId: new Types.ObjectId() }),
    ).toThrow(/organizationId/);
  });

  it('refuses server-side JavaScript in filters and updates', () => {
    const { db } = fakeModel();
    expect(() => db.find({ $where: 'sleep(1000)' })).toThrow(/\$where/);
    expect(() => db.find({ a: { $function: {} } })).toThrow(/\$function/);
  });

  it('aggregate always starts with the tenant $match and rejects stages that cross collections', () => {
    const { m, db } = fakeModel();
    db.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    expect(firstArg(m.aggregate, 0)).toEqual([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    for (const stage of [
      {
        $lookup: {
          from: 'orders',
          as: 'o',
          localField: 'a',
          foreignField: 'b',
        },
      },
      { $graphLookup: {} },
      { $unionWith: 'orders' },
      { $out: 'x' },
      { $merge: { into: 'x' } },
      { $facet: { inner: [{ $lookup: {} }] } },
    ]) {
      expect(() => db.aggregate([stage as never])).toThrow(/not allowed/);
    }
  });

  it('tenantDb() gives a wrapper bound to the caller tenant and refuses platform users', () => {
    const model = {} as Model<Record<string, unknown>>;
    const org: Principal = {
      userId: 'u',
      sessionId: 's',
      role: Role.ORG_ADMIN,
      organizationId: orgId.toString(),
    };
    expect(tenantDb(model, org).organizationId.equals(orgId)).toBe(true);
    const sa: Principal = {
      userId: 'u',
      sessionId: 's',
      role: Role.SUPER_ADMIN,
    };
    expect(() => tenantDb(model, sa)).toThrow(/Not allowed/);
  });
});
