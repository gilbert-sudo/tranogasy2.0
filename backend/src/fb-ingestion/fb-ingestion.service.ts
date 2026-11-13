import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Property, PropertyDocument } from '../properties/schemas/property.schema';
import { PropertiesService } from '../properties/properties.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { FbBrightDataService } from './fb-brightdata.service';
import { FbCityMatcherService } from './fb-city-matcher.service';
import {
  BrightDataPostRecord,
  computeTextSimilarity,
  extractGroupIdFromUrl,
  UnwrappedFbPost,
} from './fb-dedup.util';
import { unwrapBrightDataPost } from './fb-dedup.util';
import { FbGcsService } from './fb-gcs.service';
import { FbGeminiService, PROPERTY_FEATURE_KEYS } from './fb-gemini.service';
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
  FbIngestionConfig,
  FbIngestionConfigDocument,
} from './schemas/fb-ingestion-config.schema';
import { FbSeenPost, FbSeenPostDocument } from './schemas/fb-seen-post.schema';

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
  geminiCalls: number;
  errors: string[];
}

@Injectable()
export class FbIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FbIngestionService.name);
  private schedulerTimer: NodeJS.Timeout | null = null;
  private isRunInProgress = false;

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
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBootstrapped();
    // Check every 60s whether the dynamic poll interval has elapsed while isLive=true.
    this.schedulerTimer = setInterval(() => {
      void this.schedulerTick();
    }, 60_000);
    this.schedulerTimer.unref?.();
    this.logger.log('FbIngestion scheduler initialized (starts PAUSED unless isLive=true in DB)');
  }

  onModuleDestroy(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
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

  private getMadagascarHour(): number {
    const utcHour = new Date().getUTCHours();
    return (utcHour + 3) % 24;
  }

  private async schedulerTick(): Promise<void> {
    if (this.isRunInProgress) return;
    try {
      const config = await this.getConfig();
      if (!config.isLive) return;

      if (config.onlyActiveHours) {
        const mgHour = this.getMadagascarHour();
        if (mgHour < config.activeHourStart || mgHour >= config.activeHourEnd) {
          return;
        }
      }

      const lastRunMs = config.lastPollStartedAt
        ? new Date(config.lastPollStartedAt).getTime()
        : 0;
      const intervalMs = Math.max(5, config.pollIntervalMinutes) * 60_000;
      if (Date.now() - lastRunMs < intervalMs) {
        return;
      }

      this.logger.log(
        `Scheduled poll triggered (interval=${config.pollIntervalMinutes}m, model=${config.geminiModel})`,
      );
      await this.runActiveGroups();
    } catch (err) {
      this.logger.error(`Scheduler tick failed: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Config & Live Control
  // ---------------------------------------------------------------------------

  async getConfig(): Promise<FbIngestionConfigDocument> {
    await this.ensureBootstrapped();
    const cfg = await this.configModel.findOne({ key: 'default' });
    if (!cfg) {
      throw new NotFoundException('Ingestion config missing');
    }
    return cfg;
  }

  async updateConfig(
    patch: Partial<FbIngestionConfig> & { lastError?: string | null },
  ): Promise<FbIngestionConfigDocument> {
    await this.getConfig();
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
    if (patch.lastError === null) {
      allowed.lastError = null;
    }

    const updated = await this.configModel.findOneAndUpdate(
      { key: 'default' },
      { $set: allowed },
      { new: true },
    );
    return updated!;
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

  private async updatePollState(patch: Record<string, any>): Promise<void> {
    try {
      await this.configModel.updateOne({ key: 'default' }, { $set: patch });
    } catch (err) {
      this.logger.warn(`Failed to update poll state: ${(err as Error).message}`);
    }
  }

  private async prepareActiveTargets(groupIds?: string[]) {
    if (this.isRunInProgress) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    const config = await this.getConfig();
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

  private async markRunStarted(
    status: 'running' | 'importing_snapshot',
    phase: string,
    message: string,
    snapshotId?: string,
  ): Promise<void> {
    this.isRunInProgress = true;
    const setPatch: Record<string, any> = {
      lastPollStartedAt: new Date(),
      lastPollStatus: status,
      lastPollPhase: phase,
      lastPollMessage: message,
      lastRunProgress: null,
      lastError: null,
    };
    if (snapshotId) {
      setPatch.lastSnapshotId = snapshotId;
    }
    await this.configModel.updateOne(
      { key: 'default' },
      {
        $set: setPatch,
        $inc: { totalRuns: 1 },
      },
    );
  }

  private async finalizeRunSuccess(summary: RunSummary): Promise<void> {
    const errNote = summary.errors.length > 0 ? ` (${summary.errors.length} erreur)` : '';
    await this.configModel.updateOne(
      { key: 'default' },
      {
        $set: {
          lastPollFinishedAt: new Date(),
          lastPollStatus: 'idle',
          lastPollPhase: 'completed',
          lastPollMessage: `Terminé (${summary.snapshotId}) : +${summary.candidatesCreated} annonce(s), ${summary.duplicateSkipped} doublons${errNote}.`,
          lastRunProgress: null,
          lastRunSummary: summary,
          lastError: summary.errors.length > 0 ? summary.errors[0] : null,
        },
        $inc: {
          totalBrightDataRecords: summary.totalRawRecords,
        },
      },
    );
  }

  private async finalizeRunError(err: unknown): Promise<string> {
    const msg = (err as Error).message || 'Unknown error';
    await this.configModel.updateOne(
      { key: 'default' },
      {
        $set: {
          lastPollFinishedAt: new Date(),
          lastPollStatus: 'error',
          lastPollPhase: 'error',
          lastPollMessage: msg,
          lastRunProgress: null,
          lastError: msg,
        },
      },
    );
    return msg;
  }

  private async executeRunActiveGroups(
    config: FbIngestionConfigDocument,
    targets: any[],
  ): Promise<RunSummary> {
    try {
      // Scale requested posts proportionally if admin changes pollIntervalMinutes (base = 30 min)
      const scaleFactor = Math.max(0.25, config.pollIntervalMinutes / 30);
      const triggerPayload = targets.map((t: any) => ({
        url: t.url,
        num_of_posts: Math.max(
          2,
          Math.min(200, Math.round((t.scrapeLimitPer30Min || 10) * scaleFactor)),
        ),
        posts_to_not_include: Array.isArray(t.recentPostIds) ? t.recentPostIds.slice(-30) : [],
      }));

      const snapshotId = await this.brightDataService.triggerCollection(triggerPayload);
      await this.updatePollState({
        lastSnapshotId: snapshotId,
        lastPollPhase: 'waiting_brightdata',
        lastPollMessage: `Bright Data collecte ${targets.length} groupe(s) (0s)...`,
      });

      await this.brightDataService.waitForSnapshot(snapshotId, 600000, async ({ elapsedSec, status }) => {
        await this.updatePollState({
          lastPollPhase: 'waiting_brightdata',
          lastPollMessage: `Collecte Bright Data (${status}) : ${elapsedSec}s écoulées (${targets.length} groupe(s))...`,
        });
      });

      await this.updatePollState({
        lastPollPhase: 'downloading_snapshot',
        lastPollMessage: `Téléchargement du snapshot ${snapshotId}...`,
      });
      const records = await this.brightDataService.downloadSnapshot(snapshotId);
      const summary = await this.processSnapshotRecords(snapshotId, records);
      await this.finalizeRunSuccess(summary);
      return summary;
    } catch (err) {
      await this.finalizeRunError(err);
      throw err;
    } finally {
      this.isRunInProgress = false;
    }
  }

  private async executeImportSnapshot(snapshotId: string): Promise<RunSummary> {
    try {
      await this.updatePollState({
        lastPollPhase: 'downloading_snapshot',
        lastPollMessage: `Téléchargement du snapshot ${snapshotId}...`,
      });
      const records = await this.brightDataService.downloadSnapshot(snapshotId);
      const summary = await this.processSnapshotRecords(snapshotId, records);
      await this.finalizeRunSuccess(summary);
      return summary;
    } catch (err) {
      await this.finalizeRunError(err);
      throw err;
    } finally {
      this.isRunInProgress = false;
    }
  }

  async startRunInBackground(groupIds?: string[]) {
    const { config, targets } = await this.prepareActiveTargets(groupIds);
    await this.markRunStarted(
      'running',
      'triggering_brightdata',
      `Déclenchement Bright Data sur ${targets.length} groupe(s)...`,
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

  async runActiveGroups(groupIds?: string[]): Promise<RunSummary> {
    const { config, targets } = await this.prepareActiveTargets(groupIds);
    await this.markRunStarted(
      'running',
      'triggering_brightdata',
      `Déclenchement Bright Data sur ${targets.length} groupe(s)...`,
    );
    return this.executeRunActiveGroups(config, targets);
  }

  async startImportInBackground(snapshotId: string) {
    const cleanId = snapshotId?.trim();
    if (!cleanId) {
      throw new BadRequestException('snapshotId is required');
    }
    if (this.isRunInProgress) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    await this.markRunStarted(
      'importing_snapshot',
      'downloading_snapshot',
      `Importation du snapshot ${cleanId}...`,
      cleanId,
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
    if (this.isRunInProgress) {
      throw new BadRequestException('An ingestion run is already in progress');
    }

    await this.markRunStarted(
      'importing_snapshot',
      'downloading_snapshot',
      `Importation du snapshot ${cleanId}...`,
      cleanId,
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
      const geminiRes = await this.geminiService.parsePost({
        content: post.content,
        groupName: post.groupName,
        authorName: post.authorName,
        modelOverride: config.geminiModel,
        regexPhones: post.phones,
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

    const cityMatch = await this.cityMatcherService.matchLocation(
      parsedResult.locationHints,
      post.content,
      post.groupName,
    );

    const gcsUpload = await this.gcsService.reuploadFbImages(
      post.photoUrls,
      post.canonicalPostId,
    );

    let aiNotes = parsedResult.aiNotes || '';
    if (gcsUpload.uploadedUrls.length === 0 && gcsUpload.failedCount > 0) {
      aiNotes = `${aiNotes ? `${aiNotes} | ` : ''}${gcsUpload.failedCount} FB image(s) failed download (likely expired CDN link in snapshot); verify/upload photos before publishing.`;
    }

    const missingFields = this.computeMissingFields({
      type: parsedResult.type,
      price: parsedResult.priceAriary,
      rent: parsedResult.rentAriary,
      matchedCityId: cityMatch.bestMatch?._id || null,
      rooms: parsedResult.rooms,
      toilet: parsedResult.toilet,
      bathrooms: parsedResult.bathrooms,
      area: parsedResult.area,
      phones: parsedResult.phones,
    });

    try {
      await this.candidateModel.create({
        status: 'pending',
        groupId: post.groupId,
        groupName: groupDoc.name || post.groupName,
        canonicalPostId: post.canonicalPostId,
        postUrl: post.postUrl,
        authorName: post.authorName,
        authorAvatarUrl: post.authorAvatar,
        datePosted: post.datePosted,
        rawContent: post.content,
        gcsImages: gcsUpload.uploadedUrls,
        extracted: {
          title: parsedResult.title,
          description: parsedResult.description,
          type: parsedResult.type,
          houseType: parsedResult.houseType,
          price: parsedResult.priceAriary,
          rent: parsedResult.rentAriary,
          rooms: parsedResult.rooms,
          livingRoom: parsedResult.livingRoom,
          kitchen: parsedResult.kitchen,
          toilet: parsedResult.toilet,
          bathrooms: parsedResult.bathrooms,
          area: parsedResult.area,
          floor: parsedResult.floor,
          phone1: parsedResult.phones[0] || null,
          phone2: parsedResult.phones[1] || null,
          phone3: parsedResult.phones[2] || null,
          features: parsedResult.features,
          locationHints: parsedResult.locationHints,
        },
        matchedCityId: cityMatch.bestMatch?._id || null,
        matchedCityLabel: cityMatch.bestMatch?.label || null,
        cityCandidates: cityMatch.candidates.map((c) => ({
          _id: c._id,
          label: c.label,
          score: c.score,
        })),
        missingFields,
        aiConfidence: parsedResult.aiConfidence,
        aiNotes,
      });

      summary.candidatesCreated++;
      groupDoc.uniqueAccepted = (groupDoc.uniqueAccepted || 0) + 1;
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
      geminiCalls: 0,
      errors: [],
    };

    const grouped = new Map<string, UnwrappedFbPost[]>();
    for (const raw of records) {
      if (raw.error) {
        summary.errors.push(`BrightData error: ${raw.error}`);
        continue;
      }
      const post = unwrapBrightDataPost(raw);
      if (!post) continue;

      summary.unwrappedCount++;
      const arr = grouped.get(post.groupId) || [];
      arr.push(post);
      grouped.set(post.groupId, arr);
    }

    const totalPostsToScan = summary.unwrappedCount;
    let processedCount = 0;

    await this.updatePollState({
      lastPollPhase: 'filtering_ai_gcs',
      lastPollMessage: `Filtrage & analyse Gemini/GCS : 0 / ${totalPostsToScan} posts...`,
      lastRunProgress: { current: 0, total: totalPostsToScan },
    });

    for (const [groupId, posts] of grouped.entries()) {
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
        newRecentIds.add(post.outerPostId);

        if (post.isVideoOnly || post.photoUrls.length === 0) {
          summary.videoOnlySkipped++;
          groupDoc.videoOnlySkipped = (groupDoc.videoOnlySkipped || 0) + 1;
          processedCount++;
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
          continue;
        }

        groupNewCount++;

        // Record in seen ledger immediately so later posts in the same batch deduplicate too.
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

        const alreadyInProperties = await this.existsInLiveProperties(post);
        if (alreadyInProperties) {
          summary.duplicateSkipped++;
          groupDoc.duplicateSkipped = (groupDoc.duplicateSkipped || 0) + 1;
          processedCount++;
          continue;
        }

        aiEligiblePosts.push(post);
      }

      if (aiEligiblePosts.length > 0) {
        let nextIdx = 0;
        const workerCount = Math.min(2, aiEligiblePosts.length);
        const workers = Array.from({ length: workerCount }, async () => {
          while (nextIdx < aiEligiblePosts.length) {
            const post = aiEligiblePosts[nextIdx++];
            await this.processSingleEligiblePost(post, groupDoc!, config, summary);
            processedCount++;
            await this.updatePollState({
              lastPollPhase: 'filtering_ai_gcs',
              lastPollMessage: `Analyse Gemini & GCS : ${processedCount} / ${totalPostsToScan} posts (+${summary.candidatesCreated} annonces)...`,
              lastRunProgress: { current: processedCount, total: totalPostsToScan },
            });
          }
        });
        await Promise.all(workers);
      } else {
        await this.updatePollState({
          lastPollPhase: 'filtering_ai_gcs',
          lastPollMessage: `Filtrage doublons/vidéos : ${processedCount} / ${totalPostsToScan} posts...`,
          lastRunProgress: { current: processedCount, total: totalPostsToScan },
        });
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
    const bySource = await this.propertyModel
      .findOne({ 'sources.link': { $regex: post.canonicalPostId } }, { _id: 1 })
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
    price?: number | null;
    rent?: number | null;
    matchedCityId?: string | null;
    rooms?: number | null;
    toilet?: number | null;
    bathrooms?: number | null;
    area?: number | null;
    phones?: Array<string | null | undefined>;
  }): string[] {
    const missing: string[] = [];
    if (data.type !== 'rent' && data.type !== 'sale') missing.push('type');
    if (data.type === 'sale' && (!data.price || data.price <= 0)) missing.push('price');
    if (data.type === 'rent' && (!data.rent || data.rent <= 0)) missing.push('rent');
    if (!data.matchedCityId) missing.push('city');
    if (data.rooms === null || data.rooms === undefined) missing.push('rooms');
    if (data.toilet === null || data.toilet === undefined) missing.push('toilet');
    if (data.bathrooms === null || data.bathrooms === undefined) missing.push('bathrooms');
    if (data.area === null || data.area === undefined) missing.push('area');
    const hasPhone = (data.phones || []).some((p) => Boolean(p && String(p).trim()));
    if (!hasPhone) missing.push('phone1');
    return missing;
  }

  // ---------------------------------------------------------------------------
  // Human Fast Validation Queue & One-Click Approve / Reject
  // ---------------------------------------------------------------------------

  async listCandidates(params: {
    status?: string;
    groupId?: string;
    type?: string;
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

    const [items, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
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
    ]);

    return {
      items,
      total,
      page,
      limit,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
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
      'rooms',
      'livingRoom',
      'kitchen',
      'toilet',
      'bathrooms',
      'area',
      'floor',
      'phone1',
      'phone2',
      'phone3',
    ];

    for (const key of scalarFields) {
      if (key in patch) {
        extracted[key] = patch[key];
      }
    }

    if (patch.features && typeof patch.features === 'object') {
      const mergedFeatures: Record<string, boolean> = { ...(extracted.features || {}) };
      for (const feat of PROPERTY_FEATURE_KEYS) {
        if (feat in patch.features) {
          mergedFeatures[feat] = Boolean(patch.features[feat]);
        }
      }
      extracted.features = mergedFeatures;
    }

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
      candidate.matchedCityId = patch.matchedCityId || null;
      if (patch.matchedCityId && Types.ObjectId.isValid(patch.matchedCityId)) {
        const city = await this.cityModel
          .findById(patch.matchedCityId, { fokontany: 1, commune: 1, district: 1 })
          .lean();
        if (city) {
          candidate.matchedCityLabel = [city.fokontany, city.commune, city.district]
            .filter(Boolean)
            .join(' — ');
        }
      } else {
        candidate.matchedCityLabel = null;
      }
    }

    candidate.extracted = extracted;
    candidate.missingFields = this.computeMissingFields({
      type: extracted.type,
      price: extracted.price,
      rent: extracted.rent,
      matchedCityId: candidate.matchedCityId,
      rooms: extracted.rooms,
      toilet: extracted.toilet,
      bathrooms: extracted.bathrooms,
      area: extracted.area,
      phones: [extracted.phone1, extracted.phone2, extracted.phone3],
    });
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
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        ex.type === 'sale' ? 'Sale price (Ar) is required' : 'Monthly rent (Ar) is required',
      );
    }

    // Resolve an admin owner so public UI displays candidate.sources cleanly.
    let ownerId = adminUserId;
    const ownerUser = await this.userModel.findById(adminUserId, { role: 1 }).lean();
    if (!ownerUser || (ownerUser.role !== 'admin' && ownerUser.role !== 'superadmin')) {
      const fallbackAdmin = await this.userModel
        .findOne({ role: { $in: ['admin', 'superadmin'] } }, { _id: 1 })
        .lean();
      if (fallbackAdmin) {
        ownerId = String(fallbackAdmin._id);
      }
    }

    const propertyPayload = {
      title: String(ex.title || 'Propriété').trim(),
      description: String(ex.description || candidate.rawContent).trim(),
      city: String(cityDoc._id),
      type: ex.type,
      houseType: ex.houseType || 'maison',
      ...(ex.type === 'sale' ? { price: Math.round(amount) } : { rent: Math.round(amount) }),
      rooms: Math.max(0, Number(ex.rooms ?? 0)),
      livingRoom: Math.max(0, Number(ex.livingRoom ?? 0)),
      kitchen: Math.max(0, Number(ex.kitchen ?? 0)),
      toilet: Math.max(0, Number(ex.toilet ?? 0)),
      bathrooms: Math.max(0, Number(ex.bathrooms ?? 0)),
      area: Math.max(0, Number(ex.area ?? 0)),
      floor: ex.floor || null,
      phone1: ex.phone1 || null,
      phone2: ex.phone2 || null,
      phone3: ex.phone3 || null,
      images: candidate.gcsImages || [],
      owner: ownerId,
      coords: cityDoc.coords || { lat: -18.8792, lng: 47.5079 },
      status: 'available',
      sources: {
        username: candidate.authorName || 'Facebook',
        avatar: candidate.authorAvatarUrl || undefined,
        link: candidate.postUrl,
      },
      features: ex.features || {},
    };

    const createdProperty = (await this.propertiesService.create(propertyPayload)) as any;

    candidate.status = 'approved';
    candidate.publishedPropertyId = String(createdProperty._id);
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
