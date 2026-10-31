'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  MapMouseEvent,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Search,
  Crosshair,
  X,
  Building,
  Compass,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { cityService, CityLocation } from '@/services/city.service';
import { Circle } from '../map/Circle';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBPQYtD-cm2GmdJGXhFcD7_2vXTkyPXqOs';
const GOOGLE_MAP_ID = '80e7a8f8db80acb5';

interface ListingLocationPickerProps {
  selectedCity: CityLocation | null;
  onSelectCity: (city: CityLocation | null) => void;
  coords: { lat: number; lng: number } | null;
  onCoordsChange: (coords: { lat: number; lng: number } | null) => void;
}

function ListingLocationPickerContent({
  selectedCity,
  onSelectCity,
  coords,
  onCoordsChange,
}: ListingLocationPickerProps) {
  const placesLib = useMapsLibrary('places');
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const [query, setQuery] = useState('');
  const [googlePredictions, setGooglePredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [backendResults, setBackendResults] = useState<CityLocation[]>([]);
  const [popularCities, setPopularCities] = useState<CityLocation[]>([]);
  const [searchSource, setSearchSource] = useState<'google' | 'backend' | 'popular'>('popular');

  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingMessage, setResolvingMessage] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);

  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: -18.8792,
    lng: 47.5079, // Antananarivo center
  });
  const [mapZoom, setMapZoom] = useState(13);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Google Places services once library is loaded
  useEffect(() => {
    if (placesLib) {
      autocompleteServiceRef.current = new placesLib.AutocompleteService();
      const dummyDiv = document.createElement('div');
      placesServiceRef.current = new placesLib.PlacesService(dummyDiv);
      if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
        geocoderRef.current = new window.google.maps.Geocoder();
      }
    }
  }, [placesLib]);

  // Load popular cities on mount
  useEffect(() => {
    let isMounted = true;
    cityService.getPopularCities(10).then((cities) => {
      if (isMounted && cities.length > 0) {
        setPopularCities(cities);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync map center when selectedCity changes
  useEffect(() => {
    if (selectedCity?.coords) {
      setMapCenter(selectedCity.coords);
      setMapZoom(15);
      if (!coords) {
        onCoordsChange(selectedCity.coords);
      }
    }
  }, [selectedCity]);

  // Fallback search directly into backend city list
  const fallbackToBackendSearch = useCallback(async (searchText: string) => {
    setGooglePredictions([]);
    setSearchSource('backend');
    try {
      const results = await cityService.searchCities(searchText, 15);
      setBackendResults(results);
    } catch (err) {
      console.error('Backend search failed:', err);
      setBackendResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Primary search: search Google Places first; if no results, fall back to backend city list
  const executeSearch = useCallback(
    (searchText: string) => {
      const cleanText = searchText.trim();
      if (!cleanText) {
        setGooglePredictions([]);
        setBackendResults([]);
        setSearchSource('popular');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      // Check Google Places API first (restricted to Madagascar: "mg")
      if (autocompleteServiceRef.current) {
        try {
          autocompleteServiceRef.current.getPlacePredictions(
            {
              input: cleanText,
              componentRestrictions: { country: 'mg' },
            },
            (predictions, status) => {
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                predictions &&
                predictions.length > 0
              ) {
                // Found on Google Places!
                setGooglePredictions(predictions);
                setBackendResults([]);
                setSearchSource('google');
                setIsLoading(false);
              } else {
                // Not found on Google Places -> fallback to backend city list
                fallbackToBackendSearch(cleanText);
              }
            }
          );
          return;
        } catch (err) {
          console.warn('Google Places prediction error, falling back to backend:', err);
        }
      }

      // If Google Places service is not yet loaded, fallback directly to backend
      fallbackToBackendSearch(cleanText);
    },
    [fallbackToBackendSearch]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setQuery(text);
    setIsDropdownOpen(true);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (!text.trim()) {
      setGooglePredictions([]);
      setBackendResults([]);
      setSearchSource('popular');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimeoutRef.current = setTimeout(() => {
      executeSearch(text);
    }, 280);
  };

  // Helper to resolve coordinates from a Google prediction place_id
  const getPlaceCoordinates = (
    prediction: google.maps.places.AutocompletePrediction
  ): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (placesServiceRef.current) {
        placesServiceRef.current.getDetails(
          {
            placeId: prediction.place_id,
            fields: ['geometry', 'name', 'formatted_address'],
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
            fallbackGeocode();
          }
        );
      } else {
        fallbackGeocode();
      }

      function fallbackGeocode() {
        if (!geocoderRef.current && typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
          geocoderRef.current = new window.google.maps.Geocoder();
        }

        if (geocoderRef.current) {
          geocoderRef.current.geocode(
            { placeId: prediction.place_id },
            (results, status) => {
              if (status === 'OK' && results && results[0]?.geometry?.location) {
                resolve({
                  lat: results[0].geometry.location.lat(),
                  lng: results[0].geometry.location.lng(),
                });
              } else {
                resolve(null);
              }
            }
          );
        } else {
          resolve(null);
        }
      }
    });
  };

  // Handle selection of a Google Places suggestion
  const handleSelectGooglePlace = async (
    prediction: google.maps.places.AutocompletePrediction
  ) => {
    setIsResolving(true);
    const placeName =
      prediction.structured_formatting?.main_text || prediction.description;
    setResolvingMessage(`Localisation de "${placeName}"...`);

    try {
      // 1. Get coords from Google Places API
      const placeCoords = await getPlaceCoordinates(prediction);
      if (!placeCoords) {
        alert("Impossible de récupérer les coordonnées GPS de ce lieu.");
        setIsResolving(false);
        return;
      }

      setResolvingMessage(`Rattachement au quartier / commune le plus proche...`);

      // 2. Find nearest city related to that coords from backend city list (exact old Tranogasy logic)
      const nearestCity = await cityService.getNearestCity(placeCoords, placeName);

      if (nearestCity) {
        onSelectCity({
          ...nearestCity,
          googlePlaceName: placeName,
          isGoogleResult: true,
        });
        onCoordsChange(placeCoords);
        setMapCenter(placeCoords);
        setMapZoom(16);
      } else {
        // Fallback if no matching city in DB within threshold
        const fallbackCity: CityLocation = {
          _id: `google-${prediction.place_id}`,
          province: '',
          region: '',
          district: '',
          commune: prediction.structured_formatting?.secondary_text || 'Madagascar',
          fokontany: placeName,
          coords: placeCoords,
          googlePlaceName: placeName,
          isGoogleResult: true,
        };
        onSelectCity(fallbackCity);
        onCoordsChange(placeCoords);
        setMapCenter(placeCoords);
        setMapZoom(16);
      }

      setQuery('');
      setGooglePredictions([]);
      setBackendResults([]);
      setIsDropdownOpen(false);
    } catch (err) {
      console.error('Error resolving Google Place:', err);
      alert('Une erreur est survenue lors de la sélection du lieu.');
    } finally {
      setIsResolving(false);
      setResolvingMessage('');
    }
  };

  // Handle selection of a backend city (fallback)
  const handleChooseBackendCity = (city: CityLocation) => {
    onSelectCity(city);
    if (city.coords) {
      onCoordsChange(city.coords);
      setMapCenter(city.coords);
      setMapZoom(15);
    }
    setQuery('');
    setGooglePredictions([]);
    setBackendResults([]);
    setIsDropdownOpen(false);
  };

  // Handle map click to refine coordinates
  const handleMapClick = (e: MapMouseEvent) => {
    if (e.detail?.latLng) {
      const newCoords = {
        lat: e.detail.latLng.lat,
        lng: e.detail.latLng.lng,
      };
      onCoordsChange(newCoords);
    }
  };

  // Get current device GPS position
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas prise en charge par votre navigateur.");
      return;
    }

    setIsLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        onCoordsChange(userCoords);
        setMapCenter(userCoords);
        setMapZoom(16);

        // Also find nearest city automatically
        try {
          const nearest = await cityService.getNearestCity(userCoords);
          if (nearest) {
            onSelectCity({
              ...nearest,
              googlePlaceName: 'Position GPS actuelle',
              isGoogleResult: true,
            });
          }
        } catch {
          // Keep coords
        } finally {
          setIsLocatingUser(false);
        }
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        alert("Impossible de récupérer votre position GPS actuelle.");
        setIsLocatingUser(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const activePosition = coords || selectedCity?.coords;

  return (
    <div className="w-full space-y-4">
      <div>
        <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
          <span>Localisation de la propriété</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-brand-green/10 text-brand-green dark:bg-brand-green/20">
            Madagascar
          </span>
        </h3>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Recherchez par lieu Google Places ou nom de commune / fokontany, puis affinez le repère sur la carte.
        </p>
      </div>

      {/* 1. Location Selection Input / Dropdown */}
      {!selectedCity ? (
        <div className="relative">
          <div className="relative flex items-center group">
            <div className="absolute left-3 w-8 h-8 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center pointer-events-none transition-transform duration-200 group-focus-within:scale-110">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Rechercher un lieu Google Places ou fokontany (ex: Ivandry, Ambatobe, Tamatave...)"
              className="w-full pl-12 pr-10 py-2.5 sm:py-3 text-sm sm:text-base font-medium rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 focus:border-brand-green dark:focus:border-brand-green focus:outline-none focus:ring-4 focus:ring-brand-green/15 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-all shadow-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setGooglePredictions([]);
                  setBackendResults([]);
                  setSearchSource('popular');
                  setIsDropdownOpen(false);
                }}
                className="absolute right-3 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {isLoading && (
              <Loader2 className="w-4 h-4 absolute right-9 animate-spin text-brand-green" />
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl divide-y divide-zinc-100 dark:divide-zinc-800 animate-in fade-in zoom-in-95 duration-150">
              {/* Resolving overlay message */}
              {isResolving && (
                <div className="p-4 flex items-center justify-center gap-3 text-sm text-brand-green bg-emerald-50/60 dark:bg-emerald-950/40">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="font-medium">{resolvingMessage || 'Localisation en cours...'}</span>
                </div>
              )}

              {/* 1. Google Places Results (Priority) */}
              {!isResolving && searchSource === 'google' && googlePredictions.length > 0 && (
                <div className="p-2 space-y-1">
                  <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-blue-500" />
                      Lieux Google Places (Madagascar)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold">
                      Google API
                    </span>
                  </div>

                  {googlePredictions.map((pred) => (
                    <button
                      key={pred.place_id}
                      type="button"
                      onClick={() => handleSelectGooglePlace(pred)}
                      className="w-full flex items-start gap-3 p-3 rounded-xl text-left hover:bg-blue-50/70 dark:hover:bg-blue-950/30 transition-colors cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shrink-0 group-hover:scale-105 transition-transform">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                          {pred.structured_formatting?.main_text || pred.description}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                          {pred.structured_formatting?.secondary_text || 'Madagascar'}
                        </div>
                      </div>
                    </button>
                  ))}

                  {/* Quick button to search backend city list directly */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => fallbackToBackendSearch(query)}
                      className="w-full text-center py-2 text-xs font-semibold text-brand-green hover:underline cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Building className="w-3.5 h-3.5" />
                      <span>Rechercher plutôt dans la base des communes et fokontany Tranogasy</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Backend Fallback Results */}
              {!isResolving && searchSource === 'backend' && (
                <div className="p-2 space-y-1">
                  <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-brand-green" />
                      Base des Villes & Fokontany (Madagascar)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-brand-green font-semibold">
                      Tranogasy DB
                    </span>
                  </div>

                  {backendResults.length > 0 ? (
                    backendResults.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => handleChooseBackendCity(c)}
                        className="w-full flex items-start gap-3 p-3 rounded-xl text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-brand-green shrink-0 group-hover:scale-105 transition-transform">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-zinc-900 dark:text-white group-hover:text-brand-green transition-colors truncate">
                            {c.fokontany}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            {c.commune} • {c.district} ({c.region})
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs sm:text-sm text-zinc-500">
                      Aucun quartier trouvé pour "{query}". Essayez un autre mot-clé ou pointez directement sur la carte.
                    </div>
                  )}
                </div>
              )}

              {/* 3. Popular Madagascar Sectors (When query is empty) */}
              {!isResolving && searchSource === 'popular' && (
                <div className="p-2 space-y-1">
                  <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Secteurs populaires à Madagascar
                    </span>
                  </div>
                  {popularCities.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => handleChooseBackendCity(c)}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-xs sm:text-sm text-zinc-800 dark:text-zinc-200"
                    >
                      <MapPin className="w-3.5 h-3.5 text-brand-green shrink-0" />
                      <span className="font-semibold truncate">{c.fokontany}</span>
                      <span className="text-zinc-400 text-xs truncate">({c.commune})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Selected Location Badge Card */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-brand-green/30 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-brand-green text-white shadow-sm shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span>
                  {selectedCity.fokontany}, {selectedCity.commune}
                </span>
                {selectedCity.isGoogleResult && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Google Places
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {selectedCity.district} • {selectedCity.region} ({selectedCity.province})
              </div>
              {selectedCity.googlePlaceName && (
                <div className="text-xs text-brand-green dark:text-emerald-400 font-medium mt-0.5">
                  📍 Repéré : {selectedCity.googlePlaceName}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectCity(null);
              setQuery('');
              setIsDropdownOpen(true);
            }}
            className="self-start sm:self-auto px-4 py-2 rounded-full text-xs font-bold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all border border-zinc-200/80 dark:border-zinc-700 shadow-xs cursor-pointer"
          >
            Changer d'emplacement
          </button>
        </div>
      )}

      {/* 2. Interactive Google Map Location Picker */}
      <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm h-64 sm:h-80 md:h-96 w-full">
        <Map
          center={mapCenter}
          zoom={mapZoom}
          minZoom={5}
          mapId={GOOGLE_MAP_ID}
          onClick={handleMapClick}
          gestureHandling="cooperative"
          disableDefaultUI={false}
        >
          {activePosition && (
            <>
              <AdvancedMarker position={activePosition}>
                <Pin background="#7cbd1e" glyphColor="white" borderColor="#5b8f14" />
              </AdvancedMarker>
              <Circle
                center={activePosition}
                radius={400}
                strokeColor="#7cbd1e"
                strokeOpacity={0.8}
                strokeWeight={2}
                fillColor="#7cbd1e"
                fillOpacity={0.15}
              />
            </>
          )}
        </Map>

        {/* Map Overlay Controls */}
        <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocatingUser}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-white shadow-md backdrop-blur-md hover:bg-white dark:hover:bg-zinc-800 transition-all border border-zinc-200/80 dark:border-zinc-800 cursor-pointer"
          >
            {isLocatingUser ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-green" />
            ) : (
              <Crosshair className="w-3.5 h-3.5 text-brand-green" />
            )}
            <span>Ma position GPS</span>
          </button>

          {activePosition && (
            <div className="hidden sm:flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-mono font-medium bg-black/60 text-white backdrop-blur-md">
              <span>
                {activePosition.lat.toFixed(4)}, {activePosition.lng.toFixed(4)}
              </span>
            </div>
          )}
        </div>

        <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none">
          <div className="inline-block px-3 py-1.5 rounded-xl bg-black/70 text-white text-[11px] font-medium backdrop-blur-md">
            Cliquez sur la carte pour affiner l'emplacement exact de votre bien
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ListingLocationPicker(props: ListingLocationPickerProps) {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places']}>
      <ListingLocationPickerContent {...props} />
    </APIProvider>
  );
}
