import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { City } from '../../cities/schemas/city.schema';
import { HOUSE_TYPE_VALUES } from '../../common/property-types.util';
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

  @Prop({ required: false, default: 0 })
  rooms: number;

  @Prop({ required: false, default: 0 })
  toilet: number;

  @Prop({ required: false, default: 0 })
  kitchen: number;

  @Prop({ required: false, default: 0 })
  bathrooms: number;

  @Prop({ required: false, default: 0 })
  livingRoom: number;

  @Prop({ default: null })
  phone1: string;

  @Prop({ default: null })
  phone2: string;

  @Prop({ default: null })
  phone3: string;

  @Prop({ required: true, default: false })
  topProperty: boolean;

  @Prop({ required: false, default: 0 })
  area: number;

  /**
   * Server-side habitable surface estimate (`m²`) used strictly by internal
   * search/scoring algorithms when `area` is not explicitly provided.
   * Stripped from non-admin public API responses.
   */
  @Prop({ type: Number, required: false, default: null })
  estimatedArea: number | null;

  /**
   * Price / rent estimation fields when the publisher omits explicit pricing
   * ("prix sur demande" / MP).
   */
  @Prop({ type: Boolean, required: false, default: false })
  isPriceEstimated: boolean;

  @Prop({ type: Number, required: false, default: null })
  estimatedPrice: number | null;

  @Prop({ type: Number, required: false, default: null })
  estimatedRent: number | null;

  @Prop({ type: Number, required: false, default: null })
  estimatedPriceMin: number | null;

  @Prop({ type: Number, required: false, default: null })
  estimatedPriceMax: number | null;

  @Prop({ type: String, required: false, default: null })
  estimatedPriceConfidence: 'high' | 'medium' | 'low' | null;

  /**
   * Holistic listing quality score (1..100) combining visual condition,
   * data completeness, reliability, and freshness. Stripped from public API.
   */
  @Prop({ type: Number, required: false, default: 70 })
  qualityScore: number;

  @Prop({ type: String, required: false, default: null })
  visualCondition: string | null;

  /**
   * Contact paywall flag. Defaults to `false` so existing/legacy properties in DB
   * remain unlocked, while newly created/published properties set `true`.
   */
  @Prop({ type: Boolean, required: false, default: false })
  contactAccessLocked: boolean;

  /**
   * Optional agency / entry terms (populated ONLY when explicitly mentioned in the listing).
   */
  @Prop({ type: Number, required: false, default: null })
  visitFee: number | null;

  @Prop({ type: Number, required: false, default: null })
  cautionPercent: number | null;

  @Prop({ type: Number, required: false, default: null })
  cautionAmount: number | null;

  @Prop({ type: Number, required: false, default: null })
  commissionPercent: number | null;

  @Prop({ type: Number, required: false, default: null })
  commissionAmount: number | null;

  @Prop({ required: true })
  propertyNumber: string;

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

  @Prop({ enum: [...HOUSE_TYPE_VALUES], required: false, default: null })
  houseType: string;

  @Prop({ required: false, default: null })
  floor: string;

  @Prop({
    enum: ['available', 'unavailable', 'occupated', 'pending', 'approved', 'canceled'],
    required: true,
    default: 'pending',
  })
  status: string;

  /**
   * Internal admin differentiator separating organic user-generated listings
   * from scraped Facebook listings and manual admin entries (preserved even after claim).
   */
  @Prop({
    enum: ['user', 'admin_manual', 'facebook_scraper'],
    required: true,
    default: 'user',
  })
  origin: 'user' | 'admin_manual' | 'facebook_scraper';

  @Prop({
    enum: ['not_applicable', 'unclaimed', 'claimed'],
    required: true,
    default: 'not_applicable',
  })
  claimStatus: 'not_applicable' | 'unclaimed' | 'claimed';

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  claimedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  claimedAt: Date | null;

  @Prop({
    type: {
      fbUserId: { type: String, required: false },
      username: { type: String, required: false },
      avatar: { type: String, required: false },
      link: { type: String, required: false },
      postId: { type: String, required: false },
      postUrl: { type: String, required: false },
      groupId: { type: String, required: false },
    },
    required: false,
  })
  sources: Record<string, any>;
}

export const PropertySchema = SchemaFactory.createForClass(Property);
PropertySchema.index({ city: 1 });
PropertySchema.index({ type: 1 });
PropertySchema.index({ houseType: 1 });
PropertySchema.index({ type: 1, houseType: 1, created_at: -1 });
PropertySchema.index({ type: 1, created_at: -1 });
PropertySchema.index({ created_at: -1 });
PropertySchema.index({ status: 1 });
PropertySchema.index({ origin: 1, claimStatus: 1 });
PropertySchema.index({ 'sources.postId': 1 });
PropertySchema.index({ 'sources.fbUserId': 1 });
PropertySchema.index({ phone1: 1 });
PropertySchema.index({ phone2: 1 });
PropertySchema.index({ phone3: 1 });
