import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FbGroupTargetDocument = FbGroupTarget & Document;

/**
 * Represents a monitored public Facebook real estate group with per-group
 * budget caps, live frequency telemetry, and cross-group overlap stats.
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class FbGroupTarget {
  @Prop({ required: true, unique: true })
  groupId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  url: string;

  @Prop({ default: '' })
  fbActivityNote: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 10, min: 1, max: 200 })
  scrapeLimitPer30Min: number;

  @Prop({ type: [String], default: [] })
  recentPostIds: string[];

  // Frequency & coverage telemetry
  @Prop({ default: 0 })
  measuredPostsPerDay: number;

  @Prop({ default: 0 })
  measuredPostsPer30Min: number;

  @Prop({ default: 0 })
  peakPostsPer30Min: number;

  @Prop({ type: Date, default: null })
  lastRunAt: Date | null;

  @Prop({ default: 0 })
  lastRunFetchedCount: number;

  @Prop({ default: 0 })
  lastRunNewCount: number;

  @Prop({ default: true })
  lastRunCapturedAll: boolean;

  @Prop({ default: 0 })
  missedWindowAlerts: number;

  // Yield & deduplication counters
  @Prop({ default: 0 })
  totalFetched: number;

  @Prop({ default: 0 })
  uniqueAccepted: number;

  @Prop({ default: 0 })
  approvedCount: number;

  @Prop({ default: 0 })
  rejectedCount: number;

  @Prop({ default: 0 })
  duplicateSkipped: number;

  @Prop({ default: 0 })
  landSkipped: number;

  @Prop({ default: 0 })
  videoOnlySkipped: number;

  @Prop({ default: 0 })
  spamSkipped: number;

  @Prop({ type: Map, of: Number, default: {} })
  overlapByGroup: Map<string, number>;
}

export const FbGroupTargetSchema = SchemaFactory.createForClass(FbGroupTarget);
FbGroupTargetSchema.index({ isActive: 1 });

