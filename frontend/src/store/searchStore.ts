import { create } from 'zustand';
import { CityLocation } from '@/services/city.service';
import type { HouseCategoryFilter } from '@/lib/propertyTypes';

export type OfferTypeFilter = 'rent' | 'sale' | 'all';
export type { HouseCategoryFilter };
export type PlacementFilter = 'all' | 'inside' | 'outside';
export type SearchSortBy = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'distance';
export type SearchViewMode = 'map' | 'split' | 'list' | 'feed';

export interface SearchFilters {
  type: OfferTypeFilter;
  houseType: HouseCategoryFilter;
  query: string;
  selectedCity: CityLocation | null;
  searchCoords: { lat: number; lng: number } | null;
  searchPlaceName: string | null;
  searchRadius: number; // meters, 0 = unlimited / toute la carte
  budgetMin: number | null;
  budgetMax: number | null;
  minRooms: number; // 0 = all
  minBathrooms: number; // 0 = all
  minArea: number | null;
  insideToilet: PlacementFilter;
  insideBathroom: PlacementFilter;
  features: Record<string, boolean>;
  sortBy: SearchSortBy;
}

export const DEFAULT_ANTANANARIVO_CENTER = {
  lat: -18.8875,
  lng: 47.5237,
};

export interface SearchRadiusOption {
  label: string;
  shortLabel: string;
  value: number; // meters; 0 = unlimited / toute la carte
}

export const SEARCH_RADIUS_OPTIONS: readonly SearchRadiusOption[] = [
  { label: '500 m', shortLabel: '500 m', value: 500 },
  { label: '800 m', shortLabel: '800 m', value: 800 },
  { label: '1.5 km', shortLabel: '1.5 km', value: 1500 },
  { label: '3 km', shortLabel: '3 km', value: 3000 },
  { label: '5 km', shortLabel: '5 km', value: 5000 },
  { label: '10 km', shortLabel: '10 km', value: 10000 },
  { label: 'Toute la carte', shortLabel: 'Tout', value: 0 },
] as const;

export function formatRadiusLabel(radiusMeters: number, compact = false): string {
  if (!radiusMeters || radiusMeters <= 0) {
    return compact ? 'Tout' : 'Toute la carte';
  }
  if (radiusMeters >= 1000) {
    return `${(radiusMeters / 1000).toFixed(1).replace(/\.0$/, '')} km`;
  }
  return `${Math.round(radiusMeters)} m`;
}

export function getRadiusStepIndex(radiusMeters: number): number {
  const exactIdx = SEARCH_RADIUS_OPTIONS.findIndex((o) => o.value === radiusMeters);
  if (exactIdx !== -1) return exactIdx;
  if (!radiusMeters || radiusMeters <= 0) return SEARCH_RADIUS_OPTIONS.length - 1;
  // Find closest finite option
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < SEARCH_RADIUS_OPTIONS.length - 1; i++) {
    const diff = Math.abs(SEARCH_RADIUS_OPTIONS[i].value - radiusMeters);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function getPrevSearchRadius(currentRadius: number): number | null {
  if (!currentRadius || currentRadius <= 0) {
    return SEARCH_RADIUS_OPTIONS[SEARCH_RADIUS_OPTIONS.length - 2].value; // 10 km
  }
  for (let i = SEARCH_RADIUS_OPTIONS.length - 2; i >= 0; i--) {
    if (SEARCH_RADIUS_OPTIONS[i].value < currentRadius) {
      return SEARCH_RADIUS_OPTIONS[i].value;
    }
  }
  return null;
}

export function getNextSearchRadius(currentRadius: number): number | null {
  if (!currentRadius || currentRadius <= 0) {
    return null; // Already at unlimited ("Toute la carte")
  }
  for (let i = 0; i < SEARCH_RADIUS_OPTIONS.length - 1; i++) {
    if (SEARCH_RADIUS_OPTIONS[i].value > currentRadius) {
      return SEARCH_RADIUS_OPTIONS[i].value;
    }
  }
  return 0; // Expand from 10 km -> Toute la carte
}

export function getFallbackZoomForRadius(radiusMeters: number): number {
  if (!radiusMeters || radiusMeters <= 0) return 12;
  if (radiusMeters <= 500) return 15;
  if (radiusMeters <= 1000) return 14;
  if (radiusMeters <= 2000) return 14;
  if (radiusMeters <= 4000) return 13;
  if (radiusMeters <= 7000) return 12;
  return 11;
}

export const INITIAL_SEARCH_FILTERS: SearchFilters = {
  type: 'rent',
  houseType: 'all',
  query: '',
  selectedCity: null,
  searchCoords: null,
  searchPlaceName: null,
  searchRadius: 0,
  budgetMin: null,
  budgetMax: null,
  minRooms: 0,
  minBathrooms: 0,
  minArea: null,
  insideToilet: 'all',
  insideBathroom: 'all',
  features: {},
  sortBy: 'newest',
};

interface SearchStoreState {
  filters: SearchFilters;
  viewMode: SearchViewMode;
  mobileSheetSnap: 'peek' | 'half' | 'full';
  isFilterModalOpen: boolean;
  isDisplayModeModalOpen: boolean;
  isRadarClickMode: boolean;
  selectedPropertyId: string | null;
  hoveredPropertyId: string | null;
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  mapTypeId: 'roadmap' | 'hybrid';
  userLocation: { lat: number; lng: number } | null;
  catalogProperties: any[];
  isInitialized: boolean;

  // Synchronous Setters
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  setFilters: (partial: Partial<SearchFilters>) => void;
  toggleFeature: (featureKey: string) => void;
  clearFeatures: () => void;
  resetFilters: () => void;
  setLocationZone: (
    coords: { lat: number; lng: number } | null,
    placeName: string | null,
    city?: CityLocation | null,
    radius?: number
  ) => void;
  clearLocationZone: () => void;
  setViewMode: (mode: SearchViewMode) => void;
  setMobileSheetSnap: (snap: 'peek' | 'half' | 'full') => void;
  setIsFilterModalOpen: (open: boolean) => void;
  setIsDisplayModeModalOpen: (open: boolean) => void;
  setIsRadarClickMode: (active: boolean) => void;
  setSelectedPropertyId: (id: string | null) => void;
  setHoveredPropertyId: (id: string | null) => void;
  setMapCenter: (center: { lat: number; lng: number }) => void;
  setMapZoom: (zoom: number) => void;
  setMapTypeId: (type: 'roadmap' | 'hybrid') => void;
  setUserLocation: (coords: { lat: number; lng: number } | null) => void;
  setCatalogProperties: (properties: any[]) => void;
  setIsInitialized: (init: boolean) => void;
}

export const useSearchStore = create<SearchStoreState>((set) => ({
  filters: { ...INITIAL_SEARCH_FILTERS },
  viewMode: 'map',
  mobileSheetSnap: 'peek',
  isFilterModalOpen: false,
  isDisplayModeModalOpen: false,
  isRadarClickMode: false,
  selectedPropertyId: null,
  hoveredPropertyId: null,
  mapCenter: DEFAULT_ANTANANARIVO_CENTER,
  mapZoom: 13,
  mapTypeId: 'roadmap',
  userLocation: null,
  catalogProperties: [],
  isInitialized: false,

  setFilter: (key, value) =>
    set((state) => {
      const nextFilters = { ...state.filters, [key]: value };
      // Reset budget bounds when switching between rent and sale so incompatible ranges don't hide results
      if (key === 'type' && value !== state.filters.type) {
        nextFilters.budgetMin = null;
        nextFilters.budgetMax = null;
      }
      return { filters: nextFilters };
    }),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),

  toggleFeature: (featureKey) =>
    set((state) => {
      const currentVal = Boolean(state.filters.features[featureKey]);
      const nextVal = !currentVal;
      const nextFeatures = {
        ...state.filters.features,
        [featureKey]: nextVal,
      };
      // Smart rule from original Tranogasy: if carAccess is enabled, motoAccess is automatically true
      if (featureKey === 'carAccess' && nextVal) {
        nextFeatures.motoAccess = true;
      }
      return {
        filters: {
          ...state.filters,
          features: nextFeatures,
        },
      };
    }),

  clearFeatures: () =>
    set((state) => ({
      filters: {
        ...state.filters,
        features: {},
      },
    })),

  resetFilters: () =>
    set((state) => ({
      filters: {
        ...INITIAL_SEARCH_FILTERS,
        type: state.filters.type, // Preserve active offer tab (Location/Vente) or reset cleanly
      },
      selectedPropertyId: null,
    })),

  setLocationZone: (coords, placeName, city = null, radius = 1500) =>
    set((state) => {
      const resolvedRadius = coords ? (radius > 0 ? radius : 1500) : 0;
      return {
        filters: {
          ...state.filters,
          searchCoords: coords,
          searchPlaceName: placeName,
          selectedCity: city,
          searchRadius: resolvedRadius,
        },
        mapCenter: coords || state.mapCenter,
        mapZoom: coords ? getFallbackZoomForRadius(resolvedRadius) : state.mapZoom,
        isRadarClickMode: false,
      };
    }),

  clearLocationZone: () =>
    set((state) => ({
      filters: {
        ...state.filters,
        searchCoords: null,
        searchPlaceName: null,
        selectedCity: null,
        searchRadius: 0,
      },
      isRadarClickMode: false,
    })),

  setViewMode: (viewMode) => set({ viewMode }),
  setMobileSheetSnap: (mobileSheetSnap) => set({ mobileSheetSnap }),
  setIsFilterModalOpen: (isFilterModalOpen) => set({ isFilterModalOpen }),
  setIsDisplayModeModalOpen: (isDisplayModeModalOpen) => set({ isDisplayModeModalOpen }),
  setIsRadarClickMode: (isRadarClickMode) => set({ isRadarClickMode }),
  setSelectedPropertyId: (selectedPropertyId) => set({ selectedPropertyId }),
  setHoveredPropertyId: (hoveredPropertyId) => set({ hoveredPropertyId }),
  setMapCenter: (mapCenter) => set({ mapCenter }),
  setMapZoom: (mapZoom) => set({ mapZoom }),
  setMapTypeId: (mapTypeId) => set({ mapTypeId }),
  setUserLocation: (userLocation) => set({ userLocation }),
  setCatalogProperties: (catalogProperties) => set({ catalogProperties }),
  setIsInitialized: (isInitialized) => set({ isInitialized }),
}));

