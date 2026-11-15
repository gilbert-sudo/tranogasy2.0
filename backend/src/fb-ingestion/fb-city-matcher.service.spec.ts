import { FbCityMatcherService } from './fb-city-matcher.service';
import { FbPlacesService } from './fb-places.service';

describe('FbPlacesService & FbCityMatcherService geo pipeline', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildCityModel(cities: Array<Record<string, unknown>>) {
    return {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(cities),
      }),
    } as any;
  }

  it('uses minimal field masks, caches in memory & DB, and coalesces concurrent identical queries', async () => {
    const cacheModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      countDocuments: jest.fn().mockResolvedValue(1),
    } as any;

    const configService = {
      get: jest.fn((key: string) =>
        key === 'GOOGLE_PLACES_API_KEY' ? 'test-google-key' : undefined,
      ),
    } as any;

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        places: [
          {
            id: 'place_ivandry_1',
            displayName: { text: 'La City Ivandry' },
            formattedAddress: 'Ivandry, Antananarivo, Madagascar',
            location: { latitude: -18.8752, longitude: 47.5231 },
          },
        ],
      }),
    } as any);

    const placesService = new FbPlacesService(configService, cacheModel);

    // Fire 3 concurrent lookups for the exact same landmark -> singleflight must call fetch once
    const [r1, r2, r3] = await Promise.all([
      placesService.resolvePlaceCoordinates({
        queryText: 'La City Ivandry, Antananarivo, Madagascar',
        cacheKeyHint: 'la city ivandry',
        bias: { lat: -18.8792, lng: 47.5079, radiusMeters: 40_000, regionTag: 'antananarivo' },
      }),
      placesService.resolvePlaceCoordinates({
        queryText: 'La City Ivandry, Antananarivo, Madagascar',
        cacheKeyHint: 'la city ivandry',
        bias: { lat: -18.8792, lng: 47.5079, radiusMeters: 40_000, regionTag: 'antananarivo' },
      }),
      placesService.resolvePlaceCoordinates({
        queryText: 'La City Ivandry, Antananarivo, Madagascar',
        cacheKeyHint: 'la city ivandry',
        bias: { lat: -18.8792, lng: 47.5079, radiusMeters: 40_000, regionTag: 'antananarivo' },
      }),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, reqInit] = fetchSpy.mock.calls[0];
    expect((reqInit as any)?.headers?.['X-Goog-FieldMask']).toBe(
      'places.id,places.displayName,places.formattedAddress,places.location',
    );

    const apiCalls = [r1, r2, r3].filter((r) => r?.apiCallMade).length;
    expect(apiCalls).toBe(1);
    expect(r1?.coords).toEqual({ lat: -18.8752, lng: 47.5231 });

    // Sequential follow-up must hit in-memory LRU cache with zero fetch calls and zero DB reads
    const r4 = await placesService.resolvePlaceCoordinates({
      queryText: 'La City Ivandry, Antananarivo, Madagascar',
      cacheKeyHint: 'la city ivandry',
      bias: { lat: -18.8792, lng: 47.5079, radiusMeters: 40_000, regionTag: 'antananarivo' },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cacheModel.findOne).toHaveBeenCalledTimes(1);
    expect(r4?.source).toBe('cache');
    expect(r4?.apiCallMade).toBe(false);
  });

  it('uses persisted MongoDB Place cache across restarts without burning Google API quota', async () => {
    const futureExpiry = new Date(Date.now() + 86_400_000);
    const cacheModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'cache_doc_1',
          normalizedKey: 'antananarivo|lycee francais ambatobe',
          status: 'ok',
          placeId: 'place_lf',
          placeName: 'Lycée Français d’Antananarivo',
          formattedAddress: 'Ambatobe, Antananarivo',
          coords: { lat: -18.8675, lng: 47.5471 },
          expiresAt: futureExpiry,
        }),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    } as any;

    const configService = {
      get: jest.fn((key: string) =>
        key === 'GOOGLE_MAPS_API_KEY' ? 'test-google-key' : undefined,
      ),
    } as any;

    const fetchSpy = jest.spyOn(global, 'fetch');
    const placesService = new FbPlacesService(configService, cacheModel);

    const res = await placesService.resolvePlaceCoordinates({
      queryText: 'Lycée Français Ambatobe, Antananarivo, Madagascar',
      cacheKeyHint: 'Lycée Français Ambatobe',
      bias: { lat: -18.8792, lng: 47.5079, radiusMeters: 40_000, regionTag: 'antananarivo' },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res).toEqual({
      coords: { lat: -18.8675, lng: 47.5471 },
      placeId: 'place_lf',
      placeName: 'Lycée Français d’Antananarivo',
      formattedAddress: 'Ambatobe, Antananarivo',
      source: 'cache',
      apiCallMade: false,
    });
  });

  it('does not negative-cache transient HTTP 429 rate-limit responses', async () => {
    const cacheModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    } as any;

    const configService = {
      get: jest.fn((key: string) =>
        key === 'GOOGLE_PLACES_API_KEY' ? 'test-key' : undefined,
      ),
    } as any;

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Quota exceeded',
      json: async () => ({ error: { message: 'Quota exceeded' } }),
    } as any);

    const placesService = new FbPlacesService(configService, cacheModel);
    const res = await placesService.resolvePlaceCoordinates({
      queryText: 'Analamahitsy, Antananarivo, Madagascar',
      cacheKeyHint: 'analamahitsy',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res).toBeNull();
    expect(cacheModel.updateOne).not.toHaveBeenCalled();
  });

  it('resolves Google Places coords to nearest DB Fokontany via spatial grid and skips broad city tokens', async () => {
    const cities = [
      {
        _id: 'fkt_ivandry',
        fokontany: 'Ivandry',
        commune: 'Antananarivo Renivohitra',
        district: 'Antananarivo V',
        region: 'Analamanga',
        coords: { lat: -18.8758, lng: 47.5238 },
      },
      {
        _id: 'fkt_ambatobe',
        fokontany: 'Ambatobe',
        commune: 'Antananarivo Renivohitra',
        district: 'Antananarivo II',
        region: 'Analamanga',
        coords: { lat: -18.8672, lng: 47.5469 },
      },
      {
        _id: 'fkt_itanosy',
        fokontany: 'Itaosy',
        commune: 'Bemasoandro Itaosy',
        district: 'Antananarivo Atsimondrano',
        region: 'Analamanga',
        coords: { lat: -18.921, lng: 47.465 },
      },
    ];

    const placesMock = {
      resolvePlaceCoordinates: jest.fn().mockResolvedValue({
        coords: { lat: -18.8679, lng: 47.5472 },
        placeId: 'p_lf',
        placeName: 'Lycée Français Ambatobe',
        formattedAddress: 'Ambatobe, Antananarivo',
        source: 'places_v1',
        apiCallMade: true,
      }),
    } as any;

    const matcher = new FbCityMatcherService(buildCityModel(cities), placesMock);

    // Passing broad "Antananarivo" first must still query ONLY specific "Lycée Français" -> Ambatobe
    const match = await matcher.matchLocation(
      ['Antananarivo', 'Lycée Français', 'Tana'],
      'Appartement proche Lycée Français',
      'Location Maison Tana',
    );

    expect(placesMock.resolvePlaceCoordinates).toHaveBeenCalledTimes(1);
    expect(placesMock.resolvePlaceCoordinates.mock.calls[0][0].cacheKeyHint).toBe('lycee francais');
    expect(match.resolutionSource).toBe('google_places_api');
    expect(match.apiCallMade).toBe(true);
    expect(match.resolvedCoords).toEqual({ lat: -18.8679, lng: 47.5472 });
    expect(match.resolvedPlaceName).toBe('Lycée Français Ambatobe');
    expect(match.bestMatch?._id).toBe('fkt_ambatobe');
    expect(match.bestMatch?.distanceMeters).toBeLessThan(200);
  });

  it('falls back to text matching gracefully when Places service returns null', async () => {
    const cities = [
      {
        _id: 'fkt_ivandry',
        fokontany: 'Ivandry',
        commune: 'Antananarivo Renivohitra',
        district: 'Antananarivo V',
        region: 'Analamanga',
        coords: { lat: -18.8758, lng: 47.5238 },
      },
    ];

    const placesMock = {
      resolvePlaceCoordinates: jest.fn().mockResolvedValue(null),
    } as any;

    const matcher = new FbCityMatcherService(buildCityModel(cities), placesMock);
    const match = await matcher.matchLocation(['Ivandry'], 'Villa T4 à Ivandry', 'Immobilier Tana');

    expect(match.resolutionSource).toBe('text_fallback');
    expect(match.apiCallMade).toBe(false);
    expect(match.resolvedPlaceName).toBeNull();
    expect(match.resolvedCoords).toEqual({ lat: -18.8758, lng: 47.5238 });
    expect(match.bestMatch?._id).toBe('fkt_ivandry');
  });

  it('automatically extracts "by pass" from raw Facebook text when locationHints is empty, resolves coords on Google Places, and picks nearest Fokontany', async () => {
    const cities = [
      {
        _id: 'fkt_ankadiaivo',
        fokontany: 'ankadiaivo',
        commune: 'alasora',
        district: 'antananarivo avaradrano',
        region: 'analamanga',
        coords: { lat: -18.9485, lng: 47.5521 },
      },
      {
        _id: 'fkt_ivandry',
        fokontany: 'ivandry',
        commune: 'antananarivo renivohitra',
        district: 'antananarivo v',
        region: 'analamanga',
        coords: { lat: -18.8758, lng: 47.5238 },
      },
    ];

    const placesMock = {
      resolvePlaceCoordinates: jest.fn().mockResolvedValue({
        coords: { lat: -18.9504827, lng: 47.5509288 },
        placeId: 'ChIJoUEtdkx88CER5W7HqiEE1tc',
        placeName: 'By-Pass',
        formattedAddress: 'By-Pass, Antananarivo, Madagascar',
        source: 'places_legacy',
        apiCallMade: true,
      }),
    } as any;

    const matcher = new FbCityMatcherService(buildCityModel(cities), placesMock);
    const match = await matcher.matchLocation(
      [],
      'Trano ahofa by pass mitsofoka accès moto 2million fmg efitrano misy jiro rano efitra 2 wc douche anatiny contact 0388008382',
      'Trano amidy sy ahofa eto Antananarivo',
    );

    expect(placesMock.resolvePlaceCoordinates).toHaveBeenCalledTimes(1);
    expect(placesMock.resolvePlaceCoordinates.mock.calls[0][0].queryText).toBe(
      'by pass, Antananarivo, Madagascar',
    );
    expect(match.bestMatch?._id).toBe('fkt_ankadiaivo');
    expect(match.resolvedPlaceName).toBe('By-Pass');
    expect(match.resolvedCoords).toEqual({ lat: -18.9504827, lng: 47.5509288 });
  });
});
