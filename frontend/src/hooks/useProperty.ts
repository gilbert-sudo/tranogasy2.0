import { useState, useEffect } from 'react';
import { propertyService } from '../services/property.service';
import { usePropertyStore } from '../store/propertyStore';

export function useProperty(propertyId?: string, initialData?: any) {
  const getProperty = usePropertyStore(state => state.getProperty);
  const addProperty = usePropertyStore(state => state.addProperty);
  
  // Only initialize state if propertyId is provided, otherwise null.
  // Use initialData first if available to prevent any network request.
  const [property, setPropertyState] = useState<any>(
    initialData || (propertyId ? (getProperty(propertyId) || null) : null)
  );
  const [isLoading, setIsLoading] = useState(!initialData && !!propertyId && !property);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setPropertyState(initialData);
      return;
    }

    if (propertyId && !property) {
      const fetchProperty = async () => {
        setIsLoading(true);
        try {
          const data = await propertyService.getPropertyById(propertyId);
          setPropertyState(data);
          addProperty(data);
        } catch (err: any) {
          setError(err.message || 'Erreur lors du chargement de la propriété.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchProperty();
    }
  }, [propertyId, property, initialData, addProperty]);

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
    fetchPropertyById
  };
}
