import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getDistance } from 'geolib';
import { propertyService } from '@/services/property.service';
import { cityService, removeDiacritics } from '@/services/city.service';
import { usePropertyStore } from '@/store/propertyStore';
import { useSearchStore, DEFAULT_ANTANANARIVO_CENTER } from '@/store/searchStore';

// Deterministic hash for a string (property._id) -> [0, 1)
function deterministicHash(str: string, seed = 0): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Compute deterministic non-overlapping map coordinates for any property
export function getPropertyMapCoords(property: any): { lat: number; lng: number; isApproximate: boolean } {
  if (
    property?.coords &&
    typeof property.coords.lat === 'number' &&
    typeof property.coords.lng === 'number' &&
    !isNaN(property.coords.lat) &&
    !isNaN(property.coords.lng)
  ) {
    return {
      lat: property.coords.lat,
      lng: property.coords.lng,
      isApproximate: false,
    };
  }

  const baseCoords =
    property?.city?.coords &&
      typeof property.city.coords.lat === 'number' &&
      typeof property.city.coords.lng === 'number'
      ? property.city.coords
      : DEFAULT_ANTANANARIVO_CENTER;

  const idStr = String(property?._id || 'default');
  // Golden-angle spiral offset (approx 80m to 380m around fokontany center)
  const rHash = deterministicHash(idStr, 1);
  const thetaHash = deterministicHash(idStr, 2);

  const radiusDeg = 0.0007 + Math.sqrt(rHash) * 0.0028; // ~80m to ~390m
  const angle = thetaHash * Math.PI * 2;

  return {
    lat: baseCoords.lat + radiusDeg * Math.sin(angle),
    lng: baseCoords.lng + radiusDeg * Math.cos(angle),
    isApproximate: true,
  };
}

// Format price compactly for map pills (e.g. "450k", "1.2M", "85M")
export function formatCompactPrice(price?: number | null): string {
  if (!price || price <= 0) return 'Sur dmd';
  if (price >= 1_000_000_000) {
    return `${(price / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}Md`;
  }
  if (price >= 1_000_000) {
    return `${(price / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (price >= 1_000) {
    return `${Math.round(price / 1_000)}k`;
  }
  return String(price);
}

// Format price with space thousands separator (e.g. "1 200 000")
export function formatNumberWithSpaces(val?: number | string | null): string {
  if (val === null || val === undefined || val === '') return '';
  const num = typeof val === 'string' ? Number(val.replace(/\s/g, '')) : val;
  if (isNaN(num) || num <= 0) return '';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// Calculate property quality/relevance score (0-100) inspired by propertyScorer.js
export function calculatePropertyRelevanceScore(property: any): number {
  let score = 0;
  if (property.topProperty) score += 20;
  if (property.title && property.description) score += 15;
  if (property.area && property.area > 0) score += 8;
  if (property.coords?.lat && property.coords?.lng) score += 10;
  const imgCount = Array.isArray(property.images) ? property.images.length : 0;
  score += Math.min(imgCount * 3, 24);

  const feat = property.features || {};
  const activeFeatCount = Object.entries(feat).filter(
    ([k, v]) => k !== '_id' && k !== '__v' && Boolean(v)
  ).length;
  score += Math.min(activeFeatCount * 2, 23);

  return Math.min(100, score);
}

export function usePropertySearch(initialProperties?: any[]) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPropertiesToGlobalStore = usePropertyStore((s) => s.addProperties);

  const filters = useSearchStore((s) => s.filters);
  const viewMode = useSearchStore((s) => s.viewMode);
  const mobileSheetSnap = useSearchStore((s) => s.mobileSheetSnap);
  const isFilterModalOpen = useSearchStore((s) => s.isFilterModalOpen);
  const isDisplayModeModalOpen = useSearchStore((s) => s.isDisplayModeModalOpen);
  const isRadarClickMode = useSearchStore((s) => s.isRadarClickMode);
  const selectedPropertyId = useSearchStore((s) => s.selectedPropertyId);
  const hoveredPropertyId = useSearchStore((s) => s.hoveredPropertyId);
  const mapCenter = useSearchStore((s) => s.mapCenter);
  const mapZoom = useSearchStore((s) => s.mapZoom);
  const mapTypeId = useSearchStore((s) => s.mapTypeId);
  const userLocation = useSearchStore((s) => s.userLocation);
  const catalogProperties = useSearchStore((s) => s.catalogProperties);
  const isInitialized = useSearchStore((s) => s.isInitialized);

  const setFilter = useSearchStore((s) => s.setFilter);
  const setFilters = useSearchStore((s) => s.setFilters);
  const toggleFeature = useSearchStore((s) => s.toggleFeature);
  const clearFeatures = useSearchStore((s) => s.clearFeatures);
  const resetFilters = useSearchStore((s) => s.resetFilters);
  const setLocationZone = useSearchStore((s) => s.setLocationZone);
  const clearLocationZone = useSearchStore((s) => s.clearLocationZone);
  const setViewMode = useSearchStore((s) => s.setViewMode);
  const setMobileSheetSnap = useSearchStore((s) => s.setMobileSheetSnap);
  const setIsFilterModalOpen = useSearchStore((s) => s.setIsFilterModalOpen);
  const setIsDisplayModeModalOpen = useSearchStore((s) => s.setIsDisplayModeModalOpen);
  const setIsRadarClickMode = useSearchStore((s) => s.setIsRadarClickMode);
  const setSelectedPropertyId = useSearchStore((s) => s.setSelectedPropertyId);
  const setHoveredPropertyId = useSearchStore((s) => s.setHoveredPropertyId);
  const setMapCenter = useSearchStore((s) => s.setMapCenter);
  const setMapZoom = useSearchStore((s) => s.setMapZoom);
  const setMapTypeId = useSearchStore((s) => s.setMapTypeId);
  const setUserLocation = useSearchStore((s) => s.setUserLocation);
  const setCatalogProperties = useSearchStore((s) => s.setCatalogProperties);
  const setIsInitialized = useSearchStore((s) => s.setIsInitialized);

  const isFetchingRef = useRef(false);

  // Fetch catalog of properties for instant map and filter reactivity
  const loadSearchCatalog = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await propertyService.searchProperties({
        page: 1,
        limit: 300,
      });
      const fetched = response?.properties || (Array.isArray(response) ? response : []);
      if (fetched.length > 0) {
        setCatalogProperties(fetched);
        addPropertiesToGlobalStore(fetched);
      }
      setIsInitialized(true);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des propriétés.');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [setCatalogProperties, addPropertiesToGlobalStore, setIsInitialized]);

  // Seed initial properties or load catalog on mount
  useEffect(() => {
    if (initialProperties && initialProperties.length > 0 && catalogProperties.length === 0) {
      setCatalogProperties(initialProperties);
      addPropertiesToGlobalStore(initialProperties);
      setIsInitialized(true);
      // If SSR only gave a small slice, fetch full map catalog in background
      if (initialProperties.length < 50) {
        loadSearchCatalog();
      }
      return;
    }

    if (!isInitialized && catalogProperties.length === 0) {
      loadSearchCatalog();
    }
  }, [
    initialProperties,
    catalogProperties.length,
    isInitialized,
    setCatalogProperties,
    addPropertiesToGlobalStore,
    setIsInitialized,
    loadSearchCatalog,
  ]);

  // Request user GPS position and optionally set as active search zone
  const locateUserAndCenter = useCallback(
    (applyAsSearchZone = false) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return;
      }

      setIsLocatingUser(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserLocation(coords);
          setMapCenter(coords);
          setMapZoom(15);

          if (applyAsSearchZone) {
            try {
              const nearest = await cityService.getNearestCity(coords);
              const label = nearest
                ? `${nearest.fokontany}, ${nearest.commune}`
                : 'Autour de ma position';
              setLocationZone(coords, label, nearest, 1500);
            } catch {
              setLocationZone(coords, 'Autour de ma position', null, 1500);
            }
          }
          setIsLocatingUser(false);
        },
        () => {
          setIsLocatingUser(false);
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }
      );
    },
    [setUserLocation, setMapCenter, setMapZoom, setLocationZone]
  );

  // Price statistics and 24-bucket histogram for the active offer type
  const priceStats = useMemo(() => {
    const activeType = filters.type === 'sale' ? 'sale' : 'rent';
    const maxCap = activeType === 'sale' ? 800_000_000 : 6_000_000;
    const defaultMax = activeType === 'sale' ? 300_000_000 : 3_500_000;
    const step = activeType === 'sale' ? 500_000 : 25_000;

    const validPrices: number[] = [];
    catalogProperties.forEach((p) => {
      if (filters.type !== 'all' && p.type !== activeType) return;
      const val = p.type === 'sale' ? p.price : p.rent;
      if (typeof val === 'number' && val > 0 && val <= maxCap) {
        validPrices.push(val);
      }
    });

    if (validPrices.length === 0) {
      return {
        min: 0,
        max: defaultMax,
        avg: Math.round(defaultMax / 3),
        step,
        histogram: Array.from({ length: 24 }, (_, i) => Math.max(15, Math.round(Math.sin((i / 24) * Math.PI) * 85))),
      };
    }

    const rawMin = Math.min(...validPrices);
    const rawMax = Math.max(...validPrices);
    const min = Math.max(0, Math.floor(rawMin / step) * step);
    const max = Math.max(min + step * 10, Math.ceil(rawMax / step) * step);
    const avg = Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length);

    const bucketCount = 24;
    const bucketWidth = (max - min) / bucketCount || 1;
    const counts = new Array(bucketCount).fill(0);

    validPrices.forEach((p) => {
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((p - min) / bucketWidth)));
      counts[idx]++;
    });

    const maxBucket = Math.max(...counts, 1);
    const histogram = counts.map((c) => Math.max(8, Math.round((c / maxBucket) * 100)));

    return { min, max, avg, step, histogram };
  }, [catalogProperties, filters.type]);

  // Step 1: Filter properties by all non-radius criteria
  const rawFilteredWithoutRadius = useMemo(() => {
    const cleanQuery = removeDiacritics(filters.query.trim().toLowerCase());
    const activeFeatureKeys = Object.entries(filters.features)
      .filter(([_, val]) => Boolean(val))
      .map(([key]) => key);

    return catalogProperties.filter((prop) => {
      if (!prop) return false;

      // 1. Offer Type (rent / sale / all)
      if (filters.type !== 'all' && prop.type !== filters.type) {
        return false;
      }

      // 2. Property Category (appartement / maison / villa / bureau / all)
      if (filters.houseType !== 'all') {
        const propHouseType = removeDiacritics((prop.houseType || '').toLowerCase());
        const propTitle = removeDiacritics((prop.title || '').toLowerCase());
        const propDesc = removeDiacritics((prop.description || '').toLowerCase());
        const targetType = removeDiacritics(filters.houseType.toLowerCase());

        if (targetType === 'villa') {
          const isVilla =
            propHouseType === 'villa' ||
            propTitle.includes('villa') ||
            propDesc.includes('villa') ||
            (propHouseType === 'maison' && (prop.features?.swimmingPool || prop.features?.garden));
          if (!isVilla) return false;
        } else if (targetType === 'bureau') {
          const isBureau =
            propHouseType === 'bureau' ||
            propTitle.includes('bureau') ||
            propTitle.includes('commercial') ||
            propDesc.includes('usage bureau');
          if (!isBureau) return false;
        } else if (propHouseType !== targetType) {
          return false;
        }
      }

      // 3. Budget Min & Max
      const propPrice = prop.type === 'sale' ? prop.price : prop.rent;
      if (filters.budgetMin !== null && filters.budgetMin > 0) {
        if (!propPrice || propPrice < filters.budgetMin) return false;
      }
      if (filters.budgetMax !== null && filters.budgetMax > 0) {
        if (!propPrice || propPrice > filters.budgetMax) return false;
      }

      // 4. Minimum Rooms (matches rooms + livingRoom like original Tranogasy or rooms directly)
      if (filters.minRooms > 0) {
        const totalRooms = (Number(prop.rooms) || 0) + (Number(prop.livingRoom) || 0);
        if (totalRooms < filters.minRooms && (Number(prop.rooms) || 0) < filters.minRooms) {
          return false;
        }
      }

      // 5. Minimum Bathrooms
      if (filters.minBathrooms > 0) {
        if ((Number(prop.bathrooms) || 0) < filters.minBathrooms) {
          return false;
        }
      }

      // 6. Minimum Surface Area
      if (filters.minArea !== null && filters.minArea > 0) {
        if ((Number(prop.area) || 0) < filters.minArea) {
          return false;
        }
      }

      // 7. Inside / Outside WC & Shower
      const feat = prop.features || {};
      if (filters.insideToilet === 'inside' && !feat.insideToilet) return false;
      if (filters.insideToilet === 'outside' && Boolean(feat.insideToilet) !== false) return false;
      if (filters.insideBathroom === 'inside' && !feat.insideBathroom) return false;
      if (filters.insideBathroom === 'outside' && Boolean(feat.insideBathroom) !== false) return false;

      // 8. Selected Amenities / Features
      for (const key of activeFeatureKeys) {
        if (key === 'electricity') {
          if (!(feat.electricityJirama || feat.electricityPower || feat.solarPanels)) {
            return false;
          }
        } else if (key === 'waterPumpSupply') {
          if (!(feat.waterPumpSupply || feat.waterPumpSupplyJirama)) {
            return false;
          }
        } else if (!feat[key]) {
          return false;
        }
      }

      // 9. Keyword / Fokontany / Commune / Property Number search
      if (cleanQuery) {
        const title = removeDiacritics((prop.title || '').toLowerCase());
        const desc = removeDiacritics((prop.description || '').toLowerCase());
        const propNum = removeDiacritics(String(prop.propertyNumber || '').toLowerCase());
        const fokontany = removeDiacritics((prop.city?.fokontany || '').toLowerCase());
        const commune = removeDiacritics((prop.city?.commune || '').toLowerCase());
        const district = removeDiacritics((prop.city?.district || '').toLowerCase());
        const region = removeDiacritics((prop.city?.region || '').toLowerCase());

        const tokens = cleanQuery.split(/\s+/).filter(Boolean);
        const searchableBlob = `${title} ${desc} ${propNum} ${fokontany} ${commune} ${district} ${region}`;
        const allTokensMatch = tokens.every((token) => searchableBlob.includes(token));
        if (!allTokensMatch) return false;
      }

      return true;
    });
  }, [catalogProperties, filters]);

  // Step 2: Apply Geo-Radius filtering + enrich with map coordinates & distance + sort
  const filteredProperties = useMemo(() => {
    const center = filters.searchCoords;
    const radius = filters.searchRadius;
    const refPoint = center || userLocation;

    const results: any[] = [];

    for (const prop of rawFilteredWithoutRadius) {
      const mapCoords = getPropertyMapCoords(prop);
      let distanceMeters: number | null = null;

      if (refPoint) {
        try {
          distanceMeters = getDistance(
            { latitude: refPoint.lat, longitude: refPoint.lng },
            { latitude: mapCoords.lat, longitude: mapCoords.lng }
          );
        } catch {
          distanceMeters = null;
        }
      }

      // If geo-radius zone is active, check distance from searchCoords
      if (center && radius > 0) {
        const distFromZone = getDistance(
          { latitude: center.lat, longitude: center.lng },
          { latitude: mapCoords.lat, longitude: mapCoords.lng }
        );
        // Also match if selectedCity._id matches property.city._id directly
        const isSameCityId =
          filters.selectedCity?._id &&
          prop.city?._id &&
          String(filters.selectedCity._id) === String(prop.city._id);

        if (distFromZone > radius && !isSameCityId) {
          continue;
        }
        distanceMeters = distFromZone;
      }

      results.push({
        ...prop,
        _mapCoords: mapCoords,
        _distanceMeters: distanceMeters,
        _score: calculatePropertyRelevanceScore(prop),
      });
    }

    // Sort results
    const sorted = [...results];
    if (filters.sortBy === 'price_asc') {
      sorted.sort((a, b) => {
        const pA = (a.type === 'sale' ? a.price : a.rent) || Infinity;
        const pB = (b.type === 'sale' ? b.price : b.rent) || Infinity;
        return pA - pB;
      });
    } else if (filters.sortBy === 'price_desc') {
      sorted.sort((a, b) => {
        const pA = (a.type === 'sale' ? a.price : a.rent) || 0;
        const pB = (b.type === 'sale' ? b.price : b.rent) || 0;
        return pB - pA;
      });
    } else if (filters.sortBy === 'distance') {
      sorted.sort((a, b) => (a._distanceMeters ?? Infinity) - (b._distanceMeters ?? Infinity));
    } else if (filters.sortBy === 'relevance') {
      sorted.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    } else {
      // 'newest'
      sorted.sort((a, b) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tB - tA;
      });
    }

    return sorted;
  }, [rawFilteredWithoutRadius, filters.searchCoords, filters.searchRadius, filters.selectedCity, filters.sortBy, userLocation]);

  // Count how many active filters the user has set
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.houseType !== 'all') count++;
    if (filters.query.trim()) count++;
    if (filters.searchCoords && filters.searchRadius > 0) count++;
    if (filters.budgetMin !== null && filters.budgetMin > 0) count++;
    if (filters.budgetMax !== null && filters.budgetMax > 0) count++;
    if (filters.minRooms > 0) count++;
    if (filters.minBathrooms > 0) count++;
    if (filters.minArea !== null && filters.minArea > 0) count++;
    if (filters.insideToilet !== 'all') count++;
    if (filters.insideBathroom !== 'all') count++;
    count += Object.values(filters.features).filter(Boolean).length;
    return count;
  }, [filters]);

  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return (
      filteredProperties.find((p) => p._id === selectedPropertyId) ||
      catalogProperties.find((p) => p._id === selectedPropertyId) ||
      null
    );
  }, [selectedPropertyId, filteredProperties, catalogProperties]);

  return {
    // Data & Computed
    filteredProperties,
    rawFilteredWithoutRadius,
    catalogProperties,
    selectedProperty,
    priceStats,
    activeFiltersCount,
    isLoading,
    isLocatingUser,
    error,

    // Store State
    filters,
    viewMode,
    mobileSheetSnap,
    isFilterModalOpen,
    isDisplayModeModalOpen,
    isRadarClickMode,
    selectedPropertyId,
    hoveredPropertyId,
    mapCenter,
    mapZoom,
    mapTypeId,
    userLocation,

    // Actions (all stable or wrapped in useCallback)
    setFilter,
    setFilters,
    toggleFeature,
    clearFeatures,
    resetFilters,
    setLocationZone,
    clearLocationZone,
    setViewMode,
    setMobileSheetSnap,
    setIsFilterModalOpen,
    setIsDisplayModeModalOpen,
    setIsRadarClickMode,
    setSelectedPropertyId,
    setHoveredPropertyId,
    setMapCenter,
    setMapZoom,
    setMapTypeId,
    locateUserAndCenter,
    loadSearchCatalog,
  };
}

