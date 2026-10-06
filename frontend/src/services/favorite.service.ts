import { apiFetch } from './api';

export const favoriteService = {
  toggleFavorite: (userId: string, propertyId: string) => {
    return apiFetch<{ isFavorite: boolean }>('/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ userId, propertyId }),
    });
  },

  checkFavorite: (userId: string, propertyId: string) => {
    return apiFetch<{ isFavorite: boolean }>('/favorites/check', {
      params: { userId, propertyId },
    });
  },

  getUserFavorites: (userId: string) => {
    return apiFetch<{ properties: any[] }>(`/favorites/user/${userId}`);
  },
};
