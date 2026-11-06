import { create } from 'zustand';
import { CityLocation } from '@/services/city.service';

export type OfferTypeFilter = 'rent' | 'sale' | 'all';
export type HouseCategoryFilter = 'all' | 'appartement' | 'maison' | 'villa' | 'bureau';
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
    set((state) => ({
      filters: {
        ...state.filters,
        searchCoords: coords,
        searchPlaceName: placeName,
        selectedCity: city,
        searchRadius: coords ? (radius > 0 ? radius : 1500) : 0,
      },
      mapCenter: coords || state.mapCenter,
      mapZoom: coords ? 15 : state.mapZoom,
      isRadarClickMode: false,
    })),

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

