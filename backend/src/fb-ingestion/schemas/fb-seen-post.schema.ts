import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FbSeenPostDocument = FbSeenPost & Document;

/**
 * Deduplication ledger tracking every scraped post fingerprint across groups
 * so cross-posted listings skip Gemini/GCS and contribute to group overlap metrics.
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class FbSeenPost {
  @Prop({ required: true, unique: true })
  canonicalPostId: string;

  @Prop({ type: [String], default: [] })
  rawPostIds: string[];

  @Prop({ required: true })
  contentHash: string;

  @Prop({ default: '' })
  normalizedText: string;

  @Prop({ type: [String], default: [] })
  phones: string[];

  @Prop({ required: true })
  firstGroupId: string;

  @Prop({ default: '' })
  firstGroupName: string;

  @Prop({ type: [String], default: [] })
  seenInGroupIds: string[];

  @Prop({ type: Date, default: Date.now })
  earliestDatePosted: Date;

  @Prop({ type: Date, default: Date.now, expires: 60 * 60 * 24 * 60 })
  expiresAt: Date;
}

export const FbSeenPostSchema = SchemaFactory.createForClass(FbSeenPost);
FbSeenPostSchema.index({ contentHash: 1 });
FbSeenPostSchema.index({ phones: 1 });
FbSeenPostSchema.index({ rawPostIds: 1 });

