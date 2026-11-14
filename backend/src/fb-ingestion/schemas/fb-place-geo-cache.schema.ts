import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FbPlaceGeoCacheDocument = FbPlaceGeoCache & Document;

/**
 * Persistent geo-resolution cache mapping normalized Madagascar location queries
 * to Google Maps Places coordinates so repeated neighborhood hints avoid API calls.
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class FbPlaceGeoCache {
  @Prop({ required: true, unique: true })
  normalizedKey: string;

  @Prop({ required: true })
  queryText: string;

  @Prop({ enum: ['ok', 'not_found'], required: true })
  status: 'ok' | 'not_found';

  @Prop({ type: String, default: null })
  placeId: string | null;

  @Prop({ type: String, default: null })
  placeName: string | null;

  @Prop({ type: String, default: null })
  formattedAddress: string | null;

  @Prop({ type: { lat: Number, lng: Number }, default: null })
  coords: { lat: number; lng: number } | null;

  @Prop({ enum: ['places_v1', 'places_legacy', 'none'], default: 'none' })
  provider: 'places_v1' | 'places_legacy' | 'none';

  @Prop({ default: 1 })
  hitCount: number;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const FbPlaceGeoCacheSchema = SchemaFactory.createForClass(FbPlaceGeoCache);
FbPlaceGeoCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
