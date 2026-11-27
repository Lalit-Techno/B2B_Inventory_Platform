import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export enum IdempotencyStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

/** Remembers the response of a money-moving request so a retry with the same Idempotency-Key repeats it, not redoes it. */
@Schema({ collection: 'idempotency_keys', timestamps: true })
export class IdempotencyKey {
  /** Absent for platform requests (SaaS record-payment). */
  @Prop({ type: SchemaTypes.ObjectId })
  organizationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  actorId: Types.ObjectId;

  @Prop({ required: true, maxlength: 64 })
  key: string;

  /** SHA-256 of method + path + body: the same key with a different body is an error. */
  @Prop({ required: true })
  requestHash: string;

  @Prop({
    type: String,
    enum: IdempotencyStatus,
    default: IdempotencyStatus.IN_PROGRESS,
  })
  status: IdempotencyStatus;

  @Prop()
  responseStatus?: number;

  @Prop({ type: Object })
  responseBody?: unknown;

  /** While IN_PROGRESS: after this time the attempt is assumed dead and the key can be retried. */
  @Prop()
  lockedUntil?: Date;

  @Prop({ required: true })
  expiresAt: Date;
}

export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKey>;
export const IdempotencyKeySchema =
  SchemaFactory.createForClass(IdempotencyKey);
IdempotencyKeySchema.index(
  { organizationId: 1, actorId: 1, key: 1 },
  { unique: true },
);
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
