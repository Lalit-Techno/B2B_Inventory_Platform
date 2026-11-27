import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { fromDecimal128, nonNegative } from '../../../common/money/decimal128';

export enum StockLogType {
  OPENING = 'OPENING',
  STOCK_IN = 'STOCK_IN',
  ADJUSTMENT = 'ADJUSTMENT',
  WRITE_OFF = 'WRITE_OFF',
  SALE = 'SALE',
  SALE_REVERSAL = 'SALE_REVERSAL',
}

const quantity = {
  type: SchemaTypes.Decimal128,
  required: true,
  immutable: true,
};

/**
 * Append-only stock history: `newStock = previousStock + change`, written by the inventory service in the
 * same transaction as the product's stock update. Never updated or deleted.
 */
@Schema({
  collection: 'stock_logs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class StockLog {
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: StockLogType, required: true, immutable: true })
  type: StockLogType;

  @Prop(quantity) previousStock: Types.Decimal128;
  /** Negative for a deduction. */
  @Prop(quantity) change: Types.Decimal128;
  @Prop({ ...quantity, validate: nonNegative }) newStock: Types.Decimal128;

  /** What caused it, e.g. ORDER / PURCHASE and its id. */
  @Prop({ immutable: true }) referenceType?: string;
  @Prop({ type: SchemaTypes.ObjectId, immutable: true })
  referenceId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, immutable: true })
  userId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 500, immutable: true }) reason?: string;
}

export type StockLogDocument = HydratedDocument<StockLog>;
export const StockLogSchema = SchemaFactory.createForClass(StockLog);
StockLogSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });
StockLogSchema.index({ organizationId: 1, createdAt: -1 });

StockLogSchema.pre('validate', function () {
  if (!this.previousStock || !this.change || !this.newStock) return;
  const expected = fromDecimal128(this.previousStock).plus(
    fromDecimal128(this.change),
  );
  if (!expected.eq(fromDecimal128(this.newStock)))
    this.invalidate('newStock', 'newStock must equal previousStock + change');
});
