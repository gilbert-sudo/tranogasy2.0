import { create } from 'zustand';

interface FavoriteStore {
  favorites: Record<string, boolean>;
  favoritePropertiesData: any[] | null;
  setFavorite: (propertyId: string, isFavorite: boolean) => void;
  setFavorites: (favorites: Record<string, boolean>) => void;
  setFavoritePropertiesData: (data: any[] | null) => void;
}

export const useFavoriteStore = create<FavoriteStore>((set) => ({
  favorites: {},
  favoritePropertiesData: null,
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
    set({ favoritePropertiesData: data });
  },
}));
