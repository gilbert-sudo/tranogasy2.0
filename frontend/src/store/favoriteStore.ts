import { create } from 'zustand';

interface FavoriteStore {
  favorites: Record<string, boolean>;
  favoritePropertiesData: any[] | null;
  lastFetched: number | null;
  setFavorite: (propertyId: string, isFavorite: boolean) => void;
  setFavorites: (favorites: Record<string, boolean>) => void;
  setFavoritePropertiesData: (data: any[] | null) => void;
  clearFavorites: () => void;
}

export const useFavoriteStore = create<FavoriteStore>((set) => ({
  favorites: {},
  favoritePropertiesData: null,
  lastFetched: null,
  setFavorite: (propertyId, isFavorite) => {
    set((state) => ({
      favorites: { ...state.favorites, [propertyId]: isFavorite }
    }));
  },
  setFavorites: (favorites) => {
    set((state) => ({
      favorites: { ...state.favorites, ...favorites }
    }));
  },
  setFavoritePropertiesData: (data) => {
    set({
      favoritePropertiesData: data,
      lastFetched: data !== null ? Date.now() : null,
    });
  },
  clearFavorites: () => {
    set({
      favorites: {},
      favoritePropertiesData: null,
      lastFetched: null,
    });
  },
}));
