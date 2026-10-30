import { apiFetch } from './api';

export const propertyService = {
  getPropertyById: (id: string) => {
    return apiFetch<any>(`/properties/${id}`);
  },
  
  getProperties: (params?: any) => {
    return apiFetch<any>('/properties', { params });
  },

  createProperty: (data: any) => {
    return apiFetch<any>('/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
