import { useState, useCallback } from 'react';
import { useFavoriteStore } from '../store/favoriteStore';
import { favoriteService } from '../services/favorite.service';

export function useFavorite() {
  const { 
    favorites, 
    favoritePropertiesData, 
    setFavorite, 
    setFavorites, 
    setFavoritePropertiesData 
  } = useFavoriteStore();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFavorite = useCallback(async (propertyId: string, userId: string) => {
    const previousState = favorites[propertyId] || false;
    const optimisticState = !previousState;

    // Optimistic Update
    setFavorite(propertyId, optimisticState);

    try {
      const data = await favoriteService.toggleFavorite(userId, propertyId);
      setFavorite(propertyId, data.isFavorite);
      return data.isFavorite;
    } catch (e: any) {
      console.error("Failed to toggle favorite, reverting state:", e);
      // Revert on network error
      setFavorite(propertyId, previousState);
      return previousState;
    }
  }, [favorites, setFavorite]);

  const checkFavorite = useCallback(async (propertyId: string, userId: string) => {
    if (!userId || !propertyId) return;
    try {
      const data = await favoriteService.checkFavorite(userId, propertyId);
      setFavorite(propertyId, data.isFavorite);
    } catch (e) {
      console.error("Failed to check favorite:", e);
    }
  }, [setFavorite]);

  const fetchFavorites = useCallback(async (userId: string) => {
    if (!userId) return [];
    setIsLoading(true);
    setError(null);
    try {
      const data = await favoriteService.getUserFavorites(userId);
      const newFavs: Record<string, boolean> = {};
      data.properties.forEach((p: any) => {
        newFavs[p._id] = true;
      });
      
      setFavorites(newFavs);
      setFavoritePropertiesData(data.properties);
      
      return data.properties;
    } catch (e: any) {
      console.error("Failed to fetch favorites:", e);
      setError(e.message || "Impossible de charger les favoris.");
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [setFavorites, setFavoritePropertiesData]);

  return {
    favorites,
    favoritePropertiesData,
    isLoading,
    error,
    toggleFavorite,
    checkFavorite,
    fetchFavorites
  };
}
