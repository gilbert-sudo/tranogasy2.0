'use client';

import React, { useState, useMemo, memo } from 'react';
import {
  X,
  RotateCcw,
  Sparkles,
  Search,
  MapPin,
  Radar,
  SlidersHorizontal,
  Check,
  Map as MapIcon,
  LayoutGrid,
  Play,
  BedDouble,
  Bath,
  Maximize,
  Crosshair,
} from 'lucide-react';
import { AMENITIES_CATEGORIES } from '@/components/listing/ListingAmenitiesSelector';
import {
  SearchFilters,
  OfferTypeFilter,
  HouseCategoryFilter,
  PlacementFilter,
  SearchViewMode,
  SearchSortBy,
} from '@/store/searchStore';
import {
  formatCompactPrice,
  formatNumberWithSpaces,
} from '@/hooks/usePropertySearch';

interface AdvancedFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: SearchFilters;
  priceStats: {
    min: number;
    max: number;
    avg: number;
    step: number;
    histogram: number[];
  };
  totalMatching: number;
  rawMatchingWithoutRadius: number;
  activeFiltersCount: number;
  viewMode: SearchViewMode;
  onSetFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  onToggleFeature: (featureKey: string) => void;
  onResetFilters: () => void;
  onSetViewMode: (mode: SearchViewMode) => void;
  onLocateUser: (applyZone?: boolean) => void;
  onClearLocationZone: () => void;
}

const RENT_PRESETS = [
  { label: '< 400k Ar', min: null, max: 400_000 },
  { label: '400k – 800k Ar', min: 400_000, max: 800_000 },
  { label: '800k – 1.5M Ar', min: 800_000, max: 1_500_000 },
  { label: '1.5M – 3M Ar', min: 1_500_000, max: 3_000_000 },
  { label: '3M+ Ar', min: 3_000_000, max: null },
];

const SALE_PRESETS = [
  { label: '< 50M Ar', min: null, max: 50_000_000 },
  { label: '50M – 150M Ar', min: 50_000_000, max: 150_000_000 },
  { label: '150M – 350M Ar', min: 150_000_000, max: 350_000_000 },
  { label: '350M+ Ar', min: 350_000_000, max: null },
];

const RADIUS_PILLS = [
  { label: 'Toute la carte', value: 0 },
  { label: '500 m', value: 500 },
  { label: '800 m', value: 800 },
  { label: '1.5 km', value: 1500 },
  { label: '3 km', value: 3000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
];

function AdvancedFilterModalComponent({
  isOpen,
  onClose,
  filters,
  priceStats,
  totalMatching,
  rawMatchingWithoutRadius,
  activeFiltersCount,
  viewMode,
  onSetFilter,
  onToggleFeature,
  onResetFilters,
  onSetViewMode,
  onLocateUser,
  onClearLocationZone,
}: AdvancedFilterModalProps) {
  const [amenitySearch, setAmenitySearch] = useState('');
  const [activeAmenityTab, setActiveAmenityTab] = useState<string>('all');
  const [customRoomsText, setCustomRoomsText] = useState('');

  const filteredAmenityCategories = useMemo(() => {
    const q = amenitySearch.trim().toLowerCase();
    return AMENITIES_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          !q ||
          item.label.toLowerCase().includes(q) ||
          cat.title.toLowerCase().includes(q)
      ),
    })).filter((cat) => {
      if (q) return cat.items.length > 0;
      return activeAmenityTab === 'all' || activeAmenityTab === cat.title;
    });
  }, [amenitySearch, activeAmenityTab]);

  if (!isOpen) return null;

  const sliderMin = priceStats.min;
  const sliderMax = priceStats.max;
  const currentMin = filters.budgetMin !== null ? filters.budgetMin : sliderMin;
  const currentMax = filters.budgetMax !== null ? filters.budgetMax : sliderMax;

  const minPercent = Math.max(
    0,
    Math.min(100, ((currentMin - sliderMin) / (sliderMax - sliderMin || 1)) * 100)
  );
  const maxPercent = Math.max(
    0,
    Math.min(100, ((currentMax - sliderMin) / (sliderMax - sliderMin || 1)) * 100)
  );

  const presets = filters.type === 'sale' ? SALE_PRESETS : RENT_PRESETS;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-4 md:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 font-outfit select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[92dvh] sm:max-h-[88dvh] flex flex-col
          rounded-t-[2.75rem] sm:rounded-[2.75rem]
          bg-white/95 dark:bg-zinc-900/95 backdrop-blur-3xl
          border border-white/80 dark:border-white/15
          shadow-[0_24px_80px_rgba(0,0,0,0.4)]
          overflow-hidden animate-glass-island"
      >
        {/* Mobile Drag Handle Indicator */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-4 sm:py-5 border-b border-zinc-200/70 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-md">
              <SlidersHorizontal className="w-5 h-5 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg sm:text-xl font-normal tracking-tight text-zinc-900 dark:text-white">
                  Studio de Recherche
                </h2>
                {activeFiltersCount > 0 && (
                  <span className="px-3 py-0.5 rounded-full bg-brand-green/15 text-brand-green text-xs font-light tracking-wider border border-brand-green/30">
                    {activeFiltersCount} filtre{activeFiltersCount > 1 ? 's' : ''} actif
                    {activeFiltersCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs font-light tracking-wide text-zinc-500 dark:text-zinc-400">
                Affinez vos critères en temps réel sur la carte et le catalogue
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition-all active:scale-90 cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5 stroke-[1.75]" />
          </button>
        </div>

        {/* ── SCROLLABLE STUDIO BODY ── */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 space-y-8 no-scrollbar">
          {/* 1. TYPE D'OFFRE & CATÉGORIE DE BIEN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Offer Type */}
            <div className="p-5 sm:p-6 rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-3.5">
              <span className="text-xs font-light uppercase tracking-widest text-zinc-400 block">
                Type de transaction
              </span>
              <div className="flex flex-wrap gap-2.5">
                {(
                  [
                    { id: 'rent', label: 'Location' },
                    { id: 'sale', label: 'Vente' },
                    { id: 'all', label: 'Tous' },
                  ] as Array<{ id: OfferTypeFilter; label: string }>
                ).map((item) => {
                  const isActive = filters.type === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSetFilter('type', item.id)}
                      className={`flex-1 min-w-[95px] px-6 py-3.5 rounded-full text-sm font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
                        isActive
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-[0_8px_24px_rgba(0,0,0,0.18)]'
                          : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 hover:border-zinc-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Property Category */}
            <div className="p-5 sm:p-6 rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-3.5">
              <span className="text-xs font-light uppercase tracking-widest text-zinc-400 block">
                Nature du bien
              </span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'all', label: 'Tous' },
                    { id: 'appartement', label: 'Appartement' },
                    { id: 'maison', label: 'Maison' },
                    { id: 'villa', label: 'Villa' },
                    { id: 'bureau', label: 'Bureau' },
                  ] as Array<{ id: HouseCategoryFilter; label: string }>
                ).map((cat) => {
                  const isActive = filters.houseType === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onSetFilter('houseType', cat.id)}
                      className={`px-5 py-3 rounded-full text-xs sm:text-sm font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
                        isActive
                          ? 'bg-brand-green text-white font-normal shadow-[0_8px_20px_rgba(124,189,30,0.35)]'
                          : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 hover:border-zinc-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. BUDGET INTELLIGENT & HISTOGRAMME EN TEMPS RÉEL */}
          <div className="p-6 sm:p-7 rounded-[2.25rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-light uppercase tracking-widest text-zinc-400 block">
                  Budget {filters.type === 'sale' ? 'd’achat (en Ariary)' : 'mensuel (en Ar / mois)'}
                </span>
                <p className="text-sm sm:text-base font-normal text-zinc-900 dark:text-white mt-0.5">
                  {filters.budgetMin ? `${formatNumberWithSpaces(filters.budgetMin)} Ar` : 'Aucun min'}{' '}
                  <span className="text-zinc-400 font-light">→</span>{' '}
                  {filters.budgetMax ? `${formatNumberWithSpaces(filters.budgetMax)} Ar` : 'Illimité'}
                </p>
              </div>
              <span className="px-4 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-xs font-light text-zinc-500 dark:text-zinc-400">
                Moyenne : {formatCompactPrice(priceStats.avg)} Ar
              </span>
            </div>

            {/* 24-Bar Price Distribution Histogram + Dual Range Slider */}
            <div className="pt-2 pb-1">
              <div className="flex items-end gap-1 h-16 px-2">
                {priceStats.histogram.map((heightPct, idx) => {
                  const barPct = (idx / priceStats.histogram.length) * 100;
                  const inSelectedRange = barPct >= minPercent - 3 && barPct <= maxPercent + 3;
                  return (
                    <div
                      key={idx}
                      style={{ height: `${heightPct}%` }}
                      className={`flex-1 rounded-t-full transition-all duration-300 ${
                        inSelectedRange
                          ? 'bg-brand-green/85 dark:bg-brand-green'
                          : 'bg-zinc-200 dark:bg-zinc-700/50'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Dual Range Track */}
              <div className="relative h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 mt-2">
                <div
                  className="absolute h-full rounded-full bg-brand-green"
                  style={{
                    left: `${minPercent}%`,
                    width: `${Math.max(0, maxPercent - minPercent)}%`,
                  }}
                />
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={priceStats.step}
                  value={currentMin}
                  onChange={(e) => {
                    const val = Math.min(Number(e.target.value), currentMax - priceStats.step);
                    onSetFilter('budgetMin', val <= sliderMin ? null : val);
                  }}
                  aria-label="Budget minimum"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                />
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={priceStats.step}
                  value={currentMax}
                  onChange={(e) => {
                    const val = Math.max(Number(e.target.value), currentMin + priceStats.step);
                    onSetFilter('budgetMax', val >= sliderMax ? null : val);
                  }}
                  aria-label="Budget maximum"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer pointer-events-auto"
                />
              </div>
            </div>

            {/* Min / Max Formatted Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="relative">
                <label className="block text-[11px] font-light uppercase tracking-widest text-zinc-400 mb-1.5 pl-4">
                  Minimum (Ar)
                </label>
                <input
                  type="tel"
                  placeholder="Ex: 300 000"
                  value={formatNumberWithSpaces(filters.budgetMin)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\s/g, '');
                    if (!/^\d*$/.test(raw)) return;
                    onSetFilter('budgetMin', raw ? Number(raw) : null);
                  }}
                  className="w-full px-6 py-3.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm font-light tracking-wider text-zinc-900 dark:text-white focus:border-brand-green outline-none transition-all"
                />
              </div>

              <div className="relative">
                <label className="block text-[11px] font-light uppercase tracking-widest text-zinc-400 mb-1.5 pl-4">
                  Maximum (Ar)
                </label>
                <input
                  type="tel"
                  placeholder="Ex: 1 500 000"
                  value={formatNumberWithSpaces(filters.budgetMax)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\s/g, '');
                    if (!/^\d*$/.test(raw)) return;
                    onSetFilter('budgetMax', raw ? Number(raw) : null);
                  }}
                  className="w-full px-6 py-3.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm font-light tracking-wider text-zinc-900 dark:text-white focus:border-brand-green outline-none transition-all"
                />
              </div>
            </div>

            {/* 1-Tap Budget Presets (Big Padding, Thin Font, Very Rounded) */}
            <div className="flex flex-wrap gap-2 pt-1">
              {presets.map((preset) => {
                const isSelected =
                  filters.budgetMin === preset.min && filters.budgetMax === preset.max;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        onSetFilter('budgetMin', null);
                        onSetFilter('budgetMax', null);
                      } else {
                        onSetFilter('budgetMin', preset.min);
                        onSetFilter('budgetMax', preset.max);
                      }
                    }}
                    className={`px-5 py-2.5 rounded-full text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-sm'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/80 hover:border-brand-green'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. ZONE RADAR GÉOGRAPHIQUE & TRI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Radar Radius */}
            <div className="p-5 sm:p-6 rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-light uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <Radar className="w-3.5 h-3.5 text-brand-green" />
                  <span>Rayon géographique</span>
                </span>
                {filters.searchPlaceName ? (
                  <button
                    type="button"
                    onClick={onClearLocationZone}
                    className="text-xs font-light text-brand-green hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3" />
                    <span className="truncate max-w-[140px]">{filters.searchPlaceName}</span>
                    <X className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onLocateUser(true)}
                    className="text-xs font-light text-brand-green hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Utiliser mon GPS</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {RADIUS_PILLS.map((r) => {
                  const isActive = filters.searchRadius === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => onSetFilter('searchRadius', r.value)}
                      className={`px-4.5 py-2.5 rounded-full text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
                        isActive
                          ? 'bg-brand-green text-white font-normal shadow-sm'
                          : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sort Order */}
            <div className="p-5 sm:p-6 rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-3.5">
              <span className="text-xs font-light uppercase tracking-widest text-zinc-400 block">
                Ordre de tri des résultats
              </span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'newest', label: 'Plus récents' },
                    { id: 'relevance', label: 'Meilleur score' },
                    { id: 'price_asc', label: 'Prix croissant' },
                    { id: 'price_desc', label: 'Prix décroissant' },
                    { id: 'distance', label: 'Proximité GPS' },
                  ] as Array<{ id: SearchSortBy; label: string }>
                ).map((s) => {
                  const isActive = filters.sortBy === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSetFilter('sortBy', s.id)}
                      className={`px-4.5 py-2.5 rounded-full text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
                        isActive
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-sm'
                          : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. PIÈCES, SALLES DE BAIN, SURFACE & SANITAIRES (INTÉRIEUR / EXTÉRIEUR) */}
          <div className="p-6 sm:p-7 rounded-[2.25rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-6">
            <span className="text-xs font-light uppercase tracking-widest text-zinc-400 block">
              Configuration, Espaces & Emplacement Sanitaire
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Minimum Rooms */}
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 text-xs sm:text-sm font-normal text-zinc-800 dark:text-zinc-200">
                  <BedDouble className="w-4 h-4 text-brand-green stroke-[1.75]" />
                  <span>Nombre de pièces minimum</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {[0, 1, 2, 3, 4, 5].map((num) => {
                    const isActive = filters.minRooms === num && !customRoomsText;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setCustomRoomsText('');
                          onSetFilter('minRooms', num);
                        }}
                        className={`px-5 py-3 rounded-full text-xs sm:text-sm font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
                          isActive
                            ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-sm'
                            : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                        }`}
                      >
                        {num === 0 ? 'Tous' : `${num}+`}
                      </button>
                    );
                  })}
                  <input
                    type="number"
                    min={1}
                    max={30}
                    placeholder="Autre..."
                    value={customRoomsText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomRoomsText(val);
                      onSetFilter('minRooms', val ? Math.max(0, Number(val)) : 0);
                    }}
                    className="w-24 px-4 py-3 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-light text-center text-zinc-900 dark:text-white outline-none focus:border-brand-green"
                  />
                </div>
              </div>

              {/* Minimum Bathrooms & Surface */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2 text-xs sm:text-sm font-normal text-zinc-800 dark:text-zinc-200">
                    <Bath className="w-4 h-4 text-brand-green stroke-[1.75]" />
                    <span>Salles d&apos;eau</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[0, 1, 2, 3].map((b) => {
                      const isActive = filters.minBathrooms === b;
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => onSetFilter('minBathrooms', b)}
                          className={`px-4 py-3 rounded-full text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
                            isActive
                              ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-sm'
                              : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                          }`}
                        >
                          {b === 0 ? 'Tous' : `${b}+`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <label className="flex items-center gap-2 text-xs sm:text-sm font-normal text-zinc-800 dark:text-zinc-200">
                    <Maximize className="w-4 h-4 text-brand-green stroke-[1.75]" />
                    <span>Surface min (m²)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Ex: 60 m²"
                    value={filters.minArea || ''}
                    onChange={(e) =>
                      onSetFilter(
                        'minArea',
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="w-full px-5 py-3 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-light tracking-wider text-zinc-900 dark:text-white outline-none focus:border-brand-green"
                  />
                </div>
              </div>
            </div>

            {/* Emplacement WC & Douche (Intérieur / Extérieur - Inspired by original Tranogasy) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-zinc-200/60 dark:border-zinc-800">
              {/* WC */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-light text-zinc-600 dark:text-zinc-300">
                  Emplacement WC :
                </span>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Tous' },
                      { id: 'inside', label: 'Intérieur' },
                      { id: 'outside', label: 'Extérieur' },
                    ] as Array<{ id: PlacementFilter; label: string }>
                  ).map((opt) => {
                    const isActive = filters.insideToilet === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetFilter('insideToilet', opt.id)}
                        className={`px-4.5 py-2.5 rounded-full text-xs font-light tracking-wider transition-all cursor-pointer ${
                          isActive
                            ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-xs'
                            : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Douche */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-light text-zinc-600 dark:text-zinc-300">
                  Emplacement Douche :
                </span>
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'all', label: 'Tous' },
                      { id: 'inside', label: 'Intérieur' },
                      { id: 'outside', label: 'Extérieur' },
                    ] as Array<{ id: PlacementFilter; label: string }>
                  ).map((opt) => {
                    const isActive = filters.insideBathroom === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetFilter('insideBathroom', opt.id)}
                        className={`px-4.5 py-2.5 rounded-full text-xs font-light tracking-wider transition-all cursor-pointer ${
                          isActive
                            ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-xs'
                            : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 5. ÉQUIPEMENTS & PRESTATIONS (ALL 36 FEATURES) */}
          <div className="p-6 sm:p-7 rounded-[2.25rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-light uppercase tracking-widest text-zinc-400 block">
                  Critères & Équipements Recherchés
                </span>
                <p className="text-xs font-light text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Sélectionnez les atouts indispensables pour votre futur bien
                </p>
              </div>

              {/* Search inside amenities */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={amenitySearch}
                  onChange={(e) => setAmenitySearch(e.target.value)}
                  placeholder="Filtrer un équipement..."
                  className="w-full pl-10 pr-8 py-2.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs font-light tracking-wider text-zinc-900 dark:text-white outline-none focus:border-brand-green"
                />
                {amenitySearch && (
                  <button
                    type="button"
                    onClick={() => setAmenitySearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setActiveAmenityTab('all')}
                className={`px-5 py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  activeAmenityTab === 'all'
                    ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                }`}
              >
                Toutes catégories
              </button>
              {AMENITIES_CATEGORIES.map((cat) => (
                <button
                  key={cat.title}
                  type="button"
                  onClick={() => setActiveAmenityTab(cat.title)}
                  className={`px-5 py-2.5 rounded-full text-xs font-light tracking-wider whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                    activeAmenityTab === cat.title
                      ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700'
                  }`}
                >
                  {cat.title}
                </button>
              ))}
            </div>

            {/* Amenity Pills Grid (Big Padding, Thin Font, Very Rounded) */}
            <div className="space-y-6">
              {filteredAmenityCategories.map((cat) => (
                <div key={cat.title} className="space-y-3">
                  <h4 className="text-xs font-normal tracking-wider text-zinc-500 dark:text-zinc-400 pl-1">
                    {cat.title}
                  </h4>
                  <div className="flex flex-wrap gap-2.5">
                    {cat.items.map((item) => {
                      const Icon = item.icon;
                      const isSelected = Boolean(filters.features[item.key]);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => onToggleFeature(item.key)}
                          className={`group flex items-center gap-2.5 px-5 sm:px-6 py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer border ${
                            isSelected
                              ? 'bg-brand-green text-white border-brand-green font-normal shadow-[0_8px_20px_rgba(124,189,30,0.3)]'
                              : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 border-zinc-200/80 dark:border-zinc-700/80 hover:border-brand-green/60'
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                              isSelected ? 'text-white' : 'text-brand-green'
                            }`}
                          />
                          <span>{item.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-white ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── STICKY FUTURISTIC FOOTER (Big Padding, Thin Font, Ultra-Rounded Buttons) ── */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 border-t border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          {/* Left: Reset + Result Info */}
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs sm:text-sm font-light tracking-wider transition-all active:scale-95 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 stroke-[1.75]" />
              <span>Réinitialiser</span>
            </button>

            {totalMatching === 0 && rawMatchingWithoutRadius > 0 && filters.searchRadius > 0 && (
              <button
                type="button"
                onClick={() => onSetFilter('searchRadius', 0)}
                className="px-4 py-2.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-xs font-light tracking-wide cursor-pointer"
              >
                {rawMatchingWithoutRadius} hors radar • Voir toute la carte
              </button>
            )}
          </div>

          {/* Right: Mode Selection + Primary Big-Padding CTA Button */}
          <div className="flex items-center gap-2.5">
            {/* Quick Mode Selector Pills */}
            <div className="hidden md:flex items-center p-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700">
              {(
                [
                  { id: 'map', label: 'Carte', icon: MapIcon },
                  { id: 'list', label: 'Liste', icon: LayoutGrid },
                  { id: 'feed', label: 'Feed', icon: Play },
                ] as Array<{ id: SearchViewMode; label: string; icon: React.ElementType }>
              ).map((m) => {
                const Icon = m.icon;
                const isAct = viewMode === m.id || (m.id === 'map' && viewMode === 'split');
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSetViewMode(m.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-light tracking-wider transition-all cursor-pointer ${
                      isAct
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 stroke-[1.75]" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Primary CTA Button (Big Padding, Thin Font, Very Rounded) */}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-3 px-8 py-4 rounded-full
                bg-zinc-950 dark:bg-white text-white dark:text-zinc-950
                hover:bg-brand-green dark:hover:bg-brand-green dark:hover:text-white
                shadow-[0_12px_32px_rgba(0,0,0,0.25)]
                text-sm sm:text-base font-light tracking-wider
                transition-all duration-300 active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-brand-green shrink-0" />
              <span>
                Explorer{' '}
                <strong className="font-medium">{totalMatching}</strong>{' '}
                {totalMatching > 1 ? 'propriétés' : 'propriété'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const AdvancedFilterModal = memo(
  AdvancedFilterModalComponent,
  (prev, next) => !prev.isOpen && !next.isOpen
);

export default AdvancedFilterModal;

