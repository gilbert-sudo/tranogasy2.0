import { create } from 'zustand';

interface FavoriteStore {
  favorites: Record<string, boolean>;
  favoritePropertiesData: any[] | null;
  loadedForUserId: string | null;
  setFavorite: (propertyId: string, isFavorite: boolean) => void;
  setFavorites: (favorites: Record<string, boolean>, userId?: string) => void;
  setFavoritePropertiesData: (data: any[] | null) => void;
}

export const useFavoriteStore = create<FavoriteStore>((set) => ({
  favorites: {},
  favoritePropertiesData: null,
  loadedForUserId: null,
  setFavorite: (propertyId, isFavorite) => {
    set((state) => {
      if (state.favorites[propertyId] === isFavorite) return state;
      return {
        favorites: { ...state.favorites, [propertyId]: isFavorite },
      };
    });
  },
  setFavorites: (favorites, userId) => {
    set((state) => ({
      favorites: { ...state.favorites, ...favorites },
      ...(userId ? { loadedForUserId: userId } : {}),
    }));
  },
  setFavoritePropertiesData: (data) => {
    set({ favoritePropertiesData: data });
  },
}));

