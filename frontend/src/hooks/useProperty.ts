import { useState, useEffect, useCallback } from 'react';
import { propertyService } from '../services/property.service';
import { usePropertyStore } from '../store/propertyStore';

export function useProperty(propertyId?: string) {
  // Direct reactive selection from Zustand store
  const cachedProperty = usePropertyStore(
    useCallback((state) => (propertyId ? state.properties[propertyId] : undefined), [propertyId])
  );
  const addProperty = usePropertyStore((state) => state.addProperty);

  const [isLoading, setIsLoading] = useState(!!propertyId && !cachedProperty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If we have a propertyId and it's not yet in the store, fetch it
    if (propertyId && !cachedProperty) {
      let isMounted = true;
      const fetchProperty = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const data = await propertyService.getPropertyById(propertyId);
          if (isMounted) {
            addProperty(data);
          }
        } catch (err: any) {
          if (isMounted) {
            setError(err.message || 'Erreur lors du chargement de la propriété.');
          }
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      };

      fetchProperty();
      return () => {
        isMounted = false;
      };
    } else if (cachedProperty) {
      setIsLoading(false);
    }
  }, [propertyId, cachedProperty, addProperty]);

  const fetchPropertyById = useCallback(async (id: string, forceRefresh = false) => {
    if (!forceRefresh) {
      const existing = usePropertyStore.getState().getProperty(id);
      if (existing) return existing;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await propertyService.getPropertyById(id);
      addProperty(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement de la propriété.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [addProperty]);

  return {
    property: cachedProperty || null,
    isLoading,
    error,
    fetchPropertyById
  };
}

