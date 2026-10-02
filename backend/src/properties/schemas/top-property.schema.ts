import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Property } from './property.schema';

export type TopPropertyDocument = TopProperty & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class TopProperty {
  @Prop({ type: Types.ObjectId, ref: 'Property', required: true })
  property: Property | Types.ObjectId;

  @Prop({ required: true })
  rank: number;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const TopPropertySchema = SchemaFactory.createForClass(TopProperty);
