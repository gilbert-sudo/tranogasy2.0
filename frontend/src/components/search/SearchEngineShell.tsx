'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  Sparkles,
  Radar,
  RotateCcw,
  SlidersHorizontal,
  Map as MapIcon,
  ArrowUpDown,
  X,
  Eye,
  Compass,
  Navigation,
} from 'lucide-react';
import {
  usePropertySearch,
  getPropertyMapCoords,
} from '@/hooks/usePropertySearch';
import {
  OfferTypeFilter,
  HouseCategoryFilter,
  SearchSortBy,
  SearchViewMode,
  SearchFilters,
} from '@/store/searchStore';
import FuturisticSearchMap from './FuturisticSearchMap';
import SearchTopOmnibox from './SearchTopOmnibox';
import SearchFloatingBottomHud from './SearchFloatingBottomHud';
import MapPropertyPreviewCarousel from './MapPropertyPreviewCarousel';
import AdvancedFilterModal from './AdvancedFilterModal';
import PropertyCard from '@/components/PropertyCard';
import TranogasyFeed from '@/components/feed/TranogasyFeed';
import { FeedProperty } from '@/components/feed/types';

const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyBPQYtD-cm2GmdJGXhFcD7_2vXTkyPXqOs';

const MADAGASCAR_CITY_COORDS: Record<string, { lat: number; lng: number; zoom: number }> = {
  antananarivo: { lat: -18.8875, lng: 47.5237, zoom: 13 },
  toamasina: { lat: -18.1492, lng: 49.4023, zoom: 13 },
  antsirabe: { lat: -19.8659, lng: 47.0333, zoom: 13 },
  mahajanga: { lat: -15.7167, lng: 46.3167, zoom: 13 },
  fianarantsoa: { lat: -21.4527, lng: 47.0857, zoom: 13 },
  toliara: { lat: -23.35, lng: 43.6667, zoom: 13 },
  antsiranana: { lat: -12.2787, lng: 49.2917, zoom: 13 },
  'nosy be': { lat: -13.3167, lng: 48.2667, zoom: 12 },
};

const CATEGORY_MAP: Record<string, HouseCategoryFilter> = {
  all: 'all',
  tous: 'all',
  apartment: 'appartement',
  appartement: 'appartement',
  home: 'maison',
  maison: 'maison',
  villa: 'villa',
  office: 'bureau',
  bureau: 'bureau',
};

const SORT_OPTIONS: { id: SearchSortBy; label: string }[] = [
  { id: 'relevance', label: 'Pertinence' },
  { id: 'newest', label: 'Plus récents' },
  { id: 'price_asc', label: 'Prix croissant' },
  { id: 'price_desc', label: 'Prix décroissant' },
  { id: 'distance', label: 'Proximité' },
];

const CARDS_BATCH_SIZE = 25;

export default function SearchEngineShell() {
  const searchParams = useSearchParams();
  const initializedFromUrlRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(CARDS_BATCH_SIZE);

  const {
    filteredProperties,
    rawFilteredWithoutRadius,
    priceStats,
    activeFiltersCount,
    isLoading,
    isLocatingUser,
    filters,
    viewMode,
    isFilterModalOpen,
    isRadarClickMode,
    selectedPropertyId,
    mapCenter,
    mapZoom,
    mapTypeId,
    userLocation,
    setFilter,
    setFilters,
    toggleFeature,
    resetFilters,
    setLocationZone,
    clearLocationZone,
    setViewMode,
    setIsFilterModalOpen,
    setIsRadarClickMode,
    setSelectedPropertyId,
    setHoveredPropertyId,
    setMapCenter,
    setMapZoom,
    setMapTypeId,
    locateUserAndCenter,
  } = usePropertySearch();

  // Reset progressive list window when filters or viewMode change
  useEffect(() => {
    setVisibleCount(CARDS_BATCH_SIZE);
  }, [filters, viewMode]);

  // Progressive infinite-scroll batching for 'split' and 'list' modes
  useEffect(() => {
    if (viewMode !== 'split' && viewMode !== 'list') return;
    if (visibleCount >= filteredProperties.length) return;
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) =>
            Math.min(filteredProperties.length, prev + CARDS_BATCH_SIZE)
          );
        }
      },
      { rootMargin: '450px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [viewMode, visibleCount, filteredProperties.length]);

  // Freeze background map/card canvas while the filter modal is open so sliding/clicking filters never triggers 200+ marker or card DOM re-renders behind the backdrop
  const committedCanvasPropertiesRef = useRef<any[]>(filteredProperties);
  if (!isFilterModalOpen) {
    committedCanvasPropertiesRef.current = filteredProperties;
  }
  const canvasProperties = isFilterModalOpen
    ? committedCanvasPropertiesRef.current
    : filteredProperties;

  const visibleGridProperties = useMemo(() => {
    return canvasProperties.slice(0, visibleCount);
  }, [canvasProperties, visibleCount]);

  const handleOpenFilterModal = useCallback(() => {
    setIsFilterModalOpen(true);
  }, [setIsFilterModalOpen]);

  const handleCloseFilterModal = useCallback(() => {
    setIsFilterModalOpen(false);
  }, [setIsFilterModalOpen]);

  // Initialize search state from URL query params when arriving from Home / LandingNav
  useEffect(() => {
    if (initializedFromUrlRef.current) return;
    initializedFromUrlRef.current = true;

    const q = searchParams.get('q');
    const typeParam = searchParams.get('type') as OfferTypeFilter | null;
    const categoryParam = searchParams.get('category');
    const cityParam = searchParams.get('city');
    const openFiltersParam = searchParams.get('openFilters');
    const modeParam = searchParams.get('mode');

    const patch: Partial<SearchFilters> = {};

    if (q) {
      patch.query = q;
    }
    if (typeParam && ['all', 'rent', 'sale'].includes(typeParam)) {
      patch.type = typeParam;
    }
    if (categoryParam) {
      const mapped = CATEGORY_MAP[categoryParam.toLowerCase()];
      if (mapped) {
        patch.houseType = mapped;
      }
    }

    if (Object.keys(patch).length > 0) {
      setFilters(patch);
    }

    if (cityParam) {
      const cleanCity = cityParam.split(',')[0].trim().toLowerCase();
      const cityTarget = MADAGASCAR_CITY_COORDS[cleanCity];
      if (cityTarget) {
        setMapCenter({ lat: cityTarget.lat, lng: cityTarget.lng });
        setMapZoom(cityTarget.zoom);
        if (cleanCity !== 'antananarivo') {
          setLocationZone(
            { lat: cityTarget.lat, lng: cityTarget.lng },
            cityParam.split(',')[0].trim(),
            null,
            5000
          );
        }
      }
    }

    if (modeParam && ['map', 'split', 'list', 'feed'].includes(modeParam)) {
      setViewMode(modeParam as SearchViewMode);
    }

    if (openFiltersParam === '1' || openFiltersParam === 'true') {
      setIsFilterModalOpen(true);
    }
  }, [
    searchParams,
    setFilters,
    setMapCenter,
    setMapZoom,
    setLocationZone,
    setViewMode,
    setIsFilterModalOpen,
  ]);

  // Feed key to refresh TranogasyFeed when filtered set changes
  const feedSignature = useMemo(() => {
    return `${filteredProperties.length}-${filteredProperties
      .slice(0, 5)
      .map((p) => p._id)
      .join('_')}`;
  }, [filteredProperties]);

  const handleToggleMapType = useCallback(() => {
    setMapTypeId(mapTypeId === 'roadmap' ? 'hybrid' : 'roadmap');
  }, [mapTypeId, setMapTypeId]);

  const handleSelectPropertyObject = useCallback(
    (property: any | null) => {
      if (!property) {
        setSelectedPropertyId(null);
        return;
      }
      setSelectedPropertyId(property._id);
    },
    [setSelectedPropertyId]
  );

  const handleFocusPropertyOnMap = useCallback(
    (propertyId: string) => {
      const idx = filteredProperties.findIndex((p) => p._id === propertyId);
      const target = idx >= 0 ? filteredProperties[idx] : null;
      if (target) {
        const coords = getPropertyMapCoords(target);
        setSelectedPropertyId(propertyId);
        setMapCenter(coords);
        setMapZoom(16);
      }
    },
    [filteredProperties, setSelectedPropertyId, setMapCenter, setMapZoom]
  );

  const handleLocationZoneSelected = useCallback(
    (
      coords: { lat: number; lng: number } | null,
      placeName: string | null,
      city?: any,
      radius?: number
    ) => {
      setLocationZone(coords, placeName, city, radius);
      if (coords) {
        setMapCenter(coords);
        setMapZoom(15);
      }
    },
    [setLocationZone, setMapCenter, setMapZoom]
  );

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places']}>
      <div
        className={`relative w-full -mb-16 md:-mb-24 lg:-mb-8 ${
          viewMode === 'list' ? 'min-h-[100dvh]' : 'h-[100dvh] overflow-hidden'
        } bg-zinc-50 dark:bg-zinc-950 font-sans selection:bg-brand-green/20`}
      >
        {/* ══════════════════════════════════════════════════════════════════
            FLOATING LIQUID-GLASS TOP OMNIBOX (Shown in all modes: map, split, list, feed)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="fixed top-2.5 sm:top-4 inset-x-0 z-40 px-3 sm:px-5 pointer-events-none">
          <SearchTopOmnibox
            autoFocus={
              searchParams.get('focus') === '1' ||
              searchParams.get('focus') === 'true' ||
              searchParams.get('autoFocus') === '1' ||
              searchParams.get('autoFocus') === 'true'
            }
            filters={filters}
            activeFiltersCount={activeFiltersCount}
            totalResults={filteredProperties.length}
            showCategoryRibbon={viewMode !== 'feed'}
            onSetFilter={setFilter}
            onToggleFeature={toggleFeature}
            onSetLocationZone={handleLocationZoneSelected}
            onClearLocationZone={clearLocationZone}
            onOpenFilterModal={handleOpenFilterModal}
            onLocateUser={locateUserAndCenter}
            isLocatingUser={isLocatingUser}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            MODE 1: INTERACTIVE FULL-SCREEN MAP MODE ('map')
        ══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'map' && (
          <div className="relative w-full h-[100dvh] overflow-hidden select-none">
            <FuturisticSearchMap
              properties={canvasProperties}
              selectedPropertyId={selectedPropertyId}
              onSelectProperty={handleSelectPropertyObject}
              mapCenter={mapCenter}
              mapZoom={mapZoom}
              mapTypeId={mapTypeId}
              onToggleMapType={handleToggleMapType}
              userLocation={userLocation}
              isLocatingUser={isLocatingUser}
              onLocateUser={locateUserAndCenter}
              searchCoords={filters.searchCoords}
              searchPlaceName={filters.searchPlaceName}
              searchRadius={filters.searchRadius}
              onSetLocationZone={handleLocationZoneSelected}
              onClearLocationZone={clearLocationZone}
              isRadarClickMode={isRadarClickMode}
              onSetRadarClickMode={setIsRadarClickMode}
            />

            {/* Empty results floating glass alert on Map */}
            {!isLoading && filteredProperties.length === 0 && (
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[90%] max-w-md pointer-events-auto animate-glass-island">
                <div className="rounded-[2.5rem] p-6 sm:p-8 text-center bg-white/92 dark:bg-zinc-950/92 backdrop-blur-3xl border border-white/90 dark:border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                  <div className="w-14 h-14 rounded-full bg-brand-green/15 text-brand-green flex items-center justify-center mx-auto mb-4">
                    <Radar className="w-7 h-7" />
                  </div>
                  <h3 className="font-outfit font-medium text-lg sm:text-xl text-zinc-900 dark:text-white mb-1.5">
                    Aucun bien dans ce périmètre
                  </h3>
                  <p className="font-outfit font-light text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                    Essayez d&apos;élargir le rayon radar sur la carte ou d&apos;assouplir vos critères de recherche.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {filters.searchCoords && filters.searchRadius > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setFilter(
                            'searchRadius',
                            Math.min(10000, filters.searchRadius + 1500)
                          )
                        }
                        className="px-6 py-3.5 rounded-full bg-brand-green text-white font-outfit font-light text-xs sm:text-sm tracking-wide shadow-[0_8px_24px_rgba(114,193,70,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        Élargir à{' '}
                        {(
                          Math.min(10000, filters.searchRadius + 1500) / 1000
                        ).toFixed(1)}{' '}
                        km
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-6 py-3.5 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-outfit font-light text-xs sm:text-sm tracking-wide hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    >
                      Tout réinitialiser
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODE 2: HYBRID SPLIT MODE ('split' — Bento Grid + Live Map)
        ══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'split' && (
          <div className="w-full h-[100dvh] overflow-hidden flex flex-col pt-[106px] sm:pt-[130px] bg-zinc-50 dark:bg-zinc-950">
            <div className="flex-1 flex overflow-hidden w-full max-w-[2000px] mx-auto">
              {/* Left Scrollable Bento Results Pane */}
              <div className="w-full lg:w-[54%] xl:w-[52%] h-full overflow-y-auto px-4 sm:px-6 lg:px-8 pb-36 scrollbar-hide">
                {/* Split View Sticky Controls Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 py-3 mb-4 border-b border-zinc-200/70 dark:border-white/10">
                  <div className="flex items-center gap-2.5">
                    <span className="font-outfit font-medium text-base sm:text-lg text-zinc-900 dark:text-white">
                      {filteredProperties.length}{' '}
                      <span className="font-light text-zinc-500 dark:text-zinc-400">
                        {filteredProperties.length > 1 ? 'logements trouvés' : 'logement trouvé'}
                      </span>
                    </span>
                    {filters.searchCoords && filters.searchRadius > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-outfit font-normal">
                        <Radar className="w-3.5 h-3.5 text-brand-green" />
                        {filters.searchPlaceName || 'Zone'} •{' '}
                        {filters.searchRadius >= 1000
                          ? `${(filters.searchRadius / 1000).toFixed(1)} km`
                          : `${filters.searchRadius} m`}
                        <button
                          type="button"
                          onClick={clearLocationZone}
                          className="ml-0.5 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </div>

                  {/* Sort Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                    {SORT_OPTIONS.map((opt) => {
                      const active = filters.sortBy === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFilter('sortBy', opt.id)}
                          className={`px-4 py-2 rounded-full font-outfit text-xs transition-all cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-normal shadow-sm'
                              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-light border border-zinc-200/80 dark:border-white/10 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cards Grid */}
                {filteredProperties.length === 0 ? (
                  <div className="rounded-[2.5rem] p-10 text-center bg-white dark:bg-zinc-900/70 border border-zinc-200/70 dark:border-white/10 my-6">
                    <Radar className="w-10 h-10 text-brand-green mx-auto mb-3 stroke-[1.5]" />
                    <h3 className="font-outfit font-medium text-lg text-zinc-900 dark:text-white mb-1">
                      Aucun résultat ne correspond à ces filtres
                    </h3>
                    <p className="font-outfit font-light text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                      Modifiez vos critères ou élargissez la zone géographique sur la carte.
                    </p>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-7 py-3.5 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-outfit font-light text-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    >
                      Réinitialiser les filtres
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {visibleGridProperties.map((property) => {
                        const isSelected = selectedPropertyId === property._id;
                        return (
                          <div
                            key={property._id}
                            onMouseEnter={() => setHoveredPropertyId(property._id)}
                            onMouseLeave={() => setHoveredPropertyId(null)}
                            style={{ contentVisibility: 'auto', containIntrinsicSize: '0 340px' }}
                            className={`relative rounded-[1.5rem] transition-all duration-300 ${
                              isSelected
                                ? 'ring-2 ring-brand-green ring-offset-2 dark:ring-offset-zinc-950'
                                : ''
                            }`}
                          >
                            <PropertyCard property={property} />
                            {/* Locate on right-hand map quick pill (placed on thumbnail image header so it never hides specs/amenities) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFocusPropertyOnMap(property._id);
                              }}
                              className="hidden lg:flex items-center gap-1.5 absolute top-3.5 right-20 xl:right-24 z-10
                                px-3 py-1 rounded-full
                                bg-zinc-950/80 hover:bg-zinc-950 text-white
                                border border-white/20 backdrop-blur-md
                                font-outfit font-light text-[11px] tracking-wide
                                shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                            >
                              <Navigation className="w-3 h-3 text-brand-green" />
                              <span>Localiser</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {visibleCount < filteredProperties.length && (
                      <div
                        ref={loadMoreSentinelRef}
                        className="flex justify-center py-8"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleCount((prev) =>
                              Math.min(filteredProperties.length, prev + CARDS_BATCH_SIZE)
                            )
                          }
                          className="px-7 py-3 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 font-outfit font-light text-xs tracking-wider shadow-xs hover:border-brand-green transition-all cursor-pointer"
                        >
                          Afficher plus de biens ({filteredProperties.length - visibleCount} restants)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right Interactive Map Pane (Desktop lg+) */}
              <div className="hidden lg:block lg:w-[46%] xl:w-[48%] h-full pr-6 pb-24 pt-2">
                <div className="relative w-full h-full rounded-[2.5rem] overflow-hidden border border-zinc-200/80 dark:border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
                  <FuturisticSearchMap
                    properties={filteredProperties}
                    selectedPropertyId={selectedPropertyId}
                    onSelectProperty={handleSelectPropertyObject}
                    mapCenter={mapCenter}
                    mapZoom={mapZoom}
                    mapTypeId={mapTypeId}
                    onToggleMapType={handleToggleMapType}
                    userLocation={userLocation}
                    isLocatingUser={isLocatingUser}
                    onLocateUser={locateUserAndCenter}
                    searchCoords={filters.searchCoords}
                    searchPlaceName={filters.searchPlaceName}
                    searchRadius={filters.searchRadius}
                    onSetLocationZone={handleLocationZoneSelected}
                    onClearLocationZone={clearLocationZone}
                    isRadarClickMode={isRadarClickMode}
                    onSetRadarClickMode={setIsRadarClickMode}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODE 3: FULL BENTO LIST MODE ('list')
        ══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'list' && (
          <div className="w-full min-h-[100dvh] pt-[106px] sm:pt-[130px] pb-24 sm:pb-32 px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 max-w-[2000px] mx-auto">
            {/* List Header & Sort Bar - Space Optimized & Compact */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 pb-2.5 sm:pb-4 mb-3.5 sm:mb-6 border-b border-zinc-200/70 dark:border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-outfit font-medium text-base sm:text-xl text-zinc-900 dark:text-white tracking-tight">
                    {filteredProperties.length}{' '}
                    <span className="font-light text-zinc-500 dark:text-zinc-400">
                      {filteredProperties.length > 1
                        ? 'propriétés disponibles'
                        : 'propriété disponible'}
                    </span>
                  </h1>
                  {activeFiltersCount > 0 && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-outfit font-light text-[11px] sm:text-xs hover:bg-zinc-300/70 dark:hover:bg-zinc-700 transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Réinitialiser ({activeFiltersCount})</span>
                    </button>
                  )}
                </div>
                {filters.searchCoords && filters.searchRadius > 0 ? (
                  <p className="font-outfit font-light text-xs text-brand-green mt-0.5">
                    Dans un rayon de{' '}
                    {filters.searchRadius >= 1000
                      ? `${(filters.searchRadius / 1000).toFixed(1)} km`
                      : `${filters.searchRadius} m`}{' '}
                    autour de {filters.searchPlaceName || 'votre point radar'}
                  </p>
                ) : (
                  <p className="hidden sm:block font-outfit font-light text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Exploration sur tout Madagascar • Tri intelligent en temps réel
                  </p>
                )}
              </div>

              {/* Sort Selector Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <div className="hidden sm:flex items-center gap-1 text-xs font-outfit font-light text-zinc-400 mr-1 shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>Trier :</span>
                </div>
                {SORT_OPTIONS.map((opt) => {
                  const active = filters.sortBy === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFilter('sortBy', opt.id)}
                      className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full font-outfit text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-normal shadow-xs'
                          : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-light border border-zinc-200/80 dark:border-white/10 hover:border-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bento Grid or Empty State */}
            {filteredProperties.length === 0 ? (
              <div className="max-w-lg mx-auto my-12 rounded-[2.75rem] p-8 sm:p-12 text-center bg-white dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
                <div className="w-16 h-16 rounded-full bg-brand-green/15 text-brand-green flex items-center justify-center mx-auto mb-5">
                  <Sparkles className="w-8 h-8 stroke-[1.6]" />
                </div>
                <h2 className="font-outfit font-medium text-xl text-zinc-900 dark:text-white mb-2">
                  Aucun bien trouvé pour ces critères
                </h2>
                <p className="font-outfit font-light text-sm text-zinc-500 dark:text-zinc-400 mb-7">
                  Essayez de modifier votre fourchette de budget, de réduire le nombre d&apos;équipements exigés ou de repasser sur la carte interactive.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-7 py-3.5 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-outfit font-light text-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    Réinitialiser tous les filtres
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('map')}
                    className="px-7 py-3.5 rounded-full bg-brand-green text-white font-outfit font-light text-sm shadow-[0_8px_24px_rgba(114,193,70,0.3)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    Ouvrir la Carte
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
                  {visibleGridProperties.map((property) => (
                    <div
                      key={property._id}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 340px' }}
                      className="relative group"
                    >
                      <PropertyCard property={property} />
                      {/* View on map hover pill (placed on thumbnail header so it never hides specs/amenities) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFocusPropertyOnMap(property._id);
                          setViewMode('map');
                        }}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 absolute top-3.5 right-20 xl:right-24 z-10
                          px-3 py-1 rounded-full
                          bg-zinc-950/80 hover:bg-zinc-950 text-white
                          border border-white/20 backdrop-blur-md
                          font-outfit font-light text-[11px] tracking-wide
                          shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <MapIcon className="w-3 h-3 text-brand-green" />
                        <span>Voir sur la carte</span>
                      </button>
                    </div>
                  ))}
                </div>

                {visibleCount < filteredProperties.length && (
                  <div
                    ref={loadMoreSentinelRef}
                    className="flex justify-center py-10"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleCount((prev) =>
                          Math.min(filteredProperties.length, prev + CARDS_BATCH_SIZE)
                        )
                      }
                      className="px-8 py-3.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 font-outfit font-light text-xs sm:text-sm tracking-wider shadow-xs hover:border-brand-green transition-all cursor-pointer"
                    >
                      Afficher plus de biens ({filteredProperties.length - visibleCount} restants)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MODE 4: IMMERSIVE TIKTOK FEED MODE ('feed')
        ══════════════════════════════════════════════════════════════════ */}
        {viewMode === 'feed' && (
          <div className="relative w-full h-[100dvh] overflow-hidden bg-zinc-950">
            {filteredProperties.length > 0 ? (
              <TranogasyFeed
                key={feedSignature}
                embeddedInSearch
                initialProperties={filteredProperties as unknown as FeedProperty[]}
              />
            ) : (
              <div className="h-full flex items-center justify-center p-6">
                <div className="max-w-md w-full rounded-[2.5rem] p-8 text-center bg-zinc-900/90 border border-white/10 text-white">
                  <Compass className="w-12 h-12 text-brand-green mx-auto mb-4 stroke-[1.5]" />
                  <h3 className="font-outfit font-medium text-xl mb-2">
                    Aucun bien à afficher en mode Feed
                  </h3>
                  <p className="font-outfit font-light text-sm text-zinc-400 mb-6">
                    Réinitialisez vos filtres pour parcourir les propriétés en mode immersif.
                  </p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-7 py-3.5 rounded-full bg-brand-green text-white font-outfit font-light text-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    Réinitialiser les filtres
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            FLOATING BOTTOM DOCK: PREVIEW CAROUSEL (MAP MODE) + LIQUID-GLASS HUD
        ══════════════════════════════════════════════════════════════════ */}
        <div className="fixed bottom-1.5 sm:bottom-3 inset-x-0 z-30 flex flex-col items-center gap-2 pointer-events-none">
          {viewMode === 'map' && (
            <MapPropertyPreviewCarousel
              properties={canvasProperties}
              selectedPropertyId={selectedPropertyId}
              onSelectProperty={(prop) => {
                if (!prop) {
                  setSelectedPropertyId(null);
                  return;
                }
                handleFocusPropertyOnMap(prop._id);
              }}
            />
          )}

          <SearchFloatingBottomHud
            filters={filters}
            totalResults={filteredProperties.length}
            activeFiltersCount={activeFiltersCount}
            viewMode={viewMode}
            onSetViewMode={setViewMode}
            onOpenFilterModal={handleOpenFilterModal}
          />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            ADVANCED FILTER STUDIO MODAL / DRAWER
        ══════════════════════════════════════════════════════════════════ */}
        <AdvancedFilterModal
          isOpen={isFilterModalOpen}
          onClose={handleCloseFilterModal}
          filters={filters}
          priceStats={priceStats}
          totalMatching={filteredProperties.length}
          rawMatchingWithoutRadius={rawFilteredWithoutRadius.length}
          activeFiltersCount={activeFiltersCount}
          viewMode={viewMode}
          onSetFilter={setFilter}
          onToggleFeature={toggleFeature}
          onResetFilters={resetFilters}
          onSetViewMode={setViewMode}
          onLocateUser={locateUserAndCenter}
          onClearLocationZone={clearLocationZone}
        />
      </div>
    </APIProvider>
  );
}
