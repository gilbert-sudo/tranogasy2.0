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

export type FbSchedulerStatus =
  | 'paused'
  | 'waiting_next_cycle'
  | 'due_now'
  | 'waiting_pending_snapshot'
  | 'running'
  | 'importing_snapshot'
  | 'sleeping_night'
  | 'no_active_groups';

export type FbRunTrigger = 'scheduled' | 'manual' | 'snapshot';

export interface FbPendingSnapshotEntry {
  snapshotId: string;
  triggeredAt: string;
  groupsCount: number;
  groupNames?: string[];
  lastStatus?: string | null;
  lastRecords?: number | null;
  lastCheckedAt?: string | null;
}

export interface FbActivityLogEntry {
  id: string;
  at: string;
  kind:
    | 'scheduler_started'
    | 'scheduler_paused'
    | 'scheduler_sleep'
    | 'run_started'
    | 'run_completed'
    | 'run_cancelled'
    | 'run_error'
    | 'config_changed'
    | 'groups_warning';
  trigger?: FbRunTrigger | 'system';
  title: string;
  detail?: string | null;
  snapshotId?: string | null;
  durationSec?: number | null;
  stats?: {
    rawRecords?: number;
    candidatesCreated?: number;
    autoApprovedCount?: number;
    duplicateSkipped?: number;
    geminiCalls?: number;
  } | null;
}

export interface FbRunHistoryEntry {
  id: string;
  trigger: FbRunTrigger;
  status: 'completed' | 'cancelled' | 'error';
  snapshotId: string | null;
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  totalRawRecords: number;
  candidatesCreated: number;
  autoApprovedCount: number;
  duplicateSkipped: number;
  landSkipped: number;
  videoOnlySkipped: number;
  spamSkipped: number;
  geminiCalls: number;
  placesApiCalls?: number;
  placesCacheHits?: number;
  errorMessage?: string | null;
}

export interface FbSchedulerDiagnostics {
  state: FbSchedulerStatus;
  headline: string;
  detail: string;
  serverTimeIso: string;
  tanaHour: number;
  tanaMinute: number;
  tanaTimeLabel: string;
  isWithinActiveHours: boolean;
  activeGroupsCount: number;
  totalGroupsCount: number;
  nextScheduledRunAt: string | null;
  secondsUntilNextRun: number | null;
  cycleDurationSeconds: number;
  cycleElapsedSeconds: number;
  lastRunTrigger: FbRunTrigger | null;
  lastSchedulerTickAt: string | null;
  schedulerHeartbeatAgeSeconds: number | null;
  schedulerLoopAlive: boolean;
  schedulerTickIntervalSeconds: number;
}

export interface FbActiveRunState {
  ownerId: string;
  ownerHost: string;
  ownerPid: number;
  heartbeatAt: Date;
  status: 'running' | 'importing_snapshot';
  phase: string;
  message: string | null;
  snapshotId: string | null;
  startedAt: Date;
  progress: FbRunProgress | null;
  trigger?: FbRunTrigger;
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

export interface FbActiveBackfillState extends FbBackfillJobState {
  ownerId?: string;
  ownerHost?: string;
  ownerPid?: number;
  heartbeatAt?: string;
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

  @Prop({ default: true })
  autoApproveEnabled: boolean;

  @Prop({ default: 75, min: 40, max: 98 })
  autoApproveMinQualityScore: number;

  @Prop({ default: true })
  autoApproveAllowEstimatedPrice: boolean;

  @Prop({ default: 0 })
  totalAutoApproved: number;

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

  @Prop({ type: Object, default: null })
  activeRun?: FbActiveRunState | null;

  @Prop({ type: Object, default: null })
  activeBackfill?: FbActiveBackfillState | null;

  @Prop({ default: 0 })
  totalRuns: number;

  @Prop({ default: 0 })
  totalBrightDataRecords: number;

  @Prop({ default: 0 })
  totalGeminiCalls: number;

  @Prop({ type: String, default: null })
  lastRunTrigger?: FbRunTrigger | null;

  @Prop({ type: Date, default: null })
  lastSchedulerTickAt?: Date | null;

  @Prop({ type: String, default: null })
  lastSchedulerStatus?: string | null;

  @Prop({ type: String, default: null })
  lastSchedulerNote?: string | null;

  @Prop({ type: [Object], default: [] })
  activityLog?: FbActivityLogEntry[];

  @Prop({ type: [Object], default: [] })
  runHistory?: FbRunHistoryEntry[];

  @Prop({ type: [Object], default: [] })
  pendingSnapshots?: FbPendingSnapshotEntry[];
}

export const FbIngestionConfigSchema = SchemaFactory.createForClass(FbIngestionConfig);
