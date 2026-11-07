'use client';

import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import Link from 'next/link';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  Search,
  MapPin,
  SlidersHorizontal,
  ArrowLeft,
  X,
  Compass,
  Crosshair,
  Sparkles,
  Building2,
  Home,
  Building,
  Landmark,
  Globe,
  Radar,
  Loader2,
  Car,
  Wifi,
  Zap,
  Droplets,
  Sofa,
  Waves,
  CornerDownLeft,
  AlertCircle,
} from 'lucide-react';
import { cityService, CityLocation, removeDiacritics } from '@/services/city.service';
import {
  SearchFilters,
  OfferTypeFilter,
  HouseCategoryFilter,
  DEFAULT_ANTANANARIVO_CENTER,
} from '@/store/searchStore';

const RADIUS_OPTIONS = [
  { label: 'Toute la carte', value: 0 },
  { label: '500 m', value: 500 },
  { label: '800 m', value: 800 },
  { label: '1.5 km', value: 1500 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
];

const QUICK_CATEGORIES: Array<{
  id: HouseCategoryFilter;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'all', label: 'Tous les biens', icon: Globe },
  { id: 'appartement', label: 'Appartement', icon: Building2 },
  { id: 'maison', label: 'Maison', icon: Home },
  { id: 'villa', label: 'Villa', icon: Landmark },
  { id: 'bureau', label: 'Bureau', icon: Building },
];

const QUICK_FEATURES: Array<{
  key: string;
  label: string;
  icon: React.ElementType;
}> = [
  { key: 'carAccess', label: 'Accès voiture', icon: Car },
  { key: 'electricityJirama', label: 'JIRAMA', icon: Zap },
  { key: 'waterPumpSupplyJirama', label: 'Eau courante', icon: Droplets },
  { key: 'wifiAvailability', label: 'Wi-Fi', icon: Wifi },
  { key: 'furnishedProperty', label: 'Meublé', icon: Sofa },
  { key: 'swimmingPool', label: 'Piscine', icon: Waves },
];

interface SearchTopOmniboxProps {
  filters: SearchFilters;
  activeFiltersCount: number;
  totalResults: number;
  showCategoryRibbon?: boolean;
  onSetFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  onToggleFeature: (featureKey: string) => void;
  onSetLocationZone: (
    coords: { lat: number; lng: number } | null,
    placeName: string | null,
    city?: CityLocation | null,
    radius?: number
  ) => void;
  onClearLocationZone: () => void;
  onOpenFilterModal: () => void;
  onLocateUser: (applyZone?: boolean) => void;
  isLocatingUser: boolean;
}

function SearchTopOmniboxComponent({
  filters,
  activeFiltersCount,
  totalResults,
  showCategoryRibbon = true,
  onSetFilter,
  onToggleFeature,
  onSetLocationZone,
  onClearLocationZone,
  onOpenFilterModal,
  onLocateUser,
  isLocatingUser,
}: SearchTopOmniboxProps) {
  const placesLib = useMapsLibrary('places');
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const googleCacheRef = useRef<Map<string, google.maps.places.AutocompletePrediction[]>>(
    new Map()
  );

  const [inputText, setInputText] = useState(filters.query || '');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [showRequiredPlaceHint, setShowRequiredPlaceHint] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [googlePredictions, setGooglePredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [citySuggestions, setCitySuggestions] = useState<CityLocation[]>([]);
  const [popularCities, setPopularCities] = useState<CityLocation[]>(() =>
    cityService.getDefaultPopularCities(8)
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentSearchQueryRef = useRef('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const isExpanded = isInputFocused || isDropdownOpen;

  // Sync external query changes
  useEffect(() => {
    setInputText(filters.query || '');
  }, [filters.query]);

  // Lazily initialize Google Places services when needed
  const ensureGoogleServices = useCallback(() => {
    if (!placesLib) return false;
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new placesLib.AutocompleteService();
    }
    if (!placesServiceRef.current && typeof document !== 'undefined') {
      const dummy = document.createElement('div');
      placesServiceRef.current = new placesLib.PlacesService(dummy);
    }
    if (!geocoderRef.current && typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
    return true;
  }, [placesLib]);

  // Load popular cities and preload local Madagascar Fokontany index for 0ms instant search
  useEffect(() => {
    let mounted = true;
    cityService.getPopularCities(8).then((cities) => {
      if (mounted && cities.length > 0) {
        setPopularCities(cities);
      }
    });
    cityService.preloadLocalCities();
    return () => {
      mounted = false;
    };
  }, []);

  // Close dropdown & unfocus on click outside. Discards unvalidated raw typed text.
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setIsInputFocused(false);
        setActiveIndex(-1);
        setShowRequiredPlaceHint(false);
        // Do not keep unvalidated raw text
        setInputText('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);

  // Google Map Places first search logic:
  // Only if Google Map places returns 0 suggestions does it fall back to the Tranogasy local database.
  const runSearchWithGoogleFirst = useCallback(
    (text: string) => {
      const clean = text.trim();
      currentSearchQueryRef.current = clean;

      if (!clean) {
        setGooglePredictions([]);
        setCitySuggestions([]);
        setIsSearchingPlaces(false);
        return;
      }

      const cacheKey = removeDiacritics(clean.toLowerCase());
      const cached = googleCacheRef.current.get(cacheKey);

      // Check if we already evaluated this query in Google Places cache
      if (cached !== undefined) {
        if (cached.length > 0) {
          // Google Places has suggestions -> show only Google Places (no fallback needed)
          setGooglePredictions(cached);
          setCitySuggestions([]);
        } else {
          // Google Places previously found 0 suggestions -> query Tranogasy database as fallback
          setGooglePredictions([]);
          const fallback = cityService.searchCitiesInstant(clean, 6);
          setCitySuggestions(fallback);
          if (fallback.length === 0) {
            cityService
              .searchCities(clean, 6)
              .then((cities) => {
                if (currentSearchQueryRef.current === clean && cities && cities.length > 0) {
                  setCitySuggestions(cities);
                }
              })
              .catch(() => {});
          }
        }
        setIsSearchingPlaces(false);
        return;
      }

      // If Google Maps places service is not available (e.g. offline/loading), fallback to Tranogasy DB
      if (!ensureGoogleServices() || !autocompleteServiceRef.current) {
        setIsSearchingPlaces(false);
        setGooglePredictions([]);
        const fallback = cityService.searchCitiesInstant(clean, 6);
        setCitySuggestions(fallback);
        return;
      }

      setIsSearchingPlaces(true);
      try {
        autocompleteServiceRef.current.getPlacePredictions(
          {
            input: clean,
            componentRestrictions: { country: 'mg' },
          },
          (predictions, status) => {
            // Guard against race conditions if user typed something new while waiting
            if (currentSearchQueryRef.current !== clean) return;

            setIsSearchingPlaces(false);
            const isOk = status === google.maps.places.PlacesServiceStatus.OK;

            if (isOk && predictions && predictions.length > 0) {
              // 1. Google Map Places found suggestions! Show Google Places only
              const top = predictions.slice(0, 6);
              googleCacheRef.current.set(cacheKey, top);
              setGooglePredictions(top);
              setCitySuggestions([]); // Clear Tranogasy database suggestions
            } else {
              // 2. Google Map Places found NO suggestions -> switch to Tranogasy database fallback
              googleCacheRef.current.set(cacheKey, []);
              setGooglePredictions([]);
              const fallback = cityService.searchCitiesInstant(clean, 6);
              setCitySuggestions(fallback);
              if (fallback.length === 0) {
                cityService
                  .searchCities(clean, 6)
                  .then((cities) => {
                    if (currentSearchQueryRef.current === clean && cities && cities.length > 0) {
                      setCitySuggestions(cities);
                    }
                  })
                  .catch(() => {});
              }
            }
          }
        );
      } catch {
        // In case of error from Google API, fallback to Tranogasy database
        if (currentSearchQueryRef.current !== clean) return;
        setIsSearchingPlaces(false);
        setGooglePredictions([]);
        const fallback = cityService.searchCitiesInstant(clean, 6);
        setCitySuggestions(fallback);
      }
    },
    [ensureGoogleServices]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setIsDropdownOpen(true);
    setActiveIndex(-1);
    setShowRequiredPlaceHint(false);

    const clean = val.trim();
    currentSearchQueryRef.current = clean;

    if (!clean) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setCitySuggestions([]);
      setGooglePredictions([]);
      setIsSearchingPlaces(false);
      return;
    }

    // Query Google Places first with debounce (or instantly if already cached).
    // Note: User must select a place from suggestions to be a valid input; raw text is not submitted.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const cacheKey = removeDiacritics(clean.toLowerCase());
    const cachedGoogle = googleCacheRef.current.get(cacheKey);

    if (cachedGoogle !== undefined) {
      // Already evaluated for Google Places -> resolve immediately
      runSearchWithGoogleFirst(clean);
    } else {
      // Brand new query: set searching state and debounce Google Places query
      setIsSearchingPlaces(true);
      setGooglePredictions([]);
      setCitySuggestions([]);
      debounceRef.current = setTimeout(() => {
        runSearchWithGoogleFirst(clean);
      }, 130);
    }
  };

  // Resolve coordinates for a Google Place prediction (with Geocoder fallback)
  const resolveGooglePredictionCoords = (
    prediction: google.maps.places.AutocompletePrediction
  ): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      ensureGoogleServices();
      if (placesServiceRef.current) {
        placesServiceRef.current.getDetails(
          {
            placeId: prediction.place_id,
            fields: ['geometry', 'name'],
          },
          (place, status) => {
            if (
              status === google.maps.places.PlacesServiceStatus.OK &&
              place?.geometry?.location
            ) {
              resolve({
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
              });
              return;
            }
            if (geocoderRef.current) {
              geocoderRef.current.geocode({ placeId: prediction.place_id }, (results, gStatus) => {
                if (gStatus === 'OK' && results?.[0]?.geometry?.location) {
                  resolve({
                    lat: results[0].geometry.location.lat(),
                    lng: results[0].geometry.location.lng(),
                  });
                } else {
                  resolve(null);
                }
              });
              return;
            }
            resolve(null);
          }
        );
      } else if (geocoderRef.current) {
        geocoderRef.current.geocode({ placeId: prediction.place_id }, (results, gStatus) => {
          if (gStatus === 'OK' && results?.[0]?.geometry?.location) {
            resolve({
              lat: results[0].geometry.location.lat(),
              lng: results[0].geometry.location.lng(),
            });
          } else {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    });
  };

  const handleCloseSearch = useCallback(() => {
    setIsDropdownOpen(false);
    setIsInputFocused(false);
    setActiveIndex(-1);
    setShowRequiredPlaceHint(false);
    setInputText('');
    inputRef.current?.blur();
  }, []);

  const handleSelectGooglePlace = useCallback(
    async (prediction: google.maps.places.AutocompletePrediction) => {
      setIsResolvingPlace(true);
      setShowRequiredPlaceHint(false);
      const label =
        prediction.structured_formatting?.main_text || prediction.description;

      try {
        const coords = await resolveGooglePredictionCoords(prediction);
        if (coords) {
          const nearestCity = await cityService.getNearestCity(coords, label);
          const radius = filters.searchRadius > 0 ? filters.searchRadius : 1500;
          onSetLocationZone(coords, label, nearestCity, radius);
          onSetFilter('query', '');
          setInputText('');
        }
      } finally {
        setIsResolvingPlace(false);
        handleCloseSearch();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.searchRadius, onSetLocationZone, onSetFilter, handleCloseSearch]
  );

  const handleSelectBackendCity = useCallback(
    (city: CityLocation) => {
      setShowRequiredPlaceHint(false);
      const label = `${city.fokontany}, ${city.commune}`;
      const radius = filters.searchRadius > 0 ? filters.searchRadius : 1500;
      const targetCoords = city.coords || DEFAULT_ANTANANARIVO_CENTER;
      onSetLocationZone(targetCoords, label, city, radius);
      onSetFilter('query', '');
      setInputText('');
      handleCloseSearch();
    },
    [filters.searchRadius, onSetLocationZone, onSetFilter, handleCloseSearch]
  );

  // Navigable items for keyboard arrow navigation: Google Places first, fallback to Tranogasy DB
  const navigableItems = useMemo(() => {
    if (googlePredictions.length > 0) {
      return googlePredictions.map((g) => ({ type: 'google' as const, data: g }));
    }
    if (citySuggestions.length > 0) {
      return citySuggestions.map((c) => ({ type: 'city' as const, data: c }));
    }
    return [];
  }, [citySuggestions, googlePredictions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCloseSearch();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen) setIsDropdownOpen(true);
      if (navigableItems.length > 0) {
        setActiveIndex((prev) => (prev + 1) % navigableItems.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navigableItems.length > 0) {
        setActiveIndex((prev) =>
          prev <= 0 ? navigableItems.length - 1 : prev - 1
        );
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < navigableItems.length) {
        const chosen = navigableItems[activeIndex];
        if (chosen.type === 'city') {
          handleSelectBackendCity(chosen.data);
        } else {
          handleSelectGooglePlace(chosen.data);
        }
      } else if (navigableItems.length > 0) {
        // If suggestions are available and user presses Enter, select the top suggestion!
        const chosen = navigableItems[0];
        if (chosen.type === 'city') {
          handleSelectBackendCity(chosen.data);
        } else {
          handleSelectGooglePlace(chosen.data);
        }
      } else {
        // Strictly prevent submitting arbitrary raw text without a suggested place!
        setShowRequiredPlaceHint(true);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col gap-2 sm:gap-2.5 font-outfit select-none pointer-events-none"
    >
      {/* ══════════════════════════════════════════════════════════════
          ROW 1: FLOATING FUTURISTIC LIQUID-GLASS OMNIBOX
          Smoothly elongates when the search input is focused!
      ══════════════════════════════════════════════════════════════ */}
      <div
        className={`relative w-full mx-auto flex items-center justify-center pointer-events-auto
          transition-[max-width,gap] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
          ${
            isExpanded
              ? 'max-w-full sm:max-w-[920px] md:max-w-[980px] lg:max-w-[1060px] xl:max-w-[1140px] gap-0 sm:gap-2.5'
              : 'max-w-full sm:max-w-[560px] md:max-w-[660px] lg:max-w-[760px] xl:max-w-[820px] gap-2 sm:gap-2.5'
          }`}
      >
        {/* 1. Ultra-Rounded Back / Accueil Button
            Collapses smoothly on mobile (< sm) when search input is focused so input elongates to 100% width */}
        <Link
          href="/"
          aria-label="Retour à l'accueil"
          className={`flex items-center justify-center gap-2 rounded-full
            bg-white/88 dark:bg-zinc-900/88 backdrop-blur-2xl
            border border-white/85 dark:border-white/15
            shadow-[0_10px_32px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.6)]
            dark:shadow-[0_10px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.1)]
            text-zinc-900 dark:text-white hover:scale-103 active:scale-95
            transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] shrink-0 overflow-hidden
            ${
              isExpanded
                ? 'max-w-0 w-0 h-11 opacity-0 scale-75 px-0 py-0 border-0 pointer-events-none sm:max-w-[150px] sm:w-auto sm:h-14 sm:opacity-100 sm:scale-100 sm:px-5 sm:py-3.5 sm:border sm:pointer-events-auto'
                : 'w-11 h-11 sm:w-auto sm:h-14 px-0 sm:px-5 md:px-6 py-0 sm:py-3.5 opacity-100 scale-100'
            }`}
        >
          <ArrowLeft className="w-4.5 h-4.5 stroke-[1.75] shrink-0" />
          <span
            className={`hidden md:inline text-sm font-light tracking-wider whitespace-nowrap transition-all duration-300 ${
              isExpanded ? 'lg:inline md:hidden' : ''
            }`}
          >
            Accueil
          </span>
        </Link>

        {/* 2. Central Omnibox Input Capsule
            Note: `static sm:relative` makes the dropdown anchor to Row 1 on mobile (100% full width immediately)
            and anchor to the expanding input capsule on tablet/desktop (sm+)! */}
        <div className="static sm:relative flex-1 min-w-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <div
            onClick={() => {
              inputRef.current?.focus();
              setIsDropdownOpen(true);
            }}
            className={`relative flex items-center w-full h-12 sm:h-14 pl-3.5 sm:pl-5 pr-1.5 sm:pr-2 rounded-full
              backdrop-blur-2xl border cursor-text
              transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
              ${
                isExpanded
                  ? 'border-brand-green ring-4 ring-brand-green/15 bg-white dark:bg-zinc-900 shadow-[0_18px_48px_rgba(124,189,30,0.18),inset_0_1px_1px_rgba(255,255,255,0.8)] dark:shadow-[0_18px_48px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.15)]'
                  : 'border-white/85 dark:border-white/15 bg-white/90 dark:bg-zinc-900/90 shadow-[0_12px_36px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.7)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)]'
              }`}
          >
            {/* Mobile Back/Close Button when expanded, or Search Icon */}
            {isExpanded ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseSearch();
                }}
                aria-label="Fermer la recherche"
                className="sm:hidden flex items-center justify-center w-8 h-8 -ml-1 mr-1.5 rounded-full text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-90 transition-all shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 stroke-[2]" />
              </button>
            ) : null}

            <Search
              className={`w-4.5 h-4.5 text-brand-green stroke-[1.8] shrink-0 mr-2 sm:mr-3 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isExpanded ? 'hidden sm:block sm:scale-110' : 'scale-100'
              }`}
            />

            {/* Active Zone Chip inside Omnibox if a radar location is set (Mobile, Tablet & Desktop) */}
            {filters.searchCoords && filters.searchPlaceName && (
              <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 mr-1.5 sm:mr-2 rounded-full bg-zinc-100/95 dark:bg-zinc-800/95 border border-zinc-200/90 dark:border-zinc-700/90 text-zinc-800 dark:text-zinc-100 text-xs font-medium tracking-wide shrink-0 max-w-[120px] sm:max-w-[160px] md:max-w-[190px] shadow-xs transition-all">
                <MapPin className="w-3.5 h-3.5 text-brand-green shrink-0 stroke-[2]" />
                <span className="truncate">{filters.searchPlaceName}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearLocationZone();
                  }}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer shrink-0"
                  title="Effacer ce lieu"
                  aria-label="Effacer ce lieu"
                >
                  <X className="w-3 h-3 stroke-[2.5]" />
                </button>
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setIsInputFocused(true);
                setIsDropdownOpen(true);
                cityService.preloadLocalCities();
              }}
              onBlur={() => {
                setIsInputFocused(false);
              }}
              placeholder={
                filters.searchPlaceName
                  ? 'Affiner par mot-clé…'
                  : 'Quartier, lieu Google, mot-clé ou n° bien...'
              }
              className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm md:text-[15px] font-light tracking-wide text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
            />

            {(isSearchingPlaces || isResolvingPlace) && (
              <Loader2 className="w-4 h-4 animate-spin text-brand-green mr-1.5 sm:mr-2 shrink-0" />
            )}

            {inputText && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setInputText('');
                  onSetFilter('query', '');
                  setGooglePredictions([]);
                  setCitySuggestions([]);
                  setActiveIndex(-1);
                  inputRef.current?.focus();
                }}
                className="p-1.5 sm:p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer mr-1 shrink-0"
                aria-label="Effacer la recherche"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Mobile Offer Type Quick Pill inside expanded search bar */}
            {isExpanded && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex sm:hidden items-center p-0.5 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 shrink-0"
              >
                {(['rent', 'sale'] as OfferTypeFilter[]).map((offerType) => {
                  const isActive = filters.type === offerType;
                  return (
                    <button
                      key={offerType}
                      type="button"
                      onClick={() => onSetFilter('type', offerType)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-light tracking-wide transition-all duration-300 cursor-pointer ${
                        isActive
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-xs'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {offerType === 'rent' ? 'Loc.' : 'Vente'}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Embedded Segmented Location / Vente Pill (Desktop & Tablet) */}
            <div
              onClick={(e) => e.stopPropagation()}
              className="hidden sm:flex items-center p-1 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 shrink-0"
            >
              {(['rent', 'sale'] as OfferTypeFilter[]).map((offerType) => {
                const isActive = filters.type === offerType;
                return (
                  <button
                    key={offerType}
                    type="button"
                    onClick={() => onSetFilter('type', offerType)}
                    className={`px-3.5 md:px-4 py-1.5 rounded-full text-xs font-light tracking-wider transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                    }`}
                  >
                    {offerType === 'rent' ? 'Location' : 'Vente'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── FUTURISTIC GLASS AUTOCOMPLETE & GEO-RADAR DROPDOWN ── */}
          {isDropdownOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-2 sm:mt-2.5 z-50
                rounded-[1.75rem] sm:rounded-[2.25rem] p-3.5 sm:p-5
                bg-white/96 dark:bg-zinc-900/96 backdrop-blur-3xl
                border border-white/90 dark:border-white/15
                shadow-[0_24px_60px_rgba(0,0,0,0.24)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.7)]
                max-h-[calc(100dvh-165px)] sm:max-h-[70vh]
                overflow-y-auto overscroll-contain no-scrollbar animate-glass-island"
            >
              {/* Quick GPS & Radius Selector Header */}
              <div className="flex flex-col gap-2.5 sm:gap-3 pb-3 sm:pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onLocateUser(true);
                      handleCloseSearch();
                    }}
                    disabled={isLocatingUser}
                    className="flex items-center justify-center sm:justify-start gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700 text-xs sm:text-sm font-normal tracking-wide sm:tracking-wider transition-all active:scale-95 cursor-pointer min-w-0"
                  >
                    {isLocatingUser ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0 text-brand-green" />
                    ) : (
                      <Crosshair className="w-4 h-4 shrink-0 text-brand-green" />
                    )}
                    <span className="truncate">Autour de ma position GPS actuelle</span>
                  </button>

                  {filters.searchCoords && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearLocationZone();
                        handleCloseSearch();
                      }}
                      className="flex items-center justify-center sm:justify-start gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-red-500 text-xs font-light tracking-wide transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Effacer la zone radar</span>
                    </button>
                  )}
                </div>

                {/* Radius Selector Pills */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-light uppercase tracking-wider sm:tracking-widest text-zinc-400 px-1">
                    <Radar className="w-3.5 h-3.5 text-brand-green shrink-0" />
                    <span className="truncate">Rayon du radar géographique</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
                    {RADIUS_OPTIONS.map((opt) => {
                      const isSelected = filters.searchRadius === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onSetFilter('searchRadius', opt.value)}
                          className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                            isSelected
                              ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-sm'
                              : 'bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 1. Google Places Predictions (PRIMARY) */}
              {googlePredictions.length > 0 && (
                <div className="pt-3 space-y-1 min-w-0">
                  <div className="px-1.5 sm:px-2 py-1 flex items-center justify-between gap-2 text-[10px] sm:text-[11px] font-light uppercase tracking-wider sm:tracking-widest text-zinc-400">
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      <Compass className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">Lieux Google Maps (Madagascar)</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 shrink-0 whitespace-nowrap">
                      Radar GPS
                    </span>
                  </div>
                  {googlePredictions.map((pred, idx) => {
                    const isKeyboardActive = activeIndex === idx;
                    return (
                      <button
                        key={pred.place_id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => handleSelectGooglePlace(pred)}
                        className={`w-full flex items-center gap-3 sm:gap-3.5 px-3 sm:px-3.5 py-2.5 rounded-2xl sm:rounded-3xl transition-all text-left group cursor-pointer ${
                          isKeyboardActive
                            ? 'bg-blue-50/80 dark:bg-blue-950/35 ring-1 ring-blue-500/30'
                            : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70'
                        }`}
                      >
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <MapPin className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[1.75]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-normal text-zinc-900 dark:text-white truncate">
                            {pred.structured_formatting?.main_text || pred.description}
                          </div>
                          <div className="text-[11px] sm:text-xs font-light text-zinc-500 dark:text-zinc-400 truncate">
                            {pred.structured_formatting?.secondary_text || 'Madagascar'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 2. Tranogasy Fokontany & Communes (FALLBACK: only shown when Google Places has NO suggestions) */}
              {googlePredictions.length === 0 && citySuggestions.length > 0 && (
                <div className="pt-3 space-y-1 min-w-0">
                  <div className="px-1.5 sm:px-2 py-1 flex items-center justify-between gap-2 text-[10px] sm:text-[11px] font-light uppercase tracking-wider sm:tracking-widest text-zinc-400">
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      <MapPin className="w-3.5 h-3.5 text-brand-green shrink-0" />
                      <span className="truncate">Quartiers & Communes (Tranogasy)</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-green/12 text-brand-green shrink-0 whitespace-nowrap">
                      Base locale
                    </span>
                  </div>
                  {citySuggestions.map((city, idx) => {
                    const isKeyboardActive = activeIndex === idx;
                    return (
                      <button
                        key={city._id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => handleSelectBackendCity(city)}
                        className={`w-full flex items-center gap-3 sm:gap-3.5 px-3 sm:px-3.5 py-2.5 rounded-2xl sm:rounded-3xl transition-all text-left group cursor-pointer ${
                          isKeyboardActive
                            ? 'bg-emerald-50/90 dark:bg-emerald-950/40 ring-1 ring-brand-green/40'
                            : 'hover:bg-emerald-50/60 dark:hover:bg-emerald-950/25'
                        }`}
                      >
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <MapPin className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[1.75]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-normal text-zinc-900 dark:text-white capitalize truncate">
                            {city.fokontany}
                          </div>
                          <div className="text-[11px] sm:text-xs font-light text-zinc-500 dark:text-zinc-400 capitalize truncate">
                            {city.commune} • {city.district}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Searching Indicator when checking Google Places */}
              {isSearchingPlaces && googlePredictions.length === 0 && (
                <div className="pt-4 pb-2 flex items-center justify-center gap-2 text-xs text-zinc-400 font-light">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-green shrink-0" />
                  <span>Recherche des lieux dans Google Maps…</span>
                </div>
              )}

              {/* Empty state: Neither Google Maps nor Tranogasy found matching places */}
              {!isSearchingPlaces &&
                inputText.trim() &&
                googlePredictions.length === 0 &&
                citySuggestions.length === 0 && (
                  <div className="pt-4 pb-2 px-3 text-center space-y-1">
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                      Aucun lieu trouvé pour « {inputText} »
                    </p>
                    <p className="text-[11px] text-zinc-400 font-light">
                      Veuillez saisir et sélectionner un lieu suggéré pour valider votre recherche.
                    </p>
                  </div>
                )}

              {/* 3. Popular Sectors when input is empty */}
              {!inputText.trim() && popularCities.length > 0 && (
                <div className="pt-3 space-y-2">
                  <div className="px-1.5 sm:px-2 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-light uppercase tracking-wider sm:tracking-widest text-zinc-400">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">Secteurs très recherchés</span>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
                    {popularCities.map((city) => (
                      <button
                        key={city._id}
                        type="button"
                        onClick={() => handleSelectBackendCity(city)}
                        className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 min-w-0 sm:max-w-[240px] rounded-full bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-brand-green hover:text-white text-zinc-800 dark:text-zinc-200 text-xs font-light tracking-wide capitalize transition-all active:scale-95 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 stroke-[1.75] shrink-0 text-brand-green group-hover:text-white" />
                        <span className="truncate">{city.fokontany}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Selection Guidance Footer & Requirement Hint */}
              {inputText.trim() && navigableItems.length > 0 && (
                <div className="pt-2.5 mt-2 px-2 flex items-center justify-between text-[11px] text-zinc-400 font-light border-t border-zinc-100 dark:border-zinc-800/80">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                    Sélectionnez un lieu dans la liste ci-dessus
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                    ↵ Entrée pour valider
                  </span>
                </div>
              )}

              {showRequiredPlaceHint && (
                <div className="mt-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>Veuillez sélectionner un lieu parmi les suggestions pour valider votre recherche.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Big-Padding, Thin-Font, Very-Rounded Filter Studio Button
            Smoothly collapses on mobile (< sm) when search input is focused so input elongates to 100% width */}
        <button
          type="button"
          onClick={onOpenFilterModal}
          className={`relative flex items-center justify-center gap-2 rounded-full
            backdrop-blur-2xl border active:scale-95 cursor-pointer shrink-0 overflow-hidden
            transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
            shadow-[0_12px_36px_rgba(0,0,0,0.14),inset_0_1px_1px_rgba(255,255,255,0.3)]
            ${
              isExpanded
                ? 'max-w-0 w-0 h-11 opacity-0 scale-75 px-0 py-0 border-0 pointer-events-none sm:max-w-[170px] sm:w-auto sm:h-14 sm:opacity-100 sm:scale-100 sm:px-5 sm:py-3.5 sm:border sm:pointer-events-auto'
                : 'h-11 sm:h-14 px-3.5 sm:px-6 py-0 sm:py-3.5 opacity-100 scale-100'
            }
            ${
              activeFiltersCount > 0
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-brand-green/60'
                : 'bg-white/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-white border-white/85 dark:border-white/15 hover:bg-white dark:hover:bg-zinc-800'
            }`}
        >
          <SlidersHorizontal className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[1.75] shrink-0" />
          <span
            className={`text-xs sm:text-sm font-light tracking-wider whitespace-nowrap ${
              isExpanded ? 'hidden lg:inline' : 'inline'
            }`}
          >
            Filtres
          </span>
          {activeFiltersCount > 0 && (
            <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-brand-green text-white text-[11px] font-medium leading-none shadow-xs shrink-0">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ROW 2: FLOATING QUICK-FILTER & CATEGORY PILLS RIBBON
          (Big Padding, Thin Font, Ultra-Rounded)
      ══════════════════════════════════════════════════════════════ */}
      {showCategoryRibbon && (
        <div className="w-full max-w-5xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-0.5 pointer-events-auto">
          {/* Mobile-Only Offer Type Toggle Pill */}
          <button
            type="button"
            onClick={() =>
              onSetFilter('type', filters.type === 'rent' ? 'sale' : 'rent')
            }
            className="sm:hidden flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-light tracking-wider shadow-md shrink-0 cursor-pointer active:scale-95 transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-brand-green" />
            <span>{filters.type === 'rent' ? 'Location' : 'Vente'}</span>
          </button>

          {/* Active Geo-Radius Pill if searchCoords is set */}
          {filters.searchCoords && (
            <div className="flex items-center gap-2 pl-3.5 pr-2 py-2 rounded-full bg-brand-green text-white shadow-[0_8px_24px_rgba(124,189,30,0.4)] text-xs font-light tracking-wider shrink-0">
              <Radar className="w-3.5 h-3.5 animate-pulse shrink-0" />
              <span className="max-w-[120px] sm:max-w-[150px] truncate">
                {filters.searchPlaceName || 'Zone radar'}
              </span>
              <select
                value={filters.searchRadius}
                onChange={(e) => onSetFilter('searchRadius', Number(e.target.value))}
                aria-label="Rayon de recherche"
                className="bg-black/20 text-white rounded-full px-2 py-0.5 text-[11px] font-light outline-none cursor-pointer"
              >
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value} className="bg-zinc-900 text-white">
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onClearLocationZone}
                className="w-5 h-5 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
                title="Retirer la zone"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Quick Category Pills */}
          {QUICK_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = filters.houseType === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSetFilter('houseType', cat.id)}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all duration-300 active:scale-95 cursor-pointer shrink-0 backdrop-blur-2xl border ${
                  isActive
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-zinc-950 dark:border-white font-normal shadow-[0_8px_24px_rgba(0,0,0,0.2)]'
                    : 'bg-white/85 dark:bg-zinc-900/85 text-zinc-700 dark:text-zinc-200 border-white/80 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>{cat.label}</span>
              </button>
            );
          })}

          {/* Quick Rooms Pills */}
          {[2, 3, 4].map((rooms) => {
            const isActive = filters.minRooms === rooms;
            return (
              <button
                key={rooms}
                type="button"
                onClick={() => onSetFilter('minRooms', isActive ? 0 : rooms)}
                className={`flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all duration-300 active:scale-95 cursor-pointer shrink-0 backdrop-blur-2xl border ${
                  isActive
                    ? 'bg-brand-green text-white border-brand-green font-normal shadow-[0_8px_20px_rgba(124,189,30,0.35)]'
                    : 'bg-white/85 dark:bg-zinc-900/85 text-zinc-700 dark:text-zinc-200 border-white/80 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                }`}
              >
                <span>{rooms}+ pièces</span>
              </button>
            );
          })}

          {/* Quick Essential Features Pills */}
          {QUICK_FEATURES.map((feat) => {
            const Icon = feat.icon;
            const isActive = Boolean(filters.features[feat.key]);
            return (
              <button
                key={feat.key}
                type="button"
                onClick={() => onToggleFeature(feat.key)}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all duration-300 active:scale-95 cursor-pointer shrink-0 backdrop-blur-2xl border ${
                  isActive
                    ? 'bg-brand-green text-white border-brand-green font-normal shadow-[0_8px_20px_rgba(124,189,30,0.35)]'
                    : 'bg-white/85 dark:bg-zinc-900/85 text-zinc-700 dark:text-zinc-200 border-white/80 dark:border-white/10 hover:bg-white dark:hover:bg-zinc-800 shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>{feat.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SearchTopOmnibox = memo(SearchTopOmniboxComponent);
export default SearchTopOmnibox;
