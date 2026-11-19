import { useState, useCallback } from 'react';
import { useFavoriteStore } from '../store/favoriteStore';
import { useUserStore } from '../store/userStore';
import { useModalStore } from '../store/modalStore';
import { favoriteService } from '../services/favorite.service';
import { ApiError, getStoredSessionAuth } from '../services/api';

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
      const { authToken } = getStoredSessionAuth();

      if (!authToken) {
        setError('Votre session a expiré. Veuillez vous reconnecter.');
        useModalStore.getState().openModal('login');
        return previousState;
      }

      const optimisticState = !previousState;

      // Optimistic Update
      setFavorite(propertyId, optimisticState);

      try {
        const data = await favoriteService.toggleFavorite(userId, propertyId);
        setFavorite(propertyId, data.isFavorite);
        return data.isFavorite;
      } catch (e: unknown) {
        // Revert on error
        setFavorite(propertyId, previousState);
        if (e instanceof ApiError && e.status === 401) {
          setError('Votre session a expiré. Veuillez vous reconnecter.');
          useModalStore.getState().openModal('login');
        } else {
          console.warn('Failed to toggle favorite, reverting state:', e);
        }
        return previousState;
      }
    },
    [setFavorite]
  );

  const fetchFavorites = useCallback(
    async (userId: string) => {
      if (!userId) return [];
      const { authToken } = getStoredSessionAuth();
      if (!authToken) {
        setFavorites({}, userId);
        setFavoritePropertiesData([]);
        return [];
      }
      if (inFlightUserFavsPromise && inFlightUserId === userId) {
        return inFlightUserFavsPromise;
      }

      setIsLoading(true);
      setError(null);

      inFlightUserId = userId;
      const startEpoch = useUserStore.getState().sessionEpoch;
      inFlightUserFavsPromise = (async () => {
        try {
          const data = await favoriteService.getUserFavorites(userId);
          if (
            useUserStore.getState().sessionEpoch !== startEpoch ||
            !useUserStore.getState().user
          ) {
            return [];
          }
          const props = data?.properties || [];
          const newFavs: Record<string, boolean> = {};
          props.forEach((p: any) => {
            if (p?._id) newFavs[p._id] = true;
          });

          setFavorites(newFavs, userId);
          setFavoritePropertiesData(props);

          return props;
        } catch (e: unknown) {
          if (e instanceof ApiError && e.status === 401) {
            // Stop repeated retries from mounted cards when a legacy/expired token is present
            setFavorites({}, userId);
            setFavoritePropertiesData([]);
            setError('Votre session a expiré. Veuillez vous reconnecter.');
            return [];
          }
          console.warn('Failed to fetch favorites:', e);
          setError(
            e instanceof Error
              ? e.message
              : 'Impossible de charger les favoris.'
          );
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

