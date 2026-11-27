import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

/** In-app inbox row. E-mail is sent separately through MailService. */
@Schema({
  collection: 'notifications',
  timestamps: { createdAt: true, updatedAt: false },
})
export class Notification {
  @Prop({ type: SchemaTypes.ObjectId })
  organizationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  /** e.g. SUBSCRIPTION_EXPIRING, ORDER_PLACED, LOW_STOCK */
  @Prop({ required: true })
  type: string;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ maxlength: 1000 })
  body?: string;

  @Prop()
  link?: string;

  @Prop()
  readAt?: Date;

  /** Lets a job send the same notice only once, e.g. SUB_REMINDER:2026-12-01:30. */
  @Prop()
  dedupeKey?: string;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
