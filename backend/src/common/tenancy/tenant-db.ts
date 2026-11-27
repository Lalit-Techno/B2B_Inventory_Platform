import type {
  AggregateOptions,
  ClientSession,
  FilterQuery,
  Model,
  PipelineStage,
  ProjectionType,
  QueryOptions,
  UpdateQuery,
} from 'mongoose';
import { Types } from 'mongoose';
import type { Principal } from '../auth/principal';
import { AppError } from '../errors/app-error';

/**
 * The only way services touch a tenant collection. Every read, update, count and aggregate is
 * restricted to one organization and every insert is stamped with it. MongoDB has no row-level
 * security, so this wrapper (and its isolation tests) IS the tenant isolation.
 *
 * Deliberately missing: delete methods (business records are deactivated, never deleted) and
 * anything that could reach another collection or tenant (see the banned operators below).
 *
 * `Organization` itself is not wrapped: it is read by `_id = principal.organizationId`, never by input.
 */

const BANNED_IN_FILTER = new Set(['$where', '$function', '$accumulator']);
// An update may never move a document to another tenant.
const BANNED_IN_UPDATE = new Set([...BANNED_IN_FILTER, 'organizationId']);
// Pipeline stages that can read or write other collections (and so other tenants).
const BANNED_IN_PIPELINE = new Set([
  ...BANNED_IN_FILTER,
  '$lookup',
  '$graphLookup',
  '$unionWith',
  '$out',
  '$merge',
]);

function assertNone(
  value: unknown,
  banned: ReadonlySet<string>,
  what: string,
): void {
  if (Array.isArray(value)) {
    value.forEach((v) => assertNone(v, banned, what));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return; // ObjectId, Date, Decimal128 ...
  for (const [key, inner] of Object.entries(value)) {
    if (banned.has(key))
      throw new Error(`"${key}" is not allowed in a tenant ${what}`);
    assertNone(inner, banned, what);
  }
}

interface WriteOptions {
  session?: ClientSession;
}

export class TenantDb<T> {
  constructor(
    private readonly model: Model<T>,
    readonly organizationId: Types.ObjectId,
  ) {}

  /** Caller filter AND organizationId: the caller cannot override or widen the tenant with $or etc. */
  private scope(filter: FilterQuery<T> = {}): FilterQuery<T> {
    assertNone(filter, BANNED_IN_FILTER, 'filter');
    return {
      $and: [filter, { organizationId: this.organizationId }],
    };
  }

  private checkUpdate(update: UpdateQuery<T>): UpdateQuery<T> {
    assertNone(update, BANNED_IN_UPDATE, 'update');
    return update;
  }

  find(
    filter?: FilterQuery<T>,
    projection?: ProjectionType<T>,
    options?: QueryOptions<T>,
  ) {
    return this.model.find(this.scope(filter), projection, options);
  }

  findOne(
    filter?: FilterQuery<T>,
    projection?: ProjectionType<T>,
    options?: QueryOptions<T>,
  ) {
    return this.model.findOne(this.scope(filter), projection, options);
  }

  findById(
    id: string | Types.ObjectId,
    projection?: ProjectionType<T>,
    options?: QueryOptions<T>,
  ) {
    return this.findOne({ _id: id }, projection, options);
  }

  countDocuments(filter?: FilterQuery<T>) {
    return this.model.countDocuments(this.scope(filter));
  }

  exists(filter: FilterQuery<T>) {
    return this.model.exists(this.scope(filter));
  }

  /** Inserts with organizationId forced to this tenant (any value in `doc` is overwritten). */
  async create(doc: Partial<T>, options?: WriteOptions) {
    const [created] = await this.model.create(
      [{ ...doc, organizationId: this.organizationId }],
      options ?? {},
    );
    return created;
  }

  insertMany(docs: Partial<T>[], options?: WriteOptions) {
    return this.model.insertMany(
      docs.map((d) => ({ ...d, organizationId: this.organizationId })),
      options ?? {},
    );
  }

  updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: WriteOptions,
  ) {
    return this.model.updateOne(
      this.scope(filter),
      this.checkUpdate(update),
      options ?? {},
    );
  }

  updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: WriteOptions,
  ) {
    return this.model.updateMany(
      this.scope(filter),
      this.checkUpdate(update),
      options ?? {},
    );
  }

  findOneAndUpdate(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: QueryOptions<T>,
  ) {
    return this.model.findOneAndUpdate(
      this.scope(filter),
      this.checkUpdate(update),
      options ?? {},
    );
  }

  /** Always starts with a $match on this tenant. Stages that reach other collections are rejected. */
  aggregate<R = unknown>(
    pipeline: PipelineStage[],
    options?: AggregateOptions,
  ) {
    assertNone(pipeline, BANNED_IN_PIPELINE, 'pipeline');
    return this.model.aggregate<R>(
      [{ $match: { organizationId: this.organizationId } }, ...pipeline],
      options ?? {},
    );
  }
}

/** Platform users (Super Admin) have no tenant, so they can never get a TenantDb. */
export function tenantDb<T>(
  model: Model<T>,
  principal: Principal,
): TenantDb<T> {
  if (!principal.organizationId) throw new AppError('FORBIDDEN', 'Not allowed');
  return new TenantDb(model, new Types.ObjectId(principal.organizationId));
}
