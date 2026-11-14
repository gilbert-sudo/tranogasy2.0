import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { normalizeTextForHash } from './fb-dedup.util';
import { FbPlacesService, PlaceBiasCircle } from './fb-places.service';

export interface CityCandidateMatch {
  _id: string;
  label: string;
  fokontany: string;
  commune: string;
  district: string;
  coords?: { lat: number; lng: number };
  distanceMeters?: number | null;
  score: number;
}

export type LocationResolutionSource =
  | 'google_places_cache'
  | 'google_places_api'
  | 'text_fallback'
  | null;

export interface LocationMatchResult {
  bestMatch: CityCandidateMatch | null;
  candidates: CityCandidateMatch[];
  resolvedCoords: { lat: number; lng: number } | null;
  resolvedPlaceName: string | null;
  resolvedAddress: string | null;
  resolutionSource: LocationResolutionSource;
  apiCallMade: boolean;
}

interface IndexedCity {
  _id: string;
  fokontany: string;
  commune: string;
  district: string;
  region: string;
  coords?: { lat: number; lng: number };
  hasValidCoords: boolean;
  normFokontany: string;
  normCommune: string;
  normDistrict: string;
  normFull: string;
  label: string;
}

const GRID_STEP_DEG = 0.05; // ~5.5 km grid cells for O(1) spatial neighborhood lookup

const MADAGASCAR_CITY_BIASES: Array<{ keywords: string[]; bias: PlaceBiasCircle }> = [
  {
    keywords: ['toamasina', 'tamatave', 'atsinanana'],
    bias: { lat: -18.1492, lng: 49.4023, radiusMeters: 30_000, regionTag: 'toamasina' },
  },
  {
    keywords: ['mahajanga', 'majunga', 'boeny'],
    bias: { lat: -15.7167, lng: 46.3167, radiusMeters: 25_000, regionTag: 'mahajanga' },
  },
  {
    keywords: ['antsirabe', 'vakinankaratra'],
    bias: { lat: -19.8659, lng: 47.0333, radiusMeters: 25_000, regionTag: 'antsirabe' },
  },
  {
    keywords: ['fianarantsoa', 'matsiatra'],
    bias: { lat: -21.4527, lng: 47.0857, radiusMeters: 25_000, regionTag: 'fianarantsoa' },
  },
  {
    keywords: ['toliara', 'tulear', 'atsimo andrefana'],
    bias: { lat: -23.35, lng: 43.6667, radiusMeters: 25_000, regionTag: 'toliara' },
  },
  {
    keywords: ['antsiranana', 'diego', 'diego suarez', 'diana'],
    bias: { lat: -12.2787, lng: 49.2917, radiusMeters: 25_000, regionTag: 'antsiranana' },
  },
  {
    keywords: ['nosy be', 'hell ville', 'hellville', 'ambohitranefitra'],
    bias: { lat: -13.3167, lng: 48.2667, radiusMeters: 20_000, regionTag: 'nosy-be' },
  },
  {
    keywords: ['sainte marie', 'nosy boraha'],
    bias: { lat: -16.9044, lng: 49.9038, radiusMeters: 20_000, regionTag: 'sainte-marie' },
  },
];

const ANTANANARIVO_BIAS: PlaceBiasCircle = {
  lat: -18.8792,
  lng: 47.5079,
  radiusMeters: 40_000,
  regionTag: 'antananarivo',
};

const BROAD_ONLY_TOKENS = new Set([
  'antananarivo',
  'tana',
  'tanana',
  'analamanga',
  'madagascar',
  'mada',
  'renivohitra',
  'antananarivo renivohitra',
  'antananarivo atsimondrano',
  'antananarivo avaradrano',
]);

const GENERIC_NON_PLACE_PATTERNS = [
  /^bord de (?:la )?route$/i,
  /^route principale$/i,
  /^quartier (?:calme|residentiel|securise)$/i,
  /^(?:bon quartier|centre ville|en ville|proximite|calme|securise)$/i,
  /^\d+$/,
];

function calculateHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tokenOverlapRatio(aNorm: string, bNorm: string): number {
  if (!aNorm || !bNorm) return 0;
  const tokA = new Set(aNorm.split(' ').filter((w) => w.length >= 2));
  const tokB = new Set(bNorm.split(' ').filter((w) => w.length >= 2));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let shared = 0;
  for (const t of tokA) {
    if (tokB.has(t)) shared++;
  }
  return shared / Math.min(tokA.size, tokB.size);
}

function distanceToScore(distanceMeters: number, exactTieBonus: number): number {
  let base: number;
  if (distanceMeters <= 350) {
    base = 100 - Math.round((distanceMeters / 350) * 3);
  } else if (distanceMeters <= 2_500) {
    base = 96 - Math.round(((distanceMeters - 350) / 2150) * 14);
  } else if (distanceMeters <= 12_000) {
    base = 82 - Math.round(((distanceMeters - 2500) / 9500) * 16);
  } else if (distanceMeters <= 25_000) {
    base = 65 - Math.round(((distanceMeters - 12000) / 13000) * 20);
  } else {
    base = Math.max(20, 45 - Math.round((distanceMeters - 25000) / 2000));
  }
  return Math.max(0, Math.min(100, base + (exactTieBonus > 0.5 ? 2 : 0)));
}

@Injectable()
export class FbCityMatcherService implements OnModuleInit {
  private readonly logger = new Logger(FbCityMatcherService.name);
  private indexedCities: IndexedCity[] = [];
  private geoIndexedCities: IndexedCity[] = [];
  private spatialGrid = new Map<string, IndexedCity[]>();
  private loadedAt = 0;

  constructor(
    @InjectModel(City.name) private cityModel: Model<CityDocument>,
    @Optional() private readonly fbPlacesService?: FbPlacesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCacheLoaded();
  }

  private gridKey(cellLat: number, cellLng: number): string {
    return `${cellLat}:${cellLng}`;
  }

  private async ensureCacheLoaded(): Promise<void> {
    if (this.indexedCities.length > 0 && Date.now() - this.loadedAt < 30 * 60 * 1000) {
      return;
    }

    const cities = await this.cityModel
      .find({}, { _id: 1, fokontany: 1, commune: 1, district: 1, region: 1, coords: 1 })
      .lean();

    const nextIndexed: IndexedCity[] = [];
    const nextGeo: IndexedCity[] = [];
    const nextGrid = new Map<string, IndexedCity[]>();

    for (const c of cities as any[]) {
      const lat = c.coords?.lat;
      const lng = c.coords?.lng;
      const hasValidCoords =
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        !(lat === 0 && lng === 0);

      const normFokontany = normalizeTextForHash(c.fokontany || '');
      const normCommune = normalizeTextForHash(c.commune || '');
      const normDistrict = normalizeTextForHash(c.district || '');

      const entry: IndexedCity = {
        _id: String(c._id),
        fokontany: c.fokontany || '',
        commune: c.commune || '',
        district: c.district || '',
        region: c.region || '',
        coords: hasValidCoords ? { lat, lng } : c.coords,
        hasValidCoords,
        normFokontany,
        normCommune,
        normDistrict,
        normFull: `${normFokontany} ${normCommune} ${normDistrict}`.trim(),
        label: [c.fokontany, c.commune, c.district].filter(Boolean).join(' — '),
      };

      nextIndexed.push(entry);
      if (hasValidCoords) {
        nextGeo.push(entry);
        const key = this.gridKey(
          Math.floor(lat / GRID_STEP_DEG),
          Math.floor(lng / GRID_STEP_DEG),
        );
        const bucket = nextGrid.get(key);
        if (bucket) bucket.push(entry);
        else nextGrid.set(key, [entry]);
      }
    }

    this.indexedCities = nextIndexed;
    this.geoIndexedCities = nextGeo;
    this.spatialGrid = nextGrid;
    this.loadedAt = Date.now();
    this.logger.log(
      `Cached ${this.indexedCities.length} Fokontany (${this.geoIndexedCities.length} geo-indexed across ${this.spatialGrid.size} spatial grid cells)`,
    );
  }

  /**
   * Infers regional coordinates bias from post hints and Facebook group context.
   */
  private inferRegionalBias(
    locationHints: string[],
    rawText: string,
    groupName: string,
  ): PlaceBiasCircle {
    const combined = normalizeTextForHash(
      `${locationHints.join(' ')} ${groupName} ${rawText.slice(0, 400)}`,
    );

    for (const region of MADAGASCAR_CITY_BIASES) {
      if (region.keywords.some((kw) => combined.includes(kw))) {
        return region.bias;
      }
    }
    return ANTANANARIVO_BIAS;
  }

  /**
   * Builds up to 2 deduplicated, specific Google Places queries from raw hints
   * (avoiding broad "Antananarivo"/"Tana" center hits and filtering non-location descriptors).
   */
  private buildPlaceQueryPlan(
    locationHints: string[],
    rawText: string,
    groupName: string,
  ): Array<{ queryText: string; cacheKeyHint: string; hintTerm: string }> {
    const bias = this.inferRegionalBias(locationHints, rawText, groupName);
    const regionLabel =
      bias.regionTag === 'antananarivo'
        ? 'Antananarivo'
        : bias.regionTag
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

    const specificCleaned: Array<{ raw: string; norm: string }> = [];
    for (const rawHint of locationHints || []) {
      const cleaned = String(rawHint || '').trim();
      if (cleaned.length < 2) continue;
      if (GENERIC_NON_PLACE_PATTERNS.some((rx) => rx.test(cleaned))) continue;

      const norm = normalizeTextForHash(cleaned);
      if (!norm || norm.length < 2) continue;
      if (BROAD_ONLY_TOKENS.has(norm)) continue;

      // Skip bare major regional city names if we also have neighborhood hints (handled below)
      specificCleaned.push({ raw: cleaned, norm });
    }

    // Deduplicate redundant substrings while keeping more specific phrases first
    const deduplicated: Array<{ raw: string; norm: string }> = [];
    for (const item of specificCleaned) {
      const redundant = deduplicated.some(
        (existing) =>
          existing.norm === item.norm ||
          existing.norm.includes(item.norm),
      );
      if (!redundant) {
        deduplicated.push(item);
      }
    }

    // Limit to max 2 Places candidates: primary hint + 1 fallback only if primary misses
    const picked = deduplicated.slice(0, 2);
    return picked.map(({ raw, norm }) => {
      const hasCountry = norm.includes('madagascar');
      const hasRegion =
        norm.includes(normalizeTextForHash(regionLabel)) ||
        norm.includes('tana');
      const suffixParts: string[] = [];
      if (!hasRegion) suffixParts.push(regionLabel);
      if (!hasCountry) suffixParts.push('Madagascar');

      const queryText =
        suffixParts.length > 0 ? `${raw}, ${suffixParts.join(', ')}` : raw;

      return {
        queryText,
        cacheKeyHint: norm,
        hintTerm: raw,
      };
    });
  }

  /**
   * Finds the nearest Fokontany in our MongoDB Cities dataset to exact GPS coordinates
   * using the pre-built 2D spatial grid index (<0.5ms per lookup).
   */
  async findNearestFokontanyToCoords(
    coords: { lat: number; lng: number },
    matchHints: string[] = [],
    maxBestDistanceMeters = 15_000,
  ): Promise<{ bestMatch: CityCandidateMatch | null; candidates: CityCandidateMatch[] }> {
    await this.ensureCacheLoaded();
    if (this.geoIndexedCities.length === 0) {
      return { bestMatch: null, candidates: [] };
    }

    const baseLatCell = Math.floor(coords.lat / GRID_STEP_DEG);
    const baseLngCell = Math.floor(coords.lng / GRID_STEP_DEG);

    const gatherGridPool = (cellRadius: number): IndexedCity[] => {
      const pool: IndexedCity[] = [];
      for (let dLat = -cellRadius; dLat <= cellRadius; dLat++) {
        for (let dLng = -cellRadius; dLng <= cellRadius; dLng++) {
          const bucket = this.spatialGrid.get(
            this.gridKey(baseLatCell + dLat, baseLngCell + dLng),
          );
          if (bucket) {
            pool.push(...bucket);
          }
        }
      }
      return pool;
    };

    let pool = gatherGridPool(1); // ~16x16km neighborhood
    if (pool.length < 4) {
      pool = gatherGridPool(3); // ~40x40km neighborhood
    }
    if (pool.length === 0) {
      pool = this.geoIndexedCities;
    }

    const combinedHintsNorm = normalizeTextForHash(matchHints.filter(Boolean).join(' '));

    const scoredPool = pool
      .map((city) => {
        const distanceMeters = calculateHaversineMeters(
          coords.lat,
          coords.lng,
          city.coords!.lat,
          city.coords!.lng,
        );
        const similarity = combinedHintsNorm
          ? tokenOverlapRatio(`${city.normFokontany} ${city.normCommune}`, combinedHintsNorm)
          : 0;
        // Small bounded tie-breaker (<= 220m) prefers matching Fokontany names right on border streets
        const effectiveDistance = distanceMeters - similarity * 220;
        return {
          city,
          distanceMeters,
          similarity,
          effectiveDistance,
        };
      })
      .sort((a, b) => a.effectiveDistance - b.effectiveDistance);

    const nearbyWithin30Km = scoredPool.filter((item) => item.distanceMeters <= 30_000);
    const finalPool = (nearbyWithin30Km.length > 0 ? nearbyWithin30Km : scoredPool).slice(0, 6);

    const candidates: CityCandidateMatch[] = finalPool.map((item) => ({
      _id: item.city._id,
      label: item.city.label,
      fokontany: item.city.fokontany,
      commune: item.city.commune,
      district: item.city.district,
      coords: item.city.coords,
      distanceMeters: Math.round(item.distanceMeters),
      score: distanceToScore(item.distanceMeters, item.similarity),
    }));

    const bestMatch =
      candidates.length > 0 &&
      (candidates[0].distanceMeters ?? Infinity) <= maxBestDistanceMeters
        ? candidates[0]
        : null;

    return { bestMatch, candidates };
  }

  /**
   * Direct admin search helper: resolves an arbitrary query/landmark through the shared
   * Google Places cache and returns the nearest DB Fokontany candidates.
   */
  async resolveLocationQuery(
    queryText: string,
    groupName = '',
  ): Promise<{
    place: {
      coords: { lat: number; lng: number };
      placeName: string;
      formattedAddress: string | null;
      source: LocationResolutionSource;
      apiCallMade: boolean;
    } | null;
    bestMatch: CityCandidateMatch | null;
    candidates: CityCandidateMatch[];
  }> {
    const clean = (queryText || '').trim();
    if (clean.length < 2) {
      return { place: null, bestMatch: null, candidates: [] };
    }

    if (!this.fbPlacesService) {
      const textRes = await this.matchByTextFallback([clean], clean, groupName);
      return {
        place: null,
        bestMatch: textRes.bestMatch,
        candidates: textRes.candidates,
      };
    }

    const bias = this.inferRegionalBias([clean], clean, groupName);
    const regionLabel =
      bias.regionTag === 'antananarivo' ? 'Antananarivo' : bias.regionTag;
    const norm = normalizeTextForHash(clean);
    const formattedQuery = norm.includes('madagascar')
      ? clean
      : norm.includes(normalizeTextForHash(regionLabel))
        ? `${clean}, Madagascar`
        : `${clean}, ${regionLabel}, Madagascar`;

    const place = await this.fbPlacesService.resolvePlaceCoordinates({
      queryText: formattedQuery,
      cacheKeyHint: norm,
      bias,
    });

    if (place) {
      const nearest = await this.findNearestFokontanyToCoords(place.coords, [
        place.placeName,
        clean,
      ]);
      const source: LocationResolutionSource =
        place.source === 'cache' ? 'google_places_cache' : 'google_places_api';
      return {
        place: {
          coords: place.coords,
          placeName: place.placeName,
          formattedAddress: place.formattedAddress,
          source,
          apiCallMade: place.apiCallMade,
        },
        bestMatch: nearest.bestMatch,
        candidates: nearest.candidates,
      };
    }

    const fallback = await this.matchByTextFallback([clean], clean, groupName);
    return {
      place: null,
      bestMatch: fallback.bestMatch,
      candidates: fallback.candidates,
    };
  }

  /**
   * Matches location hints from a Facebook post via:
   * 1) Cached / minimal-field Google Maps Places API -> exact GPS coords -> nearest DB Fokontany
   * 2) Deterministic spatial-aware text fallback when no specific place hint or Places result exists
   */
  async matchLocation(
    locationHints: string[],
    rawText: string,
    groupName: string,
  ): Promise<LocationMatchResult> {
    await this.ensureCacheLoaded();
    if (this.indexedCities.length === 0) {
      return {
        bestMatch: null,
        candidates: [],
        resolvedCoords: null,
        resolvedPlaceName: null,
        resolvedAddress: null,
        resolutionSource: null,
        apiCallMade: false,
      };
    }

    let apiCallMade = false;
    const queryPlan = this.buildPlaceQueryPlan(locationHints, rawText, groupName);

    if (this.fbPlacesService && queryPlan.length > 0) {
      const bias = this.inferRegionalBias(locationHints, rawText, groupName);

      for (const step of queryPlan) {
        const place = await this.fbPlacesService.resolvePlaceCoordinates({
          queryText: step.queryText,
          cacheKeyHint: step.cacheKeyHint,
          bias,
        });
        if (place?.apiCallMade) {
          apiCallMade = true;
        }
        if (place) {
          const nearest = await this.findNearestFokontanyToCoords(place.coords, [
            place.placeName,
            step.hintTerm,
            ...locationHints,
          ]);

          return {
            bestMatch: nearest.bestMatch,
            candidates: nearest.candidates,
            resolvedCoords: place.coords,
            resolvedPlaceName: place.placeName,
            resolvedAddress: place.formattedAddress,
            resolutionSource:
              place.source === 'cache' ? 'google_places_cache' : 'google_places_api',
            apiCallMade,
          };
        }
      }
    }

    // Fallback: if locationHints was empty or Places returned nothing (or key missing)
    const fallback = await this.matchByTextFallback(locationHints, rawText, groupName);
    return {
      bestMatch: fallback.bestMatch,
      candidates: fallback.candidates,
      resolvedCoords: fallback.bestMatch?.coords || null,
      resolvedPlaceName: null,
      resolvedAddress: null,
      resolutionSource: fallback.candidates.length > 0 ? 'text_fallback' : null,
      apiCallMade,
    };
  }

  private async matchByTextFallback(
    locationHints: string[],
    rawText: string,
    groupName: string,
  ): Promise<{ bestMatch: CityCandidateMatch | null; candidates: CityCandidateMatch[] }> {
    await this.ensureCacheLoaded();
    if (this.indexedCities.length === 0) {
      return { bestMatch: null, candidates: [] };
    }

    const normHints = locationHints
      .map((h) => normalizeTextForHash(h))
      .filter((h) => h.length >= 3 && !BROAD_ONLY_TOKENS.has(h));
    const normRaw = normalizeTextForHash(rawText);
    const normGroup = normalizeTextForHash(groupName);
    const isAntananarivoContext =
      normRaw.includes('tana') ||
      normRaw.includes('antananarivo') ||
      normGroup.includes('tana') ||
      normGroup.includes('antananarivo');

    const scored: CityCandidateMatch[] = [];

    for (const city of this.indexedCities) {
      let score = 0;

      if (city.normFokontany.length >= 3) {
        for (let idx = 0; idx < normHints.length; idx++) {
          const hint = normHints[idx];
          const hintOrderBonus = idx === 0 ? 4 : 0;
          if (hint === city.normFokontany) {
            score = Math.max(score, 100 + hintOrderBonus);
          } else if (hint.includes(city.normFokontany) || city.normFokontany.includes(hint)) {
            score = Math.max(score, 78 + hintOrderBonus);
          } else {
            const hintWords = hint.split(' ').filter((w) => w.length >= 3);
            const matchedWords = hintWords.filter((w) => city.normFokontany.includes(w));
            if (matchedWords.length > 0) {
              score = Math.max(score, Math.round((matchedWords.length / hintWords.length) * 65));
            }
          }
        }

        if (score < 70 && city.normFokontany.length >= 5 && normRaw.includes(city.normFokontany)) {
          score = Math.max(score, 72);
        }
      }

      if (score > 0 && city.normCommune) {
        if (normHints.some((h) => h.includes(city.normCommune)) || normRaw.includes(city.normCommune)) {
          score += 12;
        }
      }

      if (score > 0 && isAntananarivoContext) {
        if (city.normDistrict.includes('antananarivo renivohitra')) {
          score += 14;
        } else if (
          city.normDistrict.includes('antananarivo') ||
          city.normCommune.includes('antananarivo') ||
          normalizeTextForHash(city.region).includes('analamanga')
        ) {
          score += 10;
        }
      }

      if (score >= 45) {
        scored.push({
          _id: city._id,
          label: city.label,
          fokontany: city.fokontany,
          commune: city.commune,
          district: city.district,
          coords: city.coords,
          distanceMeters: null,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const candidates = scored.slice(0, 6);
    const bestMatch = candidates.length > 0 && candidates[0].score >= 65 ? candidates[0] : null;

    return { bestMatch, candidates };
  }
}
