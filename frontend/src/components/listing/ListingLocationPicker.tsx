'use client';

import React, { useState, useEffect } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Search,
  Crosshair,
  X,
  Check,
  Building,
  Navigation,
  Compass,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useCitySearch } from '@/hooks/useCitySearch';
import { CityLocation } from '@/services/city.service';
import { Circle } from '../map/Circle';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBPQYtD-cm2GmdJGXhFcD7_2vXTkyPXqOs';
const GOOGLE_MAP_ID = '80e7a8f8db80acb5';

interface ListingLocationPickerProps {
  selectedCity: CityLocation | null;
  onSelectCity: (city: CityLocation | null) => void;
  coords: { lat: number; lng: number } | null;
  onCoordsChange: (coords: { lat: number; lng: number } | null) => void;
}

export default function ListingLocationPicker({
  selectedCity,
  onSelectCity,
  coords,
  onCoordsChange,
}: ListingLocationPickerProps) {
  const { query, results, popularCities, isLoading, search, clear } = useCitySearch();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: -18.8792,
    lng: 47.5079, // Antananarivo center
  });
  const [mapZoom, setMapZoom] = useState(13);

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

  // Handle map click to set exact coordinates
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
      (pos) => {
        const userCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        onCoordsChange(userCoords);
        setMapCenter(userCoords);
        setMapZoom(16);
        setIsLocatingUser(false);
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        alert("Impossible de récupérer votre position GPS actuelle.");
        setIsLocatingUser(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleChooseCity = (city: CityLocation) => {
    onSelectCity(city);
    if (city.coords) {
      onCoordsChange(city.coords);
      setMapCenter(city.coords);
      setMapZoom(15);
    }
    clear();
    setIsDropdownOpen(false);
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
          Indiquez le quartier / fokontany et ajustez l'emplacement exact sur la carte.
        </p>
      </div>

      {/* 1. Location Selection Input / Card */}
      {!selectedCity ? (
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 absolute left-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                search(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Rechercher un quartier, fokontany ou commune (ex: Ivandry, Ambatobe, Tamatave...)"
              className="w-full pl-11 pr-10 py-3.5 text-sm sm:text-base rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-brand-green dark:focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20 text-zinc-900 dark:text-white transition-all shadow-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  clear();
                  setIsDropdownOpen(false);
                }}
                className="absolute right-3 p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
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
            <div className="absolute top-full left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl divide-y divide-zinc-100 dark:divide-zinc-800 animate-in fade-in zoom-in-95 duration-150">
              {results.length > 0 ? (
                results.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => handleChooseCity(c)}
                    className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer group"
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
              ) : query.trim() ? (
                <div className="p-4 text-center text-xs sm:text-sm text-zinc-500">
                  Aucun quartier trouvé pour "{query}". Essayez un nom de commune ou sélectionnez ci-dessous.
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Secteurs populaires à Madagascar
                  </div>
                  {popularCities.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => handleChooseCity(c)}
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-brand-green/30 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-brand-green text-white shadow-sm shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                {selectedCity.fokontany}, {selectedCity.commune}
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                {selectedCity.district} • {selectedCity.region} ({selectedCity.province})
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectCity(null);
              setIsDropdownOpen(true);
            }}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all border border-zinc-200/80 dark:border-zinc-700 shadow-xs cursor-pointer"
          >
            Changer d'emplacement
          </button>
        </div>
      )}

      {/* 2. Interactive Google Map Location Picker */}
      <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm h-64 sm:h-80 md:h-96 w-full">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
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
        </APIProvider>

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
              <span>{activePosition.lat.toFixed(4)}, {activePosition.lng.toFixed(4)}</span>
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

