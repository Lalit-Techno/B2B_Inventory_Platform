import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

/** Insert-only record of sensitive actions (see Rules.md section 5.8). Written through AuditService only. */
@Schema({
  collection: 'audit_logs',
  timestamps: { createdAt: true, updatedAt: false },
})
export class AuditLog {
  /** Absent for platform (Super Admin) actions. */
  @Prop({ type: SchemaTypes.ObjectId, immutable: true })
  organizationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, immutable: true })
  actorId?: Types.ObjectId;

  @Prop({ immutable: true })
  actorRole?: string;

  /** e.g. LOGIN, ROLE_CHANGED, PRICE_CHANGED, SAAS_PAYMENT_RECORDED */
  @Prop({ required: true, immutable: true })
  action: string;

  @Prop({ required: true, immutable: true })
  entityType: string;

  @Prop({ immutable: true })
  entityId?: string;

  /** Never put passwords, tokens or full bank account numbers in these. */
  @Prop({ type: Object, immutable: true })
  before?: Record<string, unknown>;

  @Prop({ type: Object, immutable: true })
  after?: Record<string, unknown>;

  @Prop({ immutable: true })
  ip?: string;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1 });
