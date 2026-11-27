import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum FileKind {
  PRODUCT_IMAGE = 'PRODUCT_IMAGE',
  LOGO = 'LOGO',
  INVOICE_PDF = 'INVOICE_PDF',
  RECEIPT_PDF = 'RECEIPT_PDF',
  OTHER = 'OTHER',
}

/** Metadata for a file held by StorageService. The key always starts with `{organizationId}/`. */
@Schema({
  collection: 'file_objects',
  timestamps: { createdAt: true, updatedAt: false },
})
export class FileObject {
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;

  /** Storage key: {organizationId}/{kind}/{id}.{ext}. */
  @Prop({ required: true, immutable: true })
  key: string;

  @Prop({ type: String, enum: FileKind, required: true, immutable: true })
  kind: FileKind;

  @Prop({ required: true, immutable: true })
  mime: string;

  @Prop({ required: true, immutable: true, min: 1 })
  size: number;

  @Prop({ trim: true, maxlength: 200, immutable: true })
  originalName?: string;

  @Prop({ type: SchemaTypes.ObjectId, immutable: true })
  uploadedBy?: Types.ObjectId;
}

export type FileObjectDocument = HydratedDocument<FileObject>;
export const FileObjectSchema = SchemaFactory.createForClass(FileObject);
FileObjectSchema.index({ key: 1 }, { unique: true });
FileObjectSchema.index({ organizationId: 1, kind: 1, createdAt: -1 });
