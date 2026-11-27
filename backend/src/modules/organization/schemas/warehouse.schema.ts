import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

/** MVP has a single default warehouse per tenant; multi-warehouse comes later. */
@Schema({ collection: 'warehouses', timestamps: true })
export class Warehouse {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ type: Object })
  address?: Record<string, string>;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export type WarehouseDocument = HydratedDocument<Warehouse>;
export const WarehouseSchema = SchemaFactory.createForClass(Warehouse);
WarehouseSchema.index({ organizationId: 1, name: 1 }, { unique: true });
