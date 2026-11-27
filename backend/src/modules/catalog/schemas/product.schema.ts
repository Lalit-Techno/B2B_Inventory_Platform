import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { fromDecimal128, nonNegative } from '../../../common/money/decimal128';

export enum PublicationStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  RETIRED = 'RETIRED',
}

/** GST slabs a product may carry (percent). */
export const GST_RATES = ['0', '0.25', '3', '5', '12', '18', '28'];

const decimal = { type: SchemaTypes.Decimal128, validate: nonNegative };
const zero = () => Types.Decimal128.fromString('0');
const one = () => Types.Decimal128.fromString('1');

/**
 * A sellable item. Stock (`currentStock`) changes only through the inventory service, which writes a
 * StockLog in the same transaction. Prices are decimal money; the role mappers decide who sees them.
 */
@Schema({ collection: 'products', timestamps: true })
export class Product {
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z0-9][A-Z0-9._/-]{0,39}$/,
  })
  sku: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ trim: true, maxlength: 2000 })
  description?: string;

  @Prop({ type: SchemaTypes.ObjectId })
  categoryId?: Types.ObjectId;

  /** 4, 6 or 8 digit HSN code. Needed to publish. */
  @Prop({ trim: true, match: /^(\d{4}|\d{6}|\d{8})$/ })
  hsn?: string;

  /** Unit of measure: PCS, KG, BOX ... */
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 10 })
  uom: string;

  /** Decimal places allowed in a quantity (0 for pieces, up to 3 for kg). */
  @Prop({ default: 0, min: 0, max: 3, validate: Number.isInteger })
  quantityScale: number;

  @Prop(decimal) mrp?: Types.Decimal128;
  @Prop(decimal) standardPrice?: Types.Decimal128;
  /** Lowest price a salesperson may agree. Never sent to buyers. */
  @Prop(decimal) floorPrice?: Types.Decimal128;

  /** GST percent, one of GST_RATES. Needed to publish. */
  @Prop({
    type: SchemaTypes.Decimal128,
    validate: {
      validator: (v: Types.Decimal128) =>
        GST_RATES.includes(fromDecimal128(v).toFixed()),
      message: 'GST rate must be one of 0, 0.25, 3, 5, 12, 18, 28',
    },
  })
  gstRate?: Types.Decimal128;

  @Prop({ ...decimal, required: true, default: zero })
  currentStock: Types.Decimal128;

  @Prop({ ...decimal, required: true, default: zero })
  reorderLevel: Types.Decimal128;

  /** True once the low-stock alert fired; reset when stock rises above the reorder level. */
  @Prop({ default: false })
  lowStockAlertSent: boolean;

  /** Minimum order quantity and order step (a multiple of). */
  @Prop({ ...decimal, required: true, default: one })
  moq: Types.Decimal128;

  @Prop({ ...decimal, required: true, default: one })
  step: Types.Decimal128;

  /** FileObject ids, first one is the cover. */
  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  imageIds: Types.ObjectId[];

  @Prop({
    type: String,
    enum: PublicationStatus,
    default: PublicationStatus.DRAFT,
  })
  publicationStatus: PublicationStatus;

  /** Optimistic-lock counter: an edit must send the version it read. */
  @Prop({ default: 1 })
  version: number;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
ProductSchema.index({ organizationId: 1, publicationStatus: 1, title: 1 });
ProductSchema.index({ organizationId: 1, categoryId: 1 });
// The low-stock list reads only the flagged products.
ProductSchema.index(
  { organizationId: 1, lowStockAlertSent: 1 },
  { partialFilterExpression: { lowStockAlertSent: true } },
);

// floor <= standard <= MRP whenever those are set.
ProductSchema.pre('validate', function () {
  const order = [this.floorPrice, this.standardPrice, this.mrp] as const;
  const names = ['floorPrice', 'standardPrice', 'mrp'] as const;
  for (let i = 0; i < 2; i++) {
    const [lo, hi] = [order[i], order[i + 1]];
    if (lo && hi && fromDecimal128(lo).gt(fromDecimal128(hi)))
      this.invalidate(
        names[i],
        `${names[i]} must not be above ${names[i + 1]}`,
      );
  }
});
