import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CityDocument = City & Document;

@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class City {
  @Prop({ required: true })
  province: string;

  @Prop({ required: true })
  region: string;

  @Prop({ required: true })
  district: string;

  @Prop({ required: true })
  commune: string;

  @Prop({ required: true })
  fokontany: string;

  @Prop({ type: { lat: Number, lng: Number }, required: false })
  coords: { lat: number; lng: number };

  @Prop({
    type: {
      averageRent: { type: Number, default: null },
      averagePrice: { type: Number, default: null },
      propertyCount: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: null },
    },
  })
  stats: Record<string, any>;
}

export const CitySchema = SchemaFactory.createForClass(City);
CitySchema.index({ province: 1, region: 1, district: 1, commune: 1, fokontany: 1 });
