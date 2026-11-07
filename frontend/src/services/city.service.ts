import { apiFetch } from './api';
import { getDistance } from 'geolib';

export interface CityLocation {
  _id: string;
  province: string;
  region: string;
  district: string;
  commune: string;
  fokontany: string;
  coords?: {
    lat: number;
    lng: number;
  };
  googlePlaceName?: string;
  isGoogleResult?: boolean;
}

// Remove accents/diacritics (frontend-safe)
export function removeDiacritics(text: string = ''): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Text similarity matching identical to the old Tranogasy version
export function checkTextSimilarity(textA: string = '', textB: string = ''): number {
  const normalize = (text: string) =>
    removeDiacritics(text || '')
      .toLowerCase()
      .replace(/[\n\r\t.,;:!?()\-–—'"“”‘’`´]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[0-9]{6,}/g, '')
      .trim()
      .split(' ')
      .filter(Boolean);

  const tokensA = normalize(textA);
  const tokensB = normalize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter((word) => setB.has(word));
  return intersection.length / Math.min(setA.size, setB.size);
}

// Find nearest city from a list using distance and similarity scoring
export function findNearestCityFromList(
  locations: CityLocation[],
  center: { lat: number; lng: number },
  placeName?: string,
  distanceThreshold: number = 25000,
): CityLocation | null {
  if (!locations || locations.length === 0) return null;

  const nearbyLocations: Array<{
    location: CityLocation;
    distance: number;
    simScore: number;
  }> = [];

  locations.forEach((location) => {
    if (!location.coords || typeof location.coords.lat !== 'number' || typeof location.coords.lng !== 'number') {
      return;
    }
    const dist = getDistance(center, location.coords);
    if (dist <= distanceThreshold) {
      if (placeName) {
        const locationName = `${location.fokontany} ${location.commune}`;
        const simScore = checkTextSimilarity(locationName, placeName) * 10;
        nearbyLocations.push({ location, distance: dist, simScore });
      } else {
        nearbyLocations.push({ location, distance: dist, simScore: 0 });
      }
    }
  });

  // If none within threshold (e.g. 25km), widen search to find physically closest city
  if (nearbyLocations.length === 0) {
    let closestCity: CityLocation | null = null;
    let minDistance = Infinity;

    locations.forEach((location) => {
      if (!location.coords || typeof location.coords.lat !== 'number' || typeof location.coords.lng !== 'number') {
        return;
      }
      const dist = getDistance(center, location.coords);
      if (dist < minDistance) {
        minDistance = dist;
        closestCity = location;
      }
    });

    return closestCity;
  }

  // Sort: highest similarity score first, then smallest distance
  nearbyLocations.sort((a, b) => {
    if (b.simScore !== a.simScore) {
      return b.simScore - a.simScore;
    }
    return a.distance - b.distance;
  });

  return nearbyLocations[0].location;
}

const DEFAULT_POPULAR_CITIES: CityLocation[] = [
  { _id: '64f75284ef8f606073e981ed', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '5ème Arrondissement', fokontany: 'Ivandry', coords: { lat: -18.8778, lng: 47.5273 } },
  { _id: '64f75284ef8f606073e981ef', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '1er Arrondissement', fokontany: 'Analakely', coords: { lat: -18.9075, lng: 47.5244 } },
  { _id: '64f75284ef8f606073e981f0', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '3ème Arrondissement', fokontany: 'Ankorondrano', coords: { lat: -18.8895, lng: 47.5228 } },
  { _id: '64f75284ef8f606073e981ee', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '5ème Arrondissement', fokontany: 'Ambatobe', coords: { lat: -18.8711, lng: 47.5512 } },
  { _id: '64f75284ef8f606073e981ec', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '1er Arrondissement', fokontany: 'Ambatovinaky', coords: { lat: -18.9159, lng: 47.5306 } },
  { _id: '64f75284ef8f606073e981f2', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Avaradrano', commune: 'Talatamaty', fokontany: 'Talatamaty', coords: { lat: -18.8417, lng: 47.4583 } },
  { _id: '64f75284ef8f606073e981f1', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Atsimondrano', commune: 'Tanjombato', fokontany: 'Tanjombato', coords: { lat: -18.9667, lng: 47.5333 } },
  { _id: '64f75284ef8f606073e981f4', province: 'Toamasina', region: 'Atsinanana', district: 'Toamasina I', commune: 'Toamasina', fokontany: 'Bazar Be', coords: { lat: -18.1492, lng: 49.4023 } },
];

interface IndexedCityItem {
  city: CityLocation;
  fktNorm: string;
  comNorm: string;
  fullNorm: string;
  isAnalamanga: boolean;
}

let popularCitiesCache: CityLocation[] | null = null;
const searchQueryCache = new Map<string, CityLocation[]>();
let localCitiesCache: CityLocation[] | null = null;
let localIndexedCities: IndexedCityItem[] | null = null;
let localCitiesPromise: Promise<CityLocation[]> | null = null;

function buildLocalIndex(cities: CityLocation[]): IndexedCityItem[] {
  return cities.map((city) => {
    const fktNorm = removeDiacritics((city.fokontany || '').toLowerCase());
    const comNorm = removeDiacritics((city.commune || '').toLowerCase());
    const distNorm = removeDiacritics((city.district || '').toLowerCase());
    const regNorm = removeDiacritics((city.region || '').toLowerCase());
    return {
      city,
      fktNorm,
      comNorm,
      fullNorm: `${fktNorm} ${comNorm} ${distNorm} ${regNorm}`,
      isAnalamanga: regNorm === 'analamanga',
    };
  });
}

function searchIndexedCitiesSync(
  indexed: IndexedCityItem[],
  query: string,
  limit: number
): CityLocation[] {
  const cleanQ = removeDiacritics(query.trim().toLowerCase());
  if (!cleanQ) return [];
  const keywords = cleanQ.split(/\s+/).filter(Boolean);

  const scored: Array<{ city: CityLocation; score: number }> = [];

  for (let i = 0; i < indexed.length; i++) {
    const item = indexed[i];
    if (!keywords.every((kw) => item.fullNorm.includes(kw))) continue;

    let score = 10;
    if (item.fktNorm === cleanQ) score += 100;
    else if (item.fktNorm.startsWith(cleanQ)) score += 75;
    else if (item.fktNorm.includes(cleanQ)) score += 50;

    if (item.comNorm === cleanQ) score += 45;
    else if (item.comNorm.startsWith(cleanQ)) score += 30;

    if (item.isAnalamanga) score += 5;

    scored.push({ city: item.city, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.city);
}

export const cityService = {
  getDefaultPopularCities: (limit: number = 8): CityLocation[] => {
    return (popularCitiesCache || DEFAULT_POPULAR_CITIES).slice(0, limit);
  },

  preloadLocalCities: async (): Promise<CityLocation[]> => {
    if (localCitiesCache && localCitiesCache.length > 0) {
      return localCitiesCache;
    }
    if (localCitiesPromise) {
      return localCitiesPromise;
    }
    if (typeof window === 'undefined') return [];

    localCitiesPromise = fetch('/data/madagascar.json')
      .then(async (res) => {
        if (!res.ok) return [];
        const data: CityLocation[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          localCitiesCache = data;
          localIndexedCities = buildLocalIndex(data);
        }
        return localCitiesCache || [];
      })
      .catch(() => [])
      .finally(() => {
        localCitiesPromise = null;
      });

    return localCitiesPromise;
  },

  searchCitiesInstant: (query: string, limit: number = 6): CityLocation[] => {
    const clean = query.trim();
    if (!clean) return [];
    const cacheKey = `${removeDiacritics(clean.toLowerCase())}:${limit}`;
    const cached = searchQueryCache.get(cacheKey);
    if (cached) return cached;

    if (localIndexedCities && localIndexedCities.length > 0) {
      const results = searchIndexedCitiesSync(localIndexedCities, clean, limit);
      if (results.length > 0) {
        searchQueryCache.set(cacheKey, results);
      }
      return results;
    }

    // Instant fallback over default popular cities while full dataset loads
    const fallbackIndex = buildLocalIndex(popularCitiesCache || DEFAULT_POPULAR_CITIES);
    return searchIndexedCitiesSync(fallbackIndex, clean, limit);
  },

  searchCities: async (query: string, limit: number = 20): Promise<CityLocation[]> => {
    const clean = query.trim();
    if (!clean) return [];

    const cacheKey = `${removeDiacritics(clean.toLowerCase())}:${limit}`;
    const cached = searchQueryCache.get(cacheKey);
    if (cached && cached.length > 0) {
      return cached;
    }

    // If local Madagascar dataset is already indexed in memory, search in <2ms
    if (localIndexedCities && localIndexedCities.length > 0) {
      const results = searchIndexedCitiesSync(localIndexedCities, clean, limit);
      searchQueryCache.set(cacheKey, results);
      return results;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const data = await apiFetch<CityLocation[]>('/cities/search', {
        params: { q: clean, limit: limit.toString() },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (Array.isArray(data) && data.length > 0) {
        searchQueryCache.set(cacheKey, data);
        return data;
      }
    } catch {
      // Fallback to internal Next API route if backend is unavailable or slow
    }

    try {
      const res = await fetch(`/api/cities/search?q=${encodeURIComponent(clean)}&limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          searchQueryCache.set(cacheKey, data);
          return data;
        }
      }
    } catch {
      // Ignore
    }

    return [];
  },

  getPopularCities: async (limit: number = 20): Promise<CityLocation[]> => {
    if (popularCitiesCache && popularCitiesCache.length > 0) {
      return popularCitiesCache.slice(0, limit);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const data = await apiFetch<CityLocation[]>('/cities/popular', {
        params: { limit: limit.toString() },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (Array.isArray(data) && data.length > 0) {
        popularCitiesCache = data;
        return data.slice(0, limit);
      }
    } catch {
      // Fallback to Next API route
    }

    try {
      const res = await fetch(`/api/cities/popular?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          popularCitiesCache = data;
          return data.slice(0, limit);
        }
      }
    } catch {
      // Ignore
    }

    return DEFAULT_POPULAR_CITIES.slice(0, limit);
  },

  getCityById: async (id: string): Promise<CityLocation | null> => {
    try {
      return await apiFetch<CityLocation>(`/cities/${id}`);
    } catch {
      return null;
    }
  },

  // Get nearest city related to given coordinates (using same logic as old Tranogasy version)
  getNearestCity: async (
    coords: { lat: number; lng: number },
    placeName?: string,
  ): Promise<CityLocation | null> => {
    // If local Madagascar dataset is already loaded in memory, compute immediately in <2ms!
    if (localCitiesCache && localCitiesCache.length > 0) {
      return findNearestCityFromList(localCitiesCache, coords, placeName);
    }

    // 1. Try NestJS Backend API with fast timeout
    try {
      const params: Record<string, string> = {
        lat: coords.lat.toString(),
        lng: coords.lng.toString(),
      };
      if (placeName) params.placeName = placeName;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const data = await apiFetch<CityLocation>('/cities/nearby', {
        params,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (data && data._id) return data;
    } catch {
      // Backend unavailable or error, proceed to fallback
    }

    // 2. Try Next.js API route fallback
    try {
      const queryParams = new URLSearchParams({
        lat: coords.lat.toString(),
        lng: coords.lng.toString(),
      });
      if (placeName) queryParams.set('placeName', placeName);

      const res = await fetch(`/api/cities/nearby?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data._id) return data;
      }
    } catch (err) {
      console.warn('Fallback /api/cities/nearby error:', err);
    }

    // 3. Client-side fallback using public data madagascar.json
    try {
      const allCities = await cityService.preloadLocalCities();
      if (allCities.length > 0) {
        return findNearestCityFromList(allCities, coords, placeName);
      }
    } catch (err) {
      console.warn('Local madagascar.json fetch error:', err);
    }

    return null;
  },
};
