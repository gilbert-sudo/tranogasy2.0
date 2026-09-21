import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { City } from '../../cities/schemas/city.schema';
import { Feature } from '../../features/schemas/feature.schema';

export type PropertyDocument = Property & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class Property {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'City', required: true })
  city: City;

  @Prop({ required: false })
  price: number;

  @Prop({ required: false })
  rent: number;

  @Prop({ required: true })
  rooms: number;

  @Prop({ required: true })
  toilet: number;

  @Prop({ required: false })
  kitchen: number;

  @Prop({ required: true })
  bathrooms: number;

  @Prop({ default: false })
  livingRoom: number;

  @Prop({ default: null })
  phone1: string;

  @Prop({ default: null })
  phone2: string;

  @Prop({ default: null })
  phone3: string;

  @Prop({ required: true, default: false })
  topProperty: boolean;

  @Prop({ required: true })
  area: number;

  @Prop({ required: true })
  propertyNumber: number;

  @Prop({ type: Types.ObjectId, ref: 'Feature', default: null })
  features: Feature;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  owner: Types.ObjectId;

  @Prop({ type: { lat: Number, lng: Number }, required: false })
  coords: { lat: number; lng: number };

  @Prop({ enum: ['sale', 'rent'], required: true })
  type: string;

  @Prop({ enum: ['maison', 'appartement'], required: false, default: null })
  houseType: string;

  @Prop({ required: false, default: null })
  floor: string;

  @Prop({
    enum: ['available', 'unavailable', 'occupated', 'pending', 'approved', 'canceled'],
    required: true,
    default: 'pending',
  })
  status: string;

  @Prop({
    type: {
      username: { type: String, required: false },
      avatar: { type: String, required: false },
      link: { type: String, required: false },
    },
  })
  sources: Record<string, any>;
}

export const PropertySchema = SchemaFactory.createForClass(Property);
PropertySchema.index({ city: 1 });
PropertySchema.index({ type: 1 });
PropertySchema.index({ status: 1 });
