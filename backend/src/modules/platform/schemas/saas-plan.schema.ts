import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';
import { nonNegative } from '../../../common/money/decimal128';

/** Platform-level price list. Edits affect new subscriptions only (a subscription keeps its negotiated amount). */
@Schema({ collection: 'saas_plans', timestamps: true })
export class SaasPlan {
  /** STARTER, GROWTH, ENTERPRISE ... */
  @Prop({ required: true, uppercase: true, trim: true, maxlength: 32 })
  code: string;

  @Prop({ required: true, trim: true, maxlength: 64 })
  name: string;

  @Prop({ type: SchemaTypes.Decimal128, required: true, validate: nonNegative })
  monthlyPrice: Types.Decimal128;

  @Prop({ type: SchemaTypes.Decimal128, required: true, validate: nonNegative })
  yearlyPrice: Types.Decimal128;

  /** GST % charged on the SaaS fee. */
  @Prop({
    type: SchemaTypes.Decimal128,
    required: true,
    validate: nonNegative,
    default: () => Types.Decimal128.fromString('18'),
  })
  gstRate: Types.Decimal128;

  @Prop({ required: true, min: 0, default: 7 })
  graceDays: number;

  /** Limits: absent = unlimited. */
  @Prop({ min: 0 }) maxStaff?: number;
  @Prop({ min: 0 }) maxBuyers?: number;
  @Prop({ min: 0 }) maxSkus?: number;
  @Prop({ min: 0 }) maxOrdersPerMonth?: number;

  @Prop({ default: true })
  isActive: boolean;
}

export type SaasPlanDocument = HydratedDocument<SaasPlan>;
export const SaasPlanSchema = SchemaFactory.createForClass(SaasPlan);
SaasPlanSchema.index({ code: 1 }, { unique: true });
