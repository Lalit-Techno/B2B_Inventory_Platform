import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';
import { Role, STAFF_ROLES } from '../../../common/rbac/roles';

/** A staff member's role inside one organization (one row per user and organization). */
@Schema({ collection: 'organization_users', timestamps: true })
export class OrgUser {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: STAFF_ROLES, required: true })
  role: Exclude<Role, Role.SUPER_ADMIN | Role.BUYER_USER>;

  @Prop({ default: true })
  isActive: boolean;
}

export type OrgUserDocument = HydratedDocument<OrgUser>;
export const OrgUserSchema = SchemaFactory.createForClass(OrgUser);
OrgUserSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
OrgUserSchema.index({ userId: 1 });
