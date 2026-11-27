import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  gstinPan,
  gstinState,
  isGstin,
  isIndianPhone,
  isPan,
  normalizePhone,
} from '../../../common/validation/validators';

export enum OrgStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  OFFBOARDED = 'OFFBOARDED',
}

/** Tenant (wholesaler). GSTIN is checksum-validated; state code and PAN must agree with it. */
@Schema({ collection: 'organizations', timestamps: true })
export class Organization {
  @Prop({ required: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true })
  legalName: string;

  @Prop({ trim: true })
  tradeName?: string;

  @Prop({
    trim: true,
    uppercase: true,
    validate: { validator: isGstin, message: 'Invalid GSTIN' },
  })
  gstin?: string;

  @Prop({
    trim: true,
    uppercase: true,
    validate: { validator: isPan, message: 'Invalid PAN' },
  })
  pan?: string;

  /** GST state code (first 2 digits of the GSTIN). */
  @Prop({ trim: true, match: /^\d{2}$/ })
  stateCode?: string;

  /** Business contact (not a login). */
  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({
    trim: true,
    set: (v?: string) => (v ? (normalizePhone(v) ?? v) : v),
    validate: { validator: isIndianPhone, message: 'Invalid mobile number' },
  })
  phone?: string;

  @Prop({ type: Object })
  address?: Record<string, string>;

  @Prop({ type: Object, default: {} })
  branding: Record<string, string>;

  @Prop({ type: Object, default: {} })
  settings: Record<string, unknown>;

  @Prop({ trim: true })
  invoicePrefix?: string;

  @Prop({ type: Object })
  bankDetails?: Record<string, string>;

  @Prop({ type: String, enum: OrgStatus, default: OrgStatus.ACTIVE })
  status: OrgStatus;
}

export type OrganizationDocument = HydratedDocument<Organization>;
export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({ slug: 1 }, { unique: true });
OrganizationSchema.index({ gstin: 1 }, { unique: true, sparse: true });

// Derive state and PAN from the GSTIN when absent; reject when they disagree with it.
OrganizationSchema.pre('validate', function () {
  if (!this.gstin) return;
  this.stateCode ??= gstinState(this.gstin);
  this.pan ??= gstinPan(this.gstin);
  if (this.stateCode !== gstinState(this.gstin))
    this.invalidate('stateCode', 'State code does not match the GSTIN');
  if (this.pan !== gstinPan(this.gstin))
    this.invalidate('pan', 'PAN does not match the GSTIN');
});
