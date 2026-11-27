import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export enum AuthTokenType {
  SET_PASSWORD = 'SET_PASSWORD', // invite
  RESET_PASSWORD = 'RESET_PASSWORD',
}

/** Single-use invite / reset token. Only the SHA-256 hash is stored. */
@Schema({ collection: 'auth_tokens', timestamps: true })
export class AuthToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: AuthTokenType, required: true })
  type: AuthTokenType;

  @Prop({ required: true })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  usedAt?: Date;
}

export type AuthTokenDocument = HydratedDocument<AuthToken>;
export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);
AuthTokenSchema.index({ tokenHash: 1 }, { unique: true });
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
