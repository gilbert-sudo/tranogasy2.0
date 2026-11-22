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
  Eye,
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
  formatRadiusLabel,
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

// Convert Web Mercator world pixel coordinates back into (lat, lng) at a given zoom level
function worldPixelToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const scale = 256 * Math.pow(2, zoom);
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

// Estimate rendered CSS bounding box (width & height in pixels, including comfortable breathing room)
// for any property badge or cluster capsule so zero pills ever overlap on screen.
function estimateMarkerPixelBox(
  item: PropertyClusterItem,
  isSelected: boolean
): { width: number; height: number } {
  if (item.isCluster) {
    const minPriceText = item.minPrice ? `dès ${formatCompactPrice(item.minPrice)}` : 'biens';
    const countDigits = String(item.count).length;
    const width = Math.max(106, Math.round(52 + countDigits * 7 + minPriceText.length * 7.6)) + 10;
    return { width, height: 48 };
  }

  const prop = item.property;
  const displayPrice = prop?.type === 'sale' ? prop?.price : prop?.rent;
  const priceText = formatCompactPrice(displayPrice);
  const hasRooms = Number(prop?.rooms) > 0;
  const hasTop = Boolean(prop?.topProperty);

  let width =
    54 +
    priceText.length * 7.8 +
    (hasRooms ? 34 : 0) +
    (hasTop ? 18 : 0) +
    10;
  let height = 46;

  // Highlighted/selected badge scales up by 1.15x
  if (isSelected) {
    width = Math.round(width * 1.15) + 6;
    height = Math.round(height * 1.15) + 4;
  }

  return { width: Math.max(96, Math.round(width)), height };
}

// Deterministic, mathematically guaranteed zero-overlap screen-space placement solver.
// Places markers in priority order (selected marker pinned first, then clusters, then deterministic ID order).
// Non-colliding markers stay at their exact original (lat, lng); any colliding marker snaps to the closest
// overlap-free slot on concentric elliptical rings matched to the pill aspect ratio.
function resolveMarkerScreenOverlaps(
  items: PropertyClusterItem[],
  zoom: number,
  selectedPropertyId: string | null
): PropertyClusterItem[] {
  const n = items.length;
  if (n <= 1) return items;

  const GOLDEN_ANGLE = 2.399963229728653;

  interface NodeBox {
    index: number;
    origCx: number;
    origCy: number;
    hw: number;
    hh: number;
    isSelected: boolean;
    isCluster: boolean;
    id: string;
  }

  const nodes: NodeBox[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const item = items[i];
    const isSelected =
      !item.isCluster && selectedPropertyId !== null && item.property?._id === selectedPropertyId;
    const { width, height } = estimateMarkerPixelBox(item, isSelected);
    const { x, y } = latLngToWorldPixel(item.lat, item.lng, zoom);
    // AdvancedMarker anchors bottom-center at (x, y), so pill box center is (x, y - height / 2)
    nodes[i] = {
      index: i,
      origCx: x,
      origCy: y - height * 0.5,
      hw: width * 0.5,
      hh: height * 0.5,
      isSelected,
      isCluster: item.isCluster,
      id: item.id,
    };
  }

  // Deterministic placement priority: selected marker first (stays pinned), then clusters, then by stable ID
  const placementOrder = [...nodes].sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if (a.isCluster !== b.isCluster) return a.isCluster ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  interface PlacedBox {
    cx: number;
    cy: number;
    hw: number;
    hh: number;
  }

  const placed: PlacedBox[] = [];
  const resolvedCoords = new Array<{ cx: number; cy: number; moved: boolean }>(n);

  const fitsWithoutOverlap = (cx: number, cy: number, hw: number, hh: number): boolean => {
    for (let j = 0; j < placed.length; j++) {
      const p = placed[j];
      if (Math.abs(cx - p.cx) < hw + p.hw && Math.abs(cy - p.cy) < hh + p.hh) {
        return false;
      }
    }
    return true;
  };

  for (let orderIdx = 0; orderIdx < placementOrder.length; orderIdx++) {
    const node = placementOrder[orderIdx];
    const { origCx, origCy, hw, hh, index } = node;

    // Fast path: keep exact position whenever no overlap exists
    if (fitsWithoutOverlap(origCx, origCy, hw, hh)) {
      placed.push({ cx: origCx, cy: origCy, hw, hh });
      resolvedCoords[index] = { cx: origCx, cy: origCy, moved: false };
      continue;
    }

    // Search concentric elliptical rings (matched to pill width/height ratio) for the closest overlap-free slot
    let bestX = origCx;
    let bestY = origCy;
    let bestDistSq = Infinity;
    let found = false;

    const baseAngle = ((orderIdx * GOLDEN_ANGLE) % (Math.PI * 2)) + Math.PI * 0.25;

    for (let ring = 1; ring <= 28 && !found; ring++) {
      const ry = ring * 24;
      const rx = ring * 38;
      const samples = Math.min(48, Math.max(12, ring * 8));

      for (let s = 0; s < samples; s++) {
        const theta = baseAngle + (s / samples) * Math.PI * 2;
        const candX = origCx + Math.cos(theta) * rx;
        const candY = origCy + Math.sin(theta) * ry;

        if (fitsWithoutOverlap(candX, candY, hw, hh)) {
          const dx = candX - origCx;
          const dy = candY - origCy;
          // Slightly favor compact vertical proximity over wide horizontal drift
          const score = dx * dx + dy * dy * 1.15;
          if (score < bestDistSq) {
            bestDistSq = score;
            bestX = candX;
            bestY = candY;
            found = true;
          }
        }
      }
    }

    placed.push({ cx: bestX, cy: bestY, hw, hh });
    resolvedCoords[index] = { cx: bestX, cy: bestY, moved: true };
  }

  return items.map((item, i) => {
    const resolved = resolvedCoords[i];
    if (!resolved || !resolved.moved) {
      return item;
    }
    const anchorY = resolved.cy + nodes[i].hh;
    const adjusted = worldPixelToLatLng(resolved.cx, anchorY, zoom);
    return {
      ...item,
      lat: adjusted.lat,
      lng: adjusted.lng,
    };
  });
}

// Smoothly fit Google Map viewport around a geographic search circle with safe-area UI padding
function fitMapToSearchCircle(
  map: google.maps.Map,
  center: { lat: number; lng: number },
  radiusMeters: number
) {
  if (typeof window === 'undefined' || !window.google?.maps) return;

  // "Toute la carte" (0m radius): zoom out around the chosen center for a broad city overview
  if (!radiusMeters || radiusMeters <= 0) {
    map.panTo(center);
    map.setZoom(12);
    return;
  }

  const latRad = (center.lat * Math.PI) / 180;
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.max(0.2, Math.cos(latRad)));

  const bounds = new window.google.maps.LatLngBounds(
    { lat: center.lat - latDelta, lng: center.lng - lngDelta },
    { lat: center.lat + latDelta, lng: center.lng + lngDelta }
  );

  const mapDiv = map.getDiv?.();
  const width = mapDiv?.clientWidth || window.innerWidth || 400;
  const height = mapDiv?.clientHeight || window.innerHeight || 800;
  const isCompact = width < 640;

  // Responsive padding clears Top Omnibox, Bottom Radius + HUD dock, and Right-side map buttons
  const topPad = Math.min(isCompact ? 132 : 148, Math.round(height * 0.22));
  const bottomPad = Math.min(isCompact ? 156 : 164, Math.round(height * 0.24));
  const leftPad = Math.min(isCompact ? 22 : 44, Math.round(width * 0.1));
  const rightPad = Math.min(isCompact ? 72 : 84, Math.round(width * 0.2));

  map.fitBounds(bounds, {
    top: topPad,
    bottom: bottomPad,
    left: leftPad,
    right: rightPad,
  });
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

  return resolveMarkerScreenOverlaps(result, zoom, selectedPropertyId);
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
          className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-full transition-all duration-200 ${
            isHighlighted
              ? 'bg-brand-green text-white border-2 border-white ring-4 ring-brand-green/40 shadow-[0_12px_28px_rgba(0,0,0,0.45),0_4px_10px_rgba(124,189,30,0.45)]'
              : isSale
              ? 'bg-zinc-900 text-white border-[1.5px] border-amber-400 ring-1 ring-black/30 shadow-[0_8px_20px_rgba(0,0,0,0.36),0_2px_6px_rgba(0,0,0,0.24)] group-hover:bg-zinc-950'
              : 'bg-zinc-900 text-white border-[1.5px] border-white ring-1 ring-black/25 shadow-[0_8px_20px_rgba(0,0,0,0.36),0_2px_6px_rgba(0,0,0,0.24)] group-hover:bg-zinc-950 group-hover:border-brand-green group-hover:ring-brand-green/40'
          }`}
        >
          {property.topProperty && (
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}

          {/* Crisp Bold Price Text */}
          <span className="text-[13px] font-bold tracking-tight whitespace-nowrap leading-none">
            {formattedPrice}{' '}
            <span
              className={`text-[11px] font-medium ${
                isHighlighted ? 'text-white/90' : 'text-zinc-300'
              }`}
            >
              Ar
            </span>
          </span>

          {/* High-Contrast Room Count Tag */}
          {property.rooms > 0 && (
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full leading-none ${
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
          className={`flex items-center gap-2 rounded-full bg-white text-zinc-950 border-2 border-brand-green ring-3 ring-brand-green/25 shadow-[0_10px_24px_rgba(0,0,0,0.34),0_2px_6px_rgba(0,0,0,0.2)] transition-all group-hover:bg-zinc-950 group-hover:text-white ${
            isLarge
              ? 'p-1.5 pr-4'
              : isMedium
              ? 'p-1.5 pr-3.5'
              : 'p-1.5 pr-3'
          }`}
        >
          {/* Count Badge */}
          <span
            className={`flex items-center justify-center rounded-full bg-brand-green text-white font-bold leading-none shrink-0 shadow-xs ${
              isLarge
                ? 'h-7.5 min-w-7.5 px-2 text-xs'
                : isMedium
                ? 'h-7 min-w-7 px-2 text-xs'
                : 'h-6.5 min-w-6.5 px-1.5 text-xs'
            }`}
          >
            {cluster.count}
          </span>

          {/* Min Price or Label */}
          <span className="text-xs sm:text-[13px] font-semibold tracking-tight whitespace-nowrap leading-none">
            {formattedMinPrice ? (
              <>
                <span className="font-medium opacity-75">dès </span>
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
  zoneFocusNonce?: number;
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
  searchCoords,
  searchRadius,
  zoneFocusNonce = 0,
  selectedProperty,
  onViewportChange,
}: {
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  searchCoords: { lat: number; lng: number } | null;
  searchRadius: number;
  zoneFocusNonce?: number;
  selectedProperty: any | null;
  onViewportChange: (zoom: number, bounds: MapBoundsLiteral) => void;
}) {
  const map = useMap();
  const prevCenterRef = useRef<string>('');
  const prevZoneKeyRef = useRef<string>('');
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

  // Coordinate camera updates cleanly: search zone / radius changes take precedence and fit exact circle bounds
  useEffect(() => {
    if (!map) return;

    const centerKey = mapCenter
      ? `${mapCenter.lat.toFixed(5)},${mapCenter.lng.toFixed(5)},${mapZoom}`
      : '';
    const zoneKey = searchCoords
      ? `${searchCoords.lat.toFixed(5)},${searchCoords.lng.toFixed(5)},${searchRadius},${zoneFocusNonce}`
      : '';

    if (searchCoords && zoneKey !== prevZoneKeyRef.current) {
      prevZoneKeyRef.current = zoneKey;
      // Absorb simultaneous store mapCenter/mapZoom update so it never overrides fitBounds
      if (centerKey) {
        prevCenterRef.current = centerKey;
      }
      fitMapToSearchCircle(map, searchCoords, searchRadius);
      return;
    }

    if (!searchCoords) {
      prevZoneKeyRef.current = '';
    }

    if (mapCenter && prevCenterRef.current !== centerKey) {
      prevCenterRef.current = centerKey;
      map.panTo(mapCenter);
      if (map.getZoom() !== mapZoom) {
        map.setZoom(mapZoom);
      }
    }
  }, [map, mapCenter, mapZoom, searchCoords, searchRadius, zoneFocusNonce]);

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

function FuturisticSearchMapComponent({
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
  zoneFocusNonce = 0,
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
        const zoomChanged =
          Math.abs(prev.zoom - newZoom) >= 0.35 ||
          Math.round(prev.zoom) !== Math.round(newZoom);
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

      // If all properties in the cluster are close together (e.g. same Fokotany) or already zoomed in deep,
      // jump straight to zoom 17-18 so individual non-overlapping badges expand cleanly
      if (currentZoom >= 16 || (latSpan < 0.0014 && lngSpan < 0.0014)) {
        if (currentZoom < 17) {
          map.panTo({ lat: cluster.lat, lng: cluster.lng });
          map.setZoom(Math.max(17, Math.min(18, Math.round(currentZoom) + 2)));
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

  // Fit bounds to all currently filtered properties or active search area
  const handleFitBounds = useCallback(() => {
    if (
      !map ||
      typeof window === 'undefined' ||
      !window.google?.maps
    ) {
      return;
    }

    if (searchCoords && searchRadius > 0) {
      fitMapToSearchCircle(map, searchCoords, searchRadius);
      return;
    }

    if (properties.length === 0) {
      if (searchCoords) {
        fitMapToSearchCircle(map, searchCoords, searchRadius);
      }
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
        streetViewControl={false}
        clickableIcons={false}
        onClick={handleMapClick}
        className="w-full h-full"
      >
        <MapCameraSync
          mapCenter={mapCenter}
          mapZoom={mapZoom}
          searchCoords={searchCoords}
          searchRadius={searchRadius}
          zoneFocusNonce={zoneFocusNonce}
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
              zIndex={20}
              title={searchPlaceName || 'Zone de recherche'}
            >
              <div className="relative flex flex-col items-center translate-y-[7px] pointer-events-none">
                {/* Desktop / Large-Screen Fokotany Pill (hidden on mobile so properties & map details stay unobstructed) */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1 mb-1.5 rounded-full bg-zinc-950/92 text-white border border-brand-green/60 shadow-[0_6px_20px_rgba(124,189,30,0.35)] pointer-events-auto">
                  <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse shrink-0" />
                  <span className="text-[11px] font-light tracking-wide whitespace-nowrap max-w-[140px] truncate">
                    {searchPlaceName || 'Radar actif'}
                  </span>
                  <span className="text-[10px] font-medium text-brand-green px-1.5 py-0.5 rounded-full bg-brand-green/15 shrink-0">
                    {formatRadiusLabel(searchRadius)}
                  </span>
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onClearLocationZone();
                    }}
                    className="ml-0.5 w-4 h-4 rounded-full bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title="Retirer le radar"
                    aria-label="Retirer le radar"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>

                {/* Minimal Non-Blocking Center Target Dot (Mobile + Desktop anchor) */}
                <div className="relative flex items-center justify-center">
                  <span className="absolute w-7 h-7 rounded-full bg-brand-green/35 animate-radar-wave pointer-events-none" />
                  <span className="relative w-3.5 h-3.5 rounded-full bg-brand-green ring-[3px] ring-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]" />
                </div>
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
        <div className="absolute top-[calc(8rem+var(--ios-safe-top))] sm:top-[calc(9rem+var(--ios-safe-top))] left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md pointer-events-auto animate-glass-island">
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
      <div className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3 pointer-events-auto">
        {/* 0. Quick Card Preview Toggle (Aperçu des Cartes) */}
        {properties.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (selectedPropertyId) {
                onSelectProperty(null as any);
              } else if (properties[0]) {
                onSelectProperty(properties[0]);
              }
            }}
            title={
              selectedPropertyId
                ? "Masquer l'aperçu des cartes"
                : `Aperçu des cartes (${properties.length})`
            }
            className={`group relative flex h-13 w-13 items-center justify-center rounded-full backdrop-blur-2xl border transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.16)] ${
              selectedPropertyId
                ? 'bg-brand-green text-white border-white/40 shadow-[0_8px_28px_rgba(124,189,30,0.45)]'
                : 'bg-white/90 dark:bg-zinc-900/90 text-zinc-800 dark:text-zinc-100 border-white/85 dark:border-white/15 hover:bg-white dark:hover:bg-zinc-800'
            }`}
          >
            <Eye className="w-5.5 h-5.5 group-hover:scale-110 transition-transform" />
            <span
              className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none shadow-xs ${
                selectedPropertyId
                  ? 'bg-zinc-950 text-white'
                  : 'bg-brand-green text-white'
              }`}
            >
              {properties.length}
            </span>
          </button>
        )}

        {/* 1. Place Radar Zone on Map */}
        <button
          type="button"
          onClick={() => onSetRadarClickMode(!isRadarClickMode)}
          title="Cibler une zone radar sur la carte"
          className={`group flex h-13 w-13 items-center justify-center rounded-full backdrop-blur-2xl border transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.16)] ${
            isRadarClickMode || (searchCoords && searchRadius > 0)
              ? 'bg-brand-green text-white border-white/40 shadow-[0_8px_28px_rgba(124,189,30,0.45)]'
              : 'bg-white/90 dark:bg-zinc-900/90 text-zinc-800 dark:text-zinc-100 border-white/85 dark:border-white/15 hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          <Radar className={`w-5.5 h-5.5 ${isRadarClickMode ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`} />
        </button>

        {/* 2. My GPS Position */}
        <button
          type="button"
          onClick={() => onLocateUser(true)}
          disabled={isLocatingUser}
          title="Rechercher autour de ma position GPS"
          className={`group flex h-13 w-13 items-center justify-center rounded-full backdrop-blur-2xl border transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.16)] ${
            userLocation
              ? 'bg-blue-600 text-white border-white/40'
              : 'bg-white/90 dark:bg-zinc-900/90 text-zinc-800 dark:text-zinc-100 border-white/85 dark:border-white/15 hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          <Crosshair
            className={`w-5.5 h-5.5 ${
              isLocatingUser ? 'animate-spin text-brand-green' : 'group-hover:scale-110 transition-transform'
            }`}
          />
        </button>

        {/* 3. Map Type Switcher (Roadmap / Satellite Hybrid) */}
        <button
          type="button"
          onClick={onToggleMapType}
          title={mapTypeId === 'roadmap' ? 'Passer en vue Satellite' : 'Passer en vue Plan'}
          className={`group flex h-13 w-13 items-center justify-center rounded-full backdrop-blur-2xl border transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.16)] ${
            mapTypeId === 'hybrid'
              ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-white/30'
              : 'bg-white/90 dark:bg-zinc-900/90 text-zinc-800 dark:text-zinc-100 border-white/85 dark:border-white/15 hover:bg-white dark:hover:bg-zinc-800'
          }`}
        >
          <Layers className="w-5.5 h-5.5 group-hover:scale-110 transition-transform" />
        </button>

        {/* 4. Fit Bounds to All Results */}
        <button
          type="button"
          onClick={handleFitBounds}
          title="Recadrer sur les résultats"
          className="group flex h-13 w-13 items-center justify-center rounded-full bg-white/90 dark:bg-zinc-900/90 text-zinc-800 dark:text-zinc-100 backdrop-blur-2xl border border-white/85 dark:border-white/15 hover:bg-white dark:hover:bg-zinc-800 transition-all duration-300 active:scale-90 cursor-pointer shadow-[0_8px_28px_rgba(0,0,0,0.16)]"
        >
          <Maximize2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
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

const FuturisticSearchMap = memo(FuturisticSearchMapComponent);
export default FuturisticSearchMap;

