import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FbIngestionConfigDocument = FbIngestionConfig & Document;

export interface FbRunProgress {
  current: number;
  total: number;
  percent?: number;
  etaSeconds?: number | null;
  unit?: 'percent' | 'posts';
  detail?: string | null;
}

export interface FbBackfillJobState {
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  phase: string;
  message: string | null;
  current: number;
  total: number;
  percent: number;
  etaSeconds: number | null;
  currentItemTitle?: string | null;
  scanned: number;
  migratedScraped: number;
  markedOrganic: number;
  markedAdminManual: number;
  avatarsPersisted: number;
  errorCount: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
}

/**
 * Singleton runtime configuration and scheduler state for Facebook ingestion.
 */
@Schema({ timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } })
export class FbIngestionConfig {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ default: false })
  isLive: boolean;

  @Prop({ default: 30, min: 5, max: 1440 })
  pollIntervalMinutes: number;

  @Prop({ default: true })
  onlyActiveHours: boolean;

  @Prop({ default: 6, min: 0, max: 23 })
  activeHourStart: number;

  @Prop({ default: 22, min: 1, max: 24 })
  activeHourEnd: number;

  @Prop({ default: 'gemini-3.5-flash-lite' })
  geminiModel: string;

  @Prop({ default: 'idle' })
  lastPollStatus: string;

  @Prop({ type: Date, default: null })
  lastPollStartedAt: Date | null;

  @Prop({ type: Date, default: null })
  lastPollFinishedAt: Date | null;

  @Prop({ type: String, default: null })
  lastSnapshotId: string | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: String, default: 'idle' })
  lastPollPhase: string;

  @Prop({ type: String, default: null })
  lastPollMessage: string | null;

  @Prop({ type: Object, default: null })
  lastRunProgress: FbRunProgress | null;

  @Prop({ type: Object, default: null })
  lastRunSummary: Record<string, any> | null;

  @Prop({ type: Object, default: null })
  backfillJob: FbBackfillJobState | null;

  @Prop({ default: 0 })
  totalRuns: number;

  @Prop({ default: 0 })
  totalBrightDataRecords: number;

  @Prop({ default: 0 })
  totalGeminiCalls: number;
}

export const FbIngestionConfigSchema = SchemaFactory.createForClass(FbIngestionConfig);
