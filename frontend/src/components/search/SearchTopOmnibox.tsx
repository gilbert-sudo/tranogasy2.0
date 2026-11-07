'use client';

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
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
} from 'lucide-react';
import { cityService, CityLocation } from '@/services/city.service';
import {
  SearchFilters,
  OfferTypeFilter,
  HouseCategoryFilter,
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

  const [inputText, setInputText] = useState(filters.query || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [googlePredictions, setGooglePredictions] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [citySuggestions, setCitySuggestions] = useState<CityLocation[]>([]);
  const [popularCities, setPopularCities] = useState<CityLocation[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const queryFilterDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync external query changes
  useEffect(() => {
    setInputText(filters.query || '');
  }, [filters.query]);

  // Initialize Google Places library
  useEffect(() => {
    if (placesLib) {
      autocompleteServiceRef.current = new placesLib.AutocompleteService();
      const dummy = document.createElement('div');
      placesServiceRef.current = new placesLib.PlacesService(dummy);
      if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
        geocoderRef.current = new window.google.maps.Geocoder();
      }
    }
  }, [placesLib]);

  // Load popular cities once
  useEffect(() => {
    let mounted = true;
    cityService.getPopularCities(8).then((cities) => {
      if (mounted && cities.length > 0) {
        setPopularCities(cities);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Search both Google Places (Madagascar) & Tranogasy Fokontany DB
  const runAutocomplete = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) {
      setGooglePredictions([]);
      setCitySuggestions([]);
      setIsSearchingPlaces(false);
      return;
    }

    setIsSearchingPlaces(true);

    // 1. Query Tranogasy City DB in parallel
    cityService
      .searchCities(clean, 6)
      .then((cities) => {
        setCitySuggestions(cities || []);
      })
      .catch(() => setCitySuggestions([]));

    // 2. Query Google Places Autocomplete (restricted to Madagascar: 'mg')
    if (autocompleteServiceRef.current) {
      try {
        autocompleteServiceRef.current.getPlacePredictions(
          {
            input: clean,
            componentRestrictions: { country: 'mg' },
          },
          (predictions, status) => {
            if (
              status === google.maps.places.PlacesServiceStatus.OK &&
              predictions &&
              predictions.length > 0
            ) {
              setGooglePredictions(predictions.slice(0, 5));
            } else {
              setGooglePredictions([]);
            }
            setIsSearchingPlaces(false);
          }
        );
        return;
      } catch {
        // Fallback if Google Places errors
      }
    }

    setIsSearchingPlaces(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    setIsDropdownOpen(true);

    // Debounce global filter store update to keep typing 60fps smooth
    if (queryFilterDebounceRef.current) clearTimeout(queryFilterDebounceRef.current);
    if (!val.trim()) {
      onSetFilter('query', '');
    } else {
      queryFilterDebounceRef.current = setTimeout(() => {
        onSetFilter('query', val);
      }, 140);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runAutocomplete(val);
    }, 240);
  };

  // Resolve coordinates for a Google Place prediction
  const resolveGooglePredictionCoords = (
    prediction: google.maps.places.AutocompletePrediction
  ): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
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
            resolve(null);
          }
        );
      } else {
        resolve(null);
      }
    });
  };

  const handleSelectGooglePlace = async (
    prediction: google.maps.places.AutocompletePrediction
  ) => {
    setIsResolvingPlace(true);
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
      setIsDropdownOpen(false);
    }
  };

  const handleSelectBackendCity = (city: CityLocation) => {
    const label = `${city.fokontany}, ${city.commune}`;
    const radius = filters.searchRadius > 0 ? filters.searchRadius : 1500;
    if (city.coords) {
      onSetLocationZone(city.coords, label, city, radius);
      onSetFilter('query', '');
      setInputText('');
    } else {
      onSetFilter('query', city.fokontany);
      setInputText(city.fokontany);
    }
    setIsDropdownOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col gap-2.5 font-outfit select-none pointer-events-none"
    >
      {/* ══════════════════════════════════════════════════════════════
          ROW 1: FLOATING FUTURISTIC LIQUID-GLASS OMNIBOX
      ══════════════════════════════════════════════════════════════ */}
      <div className="w-full max-w-5xl mx-auto flex items-center gap-2 sm:gap-3 pointer-events-auto">
        {/* 1. Ultra-Rounded Back / Accueil Button (Big Padding, Thin Font) */}
        <Link
          href="/"
          aria-label="Retour à l'accueil"
          className="flex items-center gap-2 px-4 sm:px-6 py-3.5 sm:py-4 rounded-full
            bg-white/88 dark:bg-zinc-900/88 backdrop-blur-2xl
            border border-white/85 dark:border-white/15
            shadow-[0_10px_32px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.6)]
            dark:shadow-[0_10px_32px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.1)]
            text-zinc-900 dark:text-white hover:scale-103 active:scale-95 transition-all duration-300 shrink-0"
        >
          <ArrowLeft className="w-4.5 h-4.5 stroke-[1.75]" />
          <span className="hidden md:inline text-sm font-light tracking-wider">
            Accueil
          </span>
        </Link>

        {/* 2. Central Omnibox Input Capsule */}
        <div className="relative flex-1 min-w-0">
          <div
            className={`flex items-center w-full h-13 sm:h-14 pl-4 sm:pl-5 pr-2 rounded-full
              bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl
              border transition-all duration-300
              shadow-[0_12px_36px_rgba(0,0,0,0.12),inset_0_1px_1px_rgba(255,255,255,0.7)]
              dark:shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)]
              ${
                isDropdownOpen
                  ? 'border-brand-green ring-4 ring-brand-green/15 bg-white dark:bg-zinc-900'
                  : 'border-white/85 dark:border-white/15'
              }`}
          >
            <Search className="w-4.5 h-4.5 text-brand-green stroke-[1.8] shrink-0 mr-2.5 sm:mr-3" />

            {/* Active Zone Chip inside Omnibox if a radar location is set */}
            {filters.searchCoords && filters.searchPlaceName && !inputText && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 mr-2 rounded-full bg-brand-green/15 text-brand-green border border-brand-green/30 text-xs font-light tracking-wide shrink-0 max-w-[190px]">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{filters.searchPlaceName}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearLocationZone();
                  }}
                  className="hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <input
              type="text"
              value={inputText}
              onChange={handleInputChange}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={
                filters.searchPlaceName
                  ? `${filters.searchPlaceName} • Affiner par mot-clé ou lieu...`
                  : 'Quartier, lieu Google, mot-clé ou n° bien...'
              }
              className="flex-1 min-w-0 bg-transparent text-sm sm:text-[15px] font-light tracking-wide text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
            />

            {(isSearchingPlaces || isResolvingPlace) && (
              <Loader2 className="w-4 h-4 animate-spin text-brand-green mr-2 shrink-0" />
            )}

            {inputText && (
              <button
                type="button"
                onClick={() => {
                  setInputText('');
                  onSetFilter('query', '');
                  setGooglePredictions([]);
                  setCitySuggestions([]);
                }}
                className="p-2 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer mr-1 shrink-0"
                aria-label="Effacer la recherche"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Embedded Segmented Location / Vente Pill (Desktop & Tablet) */}
            <div className="hidden sm:flex items-center p-1 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 shrink-0">
              {(['rent', 'sale'] as OfferTypeFilter[]).map((offerType) => {
                const isActive = filters.type === offerType;
                return (
                  <button
                    key={offerType}
                    type="button"
                    onClick={() => onSetFilter('type', offerType)}
                    className={`px-4 py-1.5 rounded-full text-xs font-light tracking-wider transition-all duration-300 cursor-pointer ${
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
              className="absolute top-full left-0 right-0 mt-2.5 z-50 rounded-[2.25rem] p-4 sm:p-5
                bg-white/95 dark:bg-zinc-900/95 backdrop-blur-3xl
                border border-white/90 dark:border-white/15
                shadow-[0_24px_60px_rgba(0,0,0,0.22)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.65)]
                max-h-[72vh] overflow-y-auto no-scrollbar animate-glass-island"
            >
              {/* Quick GPS & Radius Selector Header */}
              <div className="flex flex-col gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onLocateUser(true);
                      setIsDropdownOpen(false);
                    }}
                    disabled={isLocatingUser}
                    className="flex items-center gap-2.5 px-5 py-3 rounded-full bg-brand-green/12 hover:bg-brand-green/20 text-brand-green border border-brand-green/30 text-xs sm:text-sm font-light tracking-wider transition-all active:scale-95 cursor-pointer"
                  >
                    {isLocatingUser ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Crosshair className="w-4 h-4" />
                    )}
                    <span>Autour de ma position GPS actuelle</span>
                  </button>

                  {filters.searchCoords && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearLocationZone();
                        setIsDropdownOpen(false);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:text-red-500 text-xs font-light tracking-wider transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Effacer la zone radar</span>
                    </button>
                  )}
                </div>

                {/* Radius Selector Pills (Big Padding, Thin Font, Very Rounded) */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-light uppercase tracking-widest text-zinc-400 px-1">
                    <Radar className="w-3.5 h-3.5 text-brand-green" />
                    <span>Rayon du radar géographique</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                    {RADIUS_OPTIONS.map((opt) => {
                      const isSelected = filters.searchRadius === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onSetFilter('searchRadius', opt.value)}
                          className={`px-4 py-2 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all cursor-pointer shrink-0 ${
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

              {/* 1. Google Places Predictions */}
              {googlePredictions.length > 0 && (
                <div className="pt-3 space-y-1">
                  <div className="px-2 py-1 flex items-center justify-between text-[11px] font-light uppercase tracking-widest text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-blue-500" />
                      Lieux Google Maps (Madagascar)
                    </span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                      Radar GPS
                    </span>
                  </div>
                  {googlePredictions.map((pred) => (
                    <button
                      key={pred.place_id}
                      type="button"
                      onClick={() => handleSelectGooglePlace(pred)}
                      className="w-full flex items-center gap-3.5 px-4 py-3 rounded-3xl hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70 transition-all text-left group cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <MapPin className="w-4.5 h-4.5 stroke-[1.75]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-normal text-zinc-900 dark:text-white truncate">
                          {pred.structured_formatting?.main_text || pred.description}
                        </div>
                        <div className="text-xs font-light text-zinc-500 dark:text-zinc-400 truncate">
                          {pred.structured_formatting?.secondary_text || 'Madagascar'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* 2. Tranogasy Fokontany & Communes Matches */}
              {citySuggestions.length > 0 && (
                <div className="pt-3 space-y-1">
                  <div className="px-2 py-1 flex items-center justify-between text-[11px] font-light uppercase tracking-widest text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-brand-green" />
                      Quartiers & Communes (Tranogasy)
                    </span>
                  </div>
                  {citySuggestions.map((city) => (
                    <button
                      key={city._id}
                      type="button"
                      onClick={() => handleSelectBackendCity(city)}
                      className="w-full flex items-center gap-3.5 px-4 py-3 rounded-3xl hover:bg-emerald-50/60 dark:hover:bg-emerald-950/25 transition-all text-left group cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <MapPin className="w-4.5 h-4.5 stroke-[1.75]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-normal text-zinc-900 dark:text-white capitalize truncate">
                          {city.fokontany}
                        </div>
                        <div className="text-xs font-light text-zinc-500 dark:text-zinc-400 capitalize truncate">
                          {city.commune} • {city.district}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* 3. Popular Sectors when input is empty */}
              {!inputText.trim() && popularCities.length > 0 && (
                <div className="pt-3 space-y-2">
                  <div className="px-2 flex items-center gap-1.5 text-[11px] font-light uppercase tracking-widest text-zinc-400">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Secteurs très recherchés</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {popularCities.map((city) => (
                      <button
                        key={city._id}
                        type="button"
                        onClick={() => handleSelectBackendCity(city)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-brand-green hover:text-white text-zinc-800 dark:text-zinc-200 text-xs font-light tracking-wider capitalize transition-all active:scale-95 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 stroke-[1.75]" />
                        <span>{city.fokontany}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Direct Keyword Filter Action */}
              {inputText.trim() && (
                <div className="pt-3 mt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(false)}
                    className="w-full flex items-center justify-between px-5 py-3.5 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs sm:text-sm font-light tracking-wider transition-all cursor-pointer"
                  >
                    <span>
                      Filtrer par mot-clé ou numéro «{' '}
                      <strong className="font-medium">{inputText}</strong> »
                    </span>
                    <span className="px-3 py-1 rounded-full bg-brand-green text-white text-xs font-normal">
                      {totalResults} résultat{totalResults > 1 ? 's' : ''}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. Big-Padding, Thin-Font, Very-Rounded Filter Studio Button */}
        <button
          type="button"
          onClick={onOpenFilterModal}
          className={`relative flex items-center gap-2.5 px-5 sm:px-7 py-3.5 sm:py-4 rounded-full
            backdrop-blur-2xl border transition-all duration-300 active:scale-95 cursor-pointer shrink-0
            shadow-[0_12px_36px_rgba(0,0,0,0.14),inset_0_1px_1px_rgba(255,255,255,0.3)]
            ${
              activeFiltersCount > 0
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 border-brand-green/60'
                : 'bg-white/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-white border-white/85 dark:border-white/15 hover:bg-white dark:hover:bg-zinc-800'
            }`}
        >
          <SlidersHorizontal className="w-4.5 h-4.5 stroke-[1.75]" />
          <span className="text-xs sm:text-sm font-light tracking-wider">Filtres</span>
          {activeFiltersCount > 0 && (
            <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full bg-brand-green text-white text-[11px] font-medium leading-none shadow-xs">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          ROW 2: FLOATING QUICK-FILTER & CATEGORY PILLS RIBBON
          (Big Padding, Thin Font, Ultra-Rounded)
      ══════════════════════════════════════════════════════════════ */}
      <div className="w-full max-w-5xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-0.5 pointer-events-auto">
        {/* Mobile-Only Offer Type Toggle Pill */}
        <button
          type="button"
          onClick={() =>
            onSetFilter('type', filters.type === 'rent' ? 'sale' : 'rent')
          }
          className="sm:hidden flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-light tracking-wider shadow-md shrink-0 cursor-pointer active:scale-95 transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-brand-green" />
          <span>{filters.type === 'rent' ? 'Location' : 'Vente'}</span>
        </button>

        {/* Active Geo-Radius Pill if searchCoords is set */}
        {filters.searchCoords && (
          <div className="flex items-center gap-2 pl-4 pr-2.5 py-2 rounded-full bg-brand-green text-white shadow-[0_8px_24px_rgba(124,189,30,0.4)] text-xs font-light tracking-wider shrink-0">
            <Radar className="w-3.5 h-3.5 animate-pulse shrink-0" />
            <span className="max-w-[130px] truncate">
              {filters.searchPlaceName || 'Zone radar'}
            </span>
            <select
              value={filters.searchRadius}
              onChange={(e) => onSetFilter('searchRadius', Number(e.target.value))}
              aria-label="Rayon de recherche"
              className="bg-black/20 text-white rounded-full px-2.5 py-0.5 text-[11px] font-light outline-none cursor-pointer"
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

        {/* Quick Category Pills (Big Padding, Thin Font, Very Rounded) */}
        {QUICK_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = filters.houseType === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSetFilter('houseType', cat.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all duration-300 active:scale-95 cursor-pointer shrink-0 backdrop-blur-2xl border ${
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
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all duration-300 active:scale-95 cursor-pointer shrink-0 backdrop-blur-2xl border ${
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
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all duration-300 active:scale-95 cursor-pointer shrink-0 backdrop-blur-2xl border ${
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
    </div>
  );
}

const SearchTopOmnibox = memo(SearchTopOmniboxComponent);
export default SearchTopOmnibox;

