import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** Product category tree (two levels are enough for the UI; the schema allows any depth). */
@Schema({ collection: 'categories', timestamps: true })
export class Category {
  @Prop({ type: SchemaTypes.ObjectId, required: true, immutable: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  /** Absent = top level. */
  @Prop({ type: SchemaTypes.ObjectId })
  parentId?: Types.ObjectId;

  @Prop({ default: 0 })
  sortOrder: number;

  /** Categories are deactivated, never deleted (products keep pointing at them). */
  @Prop({ default: true })
  isActive: boolean;
}

export type CategoryDocument = HydratedDocument<Category>;
export const CategorySchema = SchemaFactory.createForClass(Category);
// A missing parentId counts as null in the index, so top-level names are unique too.
CategorySchema.index(
  { organizationId: 1, parentId: 1, name: 1 },
  { unique: true },
);
