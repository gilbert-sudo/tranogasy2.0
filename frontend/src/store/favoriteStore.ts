import { create } from 'zustand';

interface FavoriteStore {
  favorites: Record<string, boolean>;
  favoritePropertiesData: any[] | null;
  setFavorite: (propertyId: string, isFavorite: boolean) => void;
  toggleFavorite: (propertyId: string, userId: string) => Promise<boolean>;
  checkFavorite: (propertyId: string, userId: string) => Promise<void>;
  fetchFavorites: (userId: string) => Promise<any[]>;
}

export const useFavoriteStore = create<FavoriteStore>((set, get) => ({
  favorites: {},
  favoritePropertiesData: null,
  setFavorite: (propertyId, isFavorite) => {
    set((state) => ({
      favorites: { ...state.favorites, [propertyId]: isFavorite }
    }));
  },
  toggleFavorite: async (propertyId, userId) => {
    const previousState = get().favorites[propertyId] || false;
    const optimisticState = !previousState;

    // 1. Optimistic Update
    set((state) => ({
      favorites: { ...state.favorites, [propertyId]: optimisticState }
    }));

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiUrl}/favorites/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, propertyId })
      });
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          favorites: { ...state.favorites, [propertyId]: data.isFavorite }
        }));
        return data.isFavorite;
      } else {
        // Revert on non-OK response
        set((state) => ({
          favorites: { ...state.favorites, [propertyId]: previousState }
        }));
        return previousState;
      }
    } catch (e) {
      console.error("Failed to toggle favorite, reverting state:", e);
      // Revert on network error
      set((state) => ({
        favorites: { ...state.favorites, [propertyId]: previousState }
      }));
      return previousState;
    }
  },
  checkFavorite: async (propertyId, userId) => {
    if (!userId || !propertyId) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiUrl}/favorites/check?userId=${userId}&propertyId=${propertyId}`);
      if (res.ok) {
        const data = await res.json();
        set((state) => ({
          favorites: { ...state.favorites, [propertyId]: data.isFavorite }
        }));
      }
    } catch (e) {
      console.error(e);
    }
  },
  fetchFavorites: async (userId) => {
    if (!userId) return [];
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const res = await fetch(`${apiUrl}/favorites/user/${userId}`);
      if (res.ok) {
        const data = await res.json();
        const newFavs: Record<string, boolean> = {};
        data.properties.forEach((p: any) => {
          newFavs[p._id] = true;
        });
        set((state) => ({
          favorites: { ...state.favorites, ...newFavs },
          favoritePropertiesData: data.properties
        }));
        return data.properties;
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  }
}));
