import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

@Schema({ collection: 'sessions', timestamps: true })
export class Session {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  /** Tenant this session is bound to (absent for SUPER_ADMIN). */
  @Prop({ type: SchemaTypes.ObjectId })
  organizationId?: Types.ObjectId;

  /** SHA-256 of the current refresh token (the raw token only lives in the cookie). */
  @Prop({ required: true })
  refreshTokenHash: string;

  /** Hash of the token before the last rotation: seeing it again means it was stolen. */
  @Prop()
  previousRefreshTokenHash?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  revokedAt?: Date;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
SessionSchema.index({ previousRefreshTokenHash: 1 }, { sparse: true });
SessionSchema.index({ userId: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
