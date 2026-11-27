import { model, Schema } from 'mongoose';
import { AuditLogSchema } from './audit/audit-log.schema';
import { DocumentSequenceSchema } from './numbering/document-sequence.schema';
import { OrganizationSchema } from '../modules/organization/schemas/organization.schema';
import { OrgUserSchema } from '../modules/organization/schemas/org-user.schema';
import { WarehouseSchema } from '../modules/organization/schemas/warehouse.schema';
import { NotificationSchema } from '../modules/notifications/schemas/notification.schema';
import { IdempotencyKeySchema } from './idempotency/idempotency-key.schema';
import { AuthTokenSchema } from '../modules/auth/schemas/auth-token.schema';
import { SessionSchema } from '../modules/auth/schemas/session.schema';
import { UserSchema } from '../modules/auth/schemas/user.schema';
import { SaasPlanSchema } from '../modules/platform/schemas/saas-plan.schema';
import { SaasSubscriptionSchema } from '../modules/platform/schemas/saas-subscription.schema';
import { SaasTransactionSchema } from '../modules/platform/schemas/saas-transaction.schema';
import { CategorySchema } from '../modules/catalog/schemas/category.schema';
import { ProductSchema } from '../modules/catalog/schemas/product.schema';
import { FileObjectSchema } from '../modules/files/schemas/file-object.schema';
import { StockLogSchema } from '../modules/inventory/schemas/stock-log.schema';
import { fromDecimal128 } from './money/decimal128';

// Validation runs without a database connection.
const Org = model('OrgTest', OrganizationSchema);
const Plan = model('PlanTest', SaasPlanSchema);
const Sub = model('SubTest', SaasSubscriptionSchema);
const Seq = model('SeqTest', DocumentSequenceSchema);
const Product = model('ProductTest', ProductSchema);
const StockLog = model('StockLogTest', StockLogSchema);

const GSTIN = '27AAPFU0939F1ZV';
const oid = '64b000000000000000000001';

const failsOn = async (doc: { validate(): Promise<unknown> }) => {
  try {
    await doc.validate();
    return [];
  } catch (e) {
    return Object.keys((e as { errors: object }).errors);
  }
};

/** Every business field of an append-only collection must be immutable. */
const mutableFields = (schema: Schema) =>
  Object.values(schema.paths)
    .filter((p) => !['_id', '__v', 'createdAt', 'updatedAt'].includes(p.path))
    .filter((p) => !p.options.immutable)
    .map((p) => p.path);

describe('Organization schema', () => {
  it('derives state code and PAN from a valid GSTIN', async () => {
    const org = new Org({
      slug: 'acme',
      legalName: 'Acme',
      gstin: GSTIN.toLowerCase(),
    });
    expect(await failsOn(org)).toEqual([]);
    expect(org.gstin).toBe(GSTIN);
    expect(org.stateCode).toBe('27');
    expect(org.pan).toBe('AAPFU0939F');
  });

  it('rejects a bad GSTIN checksum, and state / PAN that disagree with the GSTIN', async () => {
    expect(
      await failsOn(
        new Org({ slug: 'a', legalName: 'A', gstin: '27AAPFU0939F1ZX' }),
      ),
    ).toContain('gstin');
    expect(
      await failsOn(
        new Org({ slug: 'a', legalName: 'A', gstin: GSTIN, stateCode: '29' }),
      ),
    ).toContain('stateCode');
    expect(
      await failsOn(
        new Org({ slug: 'a', legalName: 'A', gstin: GSTIN, pan: 'ABCDE1234F' }),
      ),
    ).toContain('pan');
  });
});

describe('SaaS schemas', () => {
  it('plan defaults to 18% GST and 7 grace days, and rejects negative prices', async () => {
    const plan = new Plan({
      code: 'starter',
      name: 'Starter',
      monthlyPrice: '999.00',
      yearlyPrice: '9990.00',
    });
    expect(await failsOn(plan)).toEqual([]);
    expect(plan.code).toBe('STARTER');
    expect(fromDecimal128(plan.gstRate).toFixed(2)).toBe('18.00');
    expect(plan.graceDays).toBe(7);
    expect(
      await failsOn(
        new Plan({
          code: 'X',
          name: 'X',
          monthlyPrice: '-1',
          yearlyPrice: '0',
        }),
      ),
    ).toContain('monthlyPrice');
  });

  it('subscription needs IST dates in YYYY-MM-DD and a known status', async () => {
    const base = {
      organizationId: oid,
      planId: oid,
      recurringAmount: '1000',
      startDate: '2026-11-25',
      endDate: '2026-12-24',
    };
    expect(await failsOn(new Sub(base))).toEqual([]);
    expect(
      await failsOn(new Sub({ ...base, endDate: '24/12/2026' })),
    ).toContain('endDate');
    expect(await failsOn(new Sub({ ...base, status: 'PAUSED' }))).toContain(
      'status',
    );
  });

  it('ledger and audit rows are fully immutable (append-only)', () => {
    expect(mutableFields(SaasTransactionSchema)).toEqual([]);
    expect(mutableFields(AuditLogSchema)).toEqual([]);
  });
});

describe('Product schema', () => {
  const base = { organizationId: oid, sku: 'ab-1', title: 'Bolt', uom: 'pcs' };

  it('starts as a DRAFT with zero stock, MOQ 1 and an upper-cased SKU', async () => {
    const p = new Product(base);
    expect(await failsOn(p)).toEqual([]);
    expect(p.sku).toBe('AB-1');
    expect(p.publicationStatus).toBe('DRAFT');
    expect(fromDecimal128(p.currentStock).toFixed()).toBe('0');
    expect(fromDecimal128(p.moq).toFixed()).toBe('1');
  });

  it('rejects negative stock, a bad HSN, an unknown GST slab and prices out of order', async () => {
    expect(
      await failsOn(new Product({ ...base, currentStock: '-1' })),
    ).toContain('currentStock');
    expect(await failsOn(new Product({ ...base, hsn: '123' }))).toContain(
      'hsn',
    );
    expect(await failsOn(new Product({ ...base, hsn: '72083910' }))).toEqual(
      [],
    );
    expect(await failsOn(new Product({ ...base, gstRate: '13' }))).toContain(
      'gstRate',
    );
    expect(await failsOn(new Product({ ...base, gstRate: '0.25' }))).toEqual(
      [],
    );
    expect(
      await failsOn(
        new Product({
          ...base,
          floorPrice: '120',
          standardPrice: '100',
          mrp: '150',
        }),
      ),
    ).toContain('floorPrice');
    expect(
      await failsOn(
        new Product({
          ...base,
          floorPrice: '80',
          standardPrice: '100',
          mrp: '100',
        }),
      ),
    ).toEqual([]);
  });
});

describe('StockLog schema', () => {
  const row = { organizationId: oid, productId: oid, type: 'STOCK_IN' };

  it('requires newStock = previousStock + change, and is append-only', async () => {
    expect(
      await failsOn(
        new StockLog({
          ...row,
          previousStock: '10.5',
          change: '2.25',
          newStock: '12.75',
        }),
      ),
    ).toEqual([]);
    expect(
      await failsOn(
        new StockLog({
          ...row,
          previousStock: '10',
          change: '5',
          newStock: '14',
        }),
      ),
    ).toContain('newStock');
    expect(
      await failsOn(
        new StockLog({
          ...row,
          previousStock: '3',
          change: '-5',
          newStock: '-2',
        }),
      ),
    ).toContain('newStock');
    expect(mutableFields(StockLogSchema)).toEqual([]);
    expect(mutableFields(FileObjectSchema)).toEqual([]);
  });
});

describe('DocumentSequence schema', () => {
  it('starts at zero and needs a type and period', async () => {
    const seq = new Seq({ docType: 'invoice', period: '2026-27' });
    expect(await failsOn(seq)).toEqual([]);
    expect(seq.lastNumber).toBe(0);
    expect(seq.docType).toBe('INVOICE');
    expect(await failsOn(new Seq({}))).toEqual(
      expect.arrayContaining(['docType', 'period']),
    );
  });
});

describe('every schema field is really typed', () => {
  // Mongoose silently makes a field "Mixed" (no casting, no validation) if its type is wrong,
  // e.g. `type: Types.ObjectId` instead of `SchemaTypes.ObjectId`. Only these free-form objects may be Mixed.
  const INTENTIONAL_OBJECTS = new Set([
    'Organization.address',
    'Organization.branding',
    'Organization.settings',
    'Organization.bankDetails',
    'Warehouse.address',
    'AuditLog.before',
    'AuditLog.after',
    'IdempotencyKey.responseBody',
  ]);

  const schemas: Record<string, Schema> = {
    User: UserSchema,
    Session: SessionSchema,
    AuthToken: AuthTokenSchema,
    Organization: OrganizationSchema,
    OrgUser: OrgUserSchema,
    Warehouse: WarehouseSchema,
    SaasPlan: SaasPlanSchema,
    SaasSubscription: SaasSubscriptionSchema,
    SaasTransaction: SaasTransactionSchema,
    DocumentSequence: DocumentSequenceSchema,
    AuditLog: AuditLogSchema,
    IdempotencyKey: IdempotencyKeySchema,
    Notification: NotificationSchema,
    Category: CategorySchema,
    Product: ProductSchema,
    StockLog: StockLogSchema,
    FileObject: FileObjectSchema,
  };

  it('has no accidental Mixed fields', () => {
    const mixed = Object.entries(schemas).flatMap(([name, schema]) =>
      Object.values(schema.paths)
        .filter((p) => p.instance === 'Mixed')
        .map((p) => `${name}.${p.path}`),
    );
    expect(mixed.filter((m) => !INTENTIONAL_OBJECTS.has(m))).toEqual([]);
  });

  it('ids are ObjectIds and money is Decimal128', () => {
    expect(SaasPlanSchema.path('monthlyPrice').instance).toBe('Decimal128');
    expect(SaasSubscriptionSchema.path('recurringAmount').instance).toBe(
      'Decimal128',
    );
    expect(SaasTransactionSchema.path('amount').instance).toBe('Decimal128');
    expect(OrgUserSchema.path('organizationId').instance).toBe('ObjectId');
    expect(SessionSchema.path('userId').instance).toBe('ObjectId');
  });
});
