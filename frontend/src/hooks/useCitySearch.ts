import { useState, useEffect, useCallback, useRef } from 'react';
import { cityService, CityLocation } from '../services/city.service';

export function useCitySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [popularCities, setPopularCities] = useState<CityLocation[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;
    cityService.getPopularCities(10).then((cities) => {
      if (isMounted && cities.length > 0) {
        setPopularCities(cities);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const search = useCallback((text: string) => {
    setQuery(text);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!text.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const found = await cityService.searchCities(text.trim(), 15);
        setResults(found);
      } catch (err) {
        console.error('Failed to search cities:', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 280);
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  return {
    query,
    results,
    popularCities,
    isLoading,
    search,
    clear,
  };
}

