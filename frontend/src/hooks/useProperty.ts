import { useState, useEffect } from 'react';
import { propertyService } from '../services/property.service';
import { usePropertyStore } from '../store/propertyStore';

export function useProperty(propertyId?: string) {
  const getProperty = usePropertyStore(state => state.getProperty);
  const addProperty = usePropertyStore(state => state.addProperty);
  
  // Only initialize state if propertyId is provided, otherwise null.
  // This allows the hook to be used for general property methods too.
  const [property, setPropertyState] = useState<any>(propertyId ? (getProperty(propertyId) || null) : null);
  const [isLoading, setIsLoading] = useState(!!propertyId && !property);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [propertyId, property, addProperty]);

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
