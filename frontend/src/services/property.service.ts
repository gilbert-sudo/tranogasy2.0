import { apiFetch } from './api';

export const propertyService = {
  getPropertyById: (id: string) => {
    return apiFetch<any>(`/properties/${id}`);
  },
  
  getProperties: (params?: any) => {
    return apiFetch<any>('/properties', { params });
  }
};
