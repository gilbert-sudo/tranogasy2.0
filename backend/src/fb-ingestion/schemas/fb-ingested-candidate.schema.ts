import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FbIngestedCandidateDocument = FbIngestedCandidate & Document;

/**
 * Staging queue for parsed Facebook real estate listings awaiting fast human
 * review before being published to the live `properties` collection.
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class FbIngestedCandidate {
  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';

  @Prop({ required: true })
  groupId: string;

  @Prop({ required: true })
  groupName: string;

  @Prop({ required: true, unique: true })
  canonicalPostId: string;

  @Prop({ required: true })
  postUrl: string;

  @Prop({ default: '' })
  authorName: string;

  @Prop({ type: String, default: null })
  authorFbId: string | null;

  @Prop({ type: String, default: null })
  authorUrl: string | null;

  @Prop({ type: String, default: null })
  authorAvatarUrl: string | null;

  @Prop({ type: Date, default: Date.now })
  datePosted: Date;

  @Prop({ required: true })
  rawContent: string;

  @Prop({ type: [String], default: [] })
  gcsImages: string[];

  @Prop({ type: Object, default: {} })
  extracted: Record<string, any>;

  @Prop({ type: String, default: null })
  matchedCityId: string | null;

  @Prop({ type: String, default: null })
  matchedCityLabel: string | null;

  @Prop({ type: [Object], default: [] })
  cityCandidates: Array<{
    _id: string;
    label: string;
    score: number;
    distanceMeters?: number | null;
    coords?: { lat: number; lng: number };
  }>;

  @Prop({ type: { lat: Number, lng: Number }, default: null })
  resolvedCoords?: { lat: number; lng: number } | null;

  @Prop({ type: String, default: null })
  resolvedPlaceName?: string | null;

  @Prop({ type: String, default: null })
  resolvedAddress?: string | null;

  @Prop({
    type: String,
    enum: ['google_places_cache', 'google_places_api', 'text_fallback'],
    default: null,
  })
  resolutionSource?: 'google_places_cache' | 'google_places_api' | 'text_fallback' | null;

  @Prop({ type: Boolean, default: false })
  manualCityOverride?: boolean;

  @Prop({ type: [String], default: [] })
  missingFields: string[];

  @Prop({ type: Object, default: {} })
  featureVerification: Record<string, 'yes' | 'no' | 'unknown'>;

  @Prop({ enum: ['high', 'medium', 'low'], default: 'medium' })
  aiConfidence: 'high' | 'medium' | 'low';

  @Prop({ type: String, default: null })
  aiNotes: string | null;

  @Prop({ type: String, default: null })
  publishedPropertyId: string | null;

  @Prop({
    type: String,
    enum: ['auto_published', 'fast_check', 'call_queue'],
    default: 'fast_check',
  })
  workflowLane?: 'auto_published' | 'fast_check' | 'call_queue';

  @Prop({ type: Boolean, default: false })
  autoApproved?: boolean;

  @Prop({ type: String, default: null })
  autoApproveReason?: string | null;

  @Prop({
    type: String,
    enum: ['none', 'called', 'messaged_waiting', 'answered'],
    default: 'none',
  })
  contactFollowUpStatus?: 'none' | 'called' | 'messaged_waiting' | 'answered';

  @Prop({ type: Date, default: null })
  contactFollowUpAt?: Date | null;

  @Prop({ type: Date, default: null })
  reviewedAt: Date | null;
}

export const FbIngestedCandidateSchema = SchemaFactory.createForClass(FbIngestedCandidate);
FbIngestedCandidateSchema.index({ status: 1, created_at: -1 });
FbIngestedCandidateSchema.index({ groupId: 1, status: 1 });

