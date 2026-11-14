import { FbIngestionService } from './fb-ingestion.service';

function createChainableQuery<T>(result: T) {
  return {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
}

describe('FbIngestionService background job tracking & recovery', () => {
  function createHarness(initialConfig: Record<string, any> = {}) {
    let storedConfig: Record<string, any> = {
      key: 'default',
      isLive: false,
      pollIntervalMinutes: 30,
      onlyActiveHours: true,
      activeHourStart: 6,
      activeHourEnd: 22,
      geminiModel: 'gemini-3.5-flash-lite',
      lastPollStatus: 'idle',
      lastPollPhase: 'idle',
      lastPollMessage: null,
      lastRunProgress: null,
      lastError: null,
      backfillJob: null,
      ...initialConfig,
    };

    const configModel: any = {
      findOne: jest.fn(() => ({
        lean: jest.fn().mockImplementation(async () => storedConfig),
        ...storedConfig,
        then: (resolve: (val: any) => void) => resolve(storedConfig),
      })),
      updateOne: jest.fn(async (_filter: any, update: any) => {
        if (update?.$set) {
          storedConfig = { ...storedConfig, ...update.$set };
        }
        return { modifiedCount: 1 };
      }),
    };

    const groupModel: any = {
      countDocuments: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (doc) => ({
        ...doc,
        save: jest.fn().mockResolvedValue(doc),
      })),
    };

    const propertyModel: any = {
      find: jest.fn(() => createChainableQuery([])),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    const candidateModel: any = {
      find: jest.fn(() => createChainableQuery([])),
    };

    const userModel: any = {
      findOne: jest.fn().mockResolvedValue({ role: 'admin' }),
    };

    const service = new FbIngestionService(
      configModel,
      groupModel,
      { findOne: jest.fn().mockResolvedValue(null), create: jest.fn() } as any,
      candidateModel,
      propertyModel,
      { findById: jest.fn() } as any,
      userModel,
      { create: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {
        isPermanentGcsUrl: jest.fn().mockReturnValue(true),
        reuploadFbAvatar: jest.fn().mockResolvedValue(null),
      } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    return {
      service,
      getStoredConfig: () => storedConfig,
      propertyModel,
      candidateModel,
      configModel,
    };
  }

  it('recovers orphaned running scraper and backfill jobs when no in-memory job is active', async () => {
    const { service, getStoredConfig } = createHarness({
      lastPollStatus: 'running',
      lastPollPhase: 'waiting_brightdata',
      backfillJob: {
        status: 'running',
        phase: 'migrating_properties',
        message: 'Running before restart',
        current: 10,
        total: 50,
        percent: 20,
        etaSeconds: 30,
        scanned: 50,
        migratedScraped: 5,
        markedOrganic: 3,
        markedAdminManual: 2,
        avatarsPersisted: 1,
        errorCount: 0,
        lastError: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        updatedAt: new Date().toISOString(),
      },
    });

    const cfg = await service.getConfig();
    expect(cfg.lastPollStatus).toBe('error');
    expect(cfg.lastPollPhase).toBe('interrupted');
    expect(cfg.lastRunProgress).toBeNull();

    const stored = getStoredConfig();
    expect(stored.backfillJob?.status).toBe('error');
    expect(stored.backfillJob?.phase).toBe('interrupted');
  });

  it('runs backfill asynchronously with per-item progress tracking and isolates single-item failures', async () => {
    const { service, getStoredConfig, propertyModel } = createHarness();
    propertyModel.find.mockReturnValue(
      createChainableQuery([
        {
          _id: 'prop-ok',
          title: 'Belle Villa Ivandry',
          origin: undefined,
          owner: { _id: 'u1', role: 'user' },
          phone1: '034 11 223 34',
        },
        {
          _id: 'prop-fail',
          title: 'Annonce Corrompue',
          origin: 'facebook_scraper',
          sources: { username: 'Test FB', avatar: 'https://fb.example/pic.jpg' },
        },
      ]),
    );

    propertyModel.updateOne.mockImplementation(async (filter: any) => {
      if (filter._id === 'prop-fail') {
        throw new Error('DB write error');
      }
      return { modifiedCount: 1 };
    });

    const startRes = await service.startBackfillInBackground();
    expect(startRes.started).toBe(true);
    expect(startRes.job.status).toBe('running');

    // Wait briefly for microtasks/background job to complete over the 2 mocked items
    await new Promise((r) => setTimeout(r, 40));

    const status = await service.getBackfillStatus();
    expect(status.status).toBe('completed');
    expect(status.percent).toBe(100);
    expect(status.current).toBe(2);
    expect(status.total).toBe(2);
    expect(status.markedOrganic).toBe(1);
    expect(status.errorCount).toBe(1);
    expect(status.lastError).toContain('Annonce Corrompue');
    expect(getStoredConfig().backfillJob?.status).toBe('completed');
  });

  it('cancels an active/stuck scraper run cleanly via cancelActiveRun()', async () => {
    const { service, getStoredConfig } = createHarness({
      lastPollStatus: 'running',
      lastPollPhase: 'waiting_brightdata',
    });

    const cfg = await service.cancelActiveRun();
    expect(cfg.lastPollStatus).toBe('idle');
    expect(cfg.lastPollPhase).toBe('cancelled');
    expect(getStoredConfig().lastRunProgress).toBeNull();
  });

  it('updates percentage progress during snapshot record pre-filtering', async () => {
    const { service, configModel } = createHarness();
    const summary = await service.processSnapshotRecords(
      'sd_test',
      [
        {
          post_id: 'p1',
          group_id: 'g1',
          group_name: 'Groupe Test',
          url: 'https://www.facebook.com/groups/g1/posts/p1/',
          content: 'Maison sans photo vidéo uniquement',
          attachments: [{ type: 'Video', url: 'https://fb.example/v.mp4' }],
        },
      ],
      true,
    );

    expect(summary.videoOnlySkipped).toBe(1);
    const progressUpdates = configModel.updateOne.mock.calls
      .map(([, u]: any[]) => u?.$set?.lastRunProgress)
      .filter(Boolean);
    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    const finalProgress = progressUpdates[progressUpdates.length - 1];
    expect(finalProgress.percent).toBe(100);
    expect(finalProgress.current).toBe(1);
    expect(finalProgress.total).toBe(1);
    expect(finalProgress.unit).toBe('posts');
  });
});
