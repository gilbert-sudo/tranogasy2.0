import { apiFetch } from './api';

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
};

