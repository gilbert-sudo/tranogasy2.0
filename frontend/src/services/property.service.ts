import { apiFetch } from './api';

export interface SearchPropertiesParams {
  page?: string | number;
  limit?: string | number;
  type?: string;
  houseType?: string;
  q?: string;
  cityId?: string;
  budgetMin?: string | number;
  budgetMax?: string | number;
  minRooms?: string | number;
  minBathrooms?: string | number;
  minArea?: string | number;
  insideToilet?: string;
  insideBathroom?: string;
  features?: string;
  lat?: string | number;
  lng?: string | number;
  radius?: string | number;
  sortBy?: string;
}

export const propertyService = {
  getPropertyById: (id: string) => {
    return apiFetch<any>(`/properties/${id}`);
  },
  
  getProperties: (params?: any) => {
    return apiFetch<any>('/properties', { params });
  },

  searchProperties: async (params?: SearchPropertiesParams) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          cleanParams[key] = String(val);
        }
      });
    }
    try {
      return await apiFetch<any>('/properties/search', { params: cleanParams });
    } catch {
      // Fallback to paginated properties endpoint if /properties/search is unavailable on remote cold start
      return await apiFetch<any>('/properties', {
        params: {
          page: cleanParams.page || '1',
          limit: cleanParams.limit || '200',
        },
      });
    }
  },

  createProperty: (data: any) => {
    return apiFetch<any>('/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getUserProperties: (userId: string) => {
    return apiFetch<any[]>(`/properties/user/${encodeURIComponent(userId)}`);
  },

  updateProperty: (propertyId: string, data: any) => {
    return apiFetch<any>(`/properties/${encodeURIComponent(propertyId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteProperty: (propertyId: string) => {
    return apiFetch<any>(`/properties/${encodeURIComponent(propertyId)}`, {
      method: 'DELETE',
    });
  },
};
