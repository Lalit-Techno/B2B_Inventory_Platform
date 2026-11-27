import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';
import { nonNegative } from '../../../common/money/decimal128';

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}

const IST_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One current subscription per tenant. Dates are IST calendar dates stored as 'YYYY-MM-DD' (no time zone bugs). */
@Schema({ collection: 'saas_subscriptions', timestamps: true })
export class SaasSubscription {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  planId: Types.ObjectId;

  @Prop({ type: String, enum: BillingCycle, default: BillingCycle.YEARLY })
  billingCycle: BillingCycle;

  /** Negotiated amount per cycle, excluding GST. */
  @Prop({ type: SchemaTypes.Decimal128, required: true, validate: nonNegative })
  recurringAmount: Types.Decimal128;

  @Prop({ required: true, match: IST_DATE })
  startDate: string;

  /** Last day of paid validity, inclusive. */
  @Prop({ required: true, match: IST_DATE })
  endDate: string;

  @Prop({ required: true, min: 0, default: 7 })
  graceDays: number;

  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Prop({ default: true })
  renewalReminders: boolean;
}

export type SaasSubscriptionDocument = HydratedDocument<SaasSubscription>;
export const SaasSubscriptionSchema =
  SchemaFactory.createForClass(SaasSubscription);
SaasSubscriptionSchema.index({ organizationId: 1 }, { unique: true });
SaasSubscriptionSchema.index({ status: 1, endDate: 1 }); // daily status job
