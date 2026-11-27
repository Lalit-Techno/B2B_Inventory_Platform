import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import {
  isIndianPhone,
  normalizePhone,
} from '../../../common/validation/validators';

export enum UserStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
}

@Schema({ collection: 'users', timestamps: true })
export class User {
  /** Stored lower-case; the unique index makes e-mail case-insensitive in practice. */
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  /** Indian mobile, always stored as '+91XXXXXXXXXX'. Optional contact detail only: it is not used to sign in and need not be unique. */
  @Prop({
    trim: true,
    set: (v?: string) => (v ? (normalizePhone(v) ?? v) : v),
    validate: { validator: isIndianPhone, message: 'Invalid mobile number' },
  })
  phone?: string;

  @Prop()
  passwordHash?: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  /** SUPER_ADMIN is this flag, never an organization_users row. */
  @Prop({ default: false })
  isPlatformAdmin: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, enum: UserStatus, default: UserStatus.INVITED })
  status: UserStatus;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
