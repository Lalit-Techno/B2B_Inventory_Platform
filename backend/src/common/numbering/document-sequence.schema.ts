import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

/**
 * One counter per (tenant or platform, document type, financial year).
 * `organizationId` is absent for platform documents (SaaS invoices).
 * Only DocumentSequenceService increments it, inside the transaction that issues the document.
 */
@Schema({ collection: 'document_sequences', timestamps: true })
export class DocumentSequence {
  @Prop({ type: SchemaTypes.ObjectId })
  organizationId?: Types.ObjectId;

  /** INVOICE, CREDIT_NOTE, RECEIPT, ORDER, SAAS ... */
  @Prop({ required: true, uppercase: true })
  docType: string;

  /** '2026-27' for invoices and similar, or the calendar year for orders. */
  @Prop({ required: true })
  period: string;

  @Prop({ required: true, min: 0, default: 0 })
  lastNumber: number;
}

export type DocumentSequenceDocument = HydratedDocument<DocumentSequence>;
export const DocumentSequenceSchema =
  SchemaFactory.createForClass(DocumentSequence);
DocumentSequenceSchema.index(
  { organizationId: 1, docType: 1, period: 1 },
  { unique: true },
);
