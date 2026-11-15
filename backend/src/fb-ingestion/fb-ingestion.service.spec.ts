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

  it('recomputes missingFields without bedrooms/WC/bathrooms when category changes to tsena', async () => {
    const mockCandidate: any = {
      _id: 'cand-tsena-1',
      status: 'pending',
      matchedCityId: 'city-1',
      gcsImages: [],
      extracted: {
        title: 'Box commercial à louer à Namontana',
        description: 'Box cash point 100 000 Ar',
        type: 'rent',
        houseType: 'appartement',
        rent: 100000,
        rooms: null,
        toilet: null,
        bathrooms: null,
        area: null,
        phone1: '0386349387',
      },
      missingFields: ['rooms', 'toilet', 'bathrooms', 'area'],
      save: jest.fn().mockResolvedValue(true),
    };

    const { service, candidateModel } = createHarness();
    candidateModel.findById = jest.fn().mockResolvedValue(mockCandidate);

    await service.updateCandidate('cand-tsena-1', { houseType: 'tsena' });
    expect(mockCandidate.extracted.houseType).toBe('tsena');
    expect(mockCandidate.missingFields).toEqual(['area', 'carAccess', 'motoAccess']);

    await service.updateCandidate('cand-tsena-1', { houseType: 'maison' });
    expect(mockCandidate.extracted.houseType).toBe('maison');
    expect(mockCandidate.missingFields).toEqual([
      'rooms',
      'toilet',
      'bathrooms',
      'carAccess',
      'motoAccess',
      'waterSupply',
      'electricitySupply',
    ]);
  });

  it('tracks carAccess, motoAccess, waterSupply, electricitySupply, and furnishedProperty in missingFields', async () => {
    const formattedDesc = [
      '  Villa T4 avec jardin',
      '  ✔️ Living lumineux',
      '',
      '✔️ 3 Chambres à l’étage',
    ].join('\n');

    const mockCandidate: any = {
      _id: 'cand-access-1',
      status: 'pending',
      matchedCityId: 'city-1',
      gcsImages: [],
      rawContent: 'Villa T4 avec jardin\n3 Chambres',
      extracted: {
        title: 'Villa T4',
        description: 'Villa T4 avec jardin',
        type: 'rent',
        houseType: 'villa',
        rent: 1500000,
        rooms: 3,
        toilet: 2,
        bathrooms: 2,
        area: 180,
        phone1: '0341234567',
        features: {
          carAccess: false,
          motoAccess: false,
          waterPumpSupplyJirama: true,
          electricityJirama: true,
          electricityPower: true,
        },
      },
      featureVerification: {
        carAccess: 'unknown',
        motoAccess: 'unknown',
        waterSupply: 'unknown',
        electricitySupply: 'unknown',
        furnishedProperty: 'unknown',
      },
      missingFields: [
        'carAccess',
        'motoAccess',
        'waterSupply',
        'electricitySupply',
        'furnishedProperty',
      ],
      save: jest.fn().mockResolvedValue(true),
    };

    const { service, candidateModel } = createHarness();
    candidateModel.findById = jest.fn().mockResolvedValue(mockCandidate);

    // Admin confirms carAccess='no', motoAccess='yes', Maka rano (replacing unconfirmed JIRAMA), no electricity, furnished
    await service.updateCandidate('cand-access-1', {
      description: `\n${formattedDesc}\n`,
      featureVerification: {
        carAccess: 'no',
        motoAccess: 'yes',
        electricitySupply: 'no',
        furnishedProperty: 'yes',
      },
      features: {
        waterPumpSupplyJirama: false,
        waterFetchExternal: true,
      },
    });

    expect(mockCandidate.extracted.description).toBe(formattedDesc);
    expect(mockCandidate.extracted.features.carAccess).toBe(false);
    expect(mockCandidate.extracted.features.motoAccess).toBe(true);
    expect(mockCandidate.extracted.features.waterPumpSupplyJirama).toBe(false);
    expect(mockCandidate.extracted.features.waterFetchExternal).toBe(true);
    expect(mockCandidate.extracted.features.electricityJirama).toBe(false);
    expect(mockCandidate.extracted.features.electricityPower).toBe(false);
    expect(mockCandidate.extracted.features.furnishedProperty).toBe(true);
    expect(mockCandidate.featureVerification).toEqual({
      carAccess: 'no',
      motoAccess: 'yes',
      waterSupply: 'yes',
      electricitySupply: 'no',
      furnishedProperty: 'yes',
    });
    expect(mockCandidate.missingFields).toEqual([]);

    // Confirming carAccess='yes' automatically implies motoAccess='yes'
    await service.updateCandidate('cand-access-1', {
      featureVerification: { carAccess: 'yes' },
    });
    expect(mockCandidate.extracted.features.carAccess).toBe(true);
    expect(mockCandidate.extracted.features.motoAccess).toBe(true);
    expect(mockCandidate.featureVerification).toEqual({
      carAccess: 'yes',
      motoAccess: 'yes',
      waterSupply: 'yes',
      electricitySupply: 'no',
      furnishedProperty: 'yes',
    });

    // Setting motoAccess='no' automatically implies carAccess='no'
    await service.updateCandidate('cand-access-1', {
      featureVerification: { motoAccess: 'no' },
    });
    expect(mockCandidate.extracted.features.carAccess).toBe(false);
    expect(mockCandidate.extracted.features.motoAccess).toBe(false);
    expect(mockCandidate.featureVerification).toEqual({
      carAccess: 'no',
      motoAccess: 'no',
      waterSupply: 'yes',
      electricitySupply: 'no',
      furnishedProperty: 'yes',
    });
    expect(mockCandidate.missingFields).toEqual([]);
  });

  it('deterministically re-analyzes pending candidates to restore layout and recover missed features', async () => {
    const rawMultiLine = [
      'Trano AMIDY Andoharanofotsy bord de route principal',
      '2 étages + terrasse',
      'terrasse farany ambony',
      'avec parking 2 voitures',
      'misy jiro sy rano',
    ].join('\n');

    const staleCandidate: any = {
      _id: 'cand-reanalyze-1',
      status: 'pending',
      matchedCityId: 'city-1',
      rawContent: rawMultiLine,
      extracted: {
        title: 'Trano AMIDY Andoharanofotsy',
        description:
          'Trano AMIDY Andoharanofotsy bord de route, 2 étages, électricité et eau.',
        type: 'sale',
        houseType: 'maison',
        price: 200000000,
        rooms: 5,
        toilet: 2,
        bathrooms: 2,
        area: 200,
        phone1: '0345464167',
        features: { electricityJirama: true, waterPumpSupplyJirama: true },
      },
      featureVerification: {},
      missingFields: [],
      save: jest.fn().mockResolvedValue(true),
    };

    const { service, candidateModel } = createHarness();
    candidateModel.find = jest.fn().mockResolvedValue([staleCandidate]);

    const res = await service.reanalyzePendingCandidates();
    expect(res).toEqual({ analyzed: 1, updated: 1 });
    expect(staleCandidate.save).toHaveBeenCalledTimes(1);
    expect(staleCandidate.extracted.description).toBe(rawMultiLine);
    expect(staleCandidate.extracted.features.roofTop).toBe(true);
    expect(staleCandidate.extracted.features.balcony).toBe(true);
    expect(staleCandidate.extracted.features.parkingSpaceAvailable).toBe(true);
    expect(staleCandidate.extracted.features.carAccess).toBe(true);
    expect(staleCandidate.extracted.features.motoAccess).toBe(true);
    expect(staleCandidate.extracted.livingRoom).toBe(1);
    expect(staleCandidate.extracted.kitchen).toBe(1);
    expect(staleCandidate.extracted.estimatedArea).toBe(200);
    expect(staleCandidate.featureVerification).toEqual({
      carAccess: 'yes',
      motoAccess: 'yes',
      waterSupply: 'yes',
      electricitySupply: 'yes',
      furnishedProperty: 'no',
    });
    expect(staleCandidate.missingFields).toEqual([]);
  });

  it('sets Property.created_at strictly to candidate.datePosted and uses resolvedCoords on approveCandidate', async () => {
    const validCityId = '507f1f77bcf86cd799439011';
    const validAdminId = '507f1f77bcf86cd799439099';
    const originalPostDate = new Date('2026-11-12T08:14:22.000Z');
    const candidateDoc: any = {
      _id: 'cand_100',
      status: 'pending',
      groupId: 'grp_1',
      groupName: 'Location Tana',
      canonicalPostId: 'post_100',
      postUrl: 'https://www.facebook.com/groups/grp_1/posts/post_100/',
      authorName: 'Rabe Jean',
      authorFbId: '1000999888777',
      authorUrl: 'https://www.facebook.com/profile.php?id=1000999888777',
      authorAvatarUrl: null,
      datePosted: originalPostDate,
      created_at: new Date('2026-11-12T08:20:00.000Z'),
      rawContent: 'Appartement F3 proche Lycée Français',
      gcsImages: ['https://storage.googleapis.com/tranogasy-img/a.jpg'],
      matchedCityId: validCityId,
      matchedCityLabel: 'Ambatobe — Antananarivo Renivohitra',
      cityCandidates: [
        { _id: validCityId, label: 'Ambatobe — Antananarivo Renivohitra', score: 99, distanceMeters: 95 },
      ],
      resolvedCoords: { lat: -18.86791, lng: 47.54723 },
      resolvedPlaceName: 'Lycée Français Ambatobe',
      resolvedAddress: 'Ambatobe, Antananarivo',
      resolutionSource: 'google_places_api',
      manualCityOverride: false,
      extracted: {
        title: 'Appartement F3 Ambatobe',
        description: 'Appartement F3 moderne proche Lycée Français',
        type: 'rent',
        houseType: 'apartment',
        price: null,
        rent: 1500000,
        rooms: 3,
        livingRoom: 1,
        kitchen: 1,
        toilet: 1,
        bathrooms: 1,
        area: 80,
        floor: '1er étage',
        phone1: '034 11 222 33',
        phone2: null,
        phone3: null,
        features: { carAccess: true },
        locationHints: ['Lycée Français Ambatobe'],
      },
      save: jest.fn().mockResolvedValue(true),
    };

    const propertiesService = {
      create: jest.fn().mockResolvedValue({ _id: 'prop_new_1' }),
    } as any;

    const cityModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: validCityId,
          fokontany: 'Ambatobe',
          commune: 'Antananarivo Renivohitra',
          district: 'Antananarivo II',
          region: 'Analamanga',
          coords: { lat: -18.8672, lng: 47.5469 },
        }),
      }),
    } as any;

    const candidateModel = {
      findById: jest.fn().mockResolvedValue(candidateDoc),
    } as any;

    const userModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'shadow_user_1',
        username: 'Rabe Jean',
        avatar: null,
        save: jest.fn().mockResolvedValue(true),
      }),
    } as any;

    const groupModel = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    } as any;

    const service = new FbIngestionService(
      { findOne: jest.fn() } as any,
      groupModel,
      { findOne: jest.fn().mockResolvedValue(null), create: jest.fn() } as any,
      candidateModel,
      { findById: jest.fn().mockResolvedValue(null) } as any,
      cityModel,
      userModel,
      propertiesService,
      {} as any,
      {} as any,
      {} as any,
      {
        isPermanentGcsUrl: jest.fn().mockReturnValue(true),
        reuploadFbAvatar: jest.fn().mockResolvedValue(null),
      } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    await service.approveCandidate('cand_100', validAdminId);

    expect(propertiesService.create).toHaveBeenCalledTimes(1);
    const createdPayload = propertiesService.create.mock.calls[0][0];
    expect(createdPayload.created_at).toEqual(originalPostDate);
    expect(createdPayload.coords).toEqual({ lat: -18.86791, lng: 47.54723 });
  });

  it('uses cityDoc.coords on approveCandidate when manualCityOverride is true while still preserving created_at', async () => {
    const validCityId = '507f1f77bcf86cd799439011';
    const validAdminId = '507f1f77bcf86cd799439099';
    const originalPostDate = new Date('2026-11-11T16:40:00.000Z');
    const cityCentroid = { lat: -18.8672, lng: 47.5469 };

    const candidateDoc: any = {
      _id: 'cand_101',
      status: 'pending',
      groupId: 'grp_1',
      groupName: 'Location Tana',
      canonicalPostId: 'post_101',
      postUrl: 'https://www.facebook.com/groups/grp_1/posts/post_101/',
      authorName: 'Rabe Jean',
      authorFbId: '1000999888777',
      authorUrl: 'https://www.facebook.com/profile.php?id=1000999888777',
      authorAvatarUrl: null,
      datePosted: originalPostDate,
      rawContent: 'Villa T4 Ambatobe',
      gcsImages: ['https://storage.googleapis.com/tranogasy-img/a.jpg'],
      matchedCityId: validCityId,
      matchedCityLabel: 'Ambatobe — Antananarivo Renivohitra',
      cityCandidates: [],
      resolvedCoords: { lat: -18.901, lng: 47.512 },
      resolvedPlaceName: 'Old Hint',
      resolvedAddress: 'Antananarivo',
      resolutionSource: 'google_places_cache',
      manualCityOverride: true,
      extracted: {
        title: 'Villa T4 Ambatobe',
        description: 'Villa T4 Ambatobe calme',
        type: 'rent',
        houseType: 'villa',
        price: null,
        rent: 2500000,
        rooms: 4,
        livingRoom: 1,
        kitchen: 1,
        toilet: 2,
        bathrooms: 2,
        area: 150,
        floor: null,
        phone1: '034 11 222 33',
        phone2: null,
        phone3: null,
        features: {},
        locationHints: ['Ambatobe'],
      },
      save: jest.fn().mockResolvedValue(true),
    };

    const propertiesService = {
      create: jest.fn().mockResolvedValue({ _id: 'prop_new_2' }),
    } as any;

    const service = new FbIngestionService(
      { findOne: jest.fn() } as any,
      { updateOne: jest.fn().mockResolvedValue({ acknowledged: true }) } as any,
      { findOne: jest.fn().mockResolvedValue(null), create: jest.fn() } as any,
      { findById: jest.fn().mockResolvedValue(candidateDoc) } as any,
      { findById: jest.fn().mockResolvedValue(null) } as any,
      {
        findById: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: validCityId,
            fokontany: 'Ambatobe',
            commune: 'Antananarivo Renivohitra',
            district: 'Antananarivo II',
            region: 'Analamanga',
            coords: cityCentroid,
          }),
        }),
      } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          _id: 'shadow_user_1',
          username: 'Rabe Jean',
          avatar: null,
          save: jest.fn().mockResolvedValue(true),
        }),
      } as any,
      propertiesService,
      {} as any,
      {} as any,
      {} as any,
      {
        isPermanentGcsUrl: jest.fn().mockReturnValue(true),
        reuploadFbAvatar: jest.fn().mockResolvedValue(null),
      } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    await service.approveCandidate('cand_101', validAdminId);

    const createdPayload = propertiesService.create.mock.calls[0][0];
    expect(createdPayload.created_at).toEqual(originalPostDate);
    expect(createdPayload.coords).toEqual(cityCentroid);
  });

  it('repairs legacy approved FB Property.created_at during backfill with overwriteImmutable', async () => {
    const fbPostedAt = new Date('2026-10-20T14:05:00.000Z');
    const approvedMuchLater = new Date('2026-10-21T09:00:00.000Z');

    const { service, configModel, candidateModel, propertyModel } = createHarness();
    void configModel;

    candidateModel.find = jest.fn().mockReturnValue(
      createChainableQuery([
        {
          publishedPropertyId: 'prop_legacy_1',
          datePosted: fbPostedAt,
        },
      ]),
    );

    propertyModel.find.mockReturnValue(
      createChainableQuery([
        {
          _id: 'prop_legacy_1',
          title: 'Villa Ivandry',
          origin: 'facebook_scraper',
          owner: {
            _id: '507f1f77bcf86cd799439022',
            role: 'user',
            isShadowAccount: true,
          },
          sources: {
            postId: 'fb_post_legacy_1',
            postUrl: 'https://facebook.com/groups/1/posts/fb_post_legacy_1/',
          },
          created_at: approvedMuchLater,
        },
      ]),
    );

    const summary = await (service as any).executeBackfillJob();
    expect(summary.errorCount).toBe(0);
    expect(propertyModel.updateOne).toHaveBeenCalledWith(
      { _id: 'prop_legacy_1' },
      {
        $set: expect.objectContaining({
          created_at: fbPostedAt,
        }),
      },
      { overwriteImmutable: true },
    );
  });

  it('classifies candidates into auto_published, fast_check, and call_queue workflow lanes', () => {
    const { service } = createHarness();
    const baseCandidate = {
      matchedCityId: '65f000000000000000000001',
      resolutionSource: 'google_places_api',
      gcsImages: ['https://storage.googleapis.com/tranogasy-media/img1.jpg'],
      aiConfidence: 'high',
      extracted: {
        type: 'rent',
        houseType: 'house',
        rent: 500000,
        phone1: '034 11 222 33',
        qualityScore: 82,
      },
    };

    const autoExplicit = service.evaluateCandidateWorkflowLane(baseCandidate, {
      autoApproveEnabled: true,
      autoApproveMinQualityScore: 75,
      autoApproveAllowEstimatedPrice: true,
    });
    expect(autoExplicit.workflowLane).toBe('auto_published');
    expect(autoExplicit.eligibleForAutoApprove).toBe(true);

    const autoEstimated = service.evaluateCandidateWorkflowLane(
      {
        ...baseCandidate,
        extracted: {
          type: 'rent',
          houseType: 'house',
          rent: null,
          estimatedRent: 450000,
          phone1: '034 11 222 33',
          qualityScore: 80,
        },
      },
      {
        autoApproveEnabled: true,
        autoApproveMinQualityScore: 75,
        autoApproveAllowEstimatedPrice: true,
      },
    );
    expect(autoEstimated.workflowLane).toBe('auto_published');
    expect(autoEstimated.eligibleForAutoApprove).toBe(true);

    const fastCheckLowScore = service.evaluateCandidateWorkflowLane(
      {
        ...baseCandidate,
        extracted: { ...baseCandidate.extracted, qualityScore: 68 },
      },
      {
        autoApproveEnabled: true,
        autoApproveMinQualityScore: 75,
        autoApproveAllowEstimatedPrice: true,
      },
    );
    expect(fastCheckLowScore.workflowLane).toBe('fast_check');
    expect(fastCheckLowScore.eligibleForAutoApprove).toBe(false);

    const fastCheckDisabled = service.evaluateCandidateWorkflowLane(baseCandidate, {
      autoApproveEnabled: false,
      autoApproveMinQualityScore: 75,
      autoApproveAllowEstimatedPrice: true,
    });
    expect(fastCheckDisabled.workflowLane).toBe('fast_check');
    expect(fastCheckDisabled.eligibleForAutoApprove).toBe(false);

    const callQueueNoCity = service.evaluateCandidateWorkflowLane(
      {
        ...baseCandidate,
        matchedCityId: null,
      },
      {
        autoApproveEnabled: true,
        autoApproveMinQualityScore: 75,
        autoApproveAllowEstimatedPrice: true,
      },
    );
    expect(callQueueNoCity.workflowLane).toBe('call_queue');
    expect(callQueueNoCity.eligibleForAutoApprove).toBe(false);

    const callQueueNoPhone = service.evaluateCandidateWorkflowLane(
      {
        ...baseCandidate,
        extracted: { ...baseCandidate.extracted, phone1: null },
      },
      {
        autoApproveEnabled: true,
        autoApproveMinQualityScore: 75,
        autoApproveAllowEstimatedPrice: true,
      },
    );
    expect(callQueueNoPhone.workflowLane).toBe('call_queue');
    expect(callQueueNoPhone.eligibleForAutoApprove).toBe(false);
  });

  it('autoApprovePendingCandidates publishes eligible pending candidates and increments totalAutoApproved', async () => {
    const validCityId = '65f000000000000000000011';
    const eligibleCandidate: any = {
      _id: 'cand_auto_1',
      status: 'pending',
      groupId: 'grp_tana',
      groupName: 'Trano Ahofa Tana',
      canonicalPostId: 'post_auto_1',
      postUrl: 'https://facebook.com/groups/tana/posts/post_auto_1',
      authorName: 'Rabe Auto',
      authorUrl: 'https://facebook.com/rabe.auto',
      authorFbId: 'fb_auto_1',
      authorAvatarUrl: null,
      datePosted: new Date('2026-11-15T09:00:00Z'),
      matchedCityId: validCityId,
      resolutionSource: 'google_places_api',
      resolvedCoords: { lat: -18.88, lng: 47.53 },
      cityCandidates: [{ cityId: validCityId, label: 'Ambatobe', score: 96 }],
      gcsImages: ['https://storage.googleapis.com/tranogasy-media/auto1.jpg'],
      aiConfidence: 'high',
      rawContent: 'Trano ahofa Ambatobe, 2 chambres, acces voiture, JIRAMA, 600 000 Ar',
      extracted: {
        title: 'Maison T3 Ambatobe',
        description: 'Trano ahofa Ambatobe',
        type: 'rent',
        houseType: 'house',
        rent: 600000,
        price: null,
        rooms: 2,
        livingRoom: 1,
        kitchen: 1,
        toilet: 1,
        bathrooms: 1,
        area: 75,
        phone1: '034 55 666 77',
        phone2: null,
        phone3: null,
        qualityScore: 86,
        features: { carAccess: true },
        locationHints: ['Ambatobe'],
      },
      save: jest.fn().mockResolvedValue(true),
    };

    const callQueueCandidate: any = {
      _id: 'cand_call_1',
      status: 'pending',
      groupId: 'grp_tana',
      groupName: 'Trano Ahofa Tana',
      canonicalPostId: 'post_call_1',
      postUrl: 'https://facebook.com/groups/tana/posts/post_call_1',
      matchedCityId: null,
      gcsImages: ['https://storage.googleapis.com/tranogasy-media/call1.jpg'],
      aiConfidence: 'medium',
      rawContent: 'Trano tsara ahofa',
      extracted: {
        title: 'Trano tsara',
        type: 'rent',
        houseType: 'house',
        rent: 300000,
        phone1: null,
        qualityScore: 50,
        features: {},
      },
      save: jest.fn().mockResolvedValue(true),
    };

    const configModel: any = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          key: 'default',
          autoApproveEnabled: true,
          autoApproveMinQualityScore: 75,
          autoApproveAllowEstimatedPrice: true,
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };

    const candidateModel: any = {
      find: jest.fn().mockResolvedValue([eligibleCandidate, callQueueCandidate]),
      findById: jest.fn().mockImplementation(async (id: string) => {
        if (id === 'cand_auto_1') return eligibleCandidate;
        if (id === 'cand_call_1') return callQueueCandidate;
        return null;
      }),
    };

    const cityModel: any = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: validCityId,
          fokontany: 'Ambatobe',
          commune: 'Antananarivo Renivohitra',
          district: 'Antananarivo II',
          region: 'Analamanga',
          coords: { lat: -18.8672, lng: 47.5469 },
        }),
      }),
    };

    const userModel: any = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'shadow_auto_1',
        username: 'Rabe Auto',
        avatar: null,
        save: jest.fn().mockResolvedValue(true),
      }),
    };

    const groupModel: any = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };

    const propertiesService: any = {
      create: jest.fn().mockResolvedValue({ _id: 'prop_auto_1' }),
    };

    const service = new FbIngestionService(
      configModel,
      groupModel,
      { findOne: jest.fn().mockResolvedValue(null), create: jest.fn() } as any,
      candidateModel,
      { findById: jest.fn().mockResolvedValue(null) } as any,
      cityModel,
      userModel,
      propertiesService,
      {} as any,
      {} as any,
      {} as any,
      {
        isPermanentGcsUrl: jest.fn().mockReturnValue(true),
        reuploadFbAvatar: jest.fn().mockResolvedValue(null),
      } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    const res = await service.autoApprovePendingCandidates();

    expect(res).toEqual({ scanned: 2, autoApproved: 1 });
    expect(propertiesService.create).toHaveBeenCalledTimes(1);
    expect(eligibleCandidate.status).toBe('approved');
    expect(eligibleCandidate.autoApproved).toBe(true);
    expect(eligibleCandidate.workflowLane).toBe('auto_published');
    expect(eligibleCandidate.publishedPropertyId).toBe('prop_auto_1');
    expect(callQueueCandidate.status).toBe('pending');
    expect(callQueueCandidate.workflowLane).toBe('call_queue');
    expect(configModel.updateOne).toHaveBeenCalledWith(
      { key: 'default' },
      { $inc: { totalAutoApproved: 1 } },
    );
  });

  it('unpublishCandidate deletes published property, decrements group approvedCount, and returns candidate to pending', async () => {
    const { service, candidateModel, propertyModel } = createHarness();
    const approvedDoc: any = {
      _id: 'cand_unpub_1',
      status: 'approved',
      groupId: 'grp_tana',
      publishedPropertyId: 'prop_pub_99',
      autoApproved: true,
      autoApproveReason: 'Auto-validé (Confiance haute + Prix affiché)',
      workflowLane: 'auto_published',
      matchedCityId: '65f000000000000000000022',
      gcsImages: ['https://storage.googleapis.com/tranogasy-media/p1.jpg'],
      extracted: {
        type: 'rent',
        houseType: 'house',
        rent: 400000,
        phone1: '034 22 333 44',
      },
      reviewedAt: new Date('2026-11-15T10:00:00Z'),
      save: jest.fn().mockResolvedValue(true),
    };

    candidateModel.findById = jest.fn().mockResolvedValue(approvedDoc);
    propertyModel.findByIdAndDelete = jest.fn().mockResolvedValue({ _id: 'prop_pub_99' });
    const groupModel = (service as any).groupModel;
    groupModel.updateOne = jest.fn().mockResolvedValue({ acknowledged: true });

    const res = await service.unpublishCandidate('cand_unpub_1');

    expect(propertyModel.findByIdAndDelete).toHaveBeenCalledWith('prop_pub_99');
    expect(groupModel.updateOne).toHaveBeenCalledWith(
      { groupId: 'grp_tana', approvedCount: { $gt: 0 } },
      { $inc: { approvedCount: -1 } },
    );
    expect(approvedDoc.status).toBe('pending');
    expect(approvedDoc.publishedPropertyId).toBeNull();
    expect(approvedDoc.autoApproved).toBe(false);
    expect(approvedDoc.autoApproveReason).toBeNull();
    expect(approvedDoc.reviewedAt).toBeNull();
    expect(approvedDoc.save).toHaveBeenCalledTimes(1);
    expect(res.candidate).toBe(approvedDoc);
  });
});
