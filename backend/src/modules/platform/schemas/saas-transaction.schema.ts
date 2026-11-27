import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export enum PaymentMode {
  BANK_TRANSFER = 'BANK_TRANSFER',
  UPI = 'UPI',
  CHEQUE = 'CHEQUE',
  CASH = 'CASH',
  OTHER = 'OTHER',
}

export enum LedgerEntryType {
  PAYMENT = 'PAYMENT',
  REVERSAL = 'REVERSAL',
}

const IST_DATE = /^\d{4}-\d{2}-\d{2}$/;
const money = { type: SchemaTypes.Decimal128, required: true, immutable: true };

/**
 * Append-only SaaS ledger. Rows are never updated or deleted: a correction is a REVERSAL row
 * that points at the original (`reversesId`). The only writer is the platform billing service,
 * which exposes insert and read methods only. `amount = taxable + gst` is asserted there.
 */
@Schema({
  collection: 'saas_transactions',
  timestamps: { createdAt: true, updatedAt: false },
})
export class SaasTransaction {
  /** SAAS-2026-27-0001 (from DocumentSequence, platform scope). */
  @Prop({ required: true, immutable: true })
  number: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  subscriptionId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;

  @Prop({
    type: String,
    enum: LedgerEntryType,
    required: true,
    immutable: true,
  })
  entryType: LedgerEntryType;

  /** Fee before GST (negative on a reversal). */
  @Prop(money) taxable: Types.Decimal128;
  @Prop(money) gst: Types.Decimal128;
  /** taxable + gst. */
  @Prop(money) amount: Types.Decimal128;
  /** TDS deducted by the customer (informational). */
  @Prop({
    type: SchemaTypes.Decimal128,
    required: true,
    immutable: true,
    default: () => Types.Decimal128.fromString('0'),
  })
  tds: Types.Decimal128;

  @Prop({ type: String, enum: PaymentMode, required: true, immutable: true })
  mode: PaymentMode;

  /** Bank / UPI / cheque reference, stored upper-case. Unique together with the mode for payments. */
  @Prop({ trim: true, uppercase: true, immutable: true })
  reference?: string;

  @Prop({ required: true, match: IST_DATE, immutable: true })
  paymentDate: string;

  /** Validity period this payment bought (inclusive IST dates). */
  @Prop({ required: true, match: IST_DATE, immutable: true })
  periodStart: string;

  @Prop({ required: true, match: IST_DATE, immutable: true })
  periodEnd: string;

  /** Set on a REVERSAL: the entry being reversed. */
  @Prop({ type: SchemaTypes.ObjectId, immutable: true })
  reversesId?: Types.ObjectId;

  @Prop({ trim: true, immutable: true })
  reason?: string;

  @Prop({ trim: true, maxlength: 500, immutable: true })
  notes?: string;

  /** The subscription's end date just before this entry, so a reversal can restore it exactly. */
  @Prop({ required: true, match: IST_DATE, immutable: true })
  previousEndDate: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  createdBy: Types.ObjectId;
}

export type SaasTransactionDocument = HydratedDocument<SaasTransaction>;
export const SaasTransactionSchema =
  SchemaFactory.createForClass(SaasTransaction);
SaasTransactionSchema.index({ number: 1 }, { unique: true });
SaasTransactionSchema.index({ organizationId: 1, paymentDate: -1 });
// An entry can be reversed at most once.
SaasTransactionSchema.index({ reversesId: 1 }, { unique: true, sparse: true });
// Blocks entering the same payment twice (mode + reference). Reversals are exempt.
SaasTransactionSchema.index(
  { mode: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      entryType: 'PAYMENT',
      reference: { $type: 'string' },
    },
  },
);
SaasTransactionSchema.index({ entryType: 1, paymentDate: -1 });
