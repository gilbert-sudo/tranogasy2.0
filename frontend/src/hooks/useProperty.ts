import { useState, useEffect, useRef } from 'react';
import { propertyService } from '../services/property.service';
import { usePropertyStore } from '../store/propertyStore';
import { useUserStore } from '../store/userStore';
import { usePropertyDetailModalStore } from '../store/propertyDetailModalStore';

export function useProperty(propertyId?: string, initialData?: any) {
  const storeProperty = usePropertyStore((state) =>
    propertyId ? state.properties[propertyId] : undefined
  );
  const getProperty = usePropertyStore((state) => state.getProperty);
  const addProperty = usePropertyStore((state) => state.addProperty);

  const user = useUserStore((state) => state.user);
  const activeUser = user?.user || user;
  const viewerId = activeUser?._id ? String(activeUser._id) : '';
  const subscriptionExpiresAt = activeUser?.subscriptionExpiresAt
    ? String(activeUser.subscriptionExpiresAt)
    : '';

  const initial =
    storeProperty || initialData || (propertyId ? getProperty(propertyId) || null : null);
  const [property, setPropertyState] = useState<any>(initial);
  const [isLoading, setIsLoading] = useState(!initial && !!propertyId);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setPropertyState((prev: any) => {
        if (prev && prev.contactLocked === false && initialData.contactLocked === true) {
          return { ...initialData, ...prev };
        }
        return { ...(prev || {}), ...initialData };
      });
    }
  }, [initialData]);

  useEffect(() => {
    if (storeProperty) {
      setPropertyState((prev: any) => {
        if (prev && prev.contactLocked === false && storeProperty.contactLocked === true) {
          return { ...storeProperty, ...prev };
        }
        return { ...(prev || {}), ...storeProperty };
      });
    }
  }, [storeProperty]);

  useEffect(() => {
    if (!propertyId) return;

    // Do not fetch mock/offline draft IDs
    const isOfflineDraft = typeof propertyId === 'string' && propertyId.startsWith('prop-');
    if (isOfflineDraft) return;

    const current = storeProperty || property || initialData || getProperty(propertyId);
    const hasFullData =
      Boolean(current) &&
      Boolean(current.features) &&
      typeof current.features === 'object' &&
      Object.keys(current.features).length > 0 &&
      current.toilet !== undefined;

    const fetchKey = `${propertyId}:${viewerId}:${subscriptionExpiresAt}`;
    const viewerContextChanged =
      lastFetchedKeyRef.current !== null && lastFetchedKeyRef.current !== fetchKey;
    const shouldRefetchForUnlock =
      Boolean(current?.contactLocked) && Boolean(viewerId) && lastFetchedKeyRef.current !== fetchKey;

    if (!hasFullData || viewerContextChanged || shouldRefetchForUnlock) {
      let isCancelled = false;
      const fetchProperty = async () => {
        if (!current) {
          setIsLoading(true);
        }
        try {
          const data = await propertyService.getPropertyById(propertyId);
          if (!isCancelled && data) {
            lastFetchedKeyRef.current = fetchKey;
            setPropertyState((prev: any) => ({ ...(prev || {}), ...data }));
            addProperty(data);
            usePropertyDetailModalStore.getState().updateInitialProperty(data);
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
    } else if (lastFetchedKeyRef.current === null) {
      lastFetchedKeyRef.current = fetchKey;
    }
  }, [
    propertyId,
    initialData,
    storeProperty,
    viewerId,
    subscriptionExpiresAt,
    addProperty,
    getProperty,
  ]);

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
