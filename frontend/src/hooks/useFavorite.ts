import { useState, useCallback } from 'react';
import { useFavoriteStore } from '../store/favoriteStore';
import { favoriteService } from '../services/favorite.service';

// Module-level deduplication so 200 mounted cards trigger at most 1 network request
let inFlightUserFavsPromise: Promise<any[]> | null = null;
let inFlightUserId: string | null = null;

export function useFavorite() {
  const favorites = useFavoriteStore((s) => s.favorites);
  const favoritePropertiesData = useFavoriteStore((s) => s.favoritePropertiesData);
  const setFavorite = useFavoriteStore((s) => s.setFavorite);
  const setFavorites = useFavoriteStore((s) => s.setFavorites);
  const setFavoritePropertiesData = useFavoriteStore((s) => s.setFavoritePropertiesData);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFavorite = useCallback(
    async (propertyId: string, userId: string) => {
      const currentFavorites = useFavoriteStore.getState().favorites;
      const previousState = currentFavorites[propertyId] || false;
      const optimisticState = !previousState;

      // Optimistic Update
      setFavorite(propertyId, optimisticState);

      try {
        const data = await favoriteService.toggleFavorite(userId, propertyId);
        setFavorite(propertyId, data.isFavorite);
        return data.isFavorite;
      } catch (e: any) {
        console.error('Failed to toggle favorite, reverting state:', e);
        // Revert on network error
        setFavorite(propertyId, previousState);
        return previousState;
      }
    },
    [setFavorite]
  );

  const fetchFavorites = useCallback(
    async (userId: string) => {
      if (!userId) return [];
      if (inFlightUserFavsPromise && inFlightUserId === userId) {
        return inFlightUserFavsPromise;
      }

      setIsLoading(true);
      setError(null);

      inFlightUserId = userId;
      inFlightUserFavsPromise = (async () => {
        try {
          const data = await favoriteService.getUserFavorites(userId);
          const props = data?.properties || [];
          const newFavs: Record<string, boolean> = {};
          props.forEach((p: any) => {
            if (p?._id) newFavs[p._id] = true;
          });

          setFavorites(newFavs, userId);
          setFavoritePropertiesData(props);

          return props;
        } catch (e: any) {
          console.error('Failed to fetch favorites:', e);
          setError(e.message || 'Impossible de charger les favoris.');
          return [];
        } finally {
          setIsLoading(false);
          inFlightUserFavsPromise = null;
        }
      })();

      return inFlightUserFavsPromise;
    },
    [setFavorites, setFavoritePropertiesData]
  );

  const checkFavorite = useCallback(
    async (propertyId: string, userId: string) => {
      if (!userId || !propertyId) return;
      const state = useFavoriteStore.getState();
      if (state.loadedForUserId === userId || state.favorites[propertyId] !== undefined) {
        return;
      }
      // Batch-load all favorites for this user once instead of N individual HTTP calls
      await fetchFavorites(userId);
    },
    [fetchFavorites]
  );

  return {
    favorites,
    favoritePropertiesData,
    isLoading,
    error,
    toggleFavorite,
    checkFavorite,
    fetchFavorites,
  };
}

