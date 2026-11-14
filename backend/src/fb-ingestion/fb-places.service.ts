import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { normalizeTextForHash } from './fb-dedup.util';
import {
  FbPlaceGeoCache,
  FbPlaceGeoCacheDocument,
} from './schemas/fb-place-geo-cache.schema';

export interface PlaceBiasCircle {
  lat: number;
  lng: number;
  radiusMeters: number;
  regionTag: string;
}

export interface PlaceResolutionResult {
  coords: { lat: number; lng: number };
  placeId: string | null;
  placeName: string;
  formattedAddress: string | null;
  source: 'cache' | 'places_v1' | 'places_legacy';
  apiCallMade: boolean;
}

interface MemoryCacheEntry {
  status: 'ok' | 'not_found';
  result: Omit<PlaceResolutionResult, 'source' | 'apiCallMade'> | null;
  expiresAtMs: number;
}

const MAX_MEM_CACHE_SIZE = 4000;
const OK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Resolves Madagascar place/neighborhood queries to coordinates via Google Maps Places API
 * using a 3-tier cache (in-memory LRU + MongoDB TTL + singleflight coalescing) and minimal field masks.
 */
@Injectable()
export class FbPlacesService {
  private readonly logger = new Logger(FbPlacesService.name);
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
  private readonly inFlight = new Map<string, Promise<PlaceResolutionResult | null>>();
  private detectedMode: 'v1' | 'legacy' | null = null;
  private loggedMissingKey = false;
  private cachedEntryCount = 0;
  private cachedCountLoadedAt = 0;

  constructor(
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    @InjectModel(FbPlaceGeoCache.name)
    private readonly cacheModel?: Model<FbPlaceGeoCacheDocument>,
  ) {}

  getApiKey(): string | null {
    const key =
      this.configService?.get<string>('GOOGLE_PLACES_API_KEY')?.trim() ||
      this.configService?.get<string>('GOOGLE_MAPS_API_KEY')?.trim() ||
      this.configService?.get<string>('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')?.trim() ||
      process.env.GOOGLE_PLACES_API_KEY?.trim() ||
      process.env.GOOGLE_MAPS_API_KEY?.trim() ||
      null;
    return key || null;
  }

  isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  async getCacheEntryCount(): Promise<number> {
    if (!this.cacheModel) return this.memoryCache.size;
    if (Date.now() - this.cachedCountLoadedAt < 60_000) {
      return this.cachedEntryCount;
    }
    try {
      this.cachedEntryCount = await this.cacheModel.countDocuments({ status: 'ok' });
      this.cachedCountLoadedAt = Date.now();
    } catch {
      return this.memoryCache.size;
    }
    return this.cachedEntryCount;
  }

  static buildNormalizedKey(query: string, regionTag = 'mg'): string {
    const normQuery = normalizeTextForHash(query);
    const normRegion = normalizeTextForHash(regionTag || 'mg');
    return `${normRegion}|${normQuery}`;
  }

  private setMemoryEntry(key: string, entry: MemoryCacheEntry): void {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    } else if (this.memoryCache.size >= MAX_MEM_CACHE_SIZE) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(key, entry);
  }

  private isValidMadagascarCoords(lat: unknown, lng: unknown): boolean {
    if (typeof lat !== 'number' || typeof lng !== 'number') return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return lat >= -26.2 && lat <= -11.4 && lng >= 42.5 && lng <= 51.2;
  }

  private toHaversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371e3;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private pickBestMadagascarCandidate(
    candidates: Array<{
      coords: { lat: number; lng: number };
      placeId: string | null;
      placeName: string;
      formattedAddress: string | null;
    }>,
    bias?: PlaceBiasCircle,
  ) {
    const valid = candidates.filter((c) =>
      this.isValidMadagascarCoords(c.coords.lat, c.coords.lng),
    );
    if (valid.length === 0) return null;
    if (!bias || valid.length === 1) return valid[0];

    // Reject clear cross-country wrong hits when a strong regional bias is known (>150km)
    const withDist = valid.map((c) => ({
      candidate: c,
      dist: this.toHaversineMeters(bias.lat, bias.lng, c.coords.lat, c.coords.lng),
    }));
    const withinBias = withDist.find((item) => item.dist <= Math.max(bias.radiusMeters * 2.5, 90_000));
    if (withinBias) return withinBias.candidate;

    return withDist.sort((a, b) => a.dist - b.dist)[0].candidate;
  }

  async resolvePlaceCoordinates(params: {
    queryText: string;
    cacheKeyHint?: string;
    bias?: PlaceBiasCircle;
  }): Promise<PlaceResolutionResult | null> {
    const cleanQuery = (params.queryText || '').trim();
    if (cleanQuery.length < 2) return null;

    const regionTag = params.bias?.regionTag || 'mg';
    const keySource = params.cacheKeyHint?.trim() || cleanQuery;
    const cacheKey = FbPlacesService.buildNormalizedKey(keySource, regionTag);
    const now = Date.now();

    // Tier 1: In-memory LRU lookup
    const memHit = this.memoryCache.get(cacheKey);
    if (memHit && memHit.expiresAtMs > now) {
      // Refresh recency
      this.setMemoryEntry(cacheKey, memHit);
      if (memHit.status === 'not_found' || !memHit.result) {
        return null;
      }
      return {
        ...memHit.result,
        source: 'cache',
        apiCallMade: false,
      };
    }

    // Tier 3 (before DB+network): coalesce concurrent identical lookups across async workers
    const existingFlight = this.inFlight.get(cacheKey);
    if (existingFlight) {
      const flightRes = await existingFlight;
      return flightRes ? { ...flightRes, source: 'cache', apiCallMade: false } : null;
    }

    const work = this.lookupDbOrCallGoogle(cacheKey, cleanQuery, params.bias);
    this.inFlight.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async lookupDbOrCallGoogle(
    cacheKey: string,
    queryText: string,
    bias?: PlaceBiasCircle,
  ): Promise<PlaceResolutionResult | null> {
    const now = new Date();

    // Tier 2: Persistent MongoDB cache
    if (this.cacheModel) {
      try {
        const dbHit = await this.cacheModel
          .findOne({ normalizedKey: cacheKey, expiresAt: { $gt: now } })
          .lean();

        if (dbHit) {
          void this.cacheModel
            .updateOne({ _id: dbHit._id }, { $inc: { hitCount: 1 } })
            .catch(() => undefined);

          if (dbHit.status === 'not_found' || !dbHit.coords) {
            this.setMemoryEntry(cacheKey, {
              status: 'not_found',
              result: null,
              expiresAtMs: new Date(dbHit.expiresAt).getTime(),
            });
            return null;
          }

          const payload = {
            coords: dbHit.coords,
            placeId: dbHit.placeId || null,
            placeName: dbHit.placeName || queryText,
            formattedAddress: dbHit.formattedAddress || null,
          };
          this.setMemoryEntry(cacheKey, {
            status: 'ok',
            result: payload,
            expiresAtMs: new Date(dbHit.expiresAt).getTime(),
          });
          return {
            ...payload,
            source: 'cache',
            apiCallMade: false,
          };
        }
      } catch (err) {
        this.logger.warn(`Place cache DB read failed: ${(err as Error).message}`);
      }
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      if (!this.loggedMissingKey) {
        this.loggedMissingKey = true;
        this.logger.warn(
          'GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY is not configured; falling back to local Fokontany matching.',
        );
      }
      return null;
    }

    const apiResponse = await this.callGooglePlacesApi(apiKey, queryText, bias);
    if (apiResponse.transientError) {
      // Do not poison cache on temporary 429/5xx/network timeouts
      return null;
    }

    if (!apiResponse.match) {
      const expiresAt = new Date(Date.now() + NOT_FOUND_TTL_MS);
      this.setMemoryEntry(cacheKey, {
        status: 'not_found',
        result: null,
        expiresAtMs: expiresAt.getTime(),
      });
      if (this.cacheModel) {
        void this.cacheModel
          .updateOne(
            { normalizedKey: cacheKey },
            {
              $set: {
                normalizedKey: cacheKey,
                queryText,
                status: 'not_found',
                placeId: null,
                placeName: null,
                formattedAddress: null,
                coords: null,
                provider: 'none',
                expiresAt,
              },
              $inc: { hitCount: 1 },
            },
            { upsert: true },
          )
          .catch(() => undefined);
      }
      return null;
    }

    const expiresAt = new Date(Date.now() + OK_TTL_MS);
    const resultPayload = {
      coords: apiResponse.match.coords,
      placeId: apiResponse.match.placeId,
      placeName: apiResponse.match.placeName,
      formattedAddress: apiResponse.match.formattedAddress,
    };

    this.setMemoryEntry(cacheKey, {
      status: 'ok',
      result: resultPayload,
      expiresAtMs: expiresAt.getTime(),
    });

    if (this.cacheModel) {
      this.cachedCountLoadedAt = 0;
      void this.cacheModel
        .updateOne(
          { normalizedKey: cacheKey },
          {
            $set: {
              normalizedKey: cacheKey,
              queryText,
              status: 'ok',
              placeId: resultPayload.placeId,
              placeName: resultPayload.placeName,
              formattedAddress: resultPayload.formattedAddress,
              coords: resultPayload.coords,
              provider: apiResponse.provider,
              expiresAt,
            },
            $inc: { hitCount: 1 },
          },
          { upsert: true },
        )
        .catch(() => undefined);
    }

    return {
      ...resultPayload,
      source: apiResponse.provider,
      apiCallMade: true,
    };
  }

  private async callGooglePlacesApi(
    apiKey: string,
    queryText: string,
    bias?: PlaceBiasCircle,
  ): Promise<{
    match: {
      coords: { lat: number; lng: number };
      placeId: string | null;
      placeName: string;
      formattedAddress: string | null;
    } | null;
    provider: 'places_v1' | 'places_legacy';
    transientError: boolean;
  }> {
    if (this.detectedMode === 'legacy') {
      return this.callLegacyFindPlace(apiKey, queryText, bias);
    }

    const v1Res = await this.callPlacesV1SearchText(apiKey, queryText, bias);
    if (!v1Res.fallbackToLegacy) {
      if (!v1Res.transientError) {
        this.detectedMode = 'v1';
      }
      return {
        match: v1Res.match,
        provider: 'places_v1',
        transientError: v1Res.transientError,
      };
    }

    const legacyRes = await this.callLegacyFindPlace(apiKey, queryText, bias);
    if (!legacyRes.transientError) {
      this.detectedMode = 'legacy';
    }
    return legacyRes;
  }

  private async callPlacesV1SearchText(
    apiKey: string,
    queryText: string,
    bias?: PlaceBiasCircle,
  ): Promise<{
    match: {
      coords: { lat: number; lng: number };
      placeId: string | null;
      placeName: string;
      formattedAddress: string | null;
    } | null;
    transientError: boolean;
    fallbackToLegacy: boolean;
  }> {
    try {
      const body: Record<string, any> = {
        textQuery: queryText,
        regionCode: 'MG',
        languageCode: 'fr',
        maxResultCount: 3,
      };
      if (bias) {
        body.locationBias = {
          circle: {
            center: { latitude: bias.lat, longitude: bias.lng },
            radius: Math.min(50000, Math.max(5000, bias.radiusMeters)),
          },
        };
      }

      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // Strictly limit returned fields to avoid Enterprise/Atmosphere SKU charges
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const errTxt = await res.text().catch(() => '');
        if (res.status === 403 || res.status === 401) {
          this.logger.warn(
            `Places API (New) unavailable (${res.status}), switching to Places Find Place API: ${errTxt.slice(0, 180)}`,
          );
          return { match: null, transientError: true, fallbackToLegacy: true };
        }
        const transient = res.status === 429 || res.status >= 500;
        this.logger.warn(`Places API (New) HTTP ${res.status} for "${queryText}": ${errTxt.slice(0, 180)}`);
        return { match: null, transientError: transient, fallbackToLegacy: false };
      }

      const data = (await res.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
        }>;
      };

      const parsedCandidates = (data.places || [])
        .filter(
          (p) =>
            typeof p.location?.latitude === 'number' &&
            typeof p.location?.longitude === 'number',
        )
        .map((p) => ({
          coords: { lat: p.location!.latitude!, lng: p.location!.longitude! },
          placeId: p.id || null,
          placeName: p.displayName?.text || queryText,
          formattedAddress: p.formattedAddress || null,
        }));

      return {
        match: this.pickBestMadagascarCandidate(parsedCandidates, bias),
        transientError: false,
        fallbackToLegacy: false,
      };
    } catch (err) {
      this.logger.warn(`Places API (New) request error for "${queryText}": ${(err as Error).message}`);
      return { match: null, transientError: true, fallbackToLegacy: false };
    }
  }

  private async callLegacyFindPlace(
    apiKey: string,
    queryText: string,
    bias?: PlaceBiasCircle,
  ): Promise<{
    match: {
      coords: { lat: number; lng: number };
      placeId: string | null;
      placeName: string;
      formattedAddress: string | null;
    } | null;
    provider: 'places_legacy';
    transientError: boolean;
  }> {
    try {
      const qs = new URLSearchParams({
        input: queryText,
        inputtype: 'textquery',
        fields: 'place_id,name,formatted_address,geometry',
        language: 'fr',
        key: apiKey,
      });
      if (bias) {
        qs.set('locationbias', `circle:${Math.min(50000, bias.radiusMeters)}@${bias.lat},${bias.lng}`);
      }

      const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${qs.toString()}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const transient = res.status === 429 || res.status >= 500;
        this.logger.warn(`Legacy Find Place HTTP ${res.status} for "${queryText}"`);
        return { match: null, provider: 'places_legacy', transientError: transient };
      }

      const data = (await res.json()) as {
        status?: string;
        error_message?: string;
        candidates?: Array<{
          place_id?: string;
          name?: string;
          formatted_address?: string;
          geometry?: { location?: { lat?: number; lng?: number } };
        }>;
      };

      if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'UNKNOWN_ERROR') {
        this.logger.warn(`Legacy Find Place status ${data.status}: ${data.error_message || ''}`);
        return { match: null, provider: 'places_legacy', transientError: true };
      }
      if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
        this.logger.warn(`Legacy Find Place ${data.status}: ${data.error_message || ''}`);
        return { match: null, provider: 'places_legacy', transientError: true };
      }

      const parsedCandidates = (data.candidates || [])
        .filter(
          (c) =>
            typeof c.geometry?.location?.lat === 'number' &&
            typeof c.geometry?.location?.lng === 'number',
        )
        .map((c) => ({
          coords: { lat: c.geometry!.location!.lat!, lng: c.geometry!.location!.lng! },
          placeId: c.place_id || null,
          placeName: c.name || queryText,
          formattedAddress: c.formatted_address || null,
        }));

      return {
        match: this.pickBestMadagascarCandidate(parsedCandidates, bias),
        provider: 'places_legacy',
        transientError: false,
      };
    } catch (err) {
      this.logger.warn(`Legacy Find Place error for "${queryText}": ${(err as Error).message}`);
      return { match: null, provider: 'places_legacy', transientError: true };
    }
  }
}
