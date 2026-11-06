'use client';

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Map,
  AdvancedMarker,
  useMap,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  Crosshair,
  Layers,
  Maximize2,
  Radar,
  Sparkles,
  Navigation,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import { Circle } from '@/components/map/Circle';
import { cityService } from '@/services/city.service';
import {
  formatCompactPrice,
  getPropertyMapCoords,
} from '@/hooks/usePropertySearch';
import { DEFAULT_ANTANANARIVO_CENTER } from '@/store/searchStore';

const GOOGLE_MAP_ID = '80e7a8f8db80acb5';

interface FuturisticSearchMapProps {
  properties: any[];
  selectedPropertyId: string | null;
  hoveredPropertyId: string | null;
  onSelectProperty: (property: any) => void;
  onHoverProperty?: (propertyId: string | null) => void;
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  mapTypeId: 'roadmap' | 'hybrid';
  onToggleMapType: () => void;
  userLocation: { lat: number; lng: number } | null;
  isLocatingUser: boolean;
  onLocateUser: (applyZone?: boolean) => void;
  searchCoords: { lat: number; lng: number } | null;
  searchPlaceName: string | null;
  searchRadius: number;
  onSetLocationZone: (
    coords: { lat: number; lng: number } | null,
    placeName: string | null,
    city?: any,
    radius?: number
  ) => void;
  onClearLocationZone: () => void;
  isRadarClickMode: boolean;
  onSetRadarClickMode: (active: boolean) => void;
}

function MapCameraSync({
  mapCenter,
  mapZoom,
  selectedProperty,
}: {
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  selectedProperty: any | null;
}) {
  const map = useMap();
  const prevCenterRef = useRef<string>('');
  const prevSelectedIdRef = useRef<string | null>(null);

  // Sync when mapCenter or mapZoom explicitly changes from store actions
  useEffect(() => {
    if (!map || !mapCenter) return;
    const key = `${mapCenter.lat.toFixed(5)},${mapCenter.lng.toFixed(5)},${mapZoom}`;
    if (prevCenterRef.current !== key) {
      prevCenterRef.current = key;
      map.panTo(mapCenter);
      if (map.getZoom() !== mapZoom) {
        map.setZoom(mapZoom);
      }
    }
  }, [map, mapCenter, mapZoom]);

  // Smooth pan when a property is selected (from card carousel or marker)
  useEffect(() => {
    if (!map || !selectedProperty) {
      prevSelectedIdRef.current = null;
      return;
    }
    if (prevSelectedIdRef.current !== selectedProperty._id) {
      prevSelectedIdRef.current = selectedProperty._id;
      const coords = selectedProperty._mapCoords || getPropertyMapCoords(selectedProperty);
      map.panTo({ lat: coords.lat, lng: coords.lng });
      const currentZoom = map.getZoom() || 13;
      if (currentZoom < 14) {
        map.setZoom(15);
      }
    }
  }, [map, selectedProperty]);

  return null;
}

export default function FuturisticSearchMap({
  properties,
  selectedPropertyId,
  hoveredPropertyId,
  onSelectProperty,
  onHoverProperty,
  mapCenter,
  mapZoom,
  mapTypeId,
  onToggleMapType,
  userLocation,
  isLocatingUser,
  onLocateUser,
  searchCoords,
  searchPlaceName,
  searchRadius,
  onSetLocationZone,
  onClearLocationZone,
  isRadarClickMode,
  onSetRadarClickMode,
}: FuturisticSearchMapProps) {
  const map = useMap();

  // Cap visible markers to 150 for silky 60fps performance
  const visibleMarkers = useMemo(() => {
    return properties.slice(0, 150);
  }, [properties]);

  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return properties.find((p) => p._id === selectedPropertyId) || null;
  }, [properties, selectedPropertyId]);

  // Fit bounds to all currently filtered properties
  const handleFitBounds = useCallback(() => {
    if (!map || visibleMarkers.length === 0 || typeof window === 'undefined' || !window.google?.maps) {
      return;
    }

    if (searchCoords && searchRadius > 0) {
      map.panTo(searchCoords);
      const radiusZoom =
        searchRadius <= 600
          ? 16
          : searchRadius <= 1200
          ? 15
          : searchRadius <= 2500
          ? 14
          : searchRadius <= 5000
          ? 13
          : 12;
      map.setZoom(radiusZoom);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    visibleMarkers.slice(0, 60).forEach((prop) => {
      const coords = prop._mapCoords || getPropertyMapCoords(prop);
      bounds.extend({ lat: coords.lat, lng: coords.lng });
    });

    map.fitBounds(bounds, {
      top: 130,
      bottom: 220,
      left: 40,
      right: 60,
    });
  }, [map, visibleMarkers, searchCoords, searchRadius]);

  // Zoom in / out controls
  const handleZoomDelta = useCallback(
    (delta: number) => {
      if (!map) return;
      const current = map.getZoom() || 13;
      map.setZoom(Math.min(20, Math.max(6, current + delta)));
    },
    [map]
  );

  // Handle map click (either deselect property OR place radar zone when in radar click mode)
  const handleMapClick = useCallback(
    async (e: MapMouseEvent) => {
      if (isRadarClickMode && e.detail?.latLng) {
        const clickedCoords = {
          lat: e.detail.latLng.lat,
          lng: e.detail.latLng.lng,
        };
        const activeRadius = searchRadius > 0 ? searchRadius : 1500;
        onSetLocationZone(clickedCoords, 'Zone radar personnalisée...', null, activeRadius);

        try {
          const nearest = await cityService.getNearestCity(clickedCoords);
          if (nearest) {
            onSetLocationZone(
              clickedCoords,
              `${nearest.fokontany}, ${nearest.commune}`,
              nearest,
              activeRadius
            );
          } else {
            onSetLocationZone(clickedCoords, 'Point radar sur carte', null, activeRadius);
          }
        } catch {
          onSetLocationZone(clickedCoords, 'Point radar sur carte', null, activeRadius);
        }
        return;
      }
    },
    [isRadarClickMode, searchRadius, onSetLocationZone]
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-zinc-200 dark:bg-zinc-950 select-none font-outfit">
      <Map
        defaultCenter={mapCenter || DEFAULT_ANTANANARIVO_CENTER}
        defaultZoom={mapZoom || 13}
        minZoom={6}
        mapId={GOOGLE_MAP_ID}
        mapTypeId={mapTypeId}
        gestureHandling="greedy"
        disableDefaultUI={true}
        clickableIcons={false}
        onClick={handleMapClick}
        className="w-full h-full"
      >
        <MapCameraSync
          mapCenter={mapCenter}
          mapZoom={mapZoom}
          selectedProperty={selectedProperty}
        />

        {/* ── 1. Active Geo-Search Radar Circle & Center Beacon ── */}
        {searchCoords && searchRadius > 0 && (
          <>
            <Circle
              center={searchCoords}
              radius={searchRadius}
              strokeColor="#7cbd1e"
              strokeOpacity={0.95}
              strokeWeight={2.5}
              fillColor="#7cbd1e"
              fillOpacity={0.11}
              clickable={false}
            />

            <AdvancedMarker
              position={searchCoords}
              zIndex={90}
              title={searchPlaceName || 'Zone de recherche'}
            >
              <div className="relative flex flex-col items-center pointer-events-auto">
                {/* Pulsing Radar Halo */}
                <span className="absolute -inset-3 rounded-full bg-brand-green/35 animate-radar-wave pointer-events-none" />
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-950/90 text-white border border-brand-green/60 shadow-[0_8px_24px_rgba(124,189,30,0.4)] backdrop-blur-xl">
                  <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                  <span className="text-[11px] font-light tracking-wide whitespace-nowrap max-w-[140px] truncate">
                    {searchPlaceName || 'Radar actif'}
                  </span>
                  <span className="text-[10px] font-medium text-brand-green px-1.5 py-0.5 rounded-full bg-brand-green/15">
                    {searchRadius >= 1000
                      ? `${(searchRadius / 1000).toFixed(1).replace(/\.0$/, '')} km`
                      : `${searchRadius} m`}
                  </span>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onClearLocationZone();
                    }}
                    className="ml-0.5 w-4 h-4 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors cursor-pointer"
                    title="Retirer le radar"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-brand-green ring-4 ring-white shadow-md mt-1" />
              </div>
            </AdvancedMarker>
          </>
        )}

        {/* ── 2. User Current GPS Location Beacon ── */}
        {userLocation && (
          <>
            <Circle
              center={userLocation}
              radius={500}
              strokeColor="#3b82f6"
              strokeOpacity={0.45}
              strokeWeight={1.5}
              fillColor="#3b82f6"
              fillOpacity={0.06}
              clickable={false}
            />
            <AdvancedMarker position={userLocation} zIndex={85} title="Vous êtes ici">
              <div className="relative flex flex-col items-center">
                <span className="absolute -inset-2.5 rounded-full bg-blue-500/35 animate-ping pointer-events-none" />
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] font-light tracking-wider shadow-[0_6px_20px_rgba(37,99,235,0.5)] border border-white/40">
                  <Navigation className="w-3 h-3 fill-white" />
                  <span>Vous</span>
                </div>
              </div>
            </AdvancedMarker>
          </>
        )}

        {/* ── 3. Futuristic Property Price Pill Markers ── */}
        {visibleMarkers.map((property) => {
          const coords = property._mapCoords || getPropertyMapCoords(property);
          const isSelected = selectedPropertyId === property._id;
          const isHovered = hoveredPropertyId === property._id;
          const isHighlighted = isSelected || isHovered;
          const displayPrice = property.type === 'sale' ? property.price : property.rent;
          const formattedPrice = formatCompactPrice(displayPrice);
          const isSale = property.type === 'sale';

          return (
            <AdvancedMarker
              key={property._id}
              position={{ lat: coords.lat, lng: coords.lng }}
              zIndex={isSelected ? 120 : isHovered ? 110 : property.topProperty ? 50 : 10}
              onClick={() => onSelectProperty(property)}
            >
              <div
                onMouseEnter={() => onHoverProperty?.(property._id)}
                onMouseLeave={() => onHoverProperty?.(null)}
                className={`group relative flex flex-col items-center cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isHighlighted
                    ? 'scale-115 -translate-y-1.5 z-50'
                    : 'hover:scale-110 hover:-translate-y-1'
                }`}
              >
                {/* Glow Halo when selected */}
                {isHighlighted && (
                  <span className="absolute -inset-1.5 rounded-full bg-brand-green/35 blur-md animate-pulse pointer-events-none" />
                )}

                {/* Main Ultra-Rounded Price Pill */}
                <div
                  className={`relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all duration-300 backdrop-blur-xl ${
                    isHighlighted
                      ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 ring-2 ring-brand-green shadow-[0_10px_28px_rgba(0,0,0,0.45)]'
                      : isSale
                      ? 'bg-zinc-900/92 text-white border border-amber-400/50 shadow-[0_6px_18px_rgba(0,0,0,0.22)] hover:bg-zinc-950'
                      : 'bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-white border border-zinc-200/90 dark:border-white/15 shadow-[0_6px_18px_rgba(0,0,0,0.16)] hover:border-brand-green/60'
                  }`}
                >
                  {/* Offer Type / Top Property Dot */}
                  {property.topProperty ? (
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                  ) : (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isHighlighted
                          ? 'bg-brand-green animate-ping'
                          : isSale
                          ? 'bg-amber-400'
                          : 'bg-brand-green'
                      }`}
                    />
                  )}

                  {/* Price Text (Thin/Medium futuristic typography) */}
                  <span className="text-xs sm:text-[13px] font-medium tracking-tight whitespace-nowrap leading-none">
                    {formattedPrice}{' '}
                    <span className="text-[10px] font-light opacity-75">Ar</span>
                  </span>

                  {/* Subtle Room Count Tag */}
                  {property.rooms > 0 && (
                    <span
                      className={`text-[10px] font-light px-1.5 py-0.5 rounded-full leading-none ${
                        isHighlighted
                          ? 'bg-white/15 dark:bg-zinc-900/15 text-emerald-300 dark:text-brand-green'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {property.rooms}p
                    </span>
                  )}
                </div>

                {/* Pointer Stem */}
                <div
                  className={`w-2 h-2 rotate-45 -mt-1 transition-colors duration-300 ${
                    isHighlighted
                      ? 'bg-zinc-950 dark:bg-white'
                      : isSale
                      ? 'bg-zinc-900/92'
                      : 'bg-white/95 dark:bg-zinc-900/95'
                  }`}
                />
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>

      {/* ── Radar Click Mode Floating Banner ── */}
      {isRadarClickMode && (
        <div className="absolute top-32 sm:top-36 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md pointer-events-auto animate-glass-island">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 rounded-full bg-zinc-950/90 dark:bg-white/95 text-white dark:text-zinc-950 backdrop-blur-2xl border border-brand-green/50 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-green text-white animate-pulse">
                <Radar className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-normal tracking-wide truncate">
                  Mode Radar Géographique Actif
                </p>
                <p className="text-[11px] font-light opacity-75 truncate">
                  Touchez un point sur la carte pour cibler cette zone
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSetRadarClickMode(false)}
              className="px-4 py-2 rounded-full bg-white/15 dark:bg-zinc-900/10 hover:bg-white/25 text-xs font-light tracking-wider transition-all cursor-pointer shrink-0"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Floating Right-Side Futuristic Map Control Capsule ── */}
      <div className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2.5 pointer-events-auto">
        {/* 1. Place Radar Zone on Map */}
        <button
          type="button"
          onClick={() => onSetRadarClickMode(!isRadarClickMode)}
          title="Cibler une zone radar sur la carte"
          className={`group flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full backdrop-blur-2xl border transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.14)] ${
            isRadarClickMode || (searchCoords && searchRadius > 0)
              ? 'bg-brand-green text-white border-white/40 shadow-[0_8px_28px_rgba(124,189,30,0.45)]'
              : 'bg-white/85 dark:bg-zinc-900/85 text-zinc-800 dark:text-zinc-100 border-white/80 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          <Radar className={`w-5 h-5 ${isRadarClickMode ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`} />
        </button>

        {/* 2. My GPS Position */}
        <button
          type="button"
          onClick={() => onLocateUser(true)}
          disabled={isLocatingUser}
          title="Rechercher autour de ma position GPS"
          className={`group flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full backdrop-blur-2xl border transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.14)] ${
            userLocation
              ? 'bg-blue-600 text-white border-white/40'
              : 'bg-white/85 dark:bg-zinc-900/85 text-zinc-800 dark:text-zinc-100 border-white/80 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          <Crosshair
            className={`w-5 h-5 ${
              isLocatingUser ? 'animate-spin text-brand-green' : 'group-hover:scale-110 transition-transform'
            }`}
          />
        </button>

        {/* 3. Map Type Switcher (Roadmap / Satellite Hybrid) */}
        <button
          type="button"
          onClick={onToggleMapType}
          title={mapTypeId === 'roadmap' ? 'Passer en vue Satellite' : 'Passer en vue Plan'}
          className={`group flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full backdrop-blur-2xl border transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.14)] ${
            mapTypeId === 'hybrid'
              ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-white/30'
              : 'bg-white/85 dark:bg-zinc-900/85 text-zinc-800 dark:text-zinc-100 border-white/80 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          <Layers className="w-5 h-5 group-hover:scale-110 transition-transform" />
        </button>

        {/* 4. Fit Bounds to All Results */}
        <button
          type="button"
          onClick={handleFitBounds}
          title="Recadrer sur les résultats"
          className="group flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full bg-white/85 dark:bg-zinc-900/85 text-zinc-800 dark:text-zinc-100 backdrop-blur-2xl border border-white/80 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.14)]"
        >
          <Maximize2 className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
        </button>

        {/* 5. Zoom In / Out Capsule (Desktop & Tablet) */}
        <div className="hidden sm:flex flex-col rounded-full bg-white/85 dark:bg-zinc-900/85 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_8px_28px_rgba(0,0,0,0.14)] overflow-hidden">
          <button
            type="button"
            onClick={() => handleZoomDelta(1)}
            title="Zoomer"
            className="flex h-11 w-12 items-center justify-center text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer border-b border-zinc-200/60 dark:border-white/10"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleZoomDelta(-1)}
            title="Dézoomer"
            className="flex h-11 w-12 items-center justify-center text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

