import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Model, Types } from 'mongoose';
import * as os from 'os';
import { normalizeMalagasyPhone } from '../common/phone.util';
import {
  getRequiredMissingSpecs,
  isCommercialHouseType,
  normalizeHouseType,
} from '../common/property-types.util';
import { sanitizePropertyForViewer } from '../common/property-sanitizer.util';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Property, PropertyDocument } from '../properties/schemas/property.schema';
import { PropertiesService } from '../properties/properties.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  BrightDataSnapshotTimeoutError,
  FbBrightDataService,
} from './fb-brightdata.service';
import { FbCityMatcherService } from './fb-city-matcher.service';
import {
  BrightDataPostRecord,
  computeTextSimilarity,
  extractFbUserId,
  extractGroupIdFromUrl,
  normalizeFbProfileUrl,
  UnwrappedFbPost,
} from './fb-dedup.util';
import { unwrapBrightDataPost } from './fb-dedup.util';
import { FbGcsService } from './fb-gcs.service';
import {
  AccessVerificationState,
  computePropertyQualityScore,
  deriveFeatureVerification,
  estimatePropertyArea,
  estimatePropertyPriceAriary,
  extractAgencyFees,
  FeatureVerificationMap,
  getMissingFeatureVerificationFields,
  hasKnownElectricitySupply,
  hasKnownWaterSupply,
  mergeGeminiAndDeterministicFeatures,
  normalizePreservingLayout,
  preserveDescriptionLayout,
  resolveResidentialRoomDefaults,
} from './fb-feature-analyzer.util';
import { FbGeminiService, PROPERTY_FEATURE_KEYS } from './fb-gemini.service';
import { FbPlacesService } from './fb-places.service';
import { INITIAL_FB_GROUP_TARGETS } from './fb-seed.data';
import {
  FbGroupTarget,
  FbGroupTargetDocument,
} from './schemas/fb-group-target.schema';
import {
  FbIngestedCandidate,
  FbIngestedCandidateDocument,
} from './schemas/fb-ingested-candidate.schema';
import {
  FbActiveBackfillState,
  FbActiveRunState,
  FbActivityLogEntry,
  FbBackfillJobState,
  FbIngestionConfig,
  FbIngestionConfigDocument,
  FbPendingSnapshotEntry,
  FbRunHistoryEntry,
  FbRunProgress,
  FbRunTrigger,
  FbSchedulerDiagnostics,
  FbSchedulerStatus,
} from './schemas/fb-ingestion-config.schema';
import { FbSeenPost, FbSeenPostDocument } from './schemas/fb-seen-post.schema';

const RUN_HEARTBEAT_INTERVAL_MS = 15_000;
const RUN_STALE_LEASE_MS = 120_000;
const SCHEDULER_TICK_INTERVAL_MS = 15_000;
const MAX_GROUPS_PER_SNAPSHOT = 7;
const SINGLE_BATCH_WAIT_TIMEOUT_MS = 900_000; // 15 min for <= 7 groups
const MULTI_BATCH_WAIT_TIMEOUT_MS = 600_000; // 10 min per <= 7-group batch
const PENDING_SNAPSHOT_CHECK_INTERVAL_MS = 45_000;
const PENDING_SNAPSHOT_TTL_MS = 35 * 60_000; // 35 min max auto-recovery window

export interface RunSummary {
  snapshotId: string;
  totalRawRecords: number;
  unwrappedCount: number;
  videoOnlySkipped: number;
  duplicateSkipped: number;
  crossGroupOverlaps: number;
  landSkipped: number;
  spamSkipped: number;
  candidatesCreated: number;
  autoApprovedCount?: number;
  geminiCalls: number;
  placesApiCalls?: number;
  placesCacheHits?: number;
  errors: string[];
}

@Injectable()
export class FbIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FbIngestionService.name);
  private readonly ownerHost = os.hostname();
  private readonly ownerPid = process.pid;
  private readonly instanceId = `${this.ownerHost}:${this.ownerPid}:${crypto.randomUUID()}`;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private precisionTriggerTimer: NodeJS.Timeout | null = null;
  private isSchedulerLoopStarted = false;
  private lastHeartbeatWriteMs = 0;
  private lastPendingCheckMs = 0;
  private lastSchedulerDecisionLogged: string | null = null;
  private runHeartbeatTimer: NodeJS.Timeout | null = null;
  private backfillHeartbeatTimer: NodeJS.Timeout | null = null;
  private isRunInProgress = false;
  private activeRunMeta: {
    trigger: FbRunTrigger;
    startedAtMs: number;
    snapshotId: string | null;
  } | null = null;
  private runAbortController: AbortController | null = null;
  private isRunCancelRequested = false;
  private isBackfillInProgress = false;
  private isBackfillCancelRequested = false;

  constructor(
    @InjectModel(FbIngestionConfig.name)
    private configModel: Model<FbIngestionConfigDocument>,
    @InjectModel(FbGroupTarget.name)
    private groupModel: Model<FbGroupTargetDocument>,
    @InjectModel(FbSeenPost.name)
    private seenModel: Model<FbSeenPostDocument>,
    @InjectModel(FbIngestedCandidate.name)
    private candidateModel: Model<FbIngestedCandidateDocument>,
    @InjectModel(Property.name)
    private propertyModel: Model<PropertyDocument>,
    @InjectModel(City.name)
    private cityModel: Model<CityDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private readonly propertiesService: PropertiesService,
    private readonly brightDataService: FbBrightDataService,
    private readonly geminiService: FbGeminiService,
    private readonly cityMatcherService: FbCityMatcherService,
    private readonly gcsService: FbGcsService,
    private readonly configService: ConfigService,
    @Optional() private readonly fbPlacesService?: FbPlacesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBootstrapped();
    await this.recoverOrphanedJobsOnStartup();
    this.isSchedulerLoopStarted = true;
    // Check every 15s (plus precision timer near boundary) whether the poll interval has elapsed while isLive=true.
    this.schedulerTimer = setInterval(() => {
      void this.schedulerTick();
    }, SCHEDULER_TICK_INTERVAL_MS);
    this.schedulerTimer.unref?.();
    const initialKick = setTimeout(() => {
      void this.schedulerTick();
    }, 1500);
    initialKick.unref?.();
    this.logger.log('FbIngestion scheduler initialized (15s heartbeat; starts PAUSED unless isLive=true in DB)');
  }

  private isLocalOwnerProcessDead(ownerHost?: string | null, ownerPid?: number | null): boolean {
    if (!ownerHost || ownerHost !== this.ownerHost) return false;
    if (typeof ownerPid !== 'number' || !Number.isFinite(ownerPid) || ownerPid <= 0) return false;
    if (ownerPid === this.ownerPid) return false;
    try {
      process.kill(ownerPid, 0);
      return false;
    } catch (err) {
      return (err as NodeJS.ErrnoException)?.code === 'ESRCH';
    }
  }

  private isLeaseActive(opts: {
    ownerId?: string | null;
    ownerHost?: string | null;
    ownerPid?: number | null;
    heartbeatAt?: Date | string | null;
    updatedAt?: Date | string | null;
    localInProgress: boolean;
  }): boolean {
    if (opts.ownerId && opts.ownerId === this.instanceId) {
      return opts.localInProgress;
    }
    if (this.isLocalOwnerProcessDead(opts.ownerHost, opts.ownerPid)) {
      return false;
    }
    const rawTs = opts.heartbeatAt || opts.updatedAt;
    if (!rawTs) return false;
    const ms = new Date(rawTs).getTime();
    if (!Number.isFinite(ms)) return false;
    return Date.now() - ms < RUN_STALE_LEASE_MS;
  }

  private stripBackfillLeaseMetadata(
    job: FbActiveBackfillState | FbBackfillJobState,
  ): FbBackfillJobState {
    const clean = { ...(job as Record<string, any>) };
    delete clean.ownerId;
    delete clean.ownerHost;
    delete clean.ownerPid;
    delete clean.heartbeatAt;
    return clean as FbBackfillJobState;
  }

  private applyActiveStateOverlay<T extends Record<string, any>>(cfg: T): T {
    if (!cfg) return cfg;
    const mutable = cfg as Record<string, any>;
    const activeRun = mutable.activeRun as FbActiveRunState | null | undefined;
    if (
      activeRun &&
      (activeRun.status === 'running' || activeRun.status === 'importing_snapshot')
    ) {
      mutable.lastPollStatus = activeRun.status;
      if (activeRun.phase) mutable.lastPollPhase = activeRun.phase;
      if (activeRun.message !== undefined) mutable.lastPollMessage = activeRun.message;
      if (activeRun.progress !== undefined) mutable.lastRunProgress = activeRun.progress;
      if (activeRun.snapshotId) mutable.lastSnapshotId = activeRun.snapshotId;
      if (activeRun.startedAt) mutable.lastPollStartedAt = activeRun.startedAt;
      if (activeRun.trigger) mutable.lastRunTrigger = activeRun.trigger;
      mutable.lastError = null;
    }

    const activeBackfill = mutable.activeBackfill as FbActiveBackfillState | null | undefined;
    if (activeBackfill && activeBackfill.status === 'running') {
      mutable.backfillJob = this.stripBackfillLeaseMetadata(activeBackfill);
    }
    return cfg;
  }

  private startRunHeartbeat(): void {
    this.stopRunHeartbeat();
    this.runHeartbeatTimer = setInterval(() => {
      if (!this.isRunInProgress) return;
      void this.configModel
        .updateOne(
          { key: 'default', 'activeRun.ownerId': this.instanceId },
          { $set: { 'activeRun.heartbeatAt': new Date() } },
        )
        .catch(() => undefined);
    }, RUN_HEARTBEAT_INTERVAL_MS);
    this.runHeartbeatTimer.unref?.();
  }

  private stopRunHeartbeat(): void {
    if (this.runHeartbeatTimer) {
      clearInterval(this.runHeartbeatTimer);
      this.runHeartbeatTimer = null;
    }
  }

  private startBackfillHeartbeat(): void {
    this.stopBackfillHeartbeat();
    this.backfillHeartbeatTimer = setInterval(() => {
      if (!this.isBackfillInProgress) return;
      const nowIso = new Date().toISOString();
      void this.configModel
        .updateOne(
          { key: 'default', 'activeBackfill.ownerId': this.instanceId },
          {
            $set: {
              'activeBackfill.heartbeatAt': nowIso,
              'activeBackfill.updatedAt': nowIso,
            },
          },
        )
        .catch(() => undefined);
    }, RUN_HEARTBEAT_INTERVAL_MS);
    this.backfillHeartbeatTimer.unref?.();
  }

  private stopBackfillHeartbeat(): void {
    if (this.backfillHeartbeatTimer) {
      clearInterval(this.backfillHeartbeatTimer);
      this.backfillHeartbeatTimer = null;
    }
  }

  private async recoverOrphanedJobsIfNeeded(
    cfg?: FbIngestionConfigDocument | Record<string, any> | null,
  ): Promise<boolean> {
    try {
      const target = cfg || (await this.configModel.findOne({ key: 'default' }).lean());
      if (!target) return false;

      const patch: Record<string, any> = {};
      const filter: Record<string, any> = { key: 'default' };
      const now = new Date();
      const targetUpdatedAt = (target as Record<string, any>).updated_at as
        | Date
        | string
        | undefined;

      const activeRun = target.activeRun as FbActiveRunState | null | undefined;
      if (
        activeRun &&
        (activeRun.status === 'running' || activeRun.status === 'importing_snapshot')
      ) {
        const leaseStillAlive = this.isLeaseActive({
          ownerId: activeRun.ownerId,
          ownerHost: activeRun.ownerHost,
          ownerPid: activeRun.ownerPid,
          heartbeatAt: activeRun.heartbeatAt,
          updatedAt: targetUpdatedAt,
          localInProgress: this.isRunInProgress,
        });
        if (!leaseStillAlive) {
          const msg =
            'Opération interrompue (aucun processus actif sur le serveur). Vous pouvez relancer la collecte.';
          patch.activeRun = null;
          patch.lastPollStatus = 'error';
          patch.lastPollPhase = 'interrupted';
          patch.lastPollMessage = msg;
          patch.lastError = msg;
          patch.lastPollFinishedAt = now;
          patch.lastRunProgress = null;
          if (activeRun.ownerId) {
            filter['activeRun.ownerId'] = activeRun.ownerId;
          }
          if (
            activeRun.snapshotId &&
            (activeRun.phase === 'waiting_brightdata' ||
              activeRun.phase === 'downloading_snapshot')
          ) {
            const existingPending = this.filterActivePendingSnapshots(
              target.pendingSnapshots,
              now.getTime(),
            );
            if (!existingPending.some((p) => p.snapshotId === activeRun.snapshotId)) {
              patch.pendingSnapshots = [
                ...existingPending,
                {
                  snapshotId: activeRun.snapshotId,
                  triggeredAt: new Date(activeRun.startedAt || now).toISOString(),
                  groupsCount: 0,
                  lastStatus: 'running',
                  lastCheckedAt: now.toISOString(),
                },
              ].slice(-6);
            }
          }
          await this.appendActivityLog({
            kind: 'run_error',
            trigger: activeRun.trigger || 'system',
            title: 'Collecte interrompue (redémarrage serveur)',
            detail: activeRun.snapshotId
              ? `${msg} Snapshot ${activeRun.snapshotId} conservé pour récupération gratuite.`
              : msg,
            snapshotId: activeRun.snapshotId || null,
          });
        }
      } else if (
        !this.isRunInProgress &&
        (target.lastPollStatus === 'running' || target.lastPollStatus === 'importing_snapshot')
      ) {
        const legacyTs = targetUpdatedAt || target.lastPollStartedAt;
        const legacyMs = legacyTs ? new Date(legacyTs).getTime() : NaN;
        const legacyRecentlyUpdated =
          Number.isFinite(legacyMs) && Date.now() - legacyMs < RUN_STALE_LEASE_MS;
        if (!legacyRecentlyUpdated) {
          const msg =
            'Opération interrompue (aucun processus actif sur le serveur). Vous pouvez relancer la collecte.';
          patch.lastPollStatus = 'error';
          patch.lastPollPhase = 'interrupted';
          patch.lastPollMessage = msg;
          patch.lastError = msg;
          patch.lastPollFinishedAt = now;
          patch.lastRunProgress = null;
        }
      }

      const activeBackfill = target.activeBackfill as FbActiveBackfillState | null | undefined;
      if (activeBackfill && activeBackfill.status === 'running') {
        const backfillAlive = this.isLeaseActive({
          ownerId: activeBackfill.ownerId,
          ownerHost: activeBackfill.ownerHost,
          ownerPid: activeBackfill.ownerPid,
          heartbeatAt: activeBackfill.heartbeatAt,
          updatedAt: activeBackfill.updatedAt || targetUpdatedAt,
          localInProgress: this.isBackfillInProgress,
        });
        if (!backfillAlive) {
          const msg =
            'Migration interrompue (aucun processus actif sur le serveur). Relancez la migration sans risque (opération idempotente).';
          patch.activeBackfill = null;
          patch.backfillJob = {
            ...this.stripBackfillLeaseMetadata(activeBackfill),
            status: 'error',
            phase: 'interrupted',
            message: msg,
            lastError: msg,
            etaSeconds: null,
            finishedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          if (activeBackfill.ownerId) {
            filter['activeBackfill.ownerId'] = activeBackfill.ownerId;
          }
        }
      } else if (!this.isBackfillInProgress && target.backfillJob?.status === 'running') {
        const legacyBfTs =
          target.backfillJob.updatedAt || targetUpdatedAt || target.backfillJob.startedAt;
        const legacyBfMs = legacyBfTs ? new Date(legacyBfTs).getTime() : NaN;
        const legacyBfRecent =
          Number.isFinite(legacyBfMs) && Date.now() - legacyBfMs < RUN_STALE_LEASE_MS;
        if (!legacyBfRecent) {
          const msg =
            'Migration interrompue (aucun processus actif sur le serveur). Relancez la migration sans risque (opération idempotente).';
          patch.backfillJob = {
            ...target.backfillJob,
            status: 'error',
            phase: 'interrupted',
            message: msg,
            lastError: msg,
            etaSeconds: null,
            finishedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
        }
      }

      if (Object.keys(patch).length > 0) {
        await this.configModel.updateOne(filter, { $set: patch });
        this.logger.warn(`Recovered orphaned background state: ${Object.keys(patch).join(', ')}`);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.warn(`Failed orphaned job recovery check: ${(err as Error).message}`);
      return false;
    }
  }

  private async recoverOrphanedJobsOnStartup(): Promise<void> {
    await this.recoverOrphanedJobsIfNeeded();
  }

  onModuleDestroy(): void {
    this.isSchedulerLoopStarted = false;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.precisionTriggerTimer) {
      clearTimeout(this.precisionTriggerTimer);
      this.precisionTriggerTimer = null;
    }
    this.stopRunHeartbeat();
    this.stopBackfillHeartbeat();
    if (this.isRunInProgress) {
      this.isRunCancelRequested = true;
      this.runAbortController?.abort(new Error('Arrêt du serveur en cours.'));
      const msg =
        'Opération interrompue (redémarrage du serveur). Vous pouvez relancer la collecte.';
      void this.configModel
        .updateOne(
          { key: 'default', 'activeRun.ownerId': this.instanceId },
          {
            $set: {
              activeRun: null,
              lastPollStatus: 'error',
              lastPollPhase: 'interrupted',
              lastPollMessage: msg,
              lastError: msg,
              lastPollFinishedAt: new Date(),
              lastRunProgress: null,
            },
          },
        )
        .catch(() => undefined);
    }
  }

  private async ensureBootstrapped(): Promise<void> {
    await this.ensureAdminPreseeded();

    const existingConfig = await this.configModel.findOne({ key: 'default' }).lean();
    if (!existingConfig) {
      await this.configModel.create({
        key: 'default',
        isLive: false,
        pollIntervalMinutes: 30,
        onlyActiveHours: true,
        activeHourStart: 6,
        activeHourEnd: 22,
        geminiModel: 'gemini-3-flash-preview',
        lastPollStatus: 'idle',
      });
    }

    const groupCount = await this.groupModel.countDocuments();
    if (groupCount === 0) {
      await this.groupModel.insertMany(
        INITIAL_FB_GROUP_TARGETS.map((g) => ({
          groupId: g.groupId,
          name: g.name,
          url: g.url,
          fbActivityNote: g.csvInfo,
          isActive: g.isActive,
          scrapeLimitPer30Min: g.scrapeLimitPer30Min,
          measuredPostsPerDay: g.estimatedPostsPerDay,
        })),
      );
      this.logger.log(`Seeded ${INITIAL_FB_GROUP_TARGETS.length} initial Facebook group targets`);
    }
  }

  /**
   * Idempotently ensures a usable admin account exists with both phone & email + password.
   */
  private async ensureAdminPreseeded(): Promise<void> {
    const phone =
      this.configService.get<string>('ADMIN_PRESEED_PHONE')?.trim() || '0340000001';
    const email =
      (this.configService.get<string>('ADMIN_PRESEED_EMAIL')?.trim() || 'admin@tranogasy.mg').toLowerCase();
    const username =
      this.configService.get<string>('ADMIN_PRESEED_USERNAME')?.trim() || 'Admin TranoGasy';
    const plainPassword =
      this.configService.get<string>('ADMIN_PRESEED_PASSWORD')?.trim();
    if (!plainPassword) {
      this.logger.warn(
        'ADMIN_PRESEED_PASSWORD is not configured in .env; skipping admin password pre-seed.',
      );
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const altPhone = cleanPhone.startsWith('0') ? cleanPhone.slice(1) : `0${cleanPhone}`;

    const existing = await this.userModel.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: altPhone },
        { email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      ],
    });

    if (!existing) {
      const salt = await bcrypt.genSalt(5);
      const hashedPassword = await bcrypt.hash(plainPassword, salt);
      await this.userModel.create({
        username,
        phone: cleanPhone,
        email,
        password: hashedPassword,
        role: 'admin',
        balance: 0,
        created_at: new Date(),
        lastConnectedAt: new Date(),
      });
      this.logger.log(`Pre-seeded admin account (${cleanPhone} / ${email})`);
      return;
    }

    let modified = false;
    if (existing.role !== 'admin' && existing.role !== 'superadmin') {
      existing.role = 'admin';
      modified = true;
    }
    if (!existing.password) {
      const salt = await bcrypt.genSalt(5);
      existing.password = await bcrypt.hash(plainPassword, salt);
      modified = true;
    }
    if (!existing.phone) {
      existing.phone = cleanPhone;
      modified = true;
    }
    if (!existing.email) {
      existing.email = email;
      modified = true;
    }
    if (modified) {
      await existing.save();
    }
  }

  /**
   * Authenticates an admin using phone number or email + password (for phone-only OTP bypass on admin console).
   */
  async adminLogin(identifier: string, password: string): Promise<{ message: string; user: any }> {
    const cleanId = (identifier || '').trim();
    const cleanPassword = (password || '').trim();
    if (!cleanId || !cleanPassword) {
      throw new UnauthorizedException('Identifiant et mot de passe requis');
    }

    const digits = cleanId.replace(/\D/g, '');
    const normalizedDigits = digits.startsWith('261') && digits.length >= 12 ? `0${digits.slice(3)}` : digits;
    const altPhone = normalizedDigits.startsWith('0')
      ? normalizedDigits.slice(1)
      : `0${normalizedDigits}`;
    const emailRegex = new RegExp(`^${cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const queryConditions: any[] = [{ email: emailRegex }];
    if (digits.length >= 8) {
      queryConditions.push({ phone: cleanId }, { phone: normalizedDigits }, { phone: altPhone });
    }

    const user = await this.userModel.findOne({ $or: queryConditions });
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      throw new UnauthorizedException('Compte administrateur introuvable');
    }

    if (!user.password) {
      throw new UnauthorizedException('Aucun mot de passe configuré pour ce compte');
    }

    const matches = await bcrypt.compare(cleanPassword, user.password);
    if (!matches) {
      throw new UnauthorizedException('Mot de passe administrateur incorrect');
    }

    user.lastConnectedAt = new Date();
    await user.save();

    const userObj = user.toObject() as Record<string, any>;
    delete userObj.password;
    delete userObj.backUpCode;

    return {
      message: 'Connexion administrateur réussie',
      user: userObj,
    };
  }

  private getMadagascarHour(nowMs = Date.now()): number {
    return this.computeMadagascarTimeParts(nowMs).tanaHour;
  }

  private computeMadagascarTimeParts(
    nowMs = Date.now(),
    activeHourStart = 6,
    activeHourEnd = 22,
  ): {
    tanaHour: number;
    tanaMinute: number;
    tanaTimeLabel: string;
    nextWakeupUtcMs: number;
  } {
    const tanaOffsetMs = 3 * 3600_000;
    const tanaDate = new Date(nowMs + tanaOffsetMs);
    const tanaHour = tanaDate.getUTCHours();
    const tanaMinute = tanaDate.getUTCMinutes();
    const tanaTimeLabel = `${String(tanaHour).padStart(2, '0')}:${String(tanaMinute).padStart(2, '0')} (UTC+3)`;

    const dayOffset = tanaHour >= activeHourEnd ? 1 : 0;
    const tanaWakeupMs = Date.UTC(
      tanaDate.getUTCFullYear(),
      tanaDate.getUTCMonth(),
      tanaDate.getUTCDate() + dayOffset,
      activeHourStart,
      0,
      0,
      0,
    );
    return {
      tanaHour,
      tanaMinute,
      tanaTimeLabel,
      nextWakeupUtcMs: tanaWakeupMs - tanaOffsetMs,
    };
  }

  private schedulePrecisionTick(delayMs: number): void {
    if (this.precisionTriggerTimer) {
      clearTimeout(this.precisionTriggerTimer);
      this.precisionTriggerTimer = null;
    }
    const clampedDelay = Math.max(400, Math.min(delayMs, 70_000));
    this.precisionTriggerTimer = setTimeout(() => {
      this.precisionTriggerTimer = null;
      void this.schedulerTick();
    }, clampedDelay);
    this.precisionTriggerTimer.unref?.();
  }

  private async appendActivityLog(
    entry: Omit<FbActivityLogEntry, 'id' | 'at'> & { at?: string; id?: string },
  ): Promise<void> {
    try {
      const fullEntry: FbActivityLogEntry = {
        id: entry.id || crypto.randomUUID(),
        at: entry.at || new Date().toISOString(),
        kind: entry.kind,
        trigger: entry.trigger,
        title: entry.title,
        detail: entry.detail ?? null,
        snapshotId: entry.snapshotId ?? null,
        durationSec: entry.durationSec ?? null,
        stats: entry.stats ?? null,
      };
      await this.configModel.updateOne(
        { key: 'default' },
        {
          $push: {
            activityLog: {
              $each: [fullEntry],
              $slice: -30,
            },
          },
        } as any,
      );
    } catch {
      // Telemetry log writes must never interrupt ingestion execution
    }
  }

  private async appendRunHistory(entry: FbRunHistoryEntry): Promise<void> {
    try {
      await this.configModel.updateOne(
        { key: 'default' },
        {
          $push: {
            runHistory: {
              $each: [entry],
              $slice: -12,
            },
          },
        } as any,
      );
    } catch {
      // Telemetry history writes must never interrupt ingestion execution
    }
  }

  private filterActivePendingSnapshots(
    rawList: unknown,
    nowMs = Date.now(),
  ): FbPendingSnapshotEntry[] {
    if (!Array.isArray(rawList)) return [];
    return rawList.filter((item): item is FbPendingSnapshotEntry => {
      if (!item || typeof item.snapshotId !== 'string' || !item.snapshotId.trim()) {
        return false;
      }
      const ts = item.triggeredAt ? new Date(item.triggeredAt).getTime() : NaN;
      if (!Number.isFinite(ts)) return true;
      return nowMs - ts <= PENDING_SNAPSHOT_TTL_MS;
    });
  }

  private async addPendingSnapshot(entry: FbPendingSnapshotEntry): Promise<void> {
    try {
      const doc = await this.configModel.findOne({ key: 'default' }).lean();
      const existing = this.filterActivePendingSnapshots(doc?.pendingSnapshots);
      const filtered = existing.filter((p) => p.snapshotId !== entry.snapshotId);
      const next = [...filtered, entry].slice(-6);
      await this.configModel.updateOne(
        { key: 'default' },
        { $set: { pendingSnapshots: next } },
      );
    } catch {
      // Never abort run cleanup if pending snapshot persistence fails
    }
  }

  private async removePendingSnapshot(snapshotId: string): Promise<void> {
    try {
      const doc = await this.configModel.findOne({ key: 'default' }).lean();
      const raw = Array.isArray(doc?.pendingSnapshots) ? doc.pendingSnapshots : [];
      if (raw.length === 0) return;
      const next = this.filterActivePendingSnapshots(raw).filter(
        (p) => p.snapshotId !== snapshotId,
      );
      if (next.length !== raw.length) {
        await this.configModel.updateOne(
          { key: 'default' },
          { $set: { pendingSnapshots: next } },
        );
      }
    } catch {
      // Never abort run completion if pending snapshot cleanup fails
    }
  }

  private async updatePendingSnapshotMeta(
    snapshotId: string,
    patch: Partial<FbPendingSnapshotEntry>,
  ): Promise<void> {
    try {
      const doc = await this.configModel.findOne({ key: 'default' }).lean();
      const current = this.filterActivePendingSnapshots(doc?.pendingSnapshots);
      const idx = current.findIndex((p) => p.snapshotId === snapshotId);
      if (idx < 0) return;
      current[idx] = { ...current[idx], ...patch };
      await this.configModel.updateOne(
        { key: 'default' },
        { $set: { pendingSnapshots: current } },
      );
    } catch {
      // Ignore metadata update glitches
    }
  }

  private chunkArray<T>(items: T[], size: number): T[][] {
    const safeSize = Math.max(1, size);
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += safeSize) {
      out.push(items.slice(i, i + safeSize));
    }
    return out;
  }

  private mergeRunSummaries(summaries: RunSummary[], fallbackSnapshotId = ''): RunSummary {
    if (summaries.length === 1) return summaries[0];
    return summaries.reduce<RunSummary>(
      (acc, cur) => ({
        snapshotId: cur.snapshotId || acc.snapshotId,
        totalRawRecords: acc.totalRawRecords + (cur.totalRawRecords || 0),
        unwrappedCount: acc.unwrappedCount + (cur.unwrappedCount || 0),
        videoOnlySkipped: acc.videoOnlySkipped + (cur.videoOnlySkipped || 0),
        duplicateSkipped: acc.duplicateSkipped + (cur.duplicateSkipped || 0),
        crossGroupOverlaps: acc.crossGroupOverlaps + (cur.crossGroupOverlaps || 0),
        landSkipped: acc.landSkipped + (cur.landSkipped || 0),
        spamSkipped: acc.spamSkipped + (cur.spamSkipped || 0),
        candidatesCreated: acc.candidatesCreated + (cur.candidatesCreated || 0),
        autoApprovedCount: (acc.autoApprovedCount || 0) + (cur.autoApprovedCount || 0),
        geminiCalls: acc.geminiCalls + (cur.geminiCalls || 0),
        placesApiCalls: (acc.placesApiCalls || 0) + (cur.placesApiCalls || 0),
        placesCacheHits: (acc.placesCacheHits || 0) + (cur.placesCacheHits || 0),
        errors: [...acc.errors, ...(cur.errors || [])],
      }),
      {
        snapshotId: fallbackSnapshotId,
        totalRawRecords: 0,
        unwrappedCount: 0,
        videoOnlySkipped: 0,
        duplicateSkipped: 0,
        crossGroupOverlaps: 0,
        landSkipped: 0,
        spamSkipped: 0,
        candidatesCreated: 0,
        autoApprovedCount: 0,
        geminiCalls: 0,
        placesApiCalls: 0,
        placesCacheHits: 0,
        errors: [],
      },
    );
  }

  private computeSchedulerDiagnostics(
    cfg: Record<string, any>,
    activeGroupsCount: number,
    totalGroupsCount: number,
    nowMs = Date.now(),
  ): FbSchedulerDiagnostics {
    const activeStart = typeof cfg.activeHourStart === 'number' ? cfg.activeHourStart : 6;
    const activeEnd = typeof cfg.activeHourEnd === 'number' ? cfg.activeHourEnd : 22;
    const intervalMinutes = Math.max(5, Number(cfg.pollIntervalMinutes || 30));
    const intervalMs = intervalMinutes * 60_000;
    const cycleDurationSeconds = Math.round(intervalMs / 1000);

    const tana = this.computeMadagascarTimeParts(nowMs, activeStart, activeEnd);
    const isWithinActiveHours =
      !cfg.onlyActiveHours ||
      (activeStart < activeEnd
        ? tana.tanaHour >= activeStart && tana.tanaHour < activeEnd
        : true);

    const lastRunMs = cfg.lastPollStartedAt ? new Date(cfg.lastPollStartedAt).getTime() : 0;
    const validLastRunMs = Number.isFinite(lastRunMs) && lastRunMs > 0 ? lastRunMs : 0;
    const cycleElapsedSeconds =
      validLastRunMs > 0
        ? Math.max(0, Math.min(cycleDurationSeconds, Math.floor((nowMs - validLastRunMs) / 1000)))
        : 0;

    const tickMs = cfg.lastSchedulerTickAt ? new Date(cfg.lastSchedulerTickAt).getTime() : NaN;
    const activeRunHeartbeatMs = cfg.activeRun?.heartbeatAt
      ? new Date(cfg.activeRun.heartbeatAt).getTime()
      : NaN;
    const freshestBeatMs = Math.max(
      Number.isFinite(tickMs) ? tickMs : 0,
      Number.isFinite(activeRunHeartbeatMs) ? activeRunHeartbeatMs : 0,
    );
    const schedulerHeartbeatAgeSeconds =
      freshestBeatMs > 0 ? Math.max(0, Math.round((nowMs - freshestBeatMs) / 1000)) : null;
    const schedulerLoopAlive =
      this.isSchedulerLoopStarted ||
      (schedulerHeartbeatAgeSeconds !== null && schedulerHeartbeatAgeSeconds <= 90);
    const activePending = this.filterActivePendingSnapshots(cfg.pendingSnapshots, nowMs);

    let state: FbSchedulerStatus;
    let headline: string;
    let detail: string;
    let nextScheduledRunAt: string | null = null;
    let secondsUntilNextRun: number | null = null;

    if (cfg.lastPollStatus === 'running') {
      state = 'running';
      headline = 'Collecte Facebook & analyse IA en cours';
      detail = cfg.lastPollMessage || 'Traitement des publications Facebook en cours sur le serveur...';
    } else if (cfg.lastPollStatus === 'importing_snapshot') {
      state = 'importing_snapshot';
      headline = 'Importation de snapshot en cours';
      detail = cfg.lastPollMessage || 'Traitement du snapshot Bright Data en cours...';
    } else if (!cfg.isLive) {
      state = 'paused';
      headline = 'Scraper en pause';
      detail = 'Aucune collecte automatique ne sera déclenchée tant que le mode LIVE est désactivé (0 crédit consommé).';
    } else if (activeGroupsCount === 0) {
      state = 'no_active_groups';
      headline = 'En attente — Aucun groupe Facebook actif';
      detail = `Le mode LIVE est activé mais 0 / ${totalGroupsCount} groupe(s) sont actifs. Activez au moins un groupe cible.`;
    } else if (cfg.onlyActiveHours && !isWithinActiveHours) {
      state = 'sleeping_night';
      const targetMs = Math.max(
        tana.nextWakeupUtcMs,
        validLastRunMs > 0 ? validLastRunMs + intervalMs : 0,
      );
      secondsUntilNextRun = Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
      nextScheduledRunAt = new Date(targetMs).toISOString();
      headline = 'En veille nocturne (repos)';
      detail = `Hors heures actives Tana (${activeStart}h–${activeEnd}h UTC+3). Le scraper se repose jusqu'à ${String(activeStart).padStart(2, '0')}h00 heure Tana.`;
    } else if (activePending.length > 0) {
      state = 'waiting_pending_snapshot';
      const firstPending = activePending[0];
      headline = 'Récupération snapshot Bright Data en attente';
      detail = `Le snapshot ${firstPending.snapshotId} est encore en cours chez Bright Data. Vérification automatique gratuite toutes les 45s (aucun double crédit dépensé).`;
    } else {
      const targetMs = validLastRunMs > 0 ? validLastRunMs + intervalMs : nowMs;
      const remainingMs = targetMs - nowMs;
      if (remainingMs <= 0) {
        state = 'due_now';
        secondsUntilNextRun = 0;
        nextScheduledRunAt = new Date(nowMs).toISOString();
        headline = 'Cycle atteint — Déclenchement imminent';
        detail = `Le délai de ${intervalMinutes} min est écoulé. La collecte sur ${activeGroupsCount} groupe(s) actif(s) démarre dans quelques secondes.`;
      } else {
        state = 'waiting_next_cycle';
        secondsUntilNextRun = Math.ceil(remainingMs / 1000);
        nextScheduledRunAt = new Date(targetMs).toISOString();
        headline = 'En attente du prochain cycle';
        detail = `Boucle de ${intervalMinutes} min active sur ${activeGroupsCount} groupe(s). Le scraper patiente avant le prochain déclenchement Bright Data.`;
      }
    }

    return {
      state,
      headline,
      detail,
      serverTimeIso: new Date(nowMs).toISOString(),
      tanaHour: tana.tanaHour,
      tanaMinute: tana.tanaMinute,
      tanaTimeLabel: tana.tanaTimeLabel,
      isWithinActiveHours,
      activeGroupsCount,
      totalGroupsCount,
      nextScheduledRunAt,
      secondsUntilNextRun,
      cycleDurationSeconds,
      cycleElapsedSeconds,
      lastRunTrigger: (cfg.lastRunTrigger as FbRunTrigger) || null,
      lastSchedulerTickAt: freshestBeatMs > 0 ? new Date(freshestBeatMs).toISOString() : null,
      schedulerHeartbeatAgeSeconds,
      schedulerLoopAlive,
      schedulerTickIntervalSeconds: Math.round(SCHEDULER_TICK_INTERVAL_MS / 1000),
    };
  }

  private async checkAndRecoverOnePendingSnapshot(
    pending: FbPendingSnapshotEntry,
    trigger: FbRunTrigger = 'scheduled',
  ): Promise<{
    action: 'importing' | 'still_running' | 'failed';
    snapshotId: string;
    status?: string;
    records?: number | null;
    message: string;
  }> {
    if (typeof this.brightDataService?.getSnapshotProgress !== 'function') {
      return {
        action: 'still_running',
        snapshotId: pending.snapshotId,
        status: 'running',
        records: pending.lastRecords ?? null,
        message: `Vérification indisponible pour ${pending.snapshotId}.`,
      };
    }

    const progress = await this.brightDataService.getSnapshotProgress(pending.snapshotId);
    const checkedAt = new Date().toISOString();

    if (progress.status === 'ready') {
      await this.appendActivityLog({
        kind: 'run_started',
        trigger,
        title: `Snapshot ${pending.snapshotId} prêt — récupération gratuite`,
        detail: `Bright Data a terminé ${pending.snapshotId}. Téléchargement et filtrage sans dépense supplémentaire.`,
        snapshotId: pending.snapshotId,
      });

      if (trigger === 'manual') {
        await this.startImportInBackground(pending.snapshotId);
      } else {
        await this.markRunStarted(
          'importing_snapshot',
          'downloading_snapshot',
          `Récupération gratuite du snapshot ${pending.snapshotId}...`,
          pending.snapshotId,
          undefined,
          trigger,
        );
        await this.executeImportSnapshot(pending.snapshotId);
      }

      return {
        action: 'importing',
        snapshotId: pending.snapshotId,
        status: 'ready',
        records: progress.records ?? null,
        message: `Snapshot ${pending.snapshotId} prêt — importation gratuite démarrée.`,
      };
    }

    if (progress.status === 'failed' || progress.status === 'canceled') {
      await this.removePendingSnapshot(pending.snapshotId);
      const msg = `Bright Data a terminé ${pending.snapshotId} avec le statut : ${progress.status}.`;
      await this.appendActivityLog({
        kind: 'run_error',
        trigger: 'system',
        title: `Snapshot ${pending.snapshotId} ${progress.status}`,
        detail: msg,
        snapshotId: pending.snapshotId,
      });
      return {
        action: 'failed',
        snapshotId: pending.snapshotId,
        status: progress.status,
        records: progress.records ?? null,
        message: msg,
      };
    }

    await this.updatePendingSnapshotMeta(pending.snapshotId, {
      lastStatus: progress.status,
      lastRecords: progress.records ?? null,
      lastCheckedAt: checkedAt,
    });
    const recNote =
      typeof progress.records === 'number' && progress.records > 0
        ? ` • ${progress.records} post(s) déjà collectés`
        : '';
    return {
      action: 'still_running',
      snapshotId: pending.snapshotId,
      status: progress.status,
      records: progress.records ?? null,
      message: `Bright Data prépare encore ${pending.snapshotId} (${progress.status}${recNote}). Réessayez dans 1–2 min.`,
    };
  }

  async recoverPendingSnapshot(snapshotId?: string) {
    const cfg = await this.getConfig();
    if (
      this.isRunInProgress ||
      cfg.lastPollStatus === 'running' ||
      cfg.lastPollStatus === 'importing_snapshot'
    ) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    const activePending = this.filterActivePendingSnapshots(cfg.pendingSnapshots);
    const targetEntry = snapshotId
      ? activePending.find((p) => p.snapshotId === snapshotId.trim()) || {
          snapshotId: snapshotId.trim(),
          triggeredAt: new Date().toISOString(),
          groupsCount: 0,
        }
      : activePending[0];

    if (!targetEntry) {
      throw new NotFoundException('Aucun snapshot en attente à récupérer');
    }

    return this.checkAndRecoverOnePendingSnapshot(targetEntry, 'manual');
  }

  async dismissPendingSnapshot(snapshotId: string) {
    const cleanId = snapshotId?.trim();
    if (cleanId) {
      await this.removePendingSnapshot(cleanId);
    }
    return this.getConfigWithDiagnostics();
  }

  private async schedulerTick(): Promise<void> {
    if (this.isRunInProgress) return;
    try {
      const config = await this.getConfig();
      if (
        config.lastPollStatus === 'running' ||
        config.lastPollStatus === 'importing_snapshot'
      ) {
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();
      const [activeGroupsCount, totalGroupsCount] =
        typeof (this.groupModel as any)?.countDocuments === 'function'
          ? await Promise.all([
              this.groupModel.countDocuments({ isActive: true }),
              this.groupModel.countDocuments({}),
            ])
          : [1, 1];

      const diag = this.computeSchedulerDiagnostics(
        config,
        activeGroupsCount,
        totalGroupsCount,
        nowMs,
      );

      const stateChanged = config.lastSchedulerStatus !== diag.state;
      if (stateChanged || nowMs - this.lastHeartbeatWriteMs >= 30_000) {
        this.lastHeartbeatWriteMs = nowMs;
        await this.configModel
          .updateOne(
            { key: 'default' },
            {
              $set: {
                lastSchedulerTickAt: now,
                lastSchedulerStatus: diag.state,
                lastSchedulerNote: diag.detail,
              },
            },
          )
          .catch(() => undefined);
      }

      if (stateChanged) {
        if (diag.state === 'sleeping_night' && this.lastSchedulerDecisionLogged !== 'sleeping_night') {
          this.lastSchedulerDecisionLogged = 'sleeping_night';
          await this.appendActivityLog({
            kind: 'scheduler_sleep',
            trigger: 'system',
            title: 'Mise en veille nocturne',
            detail: diag.detail,
          });
        } else if (
          diag.state === 'no_active_groups' &&
          this.lastSchedulerDecisionLogged !== 'no_active_groups'
        ) {
          this.lastSchedulerDecisionLogged = 'no_active_groups';
          await this.appendActivityLog({
            kind: 'groups_warning',
            trigger: 'system',
            title: 'Collecte impossible : aucun groupe actif',
            detail: diag.detail,
          });
        } else if (diag.state === 'waiting_next_cycle' || diag.state === 'paused') {
          this.lastSchedulerDecisionLogged = diag.state;
        }
      }

      if (!config.isLive || activeGroupsCount === 0) return;

      if (config.onlyActiveHours && !diag.isWithinActiveHours) {
        return;
      }

      const activePending = this.filterActivePendingSnapshots(config.pendingSnapshots, nowMs);
      if (activePending.length > 0) {
        if (nowMs - this.lastPendingCheckMs >= PENDING_SNAPSHOT_CHECK_INTERVAL_MS) {
          this.lastPendingCheckMs = nowMs;
          await this.checkAndRecoverOnePendingSnapshot(activePending[0], 'scheduled').catch(
            (err) => {
              this.logger.warn(
                `Pending snapshot check failed (${activePending[0].snapshotId}): ${(err as Error).message}`,
              );
            },
          );
        }
        // Do not trigger a redundant paid Bright Data job while a timed-out snapshot is still completing.
        return;
      }

      const lastRunMs = config.lastPollStartedAt
        ? new Date(config.lastPollStartedAt).getTime()
        : 0;
      const intervalMs = Math.max(5, config.pollIntervalMinutes) * 60_000;
      const remainingMs = lastRunMs > 0 ? lastRunMs + intervalMs - nowMs : 0;

      if (remainingMs > 0) {
        if (this.isSchedulerLoopStarted && remainingMs <= 65_000) {
          this.schedulePrecisionTick(remainingMs + 250);
        }
        return;
      }

      this.logger.log(
        `Scheduled poll triggered (interval=${config.pollIntervalMinutes}m, model=${config.geminiModel})`,
      );
      await this.runActiveGroupsInternal(undefined, intervalMs, 'scheduled');
    } catch (err) {
      if (err instanceof BadRequestException) {
        this.logger.debug(`Scheduler tick skipped: ${(err as Error).message}`);
        return;
      }
      this.logger.error(`Scheduler tick failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Config & Live Control
  // ---------------------------------------------------------------------------

  async getConfig(): Promise<FbIngestionConfigDocument> {
    await this.ensureBootstrapped();
    let cfg = await this.configModel.findOne({ key: 'default' });
    if (!cfg) {
      throw new NotFoundException('Ingestion config missing');
    }
    if (await this.recoverOrphanedJobsIfNeeded(cfg)) {
      cfg = (await this.configModel.findOne({ key: 'default' })) || cfg;
    }
    return this.applyActiveStateOverlay(cfg);
  }

  async getConfigWithDiagnostics() {
    const cfg = await this.getConfig();
    const raw = typeof cfg.toObject === 'function' ? cfg.toObject() : { ...cfg };
    this.applyActiveStateOverlay(raw);
    const activeRunHeartbeat = raw.activeRun?.heartbeatAt || null;
    delete raw.activeRun;
    delete raw.activeBackfill;

    const placesApiConfigured = this.fbPlacesService?.isConfigured() ?? false;
    const [placesCacheEntries, activeGroupsCount, totalGroupsCount] = await Promise.all([
      this.fbPlacesService
        ? this.fbPlacesService.getCacheEntryCount().catch(() => 0)
        : Promise.resolve(0),
      typeof (this.groupModel as any)?.countDocuments === 'function'
        ? this.groupModel.countDocuments({ isActive: true }).catch(() => 0)
        : Promise.resolve(0),
      typeof (this.groupModel as any)?.countDocuments === 'function'
        ? this.groupModel.countDocuments({}).catch(() => 0)
        : Promise.resolve(0),
    ]);

    const schedulerDiagnostics = this.computeSchedulerDiagnostics(
      {
        ...raw,
        ...(activeRunHeartbeat ? { activeRun: { heartbeatAt: activeRunHeartbeat } } : {}),
      },
      activeGroupsCount,
      totalGroupsCount,
    );

    const activityLog = Array.isArray(raw.activityLog) ? [...raw.activityLog].reverse() : [];
    const runHistory = Array.isArray(raw.runHistory) ? [...raw.runHistory].reverse() : [];
    const pendingSnapshots = this.filterActivePendingSnapshots(raw.pendingSnapshots);

    return {
      ...raw,
      activityLog,
      runHistory,
      pendingSnapshots,
      placesApiConfigured,
      placesCacheEntries,
      schedulerDiagnostics,
    };
  }

  async resolveAdminLocationQuery(queryText: string, groupName = '') {
    if (typeof this.cityMatcherService?.resolveLocationQuery !== 'function') {
      return { place: null, bestMatch: null, candidates: [] };
    }
    return this.cityMatcherService.resolveLocationQuery(queryText, groupName);
  }

  async updateConfig(
    patch: Partial<FbIngestionConfig> & { lastError?: string | null },
  ): Promise<any> {
    const prev = await this.getConfig();
    const allowed: Record<string, any> = {};
    if (typeof patch.isLive === 'boolean') allowed.isLive = patch.isLive;
    if (typeof patch.pollIntervalMinutes === 'number') {
      allowed.pollIntervalMinutes = Math.max(5, Math.min(1440, Math.round(patch.pollIntervalMinutes)));
    }
    if (typeof patch.onlyActiveHours === 'boolean') {
      allowed.onlyActiveHours = patch.onlyActiveHours;
    }
    if (typeof patch.activeHourStart === 'number') {
      allowed.activeHourStart = Math.max(0, Math.min(23, Math.round(patch.activeHourStart)));
    }
    if (typeof patch.activeHourEnd === 'number') {
      allowed.activeHourEnd = Math.max(1, Math.min(24, Math.round(patch.activeHourEnd)));
    }
    if (typeof patch.geminiModel === 'string' && patch.geminiModel.trim()) {
      allowed.geminiModel = patch.geminiModel.trim();
    }
    if (typeof patch.autoApproveEnabled === 'boolean') {
      allowed.autoApproveEnabled = patch.autoApproveEnabled;
    }
    if (typeof patch.autoApproveMinQualityScore === 'number') {
      allowed.autoApproveMinQualityScore = Math.max(
        40,
        Math.min(98, Math.round(patch.autoApproveMinQualityScore)),
      );
    }
    if (typeof patch.autoApproveAllowEstimatedPrice === 'boolean') {
      allowed.autoApproveAllowEstimatedPrice = patch.autoApproveAllowEstimatedPrice;
    }
    if (patch.lastError === null) {
      allowed.lastError = null;
    }

    await this.configModel.findOneAndUpdate(
      { key: 'default' },
      { $set: allowed },
      { new: true },
    );

    const nextInterval = allowed.pollIntervalMinutes ?? prev.pollIntervalMinutes;
    const nextActiveHours = allowed.onlyActiveHours ?? prev.onlyActiveHours;
    const nextStart = allowed.activeHourStart ?? prev.activeHourStart;
    const nextEnd = allowed.activeHourEnd ?? prev.activeHourEnd;

    if (typeof allowed.isLive === 'boolean' && allowed.isLive !== prev.isLive) {
      if (allowed.isLive) {
        await this.appendActivityLog({
          kind: 'scheduler_started',
          trigger: 'manual',
          title: 'Mode LIVE activé',
          detail: `Surveillance automatique toutes les ${nextInterval} min (${
            nextActiveHours ? `heures actives ${nextStart}h–${nextEnd}h Tana` : '24h/24'
          }).`,
        });
      } else {
        await this.appendActivityLog({
          kind: 'scheduler_paused',
          trigger: 'manual',
          title: 'Scraper mis en PAUSE',
          detail: 'Aucune collecte automatique ne sera déclenchée (0 crédit consommé).',
        });
      }
    } else {
      const changes: string[] = [];
      if (
        typeof allowed.pollIntervalMinutes === 'number' &&
        allowed.pollIntervalMinutes !== prev.pollIntervalMinutes
      ) {
        changes.push(`Fréquence : ${allowed.pollIntervalMinutes} min`);
      }
      if (
        typeof allowed.onlyActiveHours === 'boolean' &&
        allowed.onlyActiveHours !== prev.onlyActiveHours
      ) {
        changes.push(
          allowed.onlyActiveHours ? `Heures actives ${nextStart}h–${nextEnd}h` : 'Mode 24h/24',
        );
      }
      if (typeof allowed.geminiModel === 'string' && allowed.geminiModel !== prev.geminiModel) {
        changes.push(`Modèle : ${allowed.geminiModel}`);
      }
      if (
        typeof allowed.autoApproveEnabled === 'boolean' &&
        allowed.autoApproveEnabled !== prev.autoApproveEnabled
      ) {
        changes.push(`Zero-Touch : ${allowed.autoApproveEnabled ? 'ACTIF' : 'MANUEL'}`);
      }
      if (changes.length > 0) {
        await this.appendActivityLog({
          kind: 'config_changed',
          trigger: 'manual',
          title: 'Configuration mise à jour',
          detail: changes.join(' • '),
        });
      }
    }

    if (
      this.isSchedulerLoopStarted &&
      (allowed.isLive === true ||
        typeof allowed.pollIntervalMinutes === 'number' ||
        typeof allowed.onlyActiveHours === 'boolean')
    ) {
      this.schedulePrecisionTick(600);
    }

    return this.getConfigWithDiagnostics();
  }

  // ---------------------------------------------------------------------------
  // Target Groups & Overlap Analytics
  // ---------------------------------------------------------------------------

  async listGroups() {
    await this.ensureBootstrapped();
    const groups = await this.groupModel.find().sort({ isActive: -1, uniqueAccepted: -1, name: 1 }).lean();
    return groups.map((g: any) => ({
      ...g,
      overlapByGroup:
        g.overlapByGroup instanceof Map
          ? Object.fromEntries(g.overlapByGroup)
          : g.overlapByGroup || {},
    }));
  }

  async addGroup(dto: { url: string; name?: string; scrapeLimitPer30Min?: number; isActive?: boolean }) {
    const groupId = extractGroupIdFromUrl(dto.url) || dto.url.trim();
    if (!groupId) {
      throw new BadRequestException('Invalid Facebook group URL or groupId');
    }
    const normalizedUrl = dto.url.includes('facebook.com/groups/')
      ? dto.url.trim()
      : `https://www.facebook.com/groups/${groupId}/`;

    const existing = await this.groupModel.findOne({ groupId });
    if (existing) {
      throw new BadRequestException(`Group ${groupId} is already monitored`);
    }

    return this.groupModel.create({
      groupId,
      name: (dto.name || `Group ${groupId}`).trim(),
      url: normalizedUrl,
      scrapeLimitPer30Min: Math.max(1, Math.min(200, dto.scrapeLimitPer30Min || 10)),
      isActive: dto.isActive ?? true,
    });
  }

  async updateGroup(
    groupId: string,
    patch: { name?: string; isActive?: boolean; scrapeLimitPer30Min?: number; fbActivityNote?: string },
  ) {
    const allowed: Record<string, any> = {};
    if (typeof patch.name === 'string' && patch.name.trim()) allowed.name = patch.name.trim();
    if (typeof patch.isActive === 'boolean') allowed.isActive = patch.isActive;
    if (typeof patch.scrapeLimitPer30Min === 'number') {
      allowed.scrapeLimitPer30Min = Math.max(1, Math.min(200, Math.round(patch.scrapeLimitPer30Min)));
    }
    if (typeof patch.fbActivityNote === 'string') allowed.fbActivityNote = patch.fbActivityNote;

    const updated = await this.groupModel.findOneAndUpdate(
      { groupId },
      { $set: allowed },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }
    return updated;
  }

  async deleteGroup(groupId: string) {
    const deleted = await this.groupModel.findOneAndDelete({ groupId });
    if (!deleted) {
      throw new NotFoundException(`Group ${groupId} not found`);
    }
    return { deleted: true, groupId };
  }

  async getOverlapMatrix() {
    const groups = await this.listGroups();
    const byId = new Map(groups.map((g: any) => [g.groupId, g]));

    const matrix = groups.map((g: any) => {
      const overlapsMap: Record<string, number> = g.overlapByGroup || {};
      const sharedTotal = Object.values(overlapsMap).reduce((s, v) => s + Number(v || 0), 0);
      const totalProcessed = Number(g.uniqueAccepted || 0) + Number(g.duplicateSkipped || 0);
      const redundancyRate =
        totalProcessed > 0 ? Math.round((Number(g.duplicateSkipped || 0) / totalProcessed) * 100) : 0;

      const topOverlaps = Object.entries(overlapsMap)
        .filter(([, count]) => Number(count) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 6)
        .map(([otherGroupId, count]) => ({
          otherGroupId,
          otherGroupName: byId.get(otherGroupId)?.name || otherGroupId,
          sharedPostsCount: Number(count),
        }));

      return {
        groupId: g.groupId,
        name: g.name,
        isActive: g.isActive,
        totalFetched: g.totalFetched || 0,
        uniqueAccepted: g.uniqueAccepted || 0,
        approvedCount: g.approvedCount || 0,
        duplicateSkipped: g.duplicateSkipped || 0,
        landSkipped: g.landSkipped || 0,
        videoOnlySkipped: g.videoOnlySkipped || 0,
        spamSkipped: g.spamSkipped || 0,
        sharedTotal,
        redundancyRate,
        topOverlaps,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      groups: matrix,
    };
  }

  // ---------------------------------------------------------------------------
  // Bright Data Scrape Trigger & Snapshot Processing Pipeline
  // ---------------------------------------------------------------------------

  async listRemoteSnapshots() {
    return this.brightDataService.listSnapshots(20);
  }

  private async updatePollState(patch: {
    lastSnapshotId?: string;
    lastPollPhase?: string;
    lastPollMessage?: string;
    lastRunProgress?: FbRunProgress | null;
  }): Promise<void> {
    try {
      const setPatch: Record<string, any> = { ...patch };
      const filter: Record<string, any> = { key: 'default' };
      if (this.isRunInProgress) {
        setPatch['activeRun.heartbeatAt'] = new Date();
        if (patch.lastPollPhase !== undefined) {
          setPatch['activeRun.phase'] = patch.lastPollPhase;
        }
        if (patch.lastPollMessage !== undefined) {
          setPatch['activeRun.message'] = patch.lastPollMessage;
        }
        if (patch.lastRunProgress !== undefined) {
          setPatch['activeRun.progress'] = patch.lastRunProgress;
        }
        if (patch.lastSnapshotId !== undefined) {
          setPatch['activeRun.snapshotId'] = patch.lastSnapshotId;
          if (this.activeRunMeta) {
            this.activeRunMeta.snapshotId = patch.lastSnapshotId;
          }
        }
        filter.$or = [
          { 'activeRun.ownerId': this.instanceId },
          { activeRun: null },
          { activeRun: { $exists: false } },
        ];
      }
      await this.configModel.updateOne(filter, { $set: setPatch });
    } catch (err) {
      this.logger.warn(`Failed to update poll state: ${(err as Error).message}`);
    }
  }

  private async prepareActiveTargets(groupIds?: string[]) {
    if (this.isRunInProgress) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    const config = await this.getConfig();
    if (
      config.lastPollStatus === 'running' ||
      config.lastPollStatus === 'importing_snapshot'
    ) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    const filter: Record<string, any> = { isActive: true };
    if (groupIds && groupIds.length > 0) {
      filter.groupId = { $in: groupIds };
    }

    const targets = await this.groupModel.find(filter).lean();
    if (targets.length === 0) {
      throw new BadRequestException('No active target groups selected');
    }
    return { config, targets };
  }

  private estimateEtaSeconds(
    startedAtMs: number,
    completed: number,
    total: number,
  ): number | null {
    if (completed < 1 || total <= 0 || completed >= total) return null;
    const elapsedMs = Date.now() - startedAtMs;
    if (elapsedMs < 200) return null;
    const remaining = total - completed;
    return Math.max(1, Math.round((elapsedMs / completed) * remaining / 1000));
  }

  private async markRunStarted(
    status: 'running' | 'importing_snapshot',
    phase: string,
    message: string,
    snapshotId?: string,
    scheduledIntervalMs?: number,
    trigger: FbRunTrigger = status === 'importing_snapshot' ? 'snapshot' : 'manual',
  ): Promise<void> {
    if (this.isRunInProgress) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    await this.recoverOrphanedJobsIfNeeded();
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - RUN_STALE_LEASE_MS);

    const initialProgress: FbRunProgress =
      status === 'importing_snapshot'
        ? {
            current: 0,
            total: 100,
            percent: 10,
            etaSeconds: 15,
            unit: 'percent',
            detail: 'Téléchargement depuis Bright Data...',
          }
        : {
            current: 0,
            total: 100,
            percent: 5,
            etaSeconds: 90,
            unit: 'percent',
            detail: 'Envoi de la requête à Bright Data...',
          };

    const activeRunState: FbActiveRunState = {
      ownerId: this.instanceId,
      ownerHost: this.ownerHost,
      ownerPid: this.ownerPid,
      heartbeatAt: now,
      status,
      phase,
      message,
      snapshotId: snapshotId || null,
      startedAt: now,
      progress: initialProgress,
      trigger,
    };

    const setPatch: Record<string, any> = {
      activeRun: activeRunState,
      lastPollStartedAt: now,
      lastPollPhase: phase,
      lastPollMessage: message,
      lastRunProgress: initialProgress,
      lastRunTrigger: trigger,
      lastSchedulerTickAt: now,
      lastSchedulerStatus: status,
      lastSchedulerNote: message,
      lastError: null,
    };
    if (snapshotId) {
      setPatch.lastSnapshotId = snapshotId;
    }

    const andConditions: Record<string, any>[] = [
      {
        $or: [
          { activeRun: null },
          { activeRun: { $exists: false } },
          { 'activeRun.heartbeatAt': { $lt: staleCutoff } },
          { 'activeRun.ownerId': this.instanceId },
        ],
      },
      {
        $or: [
          { lastPollStatus: { $nin: ['running', 'importing_snapshot'] } },
          { updated_at: { $lt: staleCutoff } },
        ],
      },
    ];
    if (scheduledIntervalMs && scheduledIntervalMs > 0) {
      const intervalCutoff = new Date(now.getTime() - scheduledIntervalMs);
      andConditions.push({
        $or: [
          { lastPollStartedAt: null },
          { lastPollStartedAt: { $exists: false } },
          { lastPollStartedAt: { $lte: intervalCutoff } },
        ],
      });
    }

    if (typeof (this.configModel as any)?.findOneAndUpdate === 'function') {
      const acquired = await (this.configModel as any).findOneAndUpdate(
        { key: 'default', $and: andConditions },
        {
          $set: setPatch,
          $inc: { totalRuns: 1 },
        },
        { new: true },
      );
      if (!acquired) {
        throw new BadRequestException('An ingestion run is already in progress');
      }
    } else {
      await this.configModel.updateOne(
        { key: 'default' },
        {
          $set: setPatch,
          $inc: { totalRuns: 1 },
        },
      );
    }

    this.isRunInProgress = true;
    this.isRunCancelRequested = false;
    this.activeRunMeta = {
      trigger,
      startedAtMs: now.getTime(),
      snapshotId: snapshotId || null,
    };
    this.runAbortController = new AbortController();
    this.startRunHeartbeat();

    const logTitle =
      trigger === 'scheduled'
        ? 'Collecte automatique déclenchée'
        : trigger === 'snapshot'
        ? `Import snapshot ${snapshotId || ''} démarré`
        : 'Collecte manuelle démarrée';
    await this.appendActivityLog({
      kind: 'run_started',
      trigger,
      title: logTitle,
      detail: message,
      snapshotId: snapshotId || null,
    });
  }

  private async finalizeRunSuccess(summary: RunSummary): Promise<void> {
    const finishedAt = new Date();
    const meta = this.activeRunMeta;
    const trigger: FbRunTrigger = meta?.trigger || 'manual';
    const startedAtMs = meta?.startedAtMs || finishedAt.getTime();
    const durationSec = Math.max(1, Math.round((finishedAt.getTime() - startedAtMs) / 1000));

    const errNote =
      summary.errors.length > 0 ? ` (${summary.errors.length} avertissement(s))` : '';
    const autoNote =
      (summary.autoApprovedCount || 0) > 0
        ? ` (dont ${summary.autoApprovedCount} auto-publiée(s))`
        : '';
    const finalMessage = `Terminé (${summary.snapshotId}) : +${summary.candidatesCreated} annonce(s)${autoNote}, ${summary.duplicateSkipped} doublons${errNote}.`;

    await this.configModel.updateOne(
      {
        key: 'default',
        $or: [
          { 'activeRun.ownerId': this.instanceId },
          { activeRun: null },
          { activeRun: { $exists: false } },
        ],
      },
      {
        $set: {
          activeRun: null,
          lastPollFinishedAt: finishedAt,
          lastPollStatus: 'idle',
          lastPollPhase: 'completed',
          lastPollMessage: finalMessage,
          lastRunProgress: null,
          lastRunSummary: summary,
          lastRunTrigger: trigger,
          lastSchedulerTickAt: finishedAt,
          lastError: null,
        },
        $inc: {
          totalBrightDataRecords: summary.totalRawRecords,
        },
      },
    );

    await Promise.all([
      this.appendRunHistory({
        id: crypto.randomUUID(),
        trigger,
        status: 'completed',
        snapshotId: summary.snapshotId || null,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationSec,
        totalRawRecords: summary.totalRawRecords,
        candidatesCreated: summary.candidatesCreated,
        autoApprovedCount: summary.autoApprovedCount || 0,
        duplicateSkipped: summary.duplicateSkipped,
        landSkipped: summary.landSkipped,
        videoOnlySkipped: summary.videoOnlySkipped,
        spamSkipped: summary.spamSkipped,
        geminiCalls: summary.geminiCalls,
        placesApiCalls: summary.placesApiCalls || 0,
        placesCacheHits: summary.placesCacheHits || 0,
        errorMessage: summary.errors.length > 0 ? summary.errors[0] : null,
      }),
      this.appendActivityLog({
        kind: 'run_completed',
        trigger,
        title:
          trigger === 'scheduled'
            ? 'Collecte automatique terminée'
            : trigger === 'snapshot'
            ? 'Import snapshot terminé'
            : 'Collecte manuelle terminée',
        detail: finalMessage,
        snapshotId: summary.snapshotId || null,
        durationSec,
        stats: {
          rawRecords: summary.totalRawRecords,
          candidatesCreated: summary.candidatesCreated,
          autoApprovedCount: summary.autoApprovedCount || 0,
          duplicateSkipped: summary.duplicateSkipped,
          geminiCalls: summary.geminiCalls,
        },
      }),
    ]);
    this.activeRunMeta = null;
  }

  private async finalizeRunCancelled(): Promise<void> {
    const finishedAt = new Date();
    const meta = this.activeRunMeta;
    const trigger: FbRunTrigger = meta?.trigger || 'manual';
    const startedAtMs = meta?.startedAtMs || finishedAt.getTime();
    const durationSec = Math.max(1, Math.round((finishedAt.getTime() - startedAtMs) / 1000));

    await this.configModel.updateOne(
      { key: 'default' },
      {
        $set: {
          activeRun: null,
          lastPollFinishedAt: finishedAt,
          lastPollStatus: 'idle',
          lastPollPhase: 'cancelled',
          lastPollMessage: 'Opération annulée par l’administrateur.',
          lastRunProgress: null,
          lastSchedulerTickAt: finishedAt,
          lastError: null,
        },
      },
    );

    if (meta) {
      await Promise.all([
        this.appendRunHistory({
          id: crypto.randomUUID(),
          trigger,
          status: 'cancelled',
          snapshotId: meta.snapshotId,
          startedAt: new Date(startedAtMs).toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationSec,
          totalRawRecords: 0,
          candidatesCreated: 0,
          autoApprovedCount: 0,
          duplicateSkipped: 0,
          landSkipped: 0,
          videoOnlySkipped: 0,
          spamSkipped: 0,
          geminiCalls: 0,
          errorMessage: 'Opération annulée par l’administrateur.',
        }),
        this.appendActivityLog({
          kind: 'run_cancelled',
          trigger,
          title: 'Collecte annulée',
          detail: 'Opération arrêtée par l’administrateur.',
          snapshotId: meta.snapshotId,
          durationSec,
        }),
      ]);
      this.activeRunMeta = null;
    }
  }

  private async finalizeRunError(err: unknown): Promise<string> {
    if (this.isRunCancelRequested || this.runAbortController?.signal.aborted) {
      await this.finalizeRunCancelled();
      return 'Opération annulée par l’administrateur.';
    }
    const finishedAt = new Date();
    const meta = this.activeRunMeta;
    const trigger: FbRunTrigger = meta?.trigger || 'manual';
    const startedAtMs = meta?.startedAtMs || finishedAt.getTime();
    const durationSec = Math.max(1, Math.round((finishedAt.getTime() - startedAtMs) / 1000));
    const msg = (err as Error).message || 'Unknown error';

    await this.configModel.updateOne(
      {
        key: 'default',
        $or: [
          { 'activeRun.ownerId': this.instanceId },
          { activeRun: null },
          { activeRun: { $exists: false } },
        ],
      },
      {
        $set: {
          activeRun: null,
          lastPollFinishedAt: finishedAt,
          lastPollStatus: 'error',
          lastPollPhase: 'error',
          lastPollMessage: msg,
          lastRunProgress: null,
          lastSchedulerTickAt: finishedAt,
          lastError: msg,
        },
      },
    );

    await Promise.all([
      this.appendRunHistory({
        id: crypto.randomUUID(),
        trigger,
        status: 'error',
        snapshotId: meta?.snapshotId || null,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationSec,
        totalRawRecords: 0,
        candidatesCreated: 0,
        autoApprovedCount: 0,
        duplicateSkipped: 0,
        landSkipped: 0,
        videoOnlySkipped: 0,
        spamSkipped: 0,
        geminiCalls: 0,
        errorMessage: msg,
      }),
      this.appendActivityLog({
        kind: 'run_error',
        trigger,
        title:
          trigger === 'scheduled'
            ? 'Échec collecte automatique'
            : trigger === 'snapshot'
            ? 'Échec import snapshot'
            : 'Échec collecte manuelle',
        detail: msg,
        snapshotId: meta?.snapshotId || null,
        durationSec,
      }),
    ]);
    this.activeRunMeta = null;
    return msg;
  }

  async cancelActiveRun() {
    this.isRunCancelRequested = true;
    this.runAbortController?.abort(new Error('Collecte annulée par l’administrateur.'));
    this.stopRunHeartbeat();
    await this.finalizeRunCancelled();
    return this.getConfigWithDiagnostics();
  }

  private async executeRunActiveGroups(
    config: FbIngestionConfigDocument,
    targets: any[],
  ): Promise<RunSummary> {
    const signal = this.runAbortController?.signal;
    try {
      // Scale requested posts proportionally if admin changes pollIntervalMinutes (base = 30 min)
      const scaleFactor = Math.max(0.25, config.pollIntervalMinutes / 30);
      const batches = this.chunkArray(targets, MAX_GROUPS_PER_SNAPSHOT);
      const perBatchWaitMs =
        batches.length === 1 ? SINGLE_BATCH_WAIT_TIMEOUT_MS : MULTI_BATCH_WAIT_TIMEOUT_MS;
      const perBatchWaitMin = Math.round(perBatchWaitMs / 60_000);
      const perBatchWaitSec = Math.round(perBatchWaitMs / 1000);

      const batchSummaries: RunSummary[] = [];
      const timeoutNotices: string[] = [];
      let lastSnapshotId = '';

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        if (this.isRunCancelRequested || signal?.aborted) break;

        const batchTargets = batches[bIdx];
        const batchLabel =
          batches.length > 1 ? `[Lot ${bIdx + 1}/${batches.length}] ` : '';

        const triggerPayload = batchTargets.map((t: any) => ({
          url: t.url,
          num_of_posts: Math.max(
            2,
            Math.min(200, Math.round((t.scrapeLimitPer30Min || 10) * scaleFactor)),
          ),
          posts_to_not_include: Array.isArray(t.recentPostIds) ? t.recentPostIds.slice(-30) : [],
        }));

        const snapshotId = await this.brightDataService.triggerCollection(triggerPayload, signal);
        lastSnapshotId = snapshotId;
        await this.updatePollState({
          lastSnapshotId: snapshotId,
          lastPollPhase: 'waiting_brightdata',
          lastPollMessage: `${batchLabel}Bright Data collecte ${batchTargets.length} groupe(s) (0s)...`,
          lastRunProgress: {
            current: 0,
            total: perBatchWaitSec,
            percent: 10,
            etaSeconds: null,
            unit: 'percent',
            detail: `${batchLabel}Snapshot ${snapshotId} — ${batchTargets.length} groupe(s)`,
          },
        });

        try {
          await this.brightDataService.waitForSnapshot(
            snapshotId,
            perBatchWaitMs,
            async ({ elapsedSec, status, records }) => {
              // Asymptotic progress curve during external Bright Data collection (10% -> 55%)
              const percent =
                status === 'ready'
                  ? 58
                  : Math.min(55, 10 + Math.round(45 * (1 - Math.exp(-elapsedSec / 65))));
              const recordsNote =
                typeof records === 'number' && records > 0 ? ` • ${records} post(s) détectés` : '';
              await this.updatePollState({
                lastPollPhase: 'waiting_brightdata',
                lastPollMessage: `${batchLabel}Collecte Bright Data (${status}) : ${elapsedSec}s écoulées (${batchTargets.length} groupe(s))${recordsNote}...`,
                lastRunProgress: {
                  current: elapsedSec,
                  total: perBatchWaitSec,
                  percent,
                  etaSeconds: null,
                  unit: 'percent',
                  detail: `${batchLabel}Bright Data: ${status}${recordsNote} (max ${perBatchWaitMin} min)`,
                },
              });
            },
            signal,
          );
        } catch (waitErr) {
          const isTimeout =
            waitErr instanceof BrightDataSnapshotTimeoutError ||
            (waitErr as Error)?.name === 'BrightDataSnapshotTimeoutError' ||
            String((waitErr as Error)?.message || '').includes('Timed out waiting for Bright Data snapshot');

          if (!isTimeout || this.isRunCancelRequested || signal?.aborted) {
            throw waitErr;
          }

          const lastStatus =
            waitErr instanceof BrightDataSnapshotTimeoutError ? waitErr.lastStatus : 'running';
          const lastRecords =
            waitErr instanceof BrightDataSnapshotTimeoutError ? waitErr.lastRecords ?? null : null;

          await this.addPendingSnapshot({
            snapshotId,
            triggeredAt: new Date().toISOString(),
            groupsCount: batchTargets.length,
            groupNames: batchTargets.map((g: any) => String(g.name || g.groupId)).slice(0, 5),
            lastStatus,
            lastRecords,
            lastCheckedAt: new Date().toISOString(),
          });

          const notice = `${batchLabel}Bright Data prend plus de temps que prévu pour ${snapshotId} (>${perBatchWaitMin} min) — sauvegardé pour récupération automatique gratuite.`;
          timeoutNotices.push(notice);
          this.logger.warn(notice);

          await this.appendActivityLog({
            kind: 'run_error',
            trigger: this.activeRunMeta?.trigger || 'manual',
            title: `${batchLabel}Snapshot mis en attente de récupération`,
            detail: notice,
            snapshotId,
          });
          continue;
        }

        await this.updatePollState({
          lastPollPhase: 'downloading_snapshot',
          lastPollMessage: `${batchLabel}Téléchargement du snapshot ${snapshotId}...`,
          lastRunProgress: {
            current: 58,
            total: 100,
            percent: 58,
            etaSeconds: 20,
            unit: 'percent',
            detail: `${batchLabel}Téléchargement JSON (${snapshotId})`,
          },
        });
        const records = await this.brightDataService.downloadSnapshot(snapshotId, signal);
        const batchSummary = await this.processSnapshotRecords(snapshotId, records, false);
        await this.removePendingSnapshot(snapshotId);
        batchSummaries.push(batchSummary);
      }

      if (this.isRunCancelRequested) {
        const cancelledSummary = this.mergeRunSummaries(batchSummaries, lastSnapshotId);
        await this.finalizeRunCancelled();
        return cancelledSummary;
      }

      if (batchSummaries.length === 0 && timeoutNotices.length > 0) {
        throw new Error(
          `Bright Data prend plus de ${perBatchWaitMin} min pour le snapshot ${lastSnapshotId}. Le snapshot a été sauvegardé pour récupération automatique gratuite dès qu'il sera prêt (aucun crédit perdu).`,
        );
      }

      const summary = this.mergeRunSummaries(batchSummaries, lastSnapshotId);
      if (timeoutNotices.length > 0) {
        summary.errors.push(...timeoutNotices);
      }

      await this.finalizeRunSuccess(summary);
      return summary;
    } catch (err) {
      await this.finalizeRunError(err);
      throw err;
    } finally {
      this.stopRunHeartbeat();
      this.isRunInProgress = false;
      this.runAbortController = null;
      this.isRunCancelRequested = false;
    }
  }

  private async executeImportSnapshot(snapshotId: string): Promise<RunSummary> {
    const signal = this.runAbortController?.signal;
    try {
      await this.updatePollState({
        lastPollPhase: 'downloading_snapshot',
        lastPollMessage: `Téléchargement du snapshot ${snapshotId}...`,
        lastRunProgress: {
          current: 10,
          total: 100,
          percent: 10,
          etaSeconds: 15,
          unit: 'percent',
          detail: `Téléchargement JSON (${snapshotId})`,
        },
      });
      const records = await this.brightDataService.downloadSnapshot(snapshotId, signal);
      const summary = await this.processSnapshotRecords(snapshotId, records, true);
      await this.removePendingSnapshot(snapshotId);
      if (this.isRunCancelRequested) {
        await this.finalizeRunCancelled();
        return summary;
      }
      await this.finalizeRunSuccess(summary);
      return summary;
    } catch (err) {
      await this.finalizeRunError(err);
      throw err;
    } finally {
      this.stopRunHeartbeat();
      this.isRunInProgress = false;
      this.runAbortController = null;
      this.isRunCancelRequested = false;
    }
  }

  async startRunInBackground(groupIds?: string[]) {
    const { config, targets } = await this.prepareActiveTargets(groupIds);
    await this.markRunStarted(
      'running',
      'triggering_brightdata',
      `Déclenchement Bright Data sur ${targets.length} groupe(s)...`,
      undefined,
      undefined,
      'manual',
    );

    void this.executeRunActiveGroups(config, targets).catch((err) => {
      this.logger.error(`Background runActiveGroups failed: ${(err as Error).message}`);
    });

    return {
      started: true,
      status: 'running',
      phase: 'triggering_brightdata',
      groupsCount: targets.length,
    };
  }

  private async runActiveGroupsInternal(
    groupIds?: string[],
    scheduledIntervalMs?: number,
    trigger: FbRunTrigger = 'manual',
  ): Promise<RunSummary> {
    const { config, targets } = await this.prepareActiveTargets(groupIds);
    await this.markRunStarted(
      'running',
      'triggering_brightdata',
      `Déclenchement Bright Data sur ${targets.length} groupe(s)...`,
      undefined,
      scheduledIntervalMs,
      trigger,
    );
    return this.executeRunActiveGroups(config, targets);
  }

  async runActiveGroups(groupIds?: string[]): Promise<RunSummary> {
    return this.runActiveGroupsInternal(groupIds, undefined, 'manual');
  }

  async startImportInBackground(snapshotId: string) {
    const cleanId = snapshotId?.trim();
    if (!cleanId) {
      throw new BadRequestException('snapshotId is required');
    }
    const cfg = await this.getConfig();
    if (
      this.isRunInProgress ||
      cfg.lastPollStatus === 'running' ||
      cfg.lastPollStatus === 'importing_snapshot'
    ) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    await this.markRunStarted(
      'importing_snapshot',
      'downloading_snapshot',
      `Importation du snapshot ${cleanId}...`,
      cleanId,
      undefined,
      'snapshot',
    );

    void this.executeImportSnapshot(cleanId).catch((err) => {
      this.logger.error(`Background importSnapshot failed: ${(err as Error).message}`);
    });

    return {
      started: true,
      snapshotId: cleanId,
      status: 'importing_snapshot',
      phase: 'downloading_snapshot',
    };
  }

  /**
   * Imports and parses an existing Bright Data snapshot (useful for zero-cost testing & replay).
   */
  async importSnapshot(snapshotId: string): Promise<RunSummary> {
    const cleanId = snapshotId?.trim();
    if (!cleanId) {
      throw new BadRequestException('snapshotId is required');
    }
    const cfg = await this.getConfig();
    if (
      this.isRunInProgress ||
      cfg.lastPollStatus === 'running' ||
      cfg.lastPollStatus === 'importing_snapshot'
    ) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    await this.markRunStarted(
      'importing_snapshot',
      'downloading_snapshot',
      `Importation du snapshot ${cleanId}...`,
      cleanId,
      undefined,
      'snapshot',
    );
    return this.executeImportSnapshot(cleanId);
  }

  private async processSingleEligiblePost(
    post: UnwrappedFbPost,
    groupDoc: FbGroupTargetDocument,
    config: FbIngestionConfigDocument,
    summary: RunSummary,
  ): Promise<void> {
    let parsedResult;
    try {
      const inlineImages =
        typeof (this.gcsService as any)?.fetchVisionInlineImages === 'function'
          ? await this.gcsService
              .fetchVisionInlineImages(post.photoUrls, 4)
              .catch(() => [])
          : [];
      const geminiRes = await this.geminiService.parsePost({
        content: post.content,
        groupName: post.groupName,
        authorName: post.authorName,
        modelOverride: config.geminiModel,
        regexPhones: post.phones,
        ...(inlineImages.length > 0 ? { inlineImages } : {}),
      });
      parsedResult = geminiRes.parsed;
      summary.geminiCalls++;
      await this.configModel.updateOne(
        { key: 'default' },
        { $inc: { totalGeminiCalls: 1 } },
      );
    } catch (err) {
      // Roll back FbSeenPost so a transient AI outage can be retried on the next poll/import.
      await this.seenModel.deleteOne({ canonicalPostId: post.canonicalPostId });
      const msg = `Gemini failed for post ${post.canonicalPostId}: ${(err as Error).message}`;
      this.logger.warn(msg);
      summary.errors.push(msg);
      return;
    }

    if (parsedResult.category === 'land') {
      summary.landSkipped++;
      groupDoc.landSkipped = (groupDoc.landSkipped || 0) + 1;
      return;
    }

    if (
      parsedResult.category === 'seeker_request' ||
      parsedResult.category === 'spam_or_other'
    ) {
      summary.spamSkipped++;
      groupDoc.spamSkipped = (groupDoc.spamSkipped || 0) + 1;
      return;
    }

    let cityMatch: Awaited<ReturnType<FbCityMatcherService['matchLocation']>>;
    let gcsUpload: Awaited<ReturnType<FbGcsService['reuploadFbImages']>>;
    let gcsAvatarUrl: string | null;
    let extractedPayload: Record<string, any>;
    let missingFields: string[];
    let aiNotes = parsedResult.aiNotes || '';

    try {
      cityMatch = await this.cityMatcherService.matchLocation(
        parsedResult.locationHints,
        `${parsedResult.title || ''}\n${post.content || ''}`,
        post.groupName,
      );
      if (cityMatch.apiCallMade) {
        summary.placesApiCalls = (summary.placesApiCalls || 0) + 1;
      } else if (cityMatch.resolutionSource === 'google_places_cache') {
        summary.placesCacheHits = (summary.placesCacheHits || 0) + 1;
      }

      const hasVisionUploadOpts =
        (Array.isArray(parsedResult.imageContactRedactions) &&
          parsedResult.imageContactRedactions.length > 0) ||
        typeof parsedResult.recommendedCoverIndex === 'number';

      [gcsUpload, gcsAvatarUrl] = await Promise.all([
        hasVisionUploadOpts
          ? this.gcsService.reuploadFbImages(post.photoUrls, post.canonicalPostId, {
              redactions: parsedResult.imageContactRedactions,
              recommendedCoverIndex: parsedResult.recommendedCoverIndex,
            })
          : this.gcsService.reuploadFbImages(post.photoUrls, post.canonicalPostId),
        this.gcsService.reuploadFbAvatar(
          post.authorAvatar,
          post.authorFbId || post.canonicalPostId,
        ),
      ]);

      if (gcsUpload.uploadedUrls.length === 0 && gcsUpload.failedCount > 0) {
        aiNotes = `${aiNotes ? `${aiNotes} | ` : ''}${gcsUpload.failedCount} FB image(s) failed download (likely expired CDN link in snapshot); verify/upload photos before publishing.`;
      }
      if ((gcsUpload.redactedCount || 0) > 0) {
        aiNotes = `${aiNotes ? `${aiNotes} | ` : ''}${gcsUpload.redactedCount} photo(s) avec contact flouté automatiquement.`;
      }

      const priceEstimation = estimatePropertyPriceAriary({
        type: parsedResult.type === 'sale' ? 'sale' : 'rent',
        houseType: parsedResult.houseType,
        fokontany: cityMatch.bestMatch?.label || null,
        locationHints: parsedResult.locationHints,
        rawText: `${post.content || ''}\n${parsedResult.description || ''}`,
        rooms: parsedResult.rooms,
        livingRoom: parsedResult.livingRoom,
        kitchen: parsedResult.kitchen,
        bathrooms: parsedResult.bathrooms,
        toilet: parsedResult.toilet,
        area: parsedResult.area,
        estimatedArea: parsedResult.estimatedArea,
        features: parsedResult.features,
        visualCondition: parsedResult.visualCondition || null,
        geminiEstimateAriary:
          parsedResult.type === 'sale'
            ? parsedResult.estimatedPriceAriary
            : parsedResult.estimatedRentAriary,
      });

      const qualityScore = computePropertyQualityScore({
        photoCount: gcsUpload.uploadedUrls.length,
        visualCondition: parsedResult.visualCondition || null,
        hasExplicitPrice: Boolean(
          (parsedResult.type === 'sale' && (parsedResult.priceAriary || 0) > 0) ||
            (parsedResult.type !== 'sale' && (parsedResult.rentAriary || 0) > 0),
        ),
        hasMatchedCity: Boolean(cityMatch.bestMatch?._id),
        hasCoords: Boolean(cityMatch.resolvedCoords || cityMatch.bestMatch?.coords),
        hasPhones: parsedResult.phones.length > 0,
        rooms: parsedResult.rooms,
        livingRoom: parsedResult.livingRoom,
        area: parsedResult.area,
        estimatedArea: parsedResult.estimatedArea,
        descriptionLength: (parsedResult.description || '').length,
        features: parsedResult.features,
        publishedAt: post.datePosted,
      });

      missingFields = this.computeMissingFields({
        type: parsedResult.type,
        houseType: parsedResult.houseType,
        price: parsedResult.priceAriary,
        rent: parsedResult.rentAriary,
        matchedCityId: cityMatch.bestMatch?._id || null,
        rooms: parsedResult.rooms,
        toilet: parsedResult.toilet,
        bathrooms: parsedResult.bathrooms,
        area: parsedResult.area,
        phones: parsedResult.phones,
        features: parsedResult.features,
        featureVerification: parsedResult.featureVerification,
        rawContent: post.content,
      });

      extractedPayload = {
        title: parsedResult.title,
        description: parsedResult.description,
        type: parsedResult.type,
        houseType: parsedResult.houseType,
        price: parsedResult.priceAriary,
        rent: parsedResult.rentAriary,
        estimatedPrice:
          parsedResult.type === 'sale' ? priceEstimation.estimatedAmount : null,
        estimatedRent:
          parsedResult.type !== 'sale' ? priceEstimation.estimatedAmount : null,
        estimatedPriceMin: priceEstimation.minAmount,
        estimatedPriceMax: priceEstimation.maxAmount,
        estimatedPriceConfidence: priceEstimation.confidence,
        visualCondition: parsedResult.visualCondition || null,
        qualityScore,
        redactedPhotoCount: gcsUpload.redactedCount || 0,
        rooms: parsedResult.rooms,
        livingRoom: parsedResult.livingRoom,
        kitchen: parsedResult.kitchen,
        toilet: parsedResult.toilet,
        bathrooms: parsedResult.bathrooms,
        area: parsedResult.area,
        estimatedArea: parsedResult.estimatedArea,
        visitFee: parsedResult.visitFee,
        cautionPercent: parsedResult.cautionPercent,
        cautionAmount: parsedResult.cautionAmount,
        commissionPercent: parsedResult.commissionPercent,
        commissionAmount: parsedResult.commissionAmount,
        floor: parsedResult.floor,
        phone1: parsedResult.phones[0] || null,
        phone2: parsedResult.phones[1] || null,
        phone3: parsedResult.phones[2] || null,
        features: parsedResult.features,
        locationHints: parsedResult.locationHints,
      };
    } catch (prepErr) {
      if (typeof (this.seenModel as any)?.deleteOne === 'function') {
        await this.seenModel
          .deleteOne({ canonicalPostId: post.canonicalPostId })
          .catch(() => undefined);
      }
      const msg = `Post processing failed for ${post.canonicalPostId}: ${(prepErr as Error).message}`;
      this.logger.warn(msg);
      summary.errors.push(msg);
      return;
    }

    const triage = this.evaluateCandidateWorkflowLane(
      {
        status: 'pending',
        matchedCityId: cityMatch.bestMatch?._id || null,
        resolutionSource: cityMatch.resolutionSource || null,
        cityCandidates: cityMatch.candidates,
        gcsImages: gcsUpload.uploadedUrls,
        aiConfidence: parsedResult.aiConfidence,
        extracted: extractedPayload,
      },
      config,
    );

    try {
      const createdCandidate = await this.candidateModel.create({
        status: 'pending',
        workflowLane: triage.eligibleForAutoApprove ? 'auto_published' : triage.workflowLane,
        autoApproved: false,
        autoApproveReason: null,
        contactFollowUpStatus: 'none',
        contactFollowUpAt: null,
        groupId: post.groupId,
        groupName: groupDoc.name || post.groupName,
        canonicalPostId: post.canonicalPostId,
        postUrl: post.postUrl,
        authorName: post.authorName,
        authorFbId: post.authorFbId || null,
        authorUrl: post.authorUrl || null,
        authorAvatarUrl: gcsAvatarUrl || post.authorAvatar || null,
        datePosted: post.datePosted,
        rawContent: post.content,
        gcsImages: gcsUpload.uploadedUrls,
        extracted: extractedPayload,
        matchedCityId: cityMatch.bestMatch?._id || null,
        matchedCityLabel: cityMatch.bestMatch?.label || null,
        cityCandidates: cityMatch.candidates.map((c) => ({
          _id: c._id,
          label: c.label,
          score: c.score,
          distanceMeters: c.distanceMeters ?? null,
          coords: c.coords,
        })),
        resolvedCoords: cityMatch.resolvedCoords || null,
        resolvedPlaceName: cityMatch.resolvedPlaceName || null,
        resolvedAddress: cityMatch.resolvedAddress || null,
        resolutionSource: cityMatch.resolutionSource || null,
        manualCityOverride: false,
        missingFields,
        featureVerification: parsedResult.featureVerification,
        aiConfidence: parsedResult.aiConfidence,
        aiNotes,
      });

      summary.candidatesCreated++;
      groupDoc.uniqueAccepted = (groupDoc.uniqueAccepted || 0) + 1;

      if (triage.eligibleForAutoApprove && createdCandidate?._id) {
        try {
          await this.approveCandidate(
            String(createdCandidate._id),
            'system_auto',
            undefined,
            {
              isAutoApproved: true,
              reason: triage.reason,
            },
          );
          summary.autoApprovedCount = (summary.autoApprovedCount || 0) + 1;
          await this.configModel.updateOne(
            { key: 'default' },
            { $inc: { totalAutoApproved: 1 } },
          );
        } catch (autoErr) {
          this.logger.warn(
            `Auto-approve failed for candidate ${String(createdCandidate._id)}: ${(autoErr as Error).message}`,
          );
          if (typeof this.candidateModel?.updateOne === 'function') {
            await this.candidateModel
              .updateOne(
                { _id: createdCandidate._id },
                { $set: { workflowLane: 'fast_check' } },
              )
              .catch(() => undefined);
          }
        }
      }
    } catch (err: any) {
      if (err?.code === 11000) {
        summary.duplicateSkipped++;
      } else {
        summary.errors.push(`Candidate save error: ${err?.message || err}`);
      }
    }
  }

  async processSnapshotRecords(
    snapshotId: string,
    records: BrightDataPostRecord[],
    isSnapshotImport = false,
  ): Promise<RunSummary> {
    const config = await this.getConfig();
    const summary: RunSummary = {
      snapshotId,
      totalRawRecords: records.length,
      unwrappedCount: 0,
      videoOnlySkipped: 0,
      duplicateSkipped: 0,
      crossGroupOverlaps: 0,
      landSkipped: 0,
      spamSkipped: 0,
      candidatesCreated: 0,
      autoApprovedCount: 0,
      geminiCalls: 0,
      placesApiCalls: 0,
      placesCacheHits: 0,
      errors: [],
    };

    const grouped = new Map<string, UnwrappedFbPost[]>();
    const emptyGroupIds = new Set<string>();
    let benignEmptyCount = 0;
    for (const raw of records) {
      if (raw.error) {
        const errText = String(raw.error).trim();
        const errGid = extractGroupIdFromUrl(
          raw.input?.url || raw.group_url || raw.url || '',
        );
        if (/posts?\s*not\s*found|no\s+(?:new\s+)?posts?/i.test(errText)) {
          benignEmptyCount++;
          if (errGid) {
            emptyGroupIds.add(errGid);
          }
          continue;
        }
        summary.errors.push(
          errGid ? `BrightData (${errGid}): ${errText}` : `BrightData error: ${errText}`,
        );
        continue;
      }
      const post = unwrapBrightDataPost(raw);
      if (!post) continue;

      summary.unwrappedCount++;
      const arr = grouped.get(post.groupId) || [];
      arr.push(post);
      grouped.set(post.groupId, arr);
    }

    if (benignEmptyCount > 0) {
      summary.totalRawRecords = Math.max(0, records.length - benignEmptyCount);
      this.logger.debug(
        `Bright Data returned ${benignEmptyCount} empty-group notice(s) ("Posts not found"); continuing cleanly.`,
      );
      if (
        emptyGroupIds.size > 0 &&
        typeof (this.groupModel as any)?.updateOne === 'function'
      ) {
        await Promise.all(
          Array.from(emptyGroupIds)
            .filter((gid) => !grouped.has(gid))
            .map((gid) =>
              this.groupModel
                .updateOne(
                  { groupId: gid },
                  {
                    $set: {
                      lastRunAt: new Date(),
                      lastRunFetchedCount: 0,
                      lastRunNewCount: 0,
                      lastRunCapturedAll: true,
                    },
                  },
                )
                .catch(() => undefined),
            ),
        );
      }
    }

    const totalPostsToScan = summary.unwrappedCount;
    let processedCount = 0;
    const filterStartedAt = Date.now();
    let lastProgressWriteAt = 0;

    const computeFilterPercent = (done: number) => {
      const ratio = totalPostsToScan > 0 ? done / totalPostsToScan : 1;
      const base = isSnapshotImport ? 15 : 60;
      const span = isSnapshotImport ? 85 : 40;
      return Math.min(100, Math.round(base + ratio * span));
    };

    const reportFilterProgress = async (force = false, detailOverride?: string) => {
      const now = Date.now();
      if (!force && now - lastProgressWriteAt < 350 && processedCount < totalPostsToScan) {
        return;
      }
      lastProgressWriteAt = now;
      await this.updatePollState({
        lastPollPhase: 'filtering_ai_gcs',
        lastPollMessage:
          totalPostsToScan === 0
            ? 'Aucun post exploitable dans ce snapshot.'
            : `Filtrage IA & Images GCS : ${processedCount} / ${totalPostsToScan} posts (+${summary.candidatesCreated} annonces)...`,
        lastRunProgress: {
          current: processedCount,
          total: totalPostsToScan,
          percent: computeFilterPercent(processedCount),
          etaSeconds: this.estimateEtaSeconds(filterStartedAt, processedCount, totalPostsToScan),
          unit: 'posts',
          detail:
            detailOverride ||
            `+${summary.candidatesCreated} retenu(s) • ${summary.duplicateSkipped} doublon(s)`,
        },
      });
    };

    await reportFilterProgress(true, 'Préparation des publications...');

    for (const [groupId, posts] of grouped.entries()) {
      if (this.isRunCancelRequested) break;

      // Ensure target group exists (auto-register if discovered via an imported snapshot).
      let groupDoc = await this.groupModel.findOne({ groupId });
      if (!groupDoc) {
        groupDoc = await this.groupModel.create({
          groupId,
          name: posts[0].groupName,
          url: posts[0].groupUrl,
          isActive: false,
          scrapeLimitPer30Min: 10,
        });
      }

      let groupNewCount = 0;
      const newRecentIds = new Set<string>(groupDoc.recentPostIds || []);
      const aiEligiblePosts: UnwrappedFbPost[] = [];

      // Sequential pre-filter & deduplication ensures deterministic cross-group overlap credit.
      for (const post of posts) {
        if (this.isRunCancelRequested) break;
        newRecentIds.add(post.outerPostId);

        if (post.isVideoOnly || post.photoUrls.length === 0) {
          summary.videoOnlySkipped++;
          groupDoc.videoOnlySkipped = (groupDoc.videoOnlySkipped || 0) + 1;
          processedCount++;
          await reportFilterProgress(false, `Pré-filtrage (${groupDoc.name})...`);
          continue;
        }

        const duplicate = await this.findSeenDuplicate(post);
        if (duplicate) {
          summary.duplicateSkipped++;
          groupDoc.duplicateSkipped = (groupDoc.duplicateSkipped || 0) + 1;

          const previouslySeenHere = duplicate.seenInGroupIds.includes(post.groupId);
          await this.seenModel.updateOne(
            { _id: duplicate._id },
            {
              $addToSet: {
                seenInGroupIds: post.groupId,
                rawPostIds: post.outerPostId,
              },
            },
          );

          if (!previouslySeenHere) {
            for (const otherGroupId of duplicate.seenInGroupIds) {
              if (otherGroupId === post.groupId) continue;
              summary.crossGroupOverlaps++;
              await this.incrementGroupOverlapPair(post.groupId, otherGroupId);
            }
          }
          processedCount++;
          await reportFilterProgress(false, `Déduplication (${groupDoc.name})...`);
          continue;
        }

        groupNewCount++;

        // Record in seen ledger immediately so later posts in the same batch deduplicate too.
        try {
          await this.seenModel.create({
            canonicalPostId: post.canonicalPostId,
            rawPostIds: [post.outerPostId],
            contentHash: post.textHash,
            normalizedText: post.normalizedText.slice(0, 1200),
            phones: post.phones,
            firstGroupId: post.groupId,
            firstGroupName: post.groupName,
            seenInGroupIds: [post.groupId],
            earliestDatePosted: post.datePosted,
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          });
        } catch (seenErr: any) {
          if (seenErr?.code === 11000) {
            summary.duplicateSkipped++;
            groupDoc.duplicateSkipped = (groupDoc.duplicateSkipped || 0) + 1;
            processedCount++;
            await reportFilterProgress(false, `Déduplication (${groupDoc.name})...`);
            continue;
          }
          throw seenErr;
        }

        const alreadyInProperties = await this.existsInLiveProperties(post);
        if (alreadyInProperties) {
          summary.duplicateSkipped++;
          groupDoc.duplicateSkipped = (groupDoc.duplicateSkipped || 0) + 1;
          processedCount++;
          await reportFilterProgress(false, `Vérification base (${groupDoc.name})...`);
          continue;
        }

        aiEligiblePosts.push(post);
      }

      if (aiEligiblePosts.length > 0 && !this.isRunCancelRequested) {
        let nextIdx = 0;
        const workerCount = Math.min(2, aiEligiblePosts.length);
        const workers = Array.from({ length: workerCount }, async () => {
          while (nextIdx < aiEligiblePosts.length && !this.isRunCancelRequested) {
            const post = aiEligiblePosts[nextIdx++];
            await this.processSingleEligiblePost(post, groupDoc!, config, summary);
            processedCount++;
            await reportFilterProgress(true, `Analyse Gemini & GCS : ${post.groupName}`);
          }
        });
        await Promise.all(workers);
      } else {
        await reportFilterProgress(true);
      }

      // Compute measured post frequency & detect under-sized scrapeLimitPer30Min windows
      const validTimestamps = posts
        .map((p) => p.datePosted.getTime())
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b);

      if (validTimestamps.length >= 2) {
        const spanMinutes = Math.max(1, (validTimestamps[validTimestamps.length - 1] - validTimestamps[0]) / 60_000);
        const rawPer30Min = Math.min(60, Math.round((posts.length / spanMinutes) * 30 * 10) / 10);
        const prev = groupDoc.measuredPostsPer30Min || rawPer30Min;
        const blendedPer30Min = Math.round((prev * 0.4 + rawPer30Min * 0.6) * 10) / 10;

        groupDoc.measuredPostsPer30Min = blendedPer30Min;
        // Madagascar active posting day ~ 16h (32 half-hour windows)
        groupDoc.measuredPostsPerDay = Math.round(blendedPer30Min * 32);
        groupDoc.peakPostsPer30Min = Math.max(groupDoc.peakPostsPer30Min || 0, rawPer30Min);
      }

      const saturatedWindow =
        posts.length >= (groupDoc.scrapeLimitPer30Min || 1) && groupNewCount === posts.length;
      groupDoc.lastRunCapturedAll = !saturatedWindow;
      if (saturatedWindow) {
        groupDoc.missedWindowAlerts = (groupDoc.missedWindowAlerts || 0) + 1;
      }

      groupDoc.lastRunAt = new Date();
      groupDoc.lastRunFetchedCount = posts.length;
      groupDoc.lastRunNewCount = groupNewCount;
      groupDoc.totalFetched = (groupDoc.totalFetched || 0) + posts.length;
      groupDoc.recentPostIds = Array.from(newRecentIds).slice(-40);
      await groupDoc.save();
    }

    return summary;
  }

  private async incrementGroupOverlapPair(groupAId: string, groupBId: string): Promise<void> {
    await Promise.all([
      this.groupModel.updateOne(
        { groupId: groupAId },
        { $inc: { [`overlapByGroup.${groupBId}`]: 1 } },
      ),
      this.groupModel.updateOne(
        { groupId: groupBId },
        { $inc: { [`overlapByGroup.${groupAId}`]: 1 } },
      ),
    ]);
  }

  private async findSeenDuplicate(post: UnwrappedFbPost): Promise<FbSeenPostDocument | null> {
    const direct = await this.seenModel.findOne({
      $or: [{ canonicalPostId: post.canonicalPostId }, { rawPostIds: post.outerPostId }],
    });
    if (direct) return direct;

    if (post.normalizedText.length >= 25) {
      const byHash = await this.seenModel.findOne({ contentHash: post.textHash });
      if (byHash) return byHash;
    }

    if (post.phones.length > 0 && post.normalizedText.length >= 20) {
      const phoneCandidates = await this.seenModel
        .find({ phones: { $in: post.phones } })
        .sort({ created_at: -1 })
        .limit(15);
      for (const item of phoneCandidates) {
        if (computeTextSimilarity(item.normalizedText, post.normalizedText) >= 0.72) {
          return item;
        }
      }
    }

    return null;
  }

  private async existsInLiveProperties(post: UnwrappedFbPost): Promise<boolean> {
    const escapedPostId = post.canonicalPostId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bySource = await this.propertyModel
      .findOne(
        {
          $or: [
            { 'sources.postId': post.canonicalPostId },
            { 'sources.link': { $regex: escapedPostId } },
          ],
        },
        { _id: 1 },
      )
      .lean();
    if (bySource) return true;

    if (post.phones.length > 0) {
      const candidates = await this.propertyModel
        .find(
          {
            $or: [
              { phone1: { $in: post.phones } },
              { phone2: { $in: post.phones } },
              { phone3: { $in: post.phones } },
            ],
          },
          { description: 1 },
        )
        .limit(10)
        .lean();

      for (const prop of candidates) {
        if (computeTextSimilarity(prop.description || '', post.content) >= 0.75) {
          return true;
        }
      }
    }

    return false;
  }

  private computeMissingFields(data: {
    type?: string | null;
    houseType?: string | null;
    price?: number | null;
    rent?: number | null;
    matchedCityId?: string | null;
    rooms?: number | null;
    toilet?: number | null;
    bathrooms?: number | null;
    area?: number | null;
    phones?: Array<string | null | undefined>;
    features?: Record<string, any> | null;
    featureVerification?: Partial<FeatureVerificationMap> | null;
    rawContent?: string | null;
  }): string[] {
    const missing: string[] = [];
    if (data.type !== 'rent' && data.type !== 'sale') missing.push('type');
    if (data.type === 'sale' && (!data.price || data.price <= 0)) missing.push('price');
    if (data.type === 'rent' && (!data.rent || data.rent <= 0)) missing.push('rent');
    if (!data.matchedCityId) missing.push('city');

    const requiredSpecs = getRequiredMissingSpecs(data.houseType);
    if (requiredSpecs.includes('rooms') && (data.rooms === null || data.rooms === undefined)) {
      missing.push('rooms');
    }
    if (requiredSpecs.includes('toilet') && (data.toilet === null || data.toilet === undefined)) {
      missing.push('toilet');
    }
    if (
      requiredSpecs.includes('bathrooms') &&
      (data.bathrooms === null || data.bathrooms === undefined)
    ) {
      missing.push('bathrooms');
    }
    if (requiredSpecs.includes('area') && (data.area === null || data.area === undefined)) {
      missing.push('area');
    }

    const hasPhone = (data.phones || []).some((p) => Boolean(p && String(p).trim()));
    if (!hasPhone) missing.push('phone1');

    const verification = deriveFeatureVerification(
      data.features,
      data.rawContent,
      data.featureVerification,
    );
    missing.push(
      ...getMissingFeatureVerificationFields({
        isCommercial: isCommercialHouseType(data.houseType),
        features: data.features,
        verification,
      }),
    );
    return missing;
  }

  // ---------------------------------------------------------------------------
  // Human Fast Validation Queue, 3-Tier Triage & One-Click Approve / Reject
  // ---------------------------------------------------------------------------

  evaluateCandidateWorkflowLane(
    candidateLike: {
      status?: string;
      autoApproved?: boolean;
      matchedCityId?: string | null;
      resolutionSource?: string | null;
      cityCandidates?: Array<{ score?: number }>;
      gcsImages?: string[];
      aiConfidence?: 'high' | 'medium' | 'low' | string;
      extracted?: Record<string, any>;
    },
    config?: Partial<FbIngestionConfig> | null,
    options?: { forceAutoEnabled?: boolean },
  ): {
    workflowLane: 'auto_published' | 'fast_check' | 'call_queue';
    eligibleForAutoApprove: boolean;
    reason: string | null;
  } {
    const ex = candidateLike.extracted || {};
    const hasType = ex.type === 'rent' || ex.type === 'sale';
    const hasCity = Boolean(candidateLike.matchedCityId);
    const hasPhone = Boolean(
      (ex.phone1 && String(ex.phone1).trim()) ||
        (ex.phone2 && String(ex.phone2).trim()) ||
        (ex.phone3 && String(ex.phone3).trim()),
    );
    const hasImage =
      Array.isArray(candidateLike.gcsImages) && candidateLike.gcsImages.length > 0;
    const explicitAmount =
      ex.type === 'sale' ? Number(ex.price || 0) : Number(ex.rent || 0);
    const hasExplicitPrice = Number.isFinite(explicitAmount) && explicitAmount > 0;
    const estimatedAmount =
      ex.type === 'sale'
        ? Number(ex.estimatedPrice || 0)
        : Number(ex.estimatedRent || 0);
    const hasEstimatedPrice = Number.isFinite(estimatedAmount) && estimatedAmount > 0;

    if (
      !hasType ||
      !hasCity ||
      !hasPhone ||
      !hasImage ||
      (!hasExplicitPrice && !hasEstimatedPrice)
    ) {
      return {
        workflowLane: 'call_queue',
        eligibleForAutoApprove: false,
        reason: null,
      };
    }

    const autoEnabled = options?.forceAutoEnabled
      ? true
      : config?.autoApproveEnabled ?? true;
    const minScore =
      typeof config?.autoApproveMinQualityScore === 'number'
        ? config.autoApproveMinQualityScore
        : 75;
    const allowEstimatedPrice = config?.autoApproveAllowEstimatedPrice ?? true;
    const qualityScore = Number(ex.qualityScore || 0);
    const aiConfidence = candidateLike.aiConfidence || 'medium';
    const confidenceOk =
      aiConfidence === 'high' ||
      (aiConfidence === 'medium' && qualityScore >= Math.max(82, minScore + 5));
    const scoreOk = qualityScore >= minScore;
    const topCityScore =
      Array.isArray(candidateLike.cityCandidates) &&
      candidateLike.cityCandidates.length > 0
        ? Number(candidateLike.cityCandidates[0]?.score || 0)
        : 0;
    const locationReliable =
      candidateLike.resolutionSource === 'google_places_api' ||
      candidateLike.resolutionSource === 'google_places_cache' ||
      topCityScore >= 85 ||
      hasCity;
    const priceOk = hasExplicitPrice || (allowEstimatedPrice && hasEstimatedPrice);

    if (autoEnabled && confidenceOk && scoreOk && locationReliable && priceOk) {
      return {
        workflowLane: 'auto_published',
        eligibleForAutoApprove: true,
        reason: hasExplicitPrice
          ? 'Auto-validé (Confiance haute + Prix affiché)'
          : 'Auto-validé (Confiance haute + Estimation IA)',
      };
    }

    return {
      workflowLane: 'fast_check',
      eligibleForAutoApprove: false,
      reason: null,
    };
  }

  private computeDisplayWorkflowLane(candidateLike: {
    autoApproved?: boolean;
    matchedCityId?: string | null;
    gcsImages?: string[];
    extracted?: Record<string, any>;
  }): 'auto_published' | 'fast_check' | 'call_queue' {
    if (candidateLike.autoApproved) return 'auto_published';
    const ex = candidateLike.extracted || {};
    const hasType = ex.type === 'rent' || ex.type === 'sale';
    const hasCity = Boolean(candidateLike.matchedCityId);
    const hasPhone = Boolean(
      (ex.phone1 && String(ex.phone1).trim()) ||
        (ex.phone2 && String(ex.phone2).trim()) ||
        (ex.phone3 && String(ex.phone3).trim()),
    );
    const hasImage =
      Array.isArray(candidateLike.gcsImages) && candidateLike.gcsImages.length > 0;
    const explicitAmount =
      ex.type === 'sale' ? Number(ex.price || 0) : Number(ex.rent || 0);
    const estimatedAmount =
      ex.type === 'sale'
        ? Number(ex.estimatedPrice || 0)
        : Number(ex.estimatedRent || 0);
    const hasAnyPrice =
      (Number.isFinite(explicitAmount) && explicitAmount > 0) ||
      (Number.isFinite(estimatedAmount) && estimatedAmount > 0);
    if (!hasType || !hasCity || !hasPhone || !hasImage || !hasAnyPrice) {
      return 'call_queue';
    }
    return 'fast_check';
  }

  async listCandidates(params: {
    status?: string;
    groupId?: string;
    type?: string;
    houseType?: string;
    page?: number;
    limit?: number;
  }) {
    const status = params.status || 'pending';
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 25));

    const filter: Record<string, any> = {};
    if (status !== 'all') filter.status = status;
    if (params.groupId) filter.groupId = params.groupId;
    if (params.type === 'rent' || params.type === 'sale') {
      filter['extracted.type'] = params.type;
    }
    const normalizedHouseType = normalizeHouseType(params.houseType);
    if (normalizedHouseType) {
      filter['extracted.houseType'] = normalizedHouseType;
    }

    const [
      items,
      total,
      pendingCount,
      approvedCount,
      rejectedCount,
      autoApprovedCount,
      fastCheckCount,
      callQueueCount,
      waitingReplyCount,
    ] = await Promise.all([
      this.candidateModel
        .find(filter)
        .sort({ datePosted: -1, created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.candidateModel.countDocuments(filter),
      this.candidateModel.countDocuments({ status: 'pending' }),
      this.candidateModel.countDocuments({ status: 'approved' }),
      this.candidateModel.countDocuments({ status: 'rejected' }),
      this.candidateModel.countDocuments({ status: 'approved', autoApproved: true }),
      this.candidateModel.countDocuments({ status: 'pending', workflowLane: 'fast_check' }),
      this.candidateModel.countDocuments({ status: 'pending', workflowLane: 'call_queue' }),
      this.candidateModel.countDocuments({
        status: 'pending',
        contactFollowUpStatus: 'messaged_waiting',
      }),
    ]);

    // Auto-resolve any pending candidate missing its city via Google Places -> nearest DB Fokontany
    if (typeof this.cityMatcherService?.matchLocation === 'function') {
      await Promise.all(
        items.map(async (item: any) => {
          if (item.matchedCityId || item.manualCityOverride) return;
          try {
            const ex = item.extracted || {};
            const hints = Array.isArray(ex.locationHints)
              ? ex.locationHints.map(String).filter(Boolean)
              : [];
            const cityMatch = await this.cityMatcherService.matchLocation(
              hints,
              `${ex.title || ''}\n${item.rawContent || ''}`,
              item.groupName || '',
            );
            if (cityMatch.bestMatch || cityMatch.candidates.length > 0) {
              item.matchedCityId = cityMatch.bestMatch?._id || null;
              item.matchedCityLabel = cityMatch.bestMatch?.label || null;
              item.cityCandidates = cityMatch.candidates.map((c) => ({
                _id: c._id,
                label: c.label,
                score: c.score,
                distanceMeters: c.distanceMeters ?? null,
                coords: c.coords,
              }));
              item.resolvedCoords = cityMatch.resolvedCoords || null;
              item.resolvedPlaceName = cityMatch.resolvedPlaceName || null;
              item.resolvedAddress = cityMatch.resolvedAddress || null;
              item.resolutionSource = cityMatch.resolutionSource || null;

              if (item._id && this.candidateModel?.updateOne) {
                void this.candidateModel
                  .updateOne(
                    { _id: item._id },
                    {
                      $set: {
                        matchedCityId: item.matchedCityId,
                        matchedCityLabel: item.matchedCityLabel,
                        cityCandidates: item.cityCandidates,
                        resolvedCoords: item.resolvedCoords,
                        resolvedPlaceName: item.resolvedPlaceName,
                        resolvedAddress: item.resolvedAddress,
                        resolutionSource: item.resolutionSource,
                      },
                    },
                  )
                  .catch(() => undefined);
              }
            }
          } catch {
            // Non-blocking auto-resolution
          }
        }),
      );
    }

    const hydratedItems = items.map((item: any) => {
      const ex = { ...(item.extracted || {}) };
      const isCommercial = isCommercialHouseType(ex.houseType);
      const { features: mergedFeatures, featureVerification: verification } =
        mergeGeminiAndDeterministicFeatures(
          ex.features,
          item.rawContent || '',
          ex.description,
          {
            isCommercial,
            existingVerification: item.featureVerification,
          },
        );

      const resolvedRooms = resolveResidentialRoomDefaults({
        rawText: `${item.rawContent || ''}\n${ex.description || ''}`,
        isCommercial,
        houseType: ex.houseType,
        rooms: ex.rooms,
        livingRoom: ex.livingRoom,
        kitchen: ex.kitchen,
        toilet: ex.toilet,
        bathrooms: ex.bathrooms,
        rentAriary: ex.rent,
        priceAriary: ex.price,
      });

      const fees = extractAgencyFees(item.rawContent || '', ex, ex.rent);
      const hydratedEx = {
        ...ex,
        rooms: resolvedRooms.rooms,
        livingRoom: resolvedRooms.livingRoom,
        kitchen: resolvedRooms.kitchen,
        toilet: resolvedRooms.toilet,
        bathrooms: resolvedRooms.bathrooms,
        visitFee: ex.visitFee !== undefined && ex.visitFee !== null ? ex.visitFee : fees.visitFee,
        cautionPercent:
          ex.cautionPercent !== undefined && ex.cautionPercent !== null
            ? ex.cautionPercent
            : fees.cautionPercent,
        cautionAmount:
          ex.cautionAmount !== undefined && ex.cautionAmount !== null
            ? ex.cautionAmount
            : fees.cautionAmount,
        commissionPercent:
          ex.commissionPercent !== undefined && ex.commissionPercent !== null
            ? ex.commissionPercent
            : fees.commissionPercent,
        commissionAmount:
          ex.commissionAmount !== undefined && ex.commissionAmount !== null
            ? ex.commissionAmount
            : fees.commissionAmount,
        features: mergedFeatures,
      };
      hydratedEx.estimatedArea = estimatePropertyArea({
        houseType: hydratedEx.houseType,
        rooms: hydratedEx.rooms,
        livingRoom: hydratedEx.livingRoom,
        kitchen: hydratedEx.kitchen,
        toilet: hydratedEx.toilet,
        bathrooms: hydratedEx.bathrooms,
        area: hydratedEx.area,
        features: mergedFeatures,
      });

      const priceEst = estimatePropertyPriceAriary({
        type: hydratedEx.type === 'sale' ? 'sale' : 'rent',
        houseType: hydratedEx.houseType,
        fokontany: item.matchedCityLabel || null,
        locationHints: hydratedEx.locationHints,
        rawText: `${item.rawContent || ''}\n${hydratedEx.description || ''}`,
        rooms: hydratedEx.rooms,
        livingRoom: hydratedEx.livingRoom,
        kitchen: hydratedEx.kitchen,
        bathrooms: hydratedEx.bathrooms,
        toilet: hydratedEx.toilet,
        area: hydratedEx.area,
        estimatedArea: hydratedEx.estimatedArea,
        features: mergedFeatures,
        visualCondition: hydratedEx.visualCondition || null,
        geminiEstimateAriary:
          hydratedEx.type === 'sale'
            ? hydratedEx.estimatedPrice
            : hydratedEx.estimatedRent,
      });
      hydratedEx.estimatedPrice =
        hydratedEx.type === 'sale'
          ? Number(hydratedEx.estimatedPrice) > 0
            ? Math.round(Number(hydratedEx.estimatedPrice))
            : priceEst.estimatedAmount
          : null;
      hydratedEx.estimatedRent =
        hydratedEx.type !== 'sale'
          ? Number(hydratedEx.estimatedRent) > 0
            ? Math.round(Number(hydratedEx.estimatedRent))
            : priceEst.estimatedAmount
          : null;
      hydratedEx.estimatedPriceMin =
        Number(hydratedEx.estimatedPriceMin) > 0
          ? Math.round(Number(hydratedEx.estimatedPriceMin))
          : priceEst.minAmount;
      hydratedEx.estimatedPriceMax =
        Number(hydratedEx.estimatedPriceMax) > 0
          ? Math.round(Number(hydratedEx.estimatedPriceMax))
          : priceEst.maxAmount;
      hydratedEx.estimatedPriceConfidence =
        hydratedEx.estimatedPriceConfidence || priceEst.confidence;

      hydratedEx.qualityScore =
        Number(hydratedEx.qualityScore) > 0
          ? Math.round(Number(hydratedEx.qualityScore))
          : computePropertyQualityScore({
              photoCount: Array.isArray(item.gcsImages) ? item.gcsImages.length : 0,
              visualCondition: hydratedEx.visualCondition || null,
              hasExplicitPrice: Boolean(
                (hydratedEx.type === 'sale' && (hydratedEx.price || 0) > 0) ||
                  (hydratedEx.type !== 'sale' && (hydratedEx.rent || 0) > 0),
              ),
              hasMatchedCity: Boolean(item.matchedCityId),
              hasCoords: Boolean(item.resolvedCoords),
              hasPhones: Boolean(hydratedEx.phone1 || hydratedEx.phone2 || hydratedEx.phone3),
              rooms: hydratedEx.rooms,
              livingRoom: hydratedEx.livingRoom,
              area: hydratedEx.area,
              estimatedArea: hydratedEx.estimatedArea,
              descriptionLength: (hydratedEx.description || '').length,
              features: mergedFeatures,
              publishedAt: item.datePosted,
            });

      const baseMissing = this.computeMissingFields({
        type: hydratedEx.type,
        houseType: hydratedEx.houseType,
        price: hydratedEx.price,
        rent: hydratedEx.rent,
        matchedCityId: item.matchedCityId,
        rooms: hydratedEx.rooms,
        toilet: hydratedEx.toilet,
        bathrooms: hydratedEx.bathrooms,
        area: hydratedEx.area,
        phones: [hydratedEx.phone1, hydratedEx.phone2, hydratedEx.phone3],
        features: mergedFeatures,
        featureVerification: verification,
        rawContent: item.rawContent,
      });

      const computedLane = this.computeDisplayWorkflowLane({
        autoApproved: Boolean(item.autoApproved),
        matchedCityId: item.matchedCityId,
        gcsImages: item.gcsImages,
        extracted: hydratedEx,
      });

      return {
        ...item,
        extracted: hydratedEx,
        featureVerification: verification,
        missingFields: baseMissing,
        workflowLane: computedLane,
        autoApproved: Boolean(item.autoApproved),
        autoApproveReason: item.autoApproveReason || null,
        contactFollowUpStatus: item.contactFollowUpStatus || 'none',
        contactFollowUpAt: item.contactFollowUpAt || null,
      };
    });

    return {
      items: hydratedItems,
      total,
      page,
      limit,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        autoApproved: autoApprovedCount,
        fastCheck: fastCheckCount,
        callQueue: callQueueCount,
        waitingReply: waitingReplyCount,
      },
    };
  }

  private async mergeCandidatePatch(
    candidate: FbIngestedCandidateDocument,
    patch: Record<string, any>,
  ) {
    const extracted = { ...(candidate.extracted || {}) };

    const scalarFields = [
      'title',
      'description',
      'type',
      'houseType',
      'price',
      'rent',
      'estimatedPrice',
      'estimatedRent',
      'estimatedPriceMin',
      'estimatedPriceMax',
      'estimatedPriceConfidence',
      'visualCondition',
      'qualityScore',
      'rooms',
      'livingRoom',
      'kitchen',
      'toilet',
      'bathrooms',
      'area',
      'estimatedArea',
      'visitFee',
      'cautionPercent',
      'cautionAmount',
      'commissionPercent',
      'commissionAmount',
      'floor',
      'phone1',
      'phone2',
      'phone3',
    ];

    for (const key of scalarFields) {
      if (key in patch) {
        if (key === 'phone1' || key === 'phone2' || key === 'phone3') {
          const val = patch[key] ? String(patch[key]).trim() : '';
          extracted[key] = val ? normalizeMalagasyPhone(val) || val : null;
        } else if (key === 'houseType') {
          extracted[key] = patch[key] ? normalizeHouseType(patch[key]) || null : null;
        } else if (key === 'description') {
          extracted[key] = normalizePreservingLayout(String(patch[key] ?? ''));
        } else {
          extracted[key] = patch[key];
        }
      }
    }

    // Recalculate cautionAmount / commissionAmount when rent or percentage changes
    const currentRent =
      typeof extracted.rent === 'number' && Number.isFinite(extracted.rent) && extracted.rent > 0
        ? Math.round(extracted.rent)
        : null;
    if (currentRent) {
      if (
        ('cautionPercent' in patch || 'rent' in patch) &&
        !('cautionAmount' in patch)
      ) {
        extracted.cautionAmount =
          typeof extracted.cautionPercent === 'number' && extracted.cautionPercent > 0
            ? Math.round((currentRent * extracted.cautionPercent) / 100)
            : extracted.cautionPercent === 0
              ? 0
              : null;
      }
      if (
        ('commissionPercent' in patch || 'rent' in patch) &&
        !('commissionAmount' in patch)
      ) {
        extracted.commissionAmount =
          typeof extracted.commissionPercent === 'number' && extracted.commissionPercent > 0
            ? Math.round((currentRent * extracted.commissionPercent) / 100)
            : extracted.commissionPercent === 0
              ? 0
              : null;
      }
    }

    const mergedFeatures: Record<string, boolean> = { ...(extracted.features || {}) };
    if (patch.features && typeof patch.features === 'object') {
      for (const feat of PROPERTY_FEATURE_KEYS) {
        if (feat in patch.features) {
          mergedFeatures[feat] = Boolean(patch.features[feat]);
        }
      }
    }

    const isVerificationState = (
      value: unknown,
    ): value is AccessVerificationState =>
      value === 'yes' || value === 'no' || value === 'unknown';

    const nextVerification = deriveFeatureVerification(
      mergedFeatures,
      candidate.rawContent,
      (candidate as any).featureVerification,
    );

    if (patch.features && typeof patch.features === 'object') {
      if ('carAccess' in patch.features) {
        if (patch.features.carAccess) {
          nextVerification.carAccess = 'yes';
          if (
            patch.features.motoAccess !== false &&
            patch.featureVerification?.motoAccess !== 'no'
          ) {
            mergedFeatures.motoAccess = true;
            nextVerification.motoAccess = 'yes';
          }
        } else if (!patch.featureVerification?.carAccess) {
          nextVerification.carAccess = mergedFeatures.motoAccess ? 'no' : 'unknown';
        }
      }
      if ('motoAccess' in patch.features) {
        if (patch.features.motoAccess) {
          nextVerification.motoAccess = 'yes';
          if (!mergedFeatures.carAccess && patch.featureVerification?.carAccess !== 'yes') {
            nextVerification.carAccess = 'no';
          }
        } else if (!patch.featureVerification?.motoAccess) {
          nextVerification.motoAccess = 'unknown';
          if (mergedFeatures.carAccess) {
            mergedFeatures.carAccess = false;
            if (!patch.featureVerification?.carAccess) {
              nextVerification.carAccess = 'unknown';
            }
          }
        }
      }
      if (
        ('waterPumpSupplyJirama' in patch.features ||
          'waterPumpSupply' in patch.features ||
          'waterWellSupply' in patch.features ||
          'waterFetchExternal' in patch.features) &&
        !patch.featureVerification?.waterSupply
      ) {
        nextVerification.waterSupply = hasKnownWaterSupply(mergedFeatures)
          ? 'yes'
          : 'unknown';
      }
      if (
        ('electricityJirama' in patch.features ||
          'electricityPower' in patch.features ||
          'solarPanels' in patch.features) &&
        !patch.featureVerification?.electricitySupply
      ) {
        nextVerification.electricitySupply = hasKnownElectricitySupply(
          mergedFeatures,
        )
          ? 'yes'
          : 'unknown';
      }
      if (
        'furnishedProperty' in patch.features &&
        !patch.featureVerification?.furnishedProperty
      ) {
        nextVerification.furnishedProperty = mergedFeatures.furnishedProperty
          ? 'yes'
          : 'no';
      }
    }

    if (patch.featureVerification && typeof patch.featureVerification === 'object') {
      const incoming = patch.featureVerification as Record<string, unknown>;
      if (isVerificationState(incoming.carAccess)) {
        nextVerification.carAccess = incoming.carAccess;
        mergedFeatures.carAccess = incoming.carAccess === 'yes';
        if (incoming.carAccess === 'yes' && incoming.motoAccess !== 'no') {
          nextVerification.motoAccess = 'yes';
          mergedFeatures.motoAccess = true;
        }
      }
      if (isVerificationState(incoming.motoAccess)) {
        nextVerification.motoAccess = incoming.motoAccess;
        mergedFeatures.motoAccess = incoming.motoAccess === 'yes';
        if (incoming.motoAccess === 'no') {
          nextVerification.carAccess = 'no';
          mergedFeatures.carAccess = false;
        } else if (
          incoming.motoAccess === 'yes' &&
          !mergedFeatures.carAccess &&
          incoming.carAccess === undefined &&
          nextVerification.carAccess === 'unknown'
        ) {
          nextVerification.carAccess = 'no';
        } else if (
          incoming.motoAccess === 'unknown' &&
          incoming.carAccess !== 'yes' &&
          mergedFeatures.carAccess
        ) {
          nextVerification.carAccess = 'unknown';
          mergedFeatures.carAccess = false;
        }
      }
      if (isVerificationState(incoming.waterSupply)) {
        nextVerification.waterSupply = incoming.waterSupply;
        if (incoming.waterSupply === 'no') {
          mergedFeatures.waterPumpSupplyJirama = false;
          mergedFeatures.waterPumpSupply = false;
          mergedFeatures.waterWellSupply = false;
          mergedFeatures.waterFetchExternal = false;
        }
      }
      if (isVerificationState(incoming.electricitySupply)) {
        nextVerification.electricitySupply = incoming.electricitySupply;
        if (incoming.electricitySupply === 'no') {
          mergedFeatures.electricityJirama = false;
          mergedFeatures.electricityPower = false;
          mergedFeatures.solarPanels = false;
        }
      }
      if (isVerificationState(incoming.furnishedProperty)) {
        nextVerification.furnishedProperty = incoming.furnishedProperty;
        mergedFeatures.furnishedProperty = incoming.furnishedProperty === 'yes';
      }
    }

    // Physical invariant: car access always implies moto access
    if (mergedFeatures.carAccess) {
      mergedFeatures.motoAccess = true;
      nextVerification.motoAccess = 'yes';
    }

    extracted.features = mergedFeatures;
    extracted.estimatedArea = estimatePropertyArea({
      houseType: extracted.houseType,
      rooms: extracted.rooms,
      livingRoom: extracted.livingRoom,
      kitchen: extracted.kitchen,
      toilet: extracted.toilet,
      bathrooms: extracted.bathrooms,
      area: extracted.area,
      features: mergedFeatures,
    });

    const priceEst = estimatePropertyPriceAriary({
      type: extracted.type === 'sale' ? 'sale' : 'rent',
      houseType: extracted.houseType,
      fokontany: candidate.matchedCityLabel || null,
      locationHints: extracted.locationHints,
      rawText: `${candidate.rawContent || ''}\n${extracted.description || ''}`,
      rooms: extracted.rooms,
      livingRoom: extracted.livingRoom,
      kitchen: extracted.kitchen,
      bathrooms: extracted.bathrooms,
      toilet: extracted.toilet,
      area: extracted.area,
      estimatedArea: extracted.estimatedArea,
      features: mergedFeatures,
      visualCondition: extracted.visualCondition || null,
      geminiEstimateAriary:
        extracted.type === 'sale'
          ? extracted.estimatedPrice
          : extracted.estimatedRent,
    });
    extracted.estimatedPrice =
      extracted.type === 'sale' ? priceEst.estimatedAmount : null;
    extracted.estimatedRent =
      extracted.type !== 'sale' ? priceEst.estimatedAmount : null;
    extracted.estimatedPriceMin = priceEst.minAmount;
    extracted.estimatedPriceMax = priceEst.maxAmount;
    extracted.estimatedPriceConfidence = priceEst.confidence;
    extracted.qualityScore = computePropertyQualityScore({
      photoCount: Array.isArray(candidate.gcsImages) ? candidate.gcsImages.length : 0,
      visualCondition: extracted.visualCondition || null,
      hasExplicitPrice: Boolean(
        (extracted.type === 'sale' && (extracted.price || 0) > 0) ||
          (extracted.type !== 'sale' && (extracted.rent || 0) > 0),
      ),
      hasMatchedCity: Boolean(candidate.matchedCityId),
      hasCoords: Boolean(candidate.resolvedCoords),
      hasPhones: Boolean(extracted.phone1 || extracted.phone2 || extracted.phone3),
      rooms: extracted.rooms,
      livingRoom: extracted.livingRoom,
      area: extracted.area,
      estimatedArea: extracted.estimatedArea,
      descriptionLength: String(extracted.description || '').length,
      features: mergedFeatures,
      publishedAt: candidate.datePosted,
    });
    (candidate as any).featureVerification = nextVerification;

    if (Array.isArray(patch.gcsImages)) {
      const removedUrls = (candidate.gcsImages || []).filter(
        (u) => !patch.gcsImages.includes(u),
      );
      if (removedUrls.length > 0) {
        await this.gcsService.deleteGcsUrls(removedUrls);
      }
      candidate.gcsImages = patch.gcsImages;
    }

    if ('matchedCityId' in patch) {
      const nextCityId = patch.matchedCityId || null;
      const cityChanged = nextCityId !== (candidate.matchedCityId || null);
      candidate.matchedCityId = nextCityId;

      if (patch.resolvedCoords && typeof patch.resolvedCoords?.lat === 'number' && typeof patch.resolvedCoords?.lng === 'number') {
        candidate.resolvedCoords = {
          lat: patch.resolvedCoords.lat,
          lng: patch.resolvedCoords.lng,
        };
        candidate.resolvedPlaceName = patch.resolvedPlaceName ? String(patch.resolvedPlaceName) : null;
        candidate.resolvedAddress = patch.resolvedAddress ? String(patch.resolvedAddress) : null;
        candidate.resolutionSource = patch.resolutionSource || 'google_places_cache';
      } else if (cityChanged) {
        candidate.resolvedPlaceName = null;
        candidate.resolvedAddress = null;
        candidate.resolutionSource = null;
      }

      if (Array.isArray(patch.cityCandidates)) {
        candidate.cityCandidates = patch.cityCandidates;
      }

      if (cityChanged) {
        candidate.manualCityOverride = Boolean(nextCityId && !patch.resolvedPlaceName);
      }

      if (nextCityId && Types.ObjectId.isValid(nextCityId)) {
        const city = await this.cityModel
          .findById(nextCityId, { fokontany: 1, commune: 1, district: 1, coords: 1 })
          .lean();
        if (city) {
          candidate.matchedCityLabel = [city.fokontany, city.commune, city.district]
            .filter(Boolean)
            .join(' — ');
          if (cityChanged && !patch.resolvedCoords) {
            candidate.resolvedCoords = (city as any).coords || null;
          }
        }
      } else {
        candidate.matchedCityLabel = null;
        if (cityChanged && !patch.resolvedCoords) {
          candidate.resolvedCoords = null;
        }
      }
    }

    candidate.extracted = extracted;
    if (
      patch.contactFollowUpStatus === 'none' ||
      patch.contactFollowUpStatus === 'called' ||
      patch.contactFollowUpStatus === 'messaged_waiting' ||
      patch.contactFollowUpStatus === 'answered'
    ) {
      if (candidate.contactFollowUpStatus !== patch.contactFollowUpStatus) {
        candidate.contactFollowUpStatus = patch.contactFollowUpStatus;
        candidate.contactFollowUpAt = new Date();
      }
    }
    candidate.workflowLane = this.computeDisplayWorkflowLane({
      autoApproved: Boolean(candidate.autoApproved),
      matchedCityId: candidate.matchedCityId,
      gcsImages: candidate.gcsImages,
      extracted,
    });
    candidate.missingFields = this.computeMissingFields({
      type: extracted.type,
      houseType: extracted.houseType,
      price: extracted.price,
      rent: extracted.rent,
      matchedCityId: candidate.matchedCityId,
      rooms: extracted.rooms,
      toilet: extracted.toilet,
      bathrooms: extracted.bathrooms,
      area: extracted.area,
      phones: [extracted.phone1, extracted.phone2, extracted.phone3],
      features: extracted.features,
      featureVerification: nextVerification,
      rawContent: candidate.rawContent,
    });
  }

  private applyDeterministicReanalysis(candidate: FbIngestedCandidateDocument): boolean {
    const prevSnapshot = JSON.stringify(candidate.extracted || {});
    const extracted = { ...(candidate.extracted || {}) };
    const existingFeatures = extracted.features || {};
    const existingVerification = (candidate as any).featureVerification || {};
    const isCommercial = isCommercialHouseType(extracted.houseType);

    const restoredDesc = preserveDescriptionLayout(
      candidate.rawContent || '',
      typeof extracted.description === 'string' ? extracted.description : null,
    );
    const { features: mergedFeatures, featureVerification } =
      mergeGeminiAndDeterministicFeatures(
        existingFeatures,
        candidate.rawContent || '',
        restoredDesc,
        {
          isCommercial,
          existingVerification,
        },
      );

    // Preserve explicit admin-confirmed "no" when the post text itself is silent
    if (
      existingVerification.carAccess === 'no' &&
      featureVerification.carAccess === 'unknown'
    ) {
      featureVerification.carAccess = 'no';
      mergedFeatures.carAccess = false;
    }
    if (
      existingVerification.motoAccess === 'no' &&
      featureVerification.motoAccess === 'unknown'
    ) {
      featureVerification.motoAccess = 'no';
      mergedFeatures.motoAccess = false;
      featureVerification.carAccess = 'no';
      mergedFeatures.carAccess = false;
    }
    if (
      existingVerification.waterSupply === 'no' &&
      featureVerification.waterSupply !== 'yes'
    ) {
      featureVerification.waterSupply = 'no';
      mergedFeatures.waterPumpSupplyJirama = false;
      mergedFeatures.waterPumpSupply = false;
      mergedFeatures.waterWellSupply = false;
      mergedFeatures.waterFetchExternal = false;
    }
    if (
      existingVerification.electricitySupply === 'no' &&
      featureVerification.electricitySupply !== 'yes'
    ) {
      featureVerification.electricitySupply = 'no';
      mergedFeatures.electricityJirama = false;
      mergedFeatures.electricityPower = false;
      mergedFeatures.solarPanels = false;
    }
    if (
      existingVerification.furnishedProperty === 'no' &&
      featureVerification.furnishedProperty === 'unknown'
    ) {
      featureVerification.furnishedProperty = 'no';
      mergedFeatures.furnishedProperty = false;
    }

    const resolvedRooms = resolveResidentialRoomDefaults({
      rawText: `${candidate.rawContent || ''}\n${restoredDesc}`,
      isCommercial,
      houseType: extracted.houseType,
      rooms: extracted.rooms,
      livingRoom: extracted.livingRoom,
      kitchen: extracted.kitchen,
      toilet: extracted.toilet,
      bathrooms: extracted.bathrooms,
      rentAriary: extracted.rent,
      priceAriary: extracted.price,
    });

    const fees = extractAgencyFees(candidate.rawContent || '', extracted, extracted.rent);
    extracted.rooms = resolvedRooms.rooms;
    extracted.livingRoom = resolvedRooms.livingRoom;
    extracted.kitchen = resolvedRooms.kitchen;
    extracted.toilet = resolvedRooms.toilet;
    extracted.bathrooms = resolvedRooms.bathrooms;
    extracted.visitFee = fees.visitFee ?? extracted.visitFee ?? null;
    extracted.cautionPercent = fees.cautionPercent ?? extracted.cautionPercent ?? null;
    extracted.cautionAmount = fees.cautionAmount ?? extracted.cautionAmount ?? null;
    extracted.commissionPercent = fees.commissionPercent ?? extracted.commissionPercent ?? null;
    extracted.commissionAmount = fees.commissionAmount ?? extracted.commissionAmount ?? null;
    extracted.description = restoredDesc;
    extracted.features = mergedFeatures;
    extracted.estimatedArea = estimatePropertyArea({
      houseType: extracted.houseType,
      rooms: extracted.rooms,
      livingRoom: extracted.livingRoom,
      kitchen: extracted.kitchen,
      toilet: extracted.toilet,
      bathrooms: extracted.bathrooms,
      area: extracted.area,
      features: mergedFeatures,
    });

    const priceEst = estimatePropertyPriceAriary({
      type: extracted.type === 'sale' ? 'sale' : 'rent',
      houseType: extracted.houseType,
      fokontany: candidate.matchedCityLabel || null,
      locationHints: extracted.locationHints,
      rawText: `${candidate.rawContent || ''}\n${restoredDesc}`,
      rooms: extracted.rooms,
      livingRoom: extracted.livingRoom,
      kitchen: extracted.kitchen,
      bathrooms: extracted.bathrooms,
      toilet: extracted.toilet,
      area: extracted.area,
      estimatedArea: extracted.estimatedArea,
      features: mergedFeatures,
      visualCondition: extracted.visualCondition || null,
      geminiEstimateAriary:
        extracted.type === 'sale'
          ? extracted.estimatedPrice
          : extracted.estimatedRent,
    });
    extracted.estimatedPrice =
      extracted.type === 'sale' ? priceEst.estimatedAmount : null;
    extracted.estimatedRent =
      extracted.type !== 'sale' ? priceEst.estimatedAmount : null;
    extracted.estimatedPriceMin = priceEst.minAmount;
    extracted.estimatedPriceMax = priceEst.maxAmount;
    extracted.estimatedPriceConfidence = priceEst.confidence;
    extracted.qualityScore = computePropertyQualityScore({
      photoCount: Array.isArray(candidate.gcsImages) ? candidate.gcsImages.length : 0,
      visualCondition: extracted.visualCondition || null,
      hasExplicitPrice: Boolean(
        (extracted.type === 'sale' && (extracted.price || 0) > 0) ||
          (extracted.type !== 'sale' && (extracted.rent || 0) > 0),
      ),
      hasMatchedCity: Boolean(candidate.matchedCityId),
      hasCoords: Boolean(candidate.resolvedCoords),
      hasPhones: Boolean(extracted.phone1 || extracted.phone2 || extracted.phone3),
      rooms: extracted.rooms,
      livingRoom: extracted.livingRoom,
      area: extracted.area,
      estimatedArea: extracted.estimatedArea,
      descriptionLength: restoredDesc.length,
      features: mergedFeatures,
      publishedAt: candidate.datePosted,
    });

    const nextMissing = this.computeMissingFields({
      type: extracted.type,
      houseType: extracted.houseType,
      price: extracted.price,
      rent: extracted.rent,
      matchedCityId: candidate.matchedCityId,
      rooms: extracted.rooms,
      toilet: extracted.toilet,
      bathrooms: extracted.bathrooms,
      area: extracted.area,
      phones: [extracted.phone1, extracted.phone2, extracted.phone3],
      features: mergedFeatures,
      featureVerification,
      rawContent: candidate.rawContent,
    });

    const changed =
      JSON.stringify(extracted) !== prevSnapshot ||
      JSON.stringify(featureVerification) !== JSON.stringify(existingVerification) ||
      JSON.stringify(nextMissing) !== JSON.stringify(candidate.missingFields || []);

    candidate.extracted = extracted;
    (candidate as any).featureVerification = featureVerification;
    candidate.missingFields = nextMissing;
    return changed;
  }

  private async applyGeoReanalysisIfEligible(
    candidate: FbIngestedCandidateDocument,
    force = false,
  ): Promise<boolean> {
    if (candidate.manualCityOverride) return false;
    if (typeof this.cityMatcherService?.matchLocation !== 'function') return false;

    const alreadyPlacesResolved =
      candidate.resolutionSource === 'google_places_api' ||
      candidate.resolutionSource === 'google_places_cache';
    if (!force && alreadyPlacesResolved && candidate.matchedCityId) {
      return false;
    }

    const hints = Array.isArray(candidate.extracted?.locationHints)
      ? candidate.extracted.locationHints.map(String).filter(Boolean)
      : [];
    if (hints.length === 0 && candidate.matchedCityId && !force) {
      return false;
    }

    const cityMatch = await this.cityMatcherService.matchLocation(
      hints,
      `${candidate.extracted?.title || ''}\n${candidate.rawContent || ''}`,
      candidate.groupName || '',
    );

    const nextCityId = cityMatch.bestMatch?._id || null;
    const nextCandidates = cityMatch.candidates.map((c) => ({
      _id: c._id,
      label: c.label,
      score: c.score,
      distanceMeters: c.distanceMeters ?? null,
      coords: c.coords,
    }));

    const changed =
      nextCityId !== (candidate.matchedCityId || null) ||
      cityMatch.resolutionSource !== (candidate.resolutionSource || null) ||
      cityMatch.resolvedPlaceName !== (candidate.resolvedPlaceName || null) ||
      JSON.stringify(nextCandidates) !== JSON.stringify(candidate.cityCandidates || []);

    if (!changed) return false;

    candidate.matchedCityId = nextCityId;
    candidate.matchedCityLabel = cityMatch.bestMatch?.label || null;
    candidate.cityCandidates = nextCandidates;
    candidate.resolvedCoords = cityMatch.resolvedCoords || null;
    candidate.resolvedPlaceName = cityMatch.resolvedPlaceName || null;
    candidate.resolvedAddress = cityMatch.resolvedAddress || null;
    candidate.resolutionSource = cityMatch.resolutionSource || null;
    return true;
  }

  async reanalyzeCandidate(id: string) {
    const candidate = await this.candidateModel.findById(id);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    const geoChanged = await this.applyGeoReanalysisIfEligible(candidate, true);
    const featureChanged = this.applyDeterministicReanalysis(candidate);
    const nextLane = this.computeDisplayWorkflowLane(candidate);
    const laneChanged = candidate.workflowLane !== nextLane;
    if (laneChanged) {
      candidate.workflowLane = nextLane;
    }
    if (geoChanged || featureChanged || laneChanged) {
      await candidate.save();
    }
    return candidate;
  }

  async reanalyzePendingCandidates() {
    const candidates = await this.candidateModel.find({ status: 'pending' });
    let updated = 0;
    let nextIdx = 0;
    const workers = Array.from(
      { length: Math.min(3, Math.max(1, candidates.length)) },
      async () => {
        while (nextIdx < candidates.length) {
          const candidate = candidates[nextIdx++];
          const geoChanged = await this.applyGeoReanalysisIfEligible(candidate, false);
          const featureChanged = this.applyDeterministicReanalysis(candidate);
          const nextLane = this.computeDisplayWorkflowLane(candidate);
          const laneChanged = candidate.workflowLane !== nextLane;
          if (laneChanged) {
            candidate.workflowLane = nextLane;
          }
          if (geoChanged || featureChanged || laneChanged) {
            await candidate.save();
            updated++;
          }
        }
      },
    );
    await Promise.all(workers);
    return { analyzed: candidates.length, updated };
  }

  async autoApprovePendingCandidates() {
    let config: Partial<FbIngestionConfig> | null = null;
    try {
      const q = this.configModel?.findOne?.({ key: 'default' }) as any;
      config = q && typeof q.lean === 'function' ? await q.lean() : await q;
    } catch {
      config = null;
    }

    const pendingCandidates = await this.candidateModel.find({ status: 'pending' });
    let autoApproved = 0;

    for (const candidate of pendingCandidates) {
      try {
        const geoChanged = await this.applyGeoReanalysisIfEligible(candidate, false);
        const featureChanged = this.applyDeterministicReanalysis(candidate);
        const triage = this.evaluateCandidateWorkflowLane(candidate, config, {
          forceAutoEnabled: true,
        });
        const nextLane = triage.eligibleForAutoApprove
          ? 'fast_check'
          : triage.workflowLane;
        const laneChanged = candidate.workflowLane !== nextLane;
        if (laneChanged) {
          candidate.workflowLane = nextLane;
        }
        if (geoChanged || featureChanged || (laneChanged && !triage.eligibleForAutoApprove)) {
          await candidate.save();
        }

        if (triage.eligibleForAutoApprove) {
          await this.approveCandidate(
            String(candidate._id),
            'system_auto',
            undefined,
            {
              isAutoApproved: true,
              reason: triage.reason,
            },
          );
          autoApproved++;
        }
      } catch (err) {
        this.logger.warn(
          `Bulk auto-approve failed for candidate ${String(candidate._id)}: ${(err as Error).message}`,
        );
      }
    }

    if (autoApproved > 0 && this.configModel?.updateOne) {
      await this.configModel.updateOne(
        { key: 'default' },
        { $inc: { totalAutoApproved: autoApproved } },
      );
    }

    return {
      scanned: pendingCandidates.length,
      autoApproved,
    };
  }

  async updateCandidate(id: string, patch: Record<string, any>) {
    const candidate = await this.candidateModel.findById(id);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    await this.mergeCandidatePatch(candidate, patch);
    await candidate.save();
    return candidate;
  }

  async approveCandidate(
    id: string,
    adminUserId: string,
    finalEdits?: Record<string, any>,
    opts?: { isAutoApproved?: boolean; reason?: string | null },
  ) {
    const candidate = await this.candidateModel.findById(id);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    if (candidate.status === 'approved' && candidate.publishedPropertyId) {
      throw new BadRequestException('Candidate is already approved and published');
    }

    if (finalEdits && Object.keys(finalEdits).length > 0) {
      await this.mergeCandidatePatch(candidate, finalEdits);
    }

    const ex = candidate.extracted || {};
    if (ex.type !== 'rent' && ex.type !== 'sale') {
      throw new BadRequestException('Listing type (rent or sale) is required before publishing');
    }
    if (!candidate.matchedCityId || !Types.ObjectId.isValid(candidate.matchedCityId)) {
      throw new BadRequestException('A valid City / Fokontany must be selected before publishing');
    }
    const cityDoc = await this.cityModel.findById(candidate.matchedCityId).lean();
    if (!cityDoc) {
      throw new BadRequestException('Selected City / Fokontany was not found');
    }

    const amount = ex.type === 'sale' ? Number(ex.price) : Number(ex.rent);
    const hasExplicitAmount = Number.isFinite(amount) && amount > 0;
    const fallbackEstimation = estimatePropertyPriceAriary({
      type: ex.type === 'sale' ? 'sale' : 'rent',
      houseType: ex.houseType,
      fokontany: cityDoc.fokontany || null,
      commune: cityDoc.commune || null,
      district: cityDoc.district || null,
      locationHints: ex.locationHints,
      rawText: `${candidate.rawContent || ''}\n${ex.description || ''}`,
      rooms: ex.rooms,
      livingRoom: ex.livingRoom,
      kitchen: ex.kitchen,
      bathrooms: ex.bathrooms,
      toilet: ex.toilet,
      area: ex.area,
      estimatedArea: ex.estimatedArea,
      features: ex.features,
      visualCondition: ex.visualCondition || null,
      geminiEstimateAriary:
        ex.type === 'sale' ? ex.estimatedPrice : ex.estimatedRent,
    });
    const resolvedEstimatedAmount =
      ex.type === 'sale'
        ? Number(ex.estimatedPrice) > 0
          ? Math.round(Number(ex.estimatedPrice))
          : fallbackEstimation.estimatedAmount
        : Number(ex.estimatedRent) > 0
          ? Math.round(Number(ex.estimatedRent))
          : fallbackEstimation.estimatedAmount;

    const normalizedAuthorName =
      candidate.authorName &&
      candidate.authorName.trim() &&
      candidate.authorName.trim().toLowerCase() !== 'facebook' &&
      candidate.authorName.trim().toLowerCase() !== 'facebook user'
        ? candidate.authorName.trim()
        : 'Membre TranoGasy';

    const fbProfileUrl = normalizeFbProfileUrl(candidate.authorUrl);
    const fbUserId =
      candidate.authorFbId || extractFbUserId([candidate.authorUrl]) || null;

    // Ensure publisher avatar is persisted in GCS (re-download if candidate only holds a temp FB CDN URL)
    let permanentAvatarUrl: string | null = null;
    if (candidate.authorAvatarUrl) {
      if (this.gcsService.isPermanentGcsUrl(candidate.authorAvatarUrl)) {
        permanentAvatarUrl = candidate.authorAvatarUrl;
      } else {
        permanentAvatarUrl = await this.gcsService.reuploadFbAvatar(
          candidate.authorAvatarUrl,
          fbUserId || candidate.canonicalPostId,
        );
      }
    }

    const locationLabel = [cityDoc.commune, cityDoc.district]
      .filter(Boolean)
      .join(', ') || 'Antananarivo, Madagascar';

    // Create/reuse dedicated shadow User profile for this Facebook publisher
    const shadowOwner = await this.upsertShadowFbPublisher({
      fbUserId,
      fbProfileUrl,
      username: normalizedAuthorName,
      avatar: permanentAvatarUrl,
      location: locationLabel,
    });

    const normalizePhone = (raw?: any) => {
      if (!raw) return null;
      const str = String(raw).trim();
      return normalizeMalagasyPhone(str) || str || null;
    };

    const rawPostDate = candidate.datePosted || (candidate as any).created_at;
    const fbCreatedAt =
      rawPostDate && !Number.isNaN(new Date(rawPostDate).getTime())
        ? new Date(rawPostDate)
        : new Date();

    const cityCoords =
      cityDoc.coords &&
      typeof cityDoc.coords.lat === 'number' &&
      typeof cityDoc.coords.lng === 'number'
        ? cityDoc.coords
        : null;
    const resolvedCoords =
      !candidate.manualCityOverride &&
      candidate.resolvedCoords &&
      typeof candidate.resolvedCoords.lat === 'number' &&
      typeof candidate.resolvedCoords.lng === 'number'
        ? candidate.resolvedCoords
        : null;
    const listingCoords =
      resolvedCoords || cityCoords || { lat: -18.8792, lng: 47.5079 };

    const propertyPayload = {
      title: String(ex.title || 'Propriété').trim(),
      description: normalizePreservingLayout(
        String(ex.description || candidate.rawContent),
      ),
      city: String(cityDoc._id),
      type: ex.type,
      houseType: normalizeHouseType(ex.houseType) || 'maison',
      ...(ex.type === 'sale'
        ? {
            price: hasExplicitAmount ? Math.round(amount) : null,
            estimatedPrice: resolvedEstimatedAmount,
          }
        : {
            rent: hasExplicitAmount ? Math.round(amount) : null,
            estimatedRent: resolvedEstimatedAmount,
          }),
      isPriceEstimated: !hasExplicitAmount,
      estimatedPriceMin:
        Number(ex.estimatedPriceMin) > 0
          ? Math.round(Number(ex.estimatedPriceMin))
          : fallbackEstimation.minAmount,
      estimatedPriceMax:
        Number(ex.estimatedPriceMax) > 0
          ? Math.round(Number(ex.estimatedPriceMax))
          : fallbackEstimation.maxAmount,
      estimatedPriceConfidence:
        ex.estimatedPriceConfidence || fallbackEstimation.confidence,
      visualCondition: ex.visualCondition || null,
      qualityScore:
        Number(ex.qualityScore) > 0
          ? Math.round(Number(ex.qualityScore))
          : computePropertyQualityScore({
              photoCount: Array.isArray(candidate.gcsImages)
                ? candidate.gcsImages.length
                : 0,
              visualCondition: ex.visualCondition || null,
              hasExplicitPrice: hasExplicitAmount,
              hasMatchedCity: true,
              hasCoords: Boolean(listingCoords),
              hasPhones: Boolean(ex.phone1 || ex.phone2 || ex.phone3),
              rooms: ex.rooms,
              livingRoom: ex.livingRoom,
              area: ex.area,
              estimatedArea: ex.estimatedArea,
              descriptionLength: String(ex.description || candidate.rawContent || '').length,
              features: ex.features,
              publishedAt: fbCreatedAt,
            }),
      contactAccessLocked: true,
      contactUnlockCostJp: 50,
      rooms: Math.max(0, Number(ex.rooms ?? 0)),
      livingRoom: Math.max(0, Number(ex.livingRoom ?? 0)),
      kitchen: Math.max(0, Number(ex.kitchen ?? 0)),
      toilet: Math.max(0, Number(ex.toilet ?? 0)),
      bathrooms: Math.max(0, Number(ex.bathrooms ?? 0)),
      area: Math.max(0, Number(ex.area ?? 0)),
      estimatedArea:
        typeof ex.estimatedArea === 'number' && ex.estimatedArea > 0
          ? Math.round(ex.estimatedArea)
          : estimatePropertyArea({
              houseType: ex.houseType,
              rooms: ex.rooms,
              livingRoom: ex.livingRoom,
              kitchen: ex.kitchen,
              toilet: ex.toilet,
              bathrooms: ex.bathrooms,
              area: ex.area,
              features: ex.features,
            }),
      visitFee:
        ex.visitFee !== undefined && ex.visitFee !== null ? Math.round(Number(ex.visitFee)) : null,
      cautionPercent:
        ex.cautionPercent !== undefined && ex.cautionPercent !== null
          ? Math.round(Number(ex.cautionPercent))
          : null,
      cautionAmount:
        ex.cautionAmount !== undefined && ex.cautionAmount !== null
          ? Math.round(Number(ex.cautionAmount))
          : null,
      commissionPercent:
        ex.commissionPercent !== undefined && ex.commissionPercent !== null
          ? Math.round(Number(ex.commissionPercent))
          : null,
      commissionAmount:
        ex.commissionAmount !== undefined && ex.commissionAmount !== null
          ? Math.round(Number(ex.commissionAmount))
          : null,
      floor: ex.floor || null,
      phone1: normalizePhone(ex.phone1),
      phone2: normalizePhone(ex.phone2),
      phone3: normalizePhone(ex.phone3),
      images: candidate.gcsImages || [],
      owner: String(shadowOwner._id),
      coords: listingCoords,
      status: 'available',
      origin: 'facebook_scraper',
      claimStatus: 'unclaimed',
      claimedBy: null,
      claimedAt: null,
      created_at: fbCreatedAt,
      sources: {
        fbUserId: fbUserId || undefined,
        username: normalizedAuthorName,
        avatar: permanentAvatarUrl || undefined,
        link: fbProfileUrl || undefined,
        postId: candidate.canonicalPostId,
        postUrl: candidate.postUrl,
        groupId: candidate.groupId,
      },
      features: ex.features || {},
    };

    const createdProperty = (await this.propertiesService.create(propertyPayload)) as any;

    candidate.status = 'approved';
    candidate.publishedPropertyId = String(createdProperty._id);
    if (opts?.isAutoApproved) {
      candidate.autoApproved = true;
      candidate.autoApproveReason = opts.reason || 'Auto-validé IA';
      candidate.workflowLane = 'auto_published';
    } else {
      candidate.autoApproved = false;
      candidate.autoApproveReason = null;
      candidate.workflowLane = 'fast_check';
    }
    if (permanentAvatarUrl) {
      candidate.authorAvatarUrl = permanentAvatarUrl;
    }
    candidate.reviewedAt = new Date();
    await candidate.save();

    await this.groupModel.updateOne(
      { groupId: candidate.groupId },
      { $inc: { approvedCount: 1 } },
    );

    return {
      candidate,
      property: createdProperty,
    };
  }

  async unpublishCandidate(id: string) {
    const candidate = await this.candidateModel.findById(id);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    if (candidate.status !== 'approved') {
      throw new BadRequestException('Candidate is not currently published');
    }

    if (candidate.publishedPropertyId) {
      await this.propertyModel.findByIdAndDelete(candidate.publishedPropertyId);
    }

    if (this.groupModel?.updateOne) {
      await this.groupModel.updateOne(
        { groupId: candidate.groupId, approvedCount: { $gt: 0 } },
        { $inc: { approvedCount: -1 } },
      );
    }

    candidate.status = 'pending';
    candidate.publishedPropertyId = null;
    candidate.autoApproved = false;
    candidate.autoApproveReason = null;
    candidate.workflowLane = this.computeDisplayWorkflowLane({
      autoApproved: false,
      matchedCityId: candidate.matchedCityId,
      gcsImages: candidate.gcsImages,
      extracted: candidate.extracted,
    });
    candidate.reviewedAt = null;
    await candidate.save();

    return { candidate };
  }

  /**
   * Upserts a clean native-looking Shadow User document for a scraped Facebook publisher.
   * Never matches by display name alone (prevents cross-contaminating namesakes) and
   * intentionally leaves `phone` unset until the real person verifies their phone via OTP.
   */
  private async upsertShadowFbPublisher(params: {
    fbUserId?: string | null;
    fbProfileUrl?: string | null;
    username: string;
    avatar?: string | null;
    location?: string | null;
  }): Promise<UserDocument> {
    let existing: UserDocument | null = null;

    if (params.fbUserId) {
      existing = await this.userModel.findOne({
        isShadowAccount: true,
        mergedIntoUserId: null,
        fbUserId: params.fbUserId,
      });
    }

    if (!existing && params.fbProfileUrl) {
      existing = await this.userModel.findOne({
        isShadowAccount: true,
        mergedIntoUserId: null,
        fbProfileUrl: params.fbProfileUrl,
      });
    }

    if (existing) {
      let dirty = false;
      if (params.username && params.username !== 'Membre TranoGasy' && existing.username === 'Membre TranoGasy') {
        existing.username = params.username;
        dirty = true;
      }
      if (params.avatar && (!existing.avatar || !this.gcsService.isPermanentGcsUrl(existing.avatar))) {
        existing.avatar = params.avatar;
        dirty = true;
      }
      if (params.fbUserId && !existing.fbUserId) {
        existing.fbUserId = params.fbUserId;
        dirty = true;
      }
      if (params.fbProfileUrl && !existing.fbProfileUrl) {
        existing.fbProfileUrl = params.fbProfileUrl;
        dirty = true;
      }
      existing.lastConnectedAt = new Date();
      dirty = true;
      if (dirty) {
        await existing.save();
      }
      return existing;
    }

    const created = new this.userModel({
      username: params.username || 'Membre TranoGasy',
      avatar: params.avatar || undefined,
      bio: null,
      location: params.location || 'Antananarivo, Madagascar',
      role: 'user',
      origin: 'facebook_scraper',
      isShadowAccount: true,
      fbUserId: params.fbUserId || null,
      fbProfileUrl: params.fbProfileUrl || null,
      mergedIntoUserId: null,
      created_at: new Date(),
      lastConnectedAt: new Date(),
    });

    return created.save();
  }

  /**
   * Lists live properties with full Admin audit fields (`origin`, `claimStatus`, `sources.*`)
   * so admins can distinguish organic user listings from scraped Facebook posts.
   */
  async listAdminProperties(params: {
    origin?: string;
    claimStatus?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 25));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (params.origin && params.origin !== 'all') {
      if (params.origin === 'facebook_scraper') {
        filter.$or = [
          { origin: 'facebook_scraper' },
          { 'sources.username': { $exists: true, $ne: '' } },
        ];
      } else {
        filter.origin = params.origin;
      }
    }
    if (params.claimStatus && params.claimStatus !== 'all') {
      filter.claimStatus = params.claimStatus;
    }
    if (params.q && params.q.trim()) {
      const escaped = params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { title: rx },
            { propertyNumber: rx },
            { phone1: rx },
            { phone2: rx },
            { phone3: rx },
            { 'sources.username': rx },
            { 'sources.fbUserId': rx },
          ],
        },
      ];
    }

    const [
      items,
      filteredTotal,
      totalCount,
      facebookScraperCount,
      userGeneratedCount,
      adminManualCount,
      unclaimedCount,
      claimedCount,
    ] = await Promise.all([
      this.propertyModel
        .find(filter)
        .populate('city', 'fokontany commune district')
        .populate(
          'owner',
          '_id username avatar role phone isShadowAccount origin fbUserId fbProfileUrl',
        )
        .populate('claimedBy', '_id username phone avatar')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.propertyModel.countDocuments(filter),
      this.propertyModel.countDocuments(),
      this.propertyModel.countDocuments({
        $or: [
          { origin: 'facebook_scraper' },
          { origin: { $exists: false }, 'sources.username': { $exists: true, $ne: '' } },
        ],
      }),
      this.propertyModel.countDocuments({ origin: 'user' }),
      this.propertyModel.countDocuments({ origin: 'admin_manual' }),
      this.propertyModel.countDocuments({ origin: 'facebook_scraper', claimStatus: 'unclaimed' }),
      this.propertyModel.countDocuments({ origin: 'facebook_scraper', claimStatus: 'claimed' }),
    ]);

    return {
      items: items.map((p) => sanitizePropertyForViewer(p, true)),
      total: filteredTotal,
      page,
      totalPages: Math.ceil(filteredTotal / limit) || 1,
      counts: {
        total: totalCount,
        facebookScraper: facebookScraperCount,
        userGenerated: userGeneratedCount,
        adminManual: adminManualCount,
        unclaimed: unclaimedCount,
        claimed: claimedCount,
      },
    };
  }

  private async updateBackfillJobState(
    job: FbBackfillJobState,
    isTerminal = false,
  ): Promise<void> {
    try {
      const cleanJob = this.stripBackfillLeaseMetadata(job);
      if (isTerminal || cleanJob.status !== 'running') {
        await this.configModel.updateOne(
          {
            key: 'default',
            $or: [
              { 'activeBackfill.ownerId': this.instanceId },
              { activeBackfill: null },
              { activeBackfill: { $exists: false } },
            ],
          },
          { $set: { activeBackfill: null, backfillJob: cleanJob } },
        );
      } else {
        await this.configModel.updateOne(
          {
            key: 'default',
            $or: [
              { 'activeBackfill.ownerId': this.instanceId },
              { activeBackfill: null },
              { activeBackfill: { $exists: false } },
            ],
          },
          {
            $set: {
              activeBackfill: {
                ...cleanJob,
                ownerId: this.instanceId,
                ownerHost: this.ownerHost,
                ownerPid: this.ownerPid,
                heartbeatAt: new Date().toISOString(),
              },
            },
          },
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to update backfill job state: ${(err as Error).message}`);
    }
  }

  async getBackfillStatus(): Promise<FbBackfillJobState> {
    const cfg = await this.getConfig();
    const existing = cfg.backfillJob;
    if (!existing) {
      return {
        status: 'idle',
        phase: 'idle',
        message: null,
        current: 0,
        total: 0,
        percent: 0,
        etaSeconds: null,
        currentItemTitle: null,
        scanned: 0,
        migratedScraped: 0,
        markedOrganic: 0,
        markedAdminManual: 0,
        avatarsPersisted: 0,
        errorCount: 0,
        lastError: null,
        startedAt: null,
        finishedAt: null,
        updatedAt: null,
      };
    }

    return this.stripBackfillLeaseMetadata(existing);
  }

  async cancelBackfill(): Promise<FbBackfillJobState> {
    this.isBackfillCancelRequested = true;
    const cfg = await this.getConfig();
    const current = cfg?.backfillJob || (await this.getBackfillStatus());
    if (!this.isBackfillInProgress && current.status === 'running') {
      const stopped: FbBackfillJobState = {
        ...this.stripBackfillLeaseMetadata(current),
        status: 'cancelled',
        phase: 'cancelled',
        message: 'Migration annulée par l’administrateur.',
        etaSeconds: null,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.configModel.updateOne(
        { key: 'default' },
        { $set: { activeBackfill: null, backfillJob: stopped } },
      );
      return stopped;
    }
    const pendingStop: FbBackfillJobState = {
      ...this.stripBackfillLeaseMetadata(current),
      message: 'Annulation demandée — arrêt après l’annonce en cours...',
      updatedAt: new Date().toISOString(),
    };
    if (this.isBackfillInProgress) {
      await this.updateBackfillJobState(pendingStop, false);
    }
    return pendingStop;
  }

  async startBackfillInBackground(): Promise<{
    started: boolean;
    alreadyRunning?: boolean;
    job: FbBackfillJobState;
  }> {
    if (this.isBackfillInProgress) {
      const current = await this.getBackfillStatus();
      return { started: false, alreadyRunning: true, job: current };
    }

    const cfg = await this.getConfig();
    if (cfg.backfillJob?.status === 'running') {
      return { started: false, alreadyRunning: true, job: cfg.backfillJob };
    }

    this.isBackfillInProgress = true;
    this.isBackfillCancelRequested = false;

    const nowIso = new Date().toISOString();
    const initialJob: FbBackfillJobState = {
      status: 'running',
      phase: 'loading_properties',
      message: 'Chargement des annonces et préparation des Shadow Users...',
      current: 0,
      total: 0,
      percent: 2,
      etaSeconds: null,
      currentItemTitle: null,
      scanned: 0,
      migratedScraped: 0,
      markedOrganic: 0,
      markedAdminManual: 0,
      avatarsPersisted: 0,
      errorCount: 0,
      lastError: null,
      startedAt: nowIso,
      finishedAt: null,
      updatedAt: nowIso,
    };
    await this.updateBackfillJobState(initialJob, false);
    this.startBackfillHeartbeat();

    void this.executeBackfillJob(nowIso).catch((err) => {
      this.logger.error(`Background backfill failed: ${(err as Error).message}`);
    });

    return {
      started: true,
      job: initialJob,
    };
  }

  /**
   * Idempotent admin backfill migrating already-published FB-scraped properties
   * into the explicit `origin`/`claimStatus`/Shadow-User schema with GCS avatars.
   */
  async backfillLegacyScrapedProperties() {
    if (this.isBackfillInProgress) {
      throw new BadRequestException('Une migration Shadow Users est déjà en cours.');
    }
    const cfg = await this.getConfig();
    if (cfg.backfillJob?.status === 'running') {
      throw new BadRequestException('Une migration Shadow Users est déjà en cours.');
    }
    this.isBackfillInProgress = true;
    this.isBackfillCancelRequested = false;
    const nowIso = new Date().toISOString();
    await this.updateBackfillJobState(
      {
        status: 'running',
        phase: 'loading_properties',
        message: 'Chargement des annonces et préparation des Shadow Users...',
        current: 0,
        total: 0,
        percent: 2,
        etaSeconds: null,
        currentItemTitle: null,
        scanned: 0,
        migratedScraped: 0,
        markedOrganic: 0,
        markedAdminManual: 0,
        avatarsPersisted: 0,
        errorCount: 0,
        lastError: null,
        startedAt: nowIso,
        finishedAt: null,
        updatedAt: nowIso,
      },
      false,
    );
    this.startBackfillHeartbeat();
    const finalJob = await this.executeBackfillJob(nowIso);
    return {
      scanned: finalJob.scanned,
      migratedScraped: finalJob.migratedScraped,
      markedOrganic: finalJob.markedOrganic,
      markedAdminManual: finalJob.markedAdminManual,
      avatarsPersisted: finalJob.avatarsPersisted,
    };
  }

  private async executeBackfillJob(startedAtIso: string): Promise<FbBackfillJobState> {
    const startedAtMs = Date.now();
    let jobState: FbBackfillJobState = {
      status: 'running',
      phase: 'loading_properties',
      message: 'Chargement des annonces et candidats approuvés...',
      current: 0,
      total: 0,
      percent: 5,
      etaSeconds: null,
      currentItemTitle: null,
      scanned: 0,
      migratedScraped: 0,
      markedOrganic: 0,
      markedAdminManual: 0,
      avatarsPersisted: 0,
      errorCount: 0,
      lastError: null,
      startedAt: startedAtIso,
      finishedAt: null,
      updatedAt: startedAtIso,
    };

    try {
      const candidatesMap = new Map<string, FbIngestedCandidate>();
      const approvedCandidates = await this.candidateModel
        .find({ publishedPropertyId: { $ne: null } })
        .lean();
      for (const c of approvedCandidates) {
        if (c.publishedPropertyId) {
          candidatesMap.set(String(c.publishedPropertyId), c);
        }
      }

      const allProps = await this.propertyModel
        .find({})
        .populate('city', 'commune district')
        .populate('owner', '_id role username isShadowAccount')
        .lean();

      const total = allProps.length;
      const processingStartedMs = Date.now();
      let lastDbWriteMs = 0;

      jobState = {
        ...jobState,
        phase: 'migrating_properties',
        total,
        scanned: total,
        percent: total === 0 ? 100 : 8,
        message:
          total === 0
            ? 'Aucune annonce trouvée dans la base.'
            : `Analyse de ${total} annonce(s)...`,
        updatedAt: new Date().toISOString(),
      };
      await this.updateBackfillJobState(jobState);

      for (let idx = 0; idx < allProps.length; idx++) {
        if (this.isBackfillCancelRequested) {
          const stoppedAt = new Date().toISOString();
          jobState = {
            ...jobState,
            status: 'cancelled',
            phase: 'cancelled',
            current: idx,
            total,
            percent: total > 0 ? Math.round((idx / total) * 100) : 0,
            etaSeconds: null,
            currentItemTitle: null,
            message: `Migration annulée (${idx} / ${total} annonces traitées). Vous pouvez reprendre à tout moment.`,
            finishedAt: stoppedAt,
            updatedAt: stoppedAt,
          };
          await this.updateBackfillJobState(jobState, true);
          return jobState;
        }

        const prop = allProps[idx] as any;
        const propId = String(prop._id);
        const propTitle = String(prop.title || prop.propertyNumber || propId).slice(0, 70);

        try {
          const linkedCandidate = candidatesMap.get(propId);
          const ownerObj = typeof prop.owner === 'object' ? prop.owner : null;
          const isFacebookOrigin =
            prop.origin === 'facebook_scraper' ||
            Boolean(linkedCandidate) ||
            Boolean(prop.sources?.username) ||
            Boolean(prop.sources?.link && String(prop.sources.link).includes('facebook.com'));

          const patch: Record<string, any> = {};

          // Normalize phones everywhere for clean claim matching
          for (const pk of ['phone1', 'phone2', 'phone3'] as const) {
            if (prop[pk]) {
              const norm = normalizeMalagasyPhone(String(prop[pk]));
              if (norm && norm !== prop[pk]) {
                patch[pk] = norm;
              }
            }
          }

          if (isFacebookOrigin) {
            patch.origin = 'facebook_scraper';
            if (!prop.claimStatus || prop.claimStatus === 'not_applicable') {
              patch.claimStatus = prop.claimedBy ? 'claimed' : 'unclaimed';
            }

            const existingSources = { ...(prop.sources || {}) };
            const rawLink = String(existingSources.link || '');
            const isPostPermalink = /\/posts\/|permalink\.php|story_fbid/i.test(rawLink);

            const rawProfileUrl = linkedCandidate?.authorUrl || (!isPostPermalink ? rawLink : '');
            const fbProfileUrl = normalizeFbProfileUrl(rawProfileUrl);
            const fbUserId =
              existingSources.fbUserId ||
              linkedCandidate?.authorFbId ||
              extractFbUserId([fbProfileUrl, rawLink]) ||
              null;

            const postUrl =
              existingSources.postUrl ||
              linkedCandidate?.postUrl ||
              (isPostPermalink ? rawLink : null);

            let postId = existingSources.postId || linkedCandidate?.canonicalPostId || null;
            if (!postId && postUrl) {
              const m = postUrl.match(/\/posts\/([^/?#]+)/i);
              if (m?.[1]) postId = m[1];
            }

            const displayAuthorName =
              (existingSources.username &&
                !['facebook', 'facebook user'].includes(existingSources.username.trim().toLowerCase())
                ? existingSources.username.trim()
                : linkedCandidate?.authorName?.trim()) || 'Membre TranoGasy';

            let avatarUrl = existingSources.avatar || linkedCandidate?.authorAvatarUrl || null;
            if (avatarUrl && !this.gcsService.isPermanentGcsUrl(avatarUrl)) {
              const uploaded = await this.gcsService.reuploadFbAvatar(
                avatarUrl,
                fbUserId || postId || propId,
              );
              if (uploaded) {
                avatarUrl = uploaded;
                jobState.avatarsPersisted++;
              } else {
                avatarUrl = null;
              }
            }

            patch.sources = {
              ...existingSources,
              fbUserId: fbUserId || undefined,
              username: displayAuthorName,
              avatar: avatarUrl || undefined,
              link: fbProfileUrl || undefined,
              postId: postId || undefined,
              postUrl: postUrl || undefined,
              groupId: existingSources.groupId || linkedCandidate?.groupId || undefined,
            };

            // Move legacy admin-owned unclaimed listings onto dedicated Shadow User profiles
            if (
              patch.claimStatus !== 'claimed' &&
              (!ownerObj || ownerObj.role === 'admin' || ownerObj.role === 'superadmin')
            ) {
              const loc =
                [prop.city?.commune, prop.city?.district].filter(Boolean).join(', ') ||
                'Antananarivo, Madagascar';
              const shadowOwner = await this.upsertShadowFbPublisher({
                fbUserId,
                fbProfileUrl,
                username: displayAuthorName,
                avatar: avatarUrl,
                location: loc,
              });
              patch.owner = shadowOwner._id;
            }

            if (linkedCandidate?.datePosted) {
              const targetDate = new Date(linkedCandidate.datePosted);
              const existingCreatedMs = prop.created_at ? new Date(prop.created_at).getTime() : NaN;
              if (
                !Number.isNaN(targetDate.getTime()) &&
                (Number.isNaN(existingCreatedMs) || Math.abs(targetDate.getTime() - existingCreatedMs) > 1000)
              ) {
                patch.created_at = targetDate;
              }
            }

            if ('created_at' in patch) {
              await this.propertyModel.updateOne(
                { _id: prop._id },
                { $set: patch },
                { overwriteImmutable: true } as any,
              );
            } else {
              await this.propertyModel.updateOne({ _id: prop._id }, { $set: patch });
            }
            jobState.migratedScraped++;
          } else if (!prop.origin) {
            const isAdminManual =
              ownerObj?.role === 'admin' || ownerObj?.role === 'superadmin';
            patch.origin = isAdminManual ? 'admin_manual' : 'user';
            patch.claimStatus = 'not_applicable';
            await this.propertyModel.updateOne({ _id: prop._id }, { $set: patch });
            if (isAdminManual) jobState.markedAdminManual++;
            else jobState.markedOrganic++;
          } else if (Object.keys(patch).length > 0) {
            await this.propertyModel.updateOne({ _id: prop._id }, { $set: patch });
          }
        } catch (err) {
          jobState.errorCount++;
          jobState.lastError = `Annonce "${propTitle}": ${(err as Error).message}`;
          this.logger.warn(`Backfill item failed (${propId}): ${(err as Error).message}`);
        }

        const processed = idx + 1;
        const nowMs = Date.now();
        if (nowMs - lastDbWriteMs >= 350 || processed === total || processed === 1) {
          lastDbWriteMs = nowMs;
          const etaSeconds =
            processed >= 2 ? this.estimateEtaSeconds(processingStartedMs, processed, total) : null;
          jobState = {
            ...jobState,
            current: processed,
            total,
            percent: total > 0 ? Math.min(99, Math.round((processed / total) * 100)) : 100,
            etaSeconds,
            currentItemTitle: propTitle,
            message: `Migration : ${processed} / ${total} annonces (${jobState.migratedScraped} FB migrées, ${jobState.avatarsPersisted} avatars GCS)...`,
            updatedAt: new Date().toISOString(),
          };
          await this.updateBackfillJobState(jobState);
        }
      }

      const finishedAt = new Date().toISOString();
      const errSuffix = jobState.errorCount > 0 ? `, ${jobState.errorCount} erreur(s)` : '';
      const durationSec = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000));
      jobState = {
        ...jobState,
        status: 'completed',
        phase: 'completed',
        current: total,
        total,
        percent: 100,
        etaSeconds: 0,
        currentItemTitle: null,
        message: `Migration terminée en ${durationSec}s (${total} analysées) : ${jobState.migratedScraped} annonces FB passées en Shadow User (${jobState.avatarsPersisted} avatars uploadés sur GCS), ${jobState.markedAdminManual} manuelles admin, ${jobState.markedOrganic} utilisateurs réels${errSuffix}.`,
        finishedAt,
        updatedAt: finishedAt,
      };
      await this.updateBackfillJobState(jobState, true);
      return jobState;
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const errMsg = (err as Error).message || 'Erreur inconnue durant la migration';
      jobState = {
        ...jobState,
        status: 'error',
        phase: 'error',
        etaSeconds: null,
        currentItemTitle: null,
        lastError: errMsg,
        message: `Échec de la migration : ${errMsg}`,
        finishedAt,
        updatedAt: finishedAt,
      };
      await this.updateBackfillJobState(jobState, true);
      throw err;
    } finally {
      this.stopBackfillHeartbeat();
      this.isBackfillInProgress = false;
      this.isBackfillCancelRequested = false;
    }
  }

  async rejectCandidate(id: string) {
    const candidate = await this.candidateModel.findById(id);
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    const deletedImages = await this.gcsService.deleteGcsUrls(candidate.gcsImages || []);
    candidate.status = 'rejected';
    candidate.gcsImages = [];
    candidate.reviewedAt = new Date();
    await candidate.save();

    await this.groupModel.updateOne(
      { groupId: candidate.groupId },
      { $inc: { rejectedCount: 1 } },
    );

    return {
      rejected: true,
      id: String(candidate._id),
      deletedGcsImages: deletedImages,
    };
  }
}
