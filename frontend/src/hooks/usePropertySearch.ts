import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { propertyService } from '@/services/property.service';
import { cityService, removeDiacritics } from '@/services/city.service';
import { usePropertyStore } from '@/store/propertyStore';
import { useSearchStore, DEFAULT_ANTANANARIVO_CENTER } from '@/store/searchStore';
import {
  computePropertyCategoryFlags,
  mapCategoryQueryParam,
  matchesComputedCategory,
} from '@/lib/propertyTypes';

// Fast inline Haversine distance in meters (avoids geolib object allocation overhead in tight loops)
const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6371000;

export function fastDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat * 0.5) * Math.sin(dLat * 0.5) +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLng * 0.5) *
      Math.sin(dLng * 0.5);
  return Math.round(EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Deterministic hash for a string (property._id) -> [0, 1)
function deterministicHash(str: string, seed = 0): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

const METERS_PER_DEG_LAT = 111320;
const GOLDEN_ANGLE_RAD = 2.399963229728653; // ~137.508 deg (Vogel/phyllotaxis optimal packing)
const COLOCATION_GROUP_RADIUS_M = 35; // Group identical or few-meter-apart properties
const SPIRAL_STEP_METERS = 44; // Yields ~68-75m minimum spacing between nearest neighbors

export interface MapCoordPoint {
  lat: number;
  lng: number;
  isApproximate: boolean;
}

interface CoordLikeProperty {
  _id?: string;
  _mapCoords?: unknown;
  coords?: unknown;
  city?: { coords?: unknown } | null;
}

function isValidCoordPair(coords: unknown): coords is { lat: number; lng: number } {
  if (!coords || typeof coords !== 'object') return false;
  const { lat, lng } = coords as { lat?: unknown; lng?: unknown };
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    (lat !== 0 || lng !== 0)
  );
}

// Extract the property's true un-dispersed base coordinates (used for accurate distance & radius filtering)
export function getPropertyBaseCoords(property: CoordLikeProperty | null | undefined): MapCoordPoint {
  if (isValidCoordPair(property?.coords)) {
    return {
      lat: property.coords.lat,
      lng: property.coords.lng,
      isApproximate: false,
    };
  }

  if (isValidCoordPair(property?.city?.coords)) {
    return {
      lat: property.city.coords.lat,
      lng: property.city.coords.lng,
      isApproximate: true,
    };
  }

  return {
    lat: DEFAULT_ANTANANARIVO_CENTER.lat,
    lng: DEFAULT_ANTANANARIVO_CENTER.lng,
    isApproximate: true,
  };
}

// Deterministic non-overlapping geographic dispersion for properties sharing identical or near-identical (<35m) coordinates.
// Uses an O(N) spatial grid anchor grouping (sorted by _id for full determinism) + metric Vogel golden-angle spiral.
export function buildDispersedMapCoordsLookup(
  properties: ReadonlyArray<CoordLikeProperty | null | undefined>
): { baseById: Map<string, MapCoordPoint>; mapById: Map<string, MapCoordPoint> } {
  const baseById = new Map<string, MapCoordPoint>();
  const mapById = new Map<string, MapCoordPoint>();

  if (!properties || properties.length === 0) {
    return { baseById, mapById };
  }

  interface Entry {
    id: string;
    base: MapCoordPoint;
  }

  const entries: Entry[] = [];
  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    if (!prop) continue;
    const id = String(prop._id || `idx-${i}`);
    const base = getPropertyBaseCoords(prop);
    baseById.set(id, base);
    entries.push({ id, base });
  }

  // Sort deterministically by ID so groups and spiral slots never jump across renders or API ordering changes
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  interface AnchorGroup {
    anchorLat: number;
    anchorLng: number;
    sumLat: number;
    sumLng: number;
    members: Entry[];
  }

  const cellDeg = COLOCATION_GROUP_RADIUS_M / METERS_PER_DEG_LAT; // ~0.000314 deg
  const grid = new Map<string, AnchorGroup[]>();
  const groups: AnchorGroup[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { lat, lng } = entry.base;
    const cellX = Math.floor(lng / cellDeg);
    const cellY = Math.floor(lat / cellDeg);

    let bestGroup: AnchorGroup | null = null;
    let bestDist = COLOCATION_GROUP_RADIUS_M;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(`${cellX + dx}:${cellY + dy}`);
        if (!bucket) continue;
        for (let j = 0; j < bucket.length; j++) {
          const candidate = bucket[j];
          const d = fastDistanceMeters(lat, lng, candidate.anchorLat, candidate.anchorLng);
          if (d <= bestDist) {
            bestDist = d;
            bestGroup = candidate;
          }
        }
      }
    }

    if (bestGroup) {
      bestGroup.members.push(entry);
      bestGroup.sumLat += lat;
      bestGroup.sumLng += lng;
    } else {
      const newGroup: AnchorGroup = {
        anchorLat: lat,
        anchorLng: lng,
        sumLat: lat,
        sumLng: lng,
        members: [entry],
      };
      groups.push(newGroup);
      const key = `${cellX}:${cellY}`;
      const existing = grid.get(key);
      if (existing) {
        existing.push(newGroup);
      } else {
        grid.set(key, [newGroup]);
      }
    }
  }

  // Assign non-overlapping spiral positions for every multi-property group
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const count = group.members.length;

    if (count === 1) {
      const solo = group.members[0];
      mapById.set(solo.id, solo.base);
      continue;
    }

    const centerLat = group.sumLat / count;
    const centerLng = group.sumLng / count;
    const cosLat = Math.max(0.2, Math.cos(centerLat * DEG_TO_RAD));

    // Seed initial rotation angle deterministically from the group anchor so neighboring Fokotany look organic
    const groupPhase =
      deterministicHash(`${centerLat.toFixed(4)}:${centerLng.toFixed(4)}`, 7) * Math.PI * 2;

    for (let k = 0; k < count; k++) {
      const member = group.members[k];
      let radiusMeters: number;
      let angle: number;

      if (count === 2) {
        // Place pairs symmetrically on opposite sides (~72m apart)
        radiusMeters = 36;
        angle = groupPhase + (k === 0 ? 0 : Math.PI);
      } else {
        // Vogel golden-angle phyllotaxis spiral: mathematically optimal uniform packing with ~68-75m spacing
        radiusMeters = SPIRAL_STEP_METERS * Math.sqrt(k + 0.6);
        angle = groupPhase + k * GOLDEN_ANGLE_RAD;
      }

      const dLat = (radiusMeters * Math.sin(angle)) / METERS_PER_DEG_LAT;
      const dLng = (radiusMeters * Math.cos(angle)) / (METERS_PER_DEG_LAT * cosLat);

      mapById.set(member.id, {
        lat: centerLat + dLat,
        lng: centerLng + dLng,
        isApproximate: true,
      });
    }
  }

  return { baseById, mapById };
}

// Compute deterministic map coordinates for a single property (prefers catalog-dispersed _mapCoords when available)
export function getPropertyMapCoords(property: CoordLikeProperty | null | undefined): MapCoordPoint {
  if (isValidCoordPair(property?._mapCoords)) {
    const existing = property._mapCoords as Partial<MapCoordPoint>;
    return {
      lat: existing.lat as number,
      lng: existing.lng as number,
      isApproximate: Boolean(existing.isApproximate),
    };
  }

  const base = getPropertyBaseCoords(property);
  if (!base.isApproximate) {
    return base;
  }

  const idStr = String(property?._id || 'default');
  const rHash = deterministicHash(idStr, 1);
  const thetaHash = deterministicHash(idStr, 2);

  const radiusMeters = 35 + Math.sqrt(rHash) * 140;
  const angle = thetaHash * Math.PI * 2;
  const cosLat = Math.max(0.2, Math.cos(base.lat * DEG_TO_RAD));

  return {
    lat: base.lat + (radiusMeters * Math.sin(angle)) / METERS_PER_DEG_LAT,
    lng: base.lng + (radiusMeters * Math.cos(angle)) / (METERS_PER_DEG_LAT * cosLat),
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

  // Pre-index catalog properties once so filtering, sorting & non-overlapping map coordinates never recompute on every keystroke
  const indexedCatalog = useMemo(() => {
    const validCatalog = catalogProperties.filter(Boolean);
    const { baseById, mapById } = buildDispersedMapCoordsLookup(validCatalog);

    return validCatalog.map((prop, idx) => {
      const id = String(prop._id || `idx-${idx}`);
      const baseCoords = baseById.get(id) || getPropertyBaseCoords(prop);
      const mapCoords = mapById.get(id) || baseCoords;
      const score = prop._score ?? calculatePropertyRelevanceScore(prop);
      const createdAtMs = prop.created_at ? Date.parse(prop.created_at) || 0 : 0;

      const houseTypeNorm = removeDiacritics((prop.houseType || '').toLowerCase());
      const titleNorm = removeDiacritics((prop.title || '').toLowerCase());
      const descNorm = removeDiacritics((prop.description || '').toLowerCase());
      const propNumNorm = removeDiacritics(String(prop.propertyNumber || '').toLowerCase());
      const fokontanyNorm = removeDiacritics((prop.city?.fokontany || '').toLowerCase());
      const communeNorm = removeDiacritics((prop.city?.commune || '').toLowerCase());
      const districtNorm = removeDiacritics((prop.city?.district || '').toLowerCase());
      const regionNorm = removeDiacritics((prop.city?.region || '').toLowerCase());

      const categoryFlags = computePropertyCategoryFlags(
        prop,
        houseTypeNorm,
        titleNorm,
        descNorm,
      );

      const featTerms = [
        prop.features?.waterFetchExternal ? 'maka rano matsaka eau exterieur' : '',
        prop.features?.waterWellSupply ? 'vovo puits' : '',
        prop.features?.waterPumpSupply
          ? 'moto-pompe motopompe surpresseur citerne chateau eau'
          : '',
        prop.features?.solarPanels ? 'solaire panneau solaire photovoltaique' : '',
        prop.features?.electricityJirama || prop.features?.waterPumpSupplyJirama ? 'jirama' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const searchBlob = `${titleNorm} ${descNorm} ${propNumNorm} ${fokontanyNorm} ${communeNorm} ${districtNorm} ${regionNorm} ${featTerms}`;
      const roomsNum = Number(prop.rooms) || 0;
      const totalRoomsNum = roomsNum + (Number(prop.livingRoom) || 0);
      const bathroomsNum = Number(prop.bathrooms) || 0;
      const areaNum = Number(prop.area) || 0;
      const effectivePrice =
        prop.type === 'sale' ? Number(prop.price) || 0 : Number(prop.rent) || 0;

      return {
        ...prop,
        _baseCoords: baseCoords,
        _mapCoords: mapCoords,
        _score: score,
        _createdAtMs: createdAtMs,
        _houseTypeNorm: houseTypeNorm,
        _categoryFlags: categoryFlags,
        _searchBlob: searchBlob,
        _roomsNum: roomsNum,
        _totalRoomsNum: totalRoomsNum,
        _bathroomsNum: bathroomsNum,
        _areaNum: areaNum,
        _effectivePrice: effectivePrice,
        _distanceMeters: null as number | null,
      };
    });
  }, [catalogProperties]);

  // Price statistics and 24-bucket histogram for the active offer type
  const priceStats = useMemo(() => {
    const activeType = filters.type === 'sale' ? 'sale' : 'rent';
    const maxCap = activeType === 'sale' ? 800_000_000 : 6_000_000;
    const defaultMax = activeType === 'sale' ? 300_000_000 : 3_500_000;
    const step = activeType === 'sale' ? 500_000 : 25_000;

    const validPrices: number[] = [];
    for (let i = 0; i < indexedCatalog.length; i++) {
      const p = indexedCatalog[i];
      if (filters.type !== 'all' && p.type !== activeType) continue;
      const val = p._effectivePrice;
      if (val > 0 && val <= maxCap) {
        validPrices.push(val);
      }
    }

    if (validPrices.length === 0) {
      return {
        min: 0,
        max: defaultMax,
        avg: Math.round(defaultMax / 3),
        step,
        histogram: Array.from({ length: 24 }, (_, i) =>
          Math.max(15, Math.round(Math.sin((i / 24) * Math.PI) * 85))
        ),
      };
    }

    let rawMin = validPrices[0];
    let rawMax = validPrices[0];
    let sum = 0;
    for (let i = 0; i < validPrices.length; i++) {
      const v = validPrices[i];
      if (v < rawMin) rawMin = v;
      if (v > rawMax) rawMax = v;
      sum += v;
    }

    const min = Math.max(0, Math.floor(rawMin / step) * step);
    const max = Math.max(min + step * 10, Math.ceil(rawMax / step) * step);
    const avg = Math.round(sum / validPrices.length);

    const bucketCount = 24;
    const bucketWidth = (max - min) / bucketCount || 1;
    const counts = new Array(bucketCount).fill(0);

    for (let i = 0; i < validPrices.length; i++) {
      const idx = Math.min(
        bucketCount - 1,
        Math.max(0, Math.floor((validPrices[i] - min) / bucketWidth))
      );
      counts[idx]++;
    }

    const maxBucket = Math.max(...counts, 1);
    const histogram = counts.map((c) => Math.max(8, Math.round((c / maxBucket) * 100)));

    return { min, max, avg, step, histogram };
  }, [indexedCatalog, filters.type]);

  // Step 1: Filter properties by all non-radius criteria (O(N) over pre-indexed fields)
  const rawFilteredWithoutRadius = useMemo(() => {
    const cleanQuery = removeDiacritics(filters.query.trim().toLowerCase());
    const tokens = cleanQuery ? cleanQuery.split(/\s+/).filter(Boolean) : [];
    const targetHouseType = mapCategoryQueryParam(filters.houseType);
    const activeFeatureKeys = Object.entries(filters.features)
      .filter(([_, val]) => Boolean(val))
      .map(([key]) => key);

    return indexedCatalog.filter((prop) => {
      // 1. Offer Type (rent / sale / all)
      if (filters.type !== 'all' && prop.type !== filters.type) {
        return false;
      }

      // 2. Property Category (appartement / maison / villa / tsena / bureau / all)
      if (!matchesComputedCategory(prop._categoryFlags, targetHouseType)) {
        return false;
      }

      // 3. Budget Min & Max
      const propPrice = prop._effectivePrice;
      if (filters.budgetMin !== null && filters.budgetMin > 0) {
        if (!propPrice || propPrice < filters.budgetMin) return false;
      }
      if (filters.budgetMax !== null && filters.budgetMax > 0) {
        if (!propPrice || propPrice > filters.budgetMax) return false;
      }

      // 4. Minimum Rooms
      if (filters.minRooms > 0) {
        if (
          prop._totalRoomsNum < filters.minRooms &&
          prop._roomsNum < filters.minRooms
        ) {
          return false;
        }
      }

      // 5. Minimum Bathrooms
      if (filters.minBathrooms > 0 && prop._bathroomsNum < filters.minBathrooms) {
        return false;
      }

      // 6. Minimum Surface Area
      if (filters.minArea !== null && filters.minArea > 0 && prop._areaNum < filters.minArea) {
        return false;
      }

      // 7. Inside / Outside WC & Shower
      const feat = prop.features || {};
      if (filters.insideToilet === 'inside' && !feat.insideToilet) return false;
      if (filters.insideToilet === 'outside' && Boolean(feat.insideToilet) !== false) return false;
      if (filters.insideBathroom === 'inside' && !feat.insideBathroom) return false;
      if (filters.insideBathroom === 'outside' && Boolean(feat.insideBathroom) !== false) return false;

      // 8. Selected Amenities / Features
      for (let i = 0; i < activeFeatureKeys.length; i++) {
        const key = activeFeatureKeys[i];
        if (key === 'electricity') {
          if (!(feat.electricityJirama || feat.electricityPower || feat.solarPanels)) {
            return false;
          }
        } else if (key === 'waterPumpSupply') {
          if (!(feat.waterPumpSupply || feat.waterPumpSupplyJirama)) {
            return false;
          }
        } else if (key === 'motoAccess') {
          if (!(feat.motoAccess || feat.carAccess)) {
            return false;
          }
        } else if (!feat[key]) {
          return false;
        }
      }

      // 9. Keyword / Fokontany / Commune / Property Number search
      if (tokens.length > 0) {
        const blob = prop._searchBlob;
        for (let i = 0; i < tokens.length; i++) {
          if (!blob.includes(tokens[i])) return false;
        }
      }

      return true;
    });
  }, [indexedCatalog, filters]);

  // Step 2: Apply Geo-Radius filtering + distance calculation + sort
  const filteredProperties = useMemo(() => {
    const center = filters.searchCoords;
    const radius = filters.searchRadius;
    const refPoint = center || userLocation;
    const selectedCityId = filters.selectedCity?._id
      ? String(filters.selectedCity._id)
      : null;

    const results: any[] = [];

    for (let i = 0; i < rawFilteredWithoutRadius.length; i++) {
      const prop = rawFilteredWithoutRadius[i];
      // Use true base coordinates for distance & radius membership so visual marker dispersion never skews geo-filtering
      const geoCoords = prop._baseCoords || prop._mapCoords;

      if (center && radius > 0) {
        const distFromZone = fastDistanceMeters(
          center.lat,
          center.lng,
          geoCoords.lat,
          geoCoords.lng
        );
        const isSameCityId =
          selectedCityId !== null &&
          prop.city?._id &&
          selectedCityId === String(prop.city._id);

        if (distFromZone > radius && !isSameCityId) {
          continue;
        }

        results.push({
          ...prop,
          _distanceMeters: distFromZone,
        });
      } else if (refPoint) {
        const distFromRef = fastDistanceMeters(
          refPoint.lat,
          refPoint.lng,
          geoCoords.lat,
          geoCoords.lng
        );
        results.push({
          ...prop,
          _distanceMeters: distFromRef,
        });
      } else {
        // Keep exact reference from indexedCatalog when no geo-distance is active!
        results.push(prop);
      }
    }

    // Sort results using pre-computed numeric fields
    if (filters.sortBy === 'price_asc') {
      results.sort((a, b) => (a._effectivePrice || Infinity) - (b._effectivePrice || Infinity));
    } else if (filters.sortBy === 'price_desc') {
      results.sort((a, b) => (b._effectivePrice || 0) - (a._effectivePrice || 0));
    } else if (filters.sortBy === 'distance') {
      results.sort((a, b) => (a._distanceMeters ?? Infinity) - (b._distanceMeters ?? Infinity));
    } else if (filters.sortBy === 'relevance') {
      results.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    } else {
      // 'newest'
      results.sort((a, b) => (b._createdAtMs || 0) - (a._createdAtMs || 0));
    }

    return results;
  }, [
    rawFilteredWithoutRadius,
    filters.searchCoords,
    filters.searchRadius,
    filters.selectedCity,
    filters.sortBy,
    userLocation,
  ]);

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

