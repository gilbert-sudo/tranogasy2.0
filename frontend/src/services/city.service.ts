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

export const cityService = {
  searchCities: async (query: string, limit: number = 20): Promise<CityLocation[]> => {
    try {
      return await apiFetch<CityLocation[]>('/cities/search', {
        params: { q: query, limit: limit.toString() },
      });
    } catch {
      // Fallback to internal Next API route if backend is unavailable
      const res = await fetch(`/api/cities/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (res.ok) {
        return await res.json();
      }
      return [];
    }
  },

  getPopularCities: async (limit: number = 20): Promise<CityLocation[]> => {
    try {
      return await apiFetch<CityLocation[]>('/cities/popular', {
        params: { limit: limit.toString() },
      });
    } catch {
      const res = await fetch(`/api/cities/popular?limit=${limit}`);
      if (res.ok) {
        return await res.json();
      }
      return [];
    }
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
    // 1. Try NestJS Backend API
    try {
      const params: Record<string, string> = {
        lat: coords.lat.toString(),
        lng: coords.lng.toString(),
      };
      if (placeName) params.placeName = placeName;

      const data = await apiFetch<CityLocation>('/cities/nearby', { params });
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
      const res = await fetch('/data/madagascar.json');
      if (res.ok) {
        const allCities: CityLocation[] = await res.json();
        return findNearestCityFromList(allCities, coords, placeName);
      }
    } catch (err) {
      console.warn('Local madagascar.json fetch error:', err);
    }

    return null;
  },
};
