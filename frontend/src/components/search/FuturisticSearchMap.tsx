'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
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
import {
  useSearchStore,
  DEFAULT_ANTANANARIVO_CENTER,
} from '@/store/searchStore';

const GOOGLE_MAP_ID = '80e7a8f8db80acb5';

interface MapBoundsLiteral {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface PropertyClusterItem {
  id: string;
  isCluster: boolean;
  lat: number;
  lng: number;
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  hasTopProperty: boolean;
  bounds: MapBoundsLiteral;
  properties: any[];
  property?: any;
}

// Convert (lat, lng) into Web Mercator world pixel coordinates at a given zoom level
function latLngToWorldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const clampedSin = Math.max(-0.9999, Math.min(0.9999, sinLat));
  const y =
    (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

// Estimate fallback viewport bounds around center & zoom before Google Map fires its first idle event
function estimateBoundsFromCenterZoom(
  center: { lat: number; lng: number },
  zoom: number
): MapBoundsLiteral {
  // Approximate degree span for a typical screen at given zoom
  const latSpan = Math.min(15, 360 / Math.pow(2, Math.max(4, zoom - 1)));
  const lngSpan = Math.min(20, (360 / Math.pow(2, Math.max(4, zoom - 1))) * 1.4);
  return {
    north: center.lat + latSpan,
    south: center.lat - latSpan,
    east: center.lng + lngSpan,
    west: center.lng - lngSpan,
  };
}

// Fast O(N) spatial grid clustering + viewport culling
function computeViewportClusters(
  properties: any[],
  zoom: number,
  bounds: MapBoundsLiteral,
  selectedPropertyId: string | null
): PropertyClusterItem[] {
  if (!properties || properties.length === 0) return [];

  // Add 25% padding around viewport bounds so markers near screen edges don't pop during slight pans
  const latPad = Math.max(0.004, (bounds.north - bounds.south) * 0.25);
  const lngPad = Math.max(0.004, (bounds.east - bounds.west) * 0.25);
  const minLat = bounds.south - latPad;
  const maxLat = bounds.north + latPad;
  const minLng = bounds.west - lngPad;
  const maxLng = bounds.east + lngPad;

  // Determine pixel clustering radius based on zoom level
  const roundedZoom = Math.round(zoom);
  const shouldCluster = roundedZoom < 17;
  const clusterRadiusPx =
    roundedZoom <= 10
      ? 90
      : roundedZoom <= 12
      ? 76
      : roundedZoom === 13
      ? 64
      : roundedZoom === 14
      ? 54
      : roundedZoom === 15
      ? 44
      : roundedZoom === 16
      ? 32
      : 0;

  const radiusSq = clusterRadiusPx * clusterRadiusPx;

  interface InternalCluster {
    sumLat: number;
    sumLng: number;
    sumX: number;
    sumY: number;
    cx: number;
    cy: number;
    count: number;
    minPrice: number | null;
    maxPrice: number | null;
    hasTopProperty: boolean;
    bounds: MapBoundsLiteral;
    properties: any[];
  }

  const grid = new globalThis.Map<string, InternalCluster[]>();
  const clusters: InternalCluster[] = [];
  let standaloneSelectedItem: PropertyClusterItem | null = null;

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    const coords = prop._mapCoords || getPropertyMapCoords(prop);
    const { lat, lng } = coords;

    const isSelected = selectedPropertyId !== null && prop._id === selectedPropertyId;

    // Viewport culling (always keep selected property visible)
    if (
      !isSelected &&
      (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng)
    ) {
      continue;
    }

    const priceVal =
      prop._effectivePrice ??
      (prop.type === 'sale' ? Number(prop.price) || 0 : Number(prop.rent) || 0);

    // Keep the currently selected property as an unclustered individual badge so it's always highlighted
    if (isSelected) {
      standaloneSelectedItem = {
        id: `prop-${prop._id}`,
        isCluster: false,
        lat,
        lng,
        count: 1,
        minPrice: priceVal > 0 ? priceVal : null,
        maxPrice: priceVal > 0 ? priceVal : null,
        hasTopProperty: Boolean(prop.topProperty),
        bounds: { north: lat, south: lat, east: lng, west: lng },
        properties: [prop],
        property: prop,
      };
      continue;
    }

    if (!shouldCluster || clusterRadiusPx <= 0) {
      clusters.push({
        sumLat: lat,
        sumLng: lng,
        sumX: 0,
        sumY: 0,
        cx: 0,
        cy: 0,
        count: 1,
        minPrice: priceVal > 0 ? priceVal : null,
        maxPrice: priceVal > 0 ? priceVal : null,
        hasTopProperty: Boolean(prop.topProperty),
        bounds: { north: lat, south: lat, east: lng, west: lng },
        properties: [prop],
      });
      continue;
    }

    const { x, y } = latLngToWorldPixel(lat, lng, roundedZoom);
    const cellX = Math.floor(x / clusterRadiusPx);
    const cellY = Math.floor(y / clusterRadiusPx);

    let bestCluster: InternalCluster | null = null;
    let bestDistSq = radiusSq;

    // Search 3x3 neighboring grid cells for closest cluster centroid
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx}:${cellY + dy}`;
        const cellList = grid.get(key);
        if (!cellList) continue;
        for (let j = 0; j < cellList.length; j++) {
          const candidate = cellList[j];
          const dX = candidate.cx - x;
          const dY = candidate.cy - y;
          const distSq = dX * dX + dY * dY;
          if (distSq <= bestDistSq) {
            bestDistSq = distSq;
            bestCluster = candidate;
          }
        }
      }
    }

    if (bestCluster) {
      bestCluster.sumLat += lat;
      bestCluster.sumLng += lng;
      bestCluster.sumX += x;
      bestCluster.sumY += y;
      bestCluster.count += 1;
      bestCluster.cx = bestCluster.sumX / bestCluster.count;
      bestCluster.cy = bestCluster.sumY / bestCluster.count;
      if (priceVal > 0) {
        bestCluster.minPrice =
          bestCluster.minPrice === null
            ? priceVal
            : Math.min(bestCluster.minPrice, priceVal);
        bestCluster.maxPrice =
          bestCluster.maxPrice === null
            ? priceVal
            : Math.max(bestCluster.maxPrice, priceVal);
      }
      if (prop.topProperty) bestCluster.hasTopProperty = true;
      if (lat > bestCluster.bounds.north) bestCluster.bounds.north = lat;
      if (lat < bestCluster.bounds.south) bestCluster.bounds.south = lat;
      if (lng > bestCluster.bounds.east) bestCluster.bounds.east = lng;
      if (lng < bestCluster.bounds.west) bestCluster.bounds.west = lng;
      bestCluster.properties.push(prop);
    } else {
      const newCluster: InternalCluster = {
        sumLat: lat,
        sumLng: lng,
        sumX: x,
        sumY: y,
        cx: x,
        cy: y,
        count: 1,
        minPrice: priceVal > 0 ? priceVal : null,
        maxPrice: priceVal > 0 ? priceVal : null,
        hasTopProperty: Boolean(prop.topProperty),
        bounds: { north: lat, south: lat, east: lng, west: lng },
        properties: [prop],
      };
      clusters.push(newCluster);
      const cellKey = `${cellX}:${cellY}`;
      const existing = grid.get(cellKey);
      if (existing) {
        existing.push(newCluster);
      } else {
        grid.set(cellKey, [newCluster]);
      }
    }
  }

  // Cap rendered items to 90 max in viewport for guaranteed 60fps smoothness
  const result: PropertyClusterItem[] = [];
  if (standaloneSelectedItem) {
    result.push(standaloneSelectedItem);
  }

  const maxToRender = Math.min(clusters.length, 90);
  for (let i = 0; i < maxToRender; i++) {
    const c = clusters[i];
    if (c.count === 1) {
      const p = c.properties[0];
      result.push({
        id: `prop-${p._id}`,
        isCluster: false,
        lat: c.sumLat,
        lng: c.sumLng,
        count: 1,
        minPrice: c.minPrice,
        maxPrice: c.maxPrice,
        hasTopProperty: c.hasTopProperty,
        bounds: c.bounds,
        properties: c.properties,
        property: p,
      });
    } else {
      const avgLat = c.sumLat / c.count;
      const avgLng = c.sumLng / c.count;
      result.push({
        id: `cluster-${c.properties[0]._id}-${c.count}`,
        isCluster: true,
        lat: avgLat,
        lng: avgLng,
        count: c.count,
        minPrice: c.minPrice,
        maxPrice: c.maxPrice,
        hasTopProperty: c.hasTopProperty,
        bounds: c.bounds,
        properties: c.properties,
      });
    }
  }

  return result;
}

// ── Memoized Individual Property Price Pill Marker (High-contrast against map, NO green dot, NO expensive backdrop-blur) ──
const PropertyBadgeMarker = memo(function PropertyBadgeMarker({
  property,
  lat,
  lng,
  isSelected,
  onSelectProperty,
}: {
  property: any;
  lat: number;
  lng: number;
  isSelected: boolean;
  onSelectProperty: (property: any) => void;
}) {
  // Targeted subscription: only re-renders this specific marker if hovered from Split View card list
  const isHoveredFromList = useSearchStore(
    (s) => s.hoveredPropertyId !== null && s.hoveredPropertyId === property._id
  );
  const isHighlighted = isSelected || isHoveredFromList;

  const displayPrice = property.type === 'sale' ? property.price : property.rent;
  const formattedPrice = useMemo(() => formatCompactPrice(displayPrice), [displayPrice]);
  const isSale = property.type === 'sale';

  const handleClick = useCallback(() => {
    onSelectProperty(property);
  }, [onSelectProperty, property]);

  return (
    <AdvancedMarker
      position={{ lat, lng }}
      zIndex={isSelected ? 120 : isHoveredFromList ? 110 : property.topProperty ? 50 : 25}
      onClick={handleClick}
    >
      <div
        className={`group relative flex flex-col items-center cursor-pointer transition-transform duration-200 ease-out will-change-transform ${
          isHighlighted
            ? 'scale-115 -translate-y-1.5 z-50'
            : 'hover:scale-110 hover:-translate-y-1'
        }`}
      >
        {/* High-Contrast Ultra-Rounded Price Pill */}
        <div
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 ${
            isHighlighted
              ? 'bg-brand-green text-white border-2 border-white ring-4 ring-brand-green/40 shadow-[0_12px_28px_rgba(0,0,0,0.45),0_4px_10px_rgba(124,189,30,0.45)]'
              : isSale
              ? 'bg-zinc-900 text-white border-[1.5px] border-amber-400 ring-1 ring-black/30 shadow-[0_8px_20px_rgba(0,0,0,0.36),0_2px_6px_rgba(0,0,0,0.24)] group-hover:bg-zinc-950'
              : 'bg-zinc-900 text-white border-[1.5px] border-white ring-1 ring-black/25 shadow-[0_8px_20px_rgba(0,0,0,0.36),0_2px_6px_rgba(0,0,0,0.24)] group-hover:bg-zinc-950 group-hover:border-brand-green group-hover:ring-brand-green/40'
          }`}
        >
          {property.topProperty && (
            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          )}

          {/* Crisp Bold Price Text */}
          <span className="text-xs sm:text-[13px] font-semibold tracking-tight whitespace-nowrap leading-none">
            {formattedPrice}{' '}
            <span
              className={`text-[10px] font-normal ${
                isHighlighted ? 'text-white/90' : 'text-zinc-300'
              }`}
            >
              Ar
            </span>
          </span>

          {/* High-Contrast Room Count Tag */}
          {property.rooms > 0 && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${
                isHighlighted
                  ? 'bg-zinc-950 text-white'
                  : isSale
                  ? 'bg-amber-400 text-zinc-950'
                  : 'bg-brand-green text-white'
              }`}
            >
              {property.rooms}p
            </span>
          )}
        </div>

        {/* Distinct Pointer Stem */}
        <div
          className={`w-2.5 h-2.5 rotate-45 -mt-1.5 border-r border-b transition-colors duration-200 shadow-xs ${
            isHighlighted
              ? 'bg-brand-green border-white'
              : isSale
              ? 'bg-zinc-900 border-amber-400'
              : 'bg-zinc-900 border-white group-hover:border-brand-green'
          }`}
        />
      </div>
    </AdvancedMarker>
  );
});

// ── Memoized Spatial Cluster Marker ──
const PropertyClusterMarker = memo(function PropertyClusterMarker({
  cluster,
  onClusterClick,
}: {
  cluster: PropertyClusterItem;
  onClusterClick: (cluster: PropertyClusterItem) => void;
}) {
  const formattedMinPrice = useMemo(
    () => (cluster.minPrice ? formatCompactPrice(cluster.minPrice) : null),
    [cluster.minPrice]
  );

  const handleClick = useCallback(() => {
    onClusterClick(cluster);
  }, [onClusterClick, cluster]);

  // Size tier based on cluster density
  const isLarge = cluster.count >= 20;
  const isMedium = cluster.count >= 6 && cluster.count < 20;

  return (
    <AdvancedMarker
      position={{ lat: cluster.lat, lng: cluster.lng }}
      zIndex={cluster.count >= 20 ? 80 : cluster.count >= 6 ? 70 : 60}
      onClick={handleClick}
    >
      <div
        className="group relative flex flex-col items-center cursor-pointer transition-transform duration-200 ease-out hover:scale-110 active:scale-95 will-change-transform"
        title={`${cluster.count} biens dans cette zone — Cliquer pour zoomer`}
      >
        {/* High-Contrast Cluster Capsule */}
        <div
          className={`flex items-center gap-1.5 rounded-full bg-white text-zinc-950 border-2 border-brand-green ring-3 ring-brand-green/25 shadow-[0_10px_24px_rgba(0,0,0,0.34),0_2px_6px_rgba(0,0,0,0.2)] transition-all group-hover:bg-zinc-950 group-hover:text-white ${
            isLarge
              ? 'p-1.5 pr-3.5'
              : isMedium
              ? 'p-1 pr-3'
              : 'p-1 pr-2.5'
          }`}
        >
          {/* Count Badge */}
          <span
            className={`flex items-center justify-center rounded-full bg-brand-green text-white font-bold leading-none shrink-0 shadow-xs ${
              isLarge
                ? 'h-7 min-w-7 px-2 text-xs'
                : isMedium
                ? 'h-6 min-w-6 px-1.5 text-xs'
                : 'h-5.5 min-w-5.5 px-1.5 text-[11px]'
            }`}
          >
            {cluster.count}
          </span>

          {/* Min Price or Label */}
          <span className="text-[11px] sm:text-xs font-medium tracking-tight whitespace-nowrap leading-none">
            {formattedMinPrice ? (
              <>
                <span className="font-normal opacity-70">dès </span>
                <strong className="font-bold">{formattedMinPrice}</strong>
              </>
            ) : (
              <span>biens</span>
            )}
          </span>
        </div>

        {/* Pointer Stem */}
        <div className="w-2.5 h-2.5 rotate-45 -mt-1.5 bg-white group-hover:bg-zinc-950 border-r-2 border-b-2 border-brand-green transition-colors" />
      </div>
    </AdvancedMarker>
  );
});

interface FuturisticSearchMapProps {
  properties: any[];
  selectedPropertyId: string | null;
  hoveredPropertyId?: string | null;
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
  onViewportChange,
}: {
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  selectedProperty: any | null;
  onViewportChange: (zoom: number, bounds: MapBoundsLiteral) => void;
}) {
  const map = useMap();
  const prevCenterRef = useRef<string>('');
  const prevSelectedIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  // Listen to map idle and zoom_changed for viewport culling & clustering
  useEffect(() => {
    if (!map) return;

    const syncViewport = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        const z = map.getZoom() ?? 13;
        const b = map.getBounds();
        if (b) {
          const ne = b.getNorthEast();
          const sw = b.getSouthWest();
          onViewportChange(z, {
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
          });
        }
      });
    };

    const idleListener = map.addListener('idle', syncViewport);
    const zoomListener = map.addListener('zoom_changed', syncViewport);
    syncViewport();

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      idleListener.remove();
      zoomListener.remove();
    };
  }, [map, onViewportChange]);

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
  onSelectProperty,
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

  const [viewport, setViewport] = useState<{
    zoom: number;
    bounds: MapBoundsLiteral;
  }>(() => ({
    zoom: mapZoom || 13,
    bounds: estimateBoundsFromCenterZoom(
      mapCenter || DEFAULT_ANTANANARIVO_CENTER,
      mapZoom || 13
    ),
  }));

  const handleViewportChange = useCallback(
    (newZoom: number, newBounds: MapBoundsLiteral) => {
      setViewport((prev) => {
        const zoomChanged = Math.round(prev.zoom) !== Math.round(newZoom);
        const latSpan = Math.max(0.0001, prev.bounds.north - prev.bounds.south);
        const lngSpan = Math.max(0.0001, prev.bounds.east - prev.bounds.west);
        const movedSignificantly =
          Math.abs(prev.bounds.north - newBounds.north) > latSpan * 0.12 ||
          Math.abs(prev.bounds.west - newBounds.west) > lngSpan * 0.12;

        if (!zoomChanged && !movedSignificantly) {
          return prev;
        }
        return { zoom: newZoom, bounds: newBounds };
      });
    },
    []
  );

  // Compute spatial clusters & viewport-culled markers in <0.5ms
  const clusteredItems = useMemo(() => {
    return computeViewportClusters(
      properties,
      viewport.zoom,
      viewport.bounds,
      selectedPropertyId
    );
  }, [properties, viewport.zoom, viewport.bounds, selectedPropertyId]);

  const selectedProperty = useMemo(() => {
    if (!selectedPropertyId) return null;
    return properties.find((p) => p._id === selectedPropertyId) || null;
  }, [properties, selectedPropertyId]);

  // Handle clicking a cluster: smoothly zoom into its bounds or expand
  const handleClusterClick = useCallback(
    (cluster: PropertyClusterItem) => {
      if (!map) return;
      const currentZoom = map.getZoom() || viewport.zoom || 13;
      const latSpan = Math.abs(cluster.bounds.north - cluster.bounds.south);
      const lngSpan = Math.abs(cluster.bounds.east - cluster.bounds.west);

      // If all properties in the cluster are at the exact same coordinates or already zoomed in deep
      if (currentZoom >= 16 || (latSpan < 0.0006 && lngSpan < 0.0006)) {
        if (currentZoom < 17) {
          map.panTo({ lat: cluster.lat, lng: cluster.lng });
          map.setZoom(Math.min(18, currentZoom + 2));
        } else if (cluster.properties.length > 0) {
          onSelectProperty(cluster.properties[0]);
        }
        return;
      }

      if (typeof window !== 'undefined' && window.google?.maps) {
        const gBounds = new window.google.maps.LatLngBounds(
          { lat: cluster.bounds.south, lng: cluster.bounds.west },
          { lat: cluster.bounds.north, lng: cluster.bounds.east }
        );
        map.fitBounds(gBounds, {
          top: 140,
          bottom: 200,
          left: 60,
          right: 60,
        });
      } else {
        map.panTo({ lat: cluster.lat, lng: cluster.lng });
        map.setZoom(Math.min(17, currentZoom + 2));
      }
    },
    [map, viewport.zoom, onSelectProperty]
  );

  // Fit bounds to all currently filtered properties
  const handleFitBounds = useCallback(() => {
    if (
      !map ||
      properties.length === 0 ||
      typeof window === 'undefined' ||
      !window.google?.maps
    ) {
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
    properties.slice(0, 80).forEach((prop) => {
      const coords = prop._mapCoords || getPropertyMapCoords(prop);
      bounds.extend({ lat: coords.lat, lng: coords.lng });
    });

    map.fitBounds(bounds, {
      top: 130,
      bottom: 220,
      left: 40,
      right: 60,
    });
  }, [map, properties, searchCoords, searchRadius]);

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
          onViewportChange={handleViewportChange}
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
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-950/95 text-white border border-brand-green/60 shadow-[0_8px_24px_rgba(124,189,30,0.4)]">
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

        {/* ── 3. Spatial Clustered & Viewport-Culled Property Badges ── */}
        {clusteredItems.map((item) => {
          if (item.isCluster) {
            return (
              <PropertyClusterMarker
                key={item.id}
                cluster={item}
                onClusterClick={handleClusterClick}
              />
            );
          }

          const prop = item.property;
          return (
            <PropertyBadgeMarker
              key={item.id}
              property={prop}
              lat={item.lat}
              lng={item.lng}
              isSelected={selectedPropertyId === prop._id}
              onSelectProperty={onSelectProperty}
            />
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

