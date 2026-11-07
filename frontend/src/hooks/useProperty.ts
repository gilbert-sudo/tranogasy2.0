import { useState, useEffect } from 'react';
import { propertyService } from '../services/property.service';
import { usePropertyStore } from '../store/propertyStore';

export function useProperty(propertyId?: string, initialData?: any) {
  const getProperty = usePropertyStore((state) => state.getProperty);
  const addProperty = usePropertyStore((state) => state.addProperty);

  const initial =
    initialData || (propertyId ? getProperty(propertyId) || null : null);
  const [property, setPropertyState] = useState<any>(initial);
  const [isLoading, setIsLoading] = useState(!initial && !!propertyId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setPropertyState((prev: any) => ({ ...(prev || {}), ...initialData }));
    }
  }, [initialData]);

  useEffect(() => {
    if (!propertyId) return;

    // Determine if full data (features, toilet, owner) needs to be fetched from the backend
    const current = property || initialData || getProperty(propertyId);
    const hasFullData =
      Boolean(current) &&
      Boolean(current.features) &&
      typeof current.features === 'object' &&
      Object.keys(current.features).length > 0 &&
      current.toilet !== undefined;

    // Do not fetch mock/offline draft IDs
    const isOfflineDraft = typeof propertyId === 'string' && propertyId.startsWith('prop-');

    if (!hasFullData && !isOfflineDraft) {
      let isCancelled = false;
      const fetchProperty = async () => {
        if (!current) {
          setIsLoading(true);
        }
        try {
          const data = await propertyService.getPropertyById(propertyId);
          if (!isCancelled && data) {
            setPropertyState((prev: any) => ({ ...(prev || {}), ...data }));
            addProperty(data);
          }
        } catch (err: any) {
          if (!isCancelled && !current) {
            setError(err.message || 'Erreur lors du chargement de la propriété.');
          }
        } finally {
          if (!isCancelled) {
            setIsLoading(false);
          }
        }
      };
      fetchProperty();
      return () => {
        isCancelled = true;
      };
    }
  }, [propertyId, initialData, addProperty, getProperty]);

  const fetchPropertyById = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await propertyService.getPropertyById(id);
      setPropertyState(data);
      addProperty(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement de la propriété.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    property,
    isLoading,
    error,
    fetchPropertyById,
  };
}
