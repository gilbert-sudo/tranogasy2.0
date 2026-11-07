'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, memo, startTransition } from 'react';
import {
  X,
  RotateCcw,
  Sparkles,
  Search,
  MapPin,
  Radar,
  SlidersHorizontal,
  Check,
  CheckCheck,
  Map as MapIcon,
  LayoutGrid,
  Play,
  BedDouble,
  Bath,
  Maximize,
  Crosshair,
} from 'lucide-react';
import {
  AMENITIES_CATEGORIES,
  AmenityCategory,
} from '@/components/listing/ListingAmenitiesSelector';
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

interface BudgetRangeSectionProps {
  offerType: OfferTypeFilter;
  budgetMin: number | null;
  budgetMax: number | null;
  priceStats: {
    min: number;
    max: number;
    avg: number;
    step: number;
    histogram: number[];
  };
  onSetFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
}

const BudgetRangeSection = memo(function BudgetRangeSection({
  offerType,
  budgetMin,
  budgetMax,
  priceStats,
  onSetFilter,
}: BudgetRangeSectionProps) {
  const [localMin, setLocalMin] = useState<number | null>(budgetMin);
  const [localMax, setLocalMax] = useState<number | null>(budgetMax);
  const [isDragging, setIsDragging] = useState(false);

  const pendingMinRef = useRef<number | null>(budgetMin);
  const pendingMaxRef = useRef<number | null>(budgetMax);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isDragging) {
      setLocalMin(budgetMin);
      pendingMinRef.current = budgetMin;
    }
  }, [budgetMin, isDragging]);

  useEffect(() => {
    if (!isDragging) {
      setLocalMax(budgetMax);
      pendingMaxRef.current = budgetMax;
    }
  }, [budgetMax, isDragging]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const scheduleCommit = useCallback(
    (nextMin: number | null, nextMax: number | null, immediate = false) => {
      pendingMinRef.current = nextMin;
      pendingMaxRef.current = nextMax;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (immediate) {
        startTransition(() => {
          onSetFilter('budgetMin', nextMin);
          onSetFilter('budgetMax', nextMax);
        });
        return;
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        startTransition(() => {
          onSetFilter('budgetMin', pendingMinRef.current);
          onSetFilter('budgetMax', pendingMaxRef.current);
        });
      }, 90);
    },
    [onSetFilter]
  );

  const handleRelease = useCallback(() => {
    setIsDragging(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    startTransition(() => {
      onSetFilter('budgetMin', pendingMinRef.current);
      onSetFilter('budgetMax', pendingMaxRef.current);
    });
  }, [onSetFilter]);

  const sliderMin = priceStats.min;
  const sliderMax = priceStats.max;
  const currentMin = localMin !== null ? localMin : sliderMin;
  const currentMax = localMax !== null ? localMax : sliderMax;

  const minPercent = Math.max(
    0,
    Math.min(100, ((currentMin - sliderMin) / (sliderMax - sliderMin || 1)) * 100)
  );
  const maxPercent = Math.max(
    0,
    Math.min(100, ((currentMax - sliderMin) / (sliderMax - sliderMin || 1)) * 100)
  );

  const presets = offerType === 'sale' ? SALE_PRESETS : RENT_PRESETS;

  return (
    <div className="p-3.5 sm:p-7 rounded-2xl sm:rounded-[2.25rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-3 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[11px] sm:text-xs font-light uppercase tracking-widest text-zinc-400 block">
            Budget {offerType === 'sale' ? 'd’achat (en Ariary)' : 'mensuel (en Ar / mois)'}
          </span>
          <p className="text-xs sm:text-base font-normal text-zinc-900 dark:text-white mt-0.5 tabular-nums">
            {localMin ? `${formatNumberWithSpaces(localMin)} Ar` : 'Aucun min'}{' '}
            <span className="text-zinc-400 font-light">→</span>{' '}
            {localMax ? `${formatNumberWithSpaces(localMax)} Ar` : 'Illimité'}
          </p>
        </div>
        <span className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-700 text-[11px] sm:text-xs font-light text-zinc-500 dark:text-zinc-400">
          Moyenne : {formatCompactPrice(priceStats.avg)} Ar
        </span>
      </div>

      {/* 24-Bar Price Distribution Histogram + Dual Range Slider */}
      <div className="pt-1 sm:pt-2 pb-1.5 sm:pb-2 px-2">
        <div className="flex items-end gap-1 h-11 sm:h-16">
          {priceStats.histogram.map((heightPct, idx) => {
            const barPct = (idx / priceStats.histogram.length) * 100;
            const inSelectedRange = barPct >= minPercent - 3 && barPct <= maxPercent + 3;
            return (
              <div
                key={idx}
                style={{ height: `${heightPct}%` }}
                className={`flex-1 rounded-t-full ${
                  isDragging ? '' : 'transition-colors duration-200'
                } ${
                  inSelectedRange
                    ? 'bg-brand-green/85 dark:bg-brand-green'
                    : 'bg-zinc-200 dark:bg-zinc-700/50'
                }`}
              />
            );
          })}
        </div>

        {/* Dual Range Track with Round Circle Thumbs at Start & End */}
        <div
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const rawVal = sliderMin + clickPct * (sliderMax - sliderMin);
            const steppedVal = Math.round(rawVal / priceStats.step) * priceStats.step;
            const distToMin = Math.abs(steppedVal - currentMin);
            const distToMax = Math.abs(steppedVal - currentMax);
            if (distToMin <= distToMax) {
              const val = Math.min(steppedVal, currentMax - priceStats.step);
              const nextMin = val <= sliderMin ? null : val;
              setLocalMin(nextMin);
              scheduleCommit(nextMin, localMax, true);
            } else {
              const val = Math.max(steppedVal, currentMin + priceStats.step);
              const nextMax = val >= sliderMax ? null : val;
              setLocalMax(nextMax);
              scheduleCommit(localMin, nextMax, true);
            }
          }}
          className="relative h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 mt-3 mb-1 cursor-pointer"
        >
          <div
            className="absolute h-full rounded-full bg-brand-green pointer-events-none"
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
            onPointerDown={() => setIsDragging(true)}
            onPointerUp={handleRelease}
            onTouchEnd={handleRelease}
            onMouseUp={handleRelease}
            onKeyUp={handleRelease}
            onChange={(e) => {
              const val = Math.min(Number(e.target.value), currentMax - priceStats.step);
              const nextMin = val <= sliderMin ? null : val;
              setLocalMin(nextMin);
              scheduleCommit(nextMin, localMax, false);
            }}
            aria-label="Budget minimum"
            className={`dual-range-input absolute top-0 -left-3 w-[calc(100%+24px)] h-2 m-0 ${
              minPercent > 85 ? 'z-30' : 'z-20'
            }`}
          />
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={priceStats.step}
            value={currentMax}
            onPointerDown={() => setIsDragging(true)}
            onPointerUp={handleRelease}
            onTouchEnd={handleRelease}
            onMouseUp={handleRelease}
            onKeyUp={handleRelease}
            onChange={(e) => {
              const val = Math.max(Number(e.target.value), currentMin + priceStats.step);
              const nextMax = val >= sliderMax ? null : val;
              setLocalMax(nextMax);
              scheduleCommit(localMin, nextMax, false);
            }}
            aria-label="Budget maximum"
            className="dual-range-input absolute top-0 -left-3 w-[calc(100%+24px)] h-2 m-0 z-20"
          />
        </div>
      </div>

      {/* Min / Max Formatted Inputs (Horizontally Aligned) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
        <div className="relative">
          <label className="block text-[10px] sm:text-[11px] font-light uppercase tracking-widest text-zinc-400 mb-1 sm:mb-1.5 pl-3 sm:pl-4">
            Minimum (Ar)
          </label>
          <input
            type="tel"
            placeholder="Ex: 300 000"
            value={formatNumberWithSpaces(localMin)}
            onChange={(e) => {
              const raw = e.target.value.replace(/\s/g, '');
              if (!/^\d*$/.test(raw)) return;
              const nextMin = raw ? Number(raw) : null;
              setLocalMin(nextMin);
              scheduleCommit(nextMin, localMax, false);
            }}
            className="w-full px-3.5 sm:px-6 py-2 sm:py-3.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-light tracking-wider text-zinc-900 dark:text-white focus:border-brand-green outline-none transition-all tabular-nums"
          />
        </div>

        <div className="relative">
          <label className="block text-[10px] sm:text-[11px] font-light uppercase tracking-widest text-zinc-400 mb-1 sm:mb-1.5 pl-3 sm:pl-4">
            Maximum (Ar)
          </label>
          <input
            type="tel"
            placeholder="Ex: 1 500 000"
            value={formatNumberWithSpaces(localMax)}
            onChange={(e) => {
              const raw = e.target.value.replace(/\s/g, '');
              if (!/^\d*$/.test(raw)) return;
              const nextMax = raw ? Number(raw) : null;
              setLocalMax(nextMax);
              scheduleCommit(localMin, nextMax, false);
            }}
            className="w-full px-3.5 sm:px-6 py-2 sm:py-3.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-light tracking-wider text-zinc-900 dark:text-white focus:border-brand-green outline-none transition-all tabular-nums"
          />
        </div>
      </div>

      {/* 1-Tap Budget Presets */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-0.5 sm:pt-1">
        {presets.map((preset) => {
          const isSelected = localMin === preset.min && localMax === preset.max;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                if (isSelected) {
                  setLocalMin(null);
                  setLocalMax(null);
                  scheduleCommit(null, null, true);
                } else {
                  setLocalMin(preset.min);
                  setLocalMax(preset.max);
                  scheduleCommit(preset.min, preset.max, true);
                }
              }}
              className={`px-3.5 sm:px-5 py-1.5 sm:py-2.5 rounded-full text-[11px] sm:text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
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
  );
});

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
  const [animatingKey, setAnimatingKey] = useState<string | null>(null);

  const selectedAmenitiesCount = useMemo(
    () => Object.values(filters.features).filter(Boolean).length,
    [filters.features]
  );

  const filteredAmenityCategories = useMemo(() => {
    const trimmed = amenitySearch.trim().toLowerCase();

    return AMENITIES_CATEGORIES.map((cat) => {
      const matchingItems = cat.items.filter((item) => {
        if (!trimmed) return true;
        return (
          item.label.toLowerCase().includes(trimmed) ||
          cat.title.toLowerCase().includes(trimmed)
        );
      });

      return {
        ...cat,
        items: matchingItems,
      };
    }).filter((cat) => {
      if (trimmed) {
        return cat.items.length > 0;
      }
      return activeAmenityTab === 'all' || activeAmenityTab === cat.title;
    });
  }, [activeAmenityTab, amenitySearch]);

  const handlePillClick = (key: string) => {
    setAnimatingKey(key);
    onToggleFeature(key);
    setTimeout(() => {
      setAnimatingKey((prev) => (prev === key ? null : prev));
    }, 450);
  };

  const handleToggleCategory = (category: AmenityCategory) => {
    const allInCatSelected = category.items.every((item) => Boolean(filters.features[item.key]));
    category.items.forEach((item) => {
      if (allInCatSelected) {
        if (filters.features[item.key]) onToggleFeature(item.key);
      } else {
        if (!filters.features[item.key]) onToggleFeature(item.key);
      }
    });
  };

  const handleClearAmenities = () => {
    Object.keys(filters.features).forEach((key) => {
      if (filters.features[key]) onToggleFeature(key);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-4 md:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 font-outfit select-none"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl max-h-[97dvh] sm:max-h-[88dvh] flex flex-col
          rounded-t-[2rem] sm:rounded-[2.75rem]
          bg-white/95 dark:bg-zinc-900/95 backdrop-blur-3xl
          border border-white/80 dark:border-white/15
          shadow-[0_24px_80px_rgba(0,0,0,0.4)]
          overflow-hidden animate-glass-island"
      >
        {/* Mobile Drag Handle Indicator */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-4 sm:px-8 py-3 sm:py-5 border-b border-zinc-200/70 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-md shrink-0">
              <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2 sm:gap-2.5">
                <h2 className="text-base sm:text-xl font-normal tracking-tight text-zinc-900 dark:text-white">
                  Studio de Recherche
                </h2>
                {activeFiltersCount > 0 && (
                  <span className="px-2.5 sm:px-3 py-0.5 rounded-full bg-brand-green/15 text-brand-green text-[11px] sm:text-xs font-light tracking-wider border border-brand-green/30">
                    {activeFiltersCount} filtre{activeFiltersCount > 1 ? 's' : ''} actif
                    {activeFiltersCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs font-light tracking-wide text-zinc-500 dark:text-zinc-400 line-clamp-1">
                Affinez vos critères en temps réel sur la carte et le catalogue
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 transition-all active:scale-90 cursor-pointer shrink-0"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.75]" />
          </button>
        </div>

        {/* ── SCROLLABLE STUDIO BODY ── */}
        <div className="flex-1 overflow-y-auto px-3.5 sm:px-8 py-3.5 sm:py-6 space-y-3.5 sm:space-y-8 no-scrollbar">
          {/* 1. TYPE D'OFFRE & CATÉGORIE DE BIEN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
            {/* Offer Type */}
            <div className="p-3.5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-2.5 sm:space-y-3.5">
              <span className="text-[11px] sm:text-xs font-light uppercase tracking-widest text-zinc-400 block">
                Type de transaction
              </span>
              <div className="flex flex-wrap gap-2">
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
                      className={`flex-1 min-w-[80px] sm:min-w-[95px] px-3.5 sm:px-6 py-2 sm:py-3.5 rounded-full text-xs sm:text-sm font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
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
            <div className="p-3.5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-2.5 sm:space-y-3.5">
              <span className="text-[11px] sm:text-xs font-light uppercase tracking-widest text-zinc-400 block">
                Nature du bien
              </span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
                      className={`px-3.5 sm:px-5 py-2 sm:py-3 rounded-full text-xs sm:text-sm font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
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

          {/* 2. BUDGET INTELLIGENT & HISTOGRAMME EN TEMPS RÉEL (OPTIMISTIC UI) */}
          <BudgetRangeSection
            offerType={filters.type}
            budgetMin={filters.budgetMin}
            budgetMax={filters.budgetMax}
            priceStats={priceStats}
            onSetFilter={onSetFilter}
          />

          {/* 3. ZONE RADAR GÉOGRAPHIQUE & TRI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
            {/* Radar Radius */}
            <div className="p-3.5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-2.5 sm:space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-light uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
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

              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {RADIUS_PILLS.map((r) => {
                  const isActive = filters.searchRadius === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => onSetFilter('searchRadius', r.value)}
                      className={`px-3.5 sm:px-4.5 py-1.5 sm:py-2.5 rounded-full text-[11px] sm:text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
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
            <div className="p-3.5 sm:p-6 rounded-2xl sm:rounded-[2rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-2.5 sm:space-y-3.5">
              <span className="text-[11px] sm:text-xs font-light uppercase tracking-widest text-zinc-400 block">
                Ordre de tri des résultats
              </span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
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
                      className={`px-3.5 sm:px-4.5 py-1.5 sm:py-2.5 rounded-full text-[11px] sm:text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
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
          <div className="p-3.5 sm:p-7 rounded-2xl sm:rounded-[2.25rem] bg-zinc-50/90 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800 space-y-3.5 sm:space-y-6">
            <span className="text-[11px] sm:text-xs font-light uppercase tracking-widest text-zinc-400 block">
              Configuration, Espaces & Emplacement Sanitaire
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-6">
              {/* Minimum Rooms */}
              <div className="space-y-2 sm:space-y-2.5">
                <label className="flex items-center gap-2 text-xs sm:text-sm font-normal text-zinc-800 dark:text-zinc-200">
                  <BedDouble className="w-4 h-4 text-brand-green stroke-[1.75]" />
                  <span>Nombre de pièces minimum</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                        className={`px-3.5 sm:px-5 py-2 sm:py-3 rounded-full text-xs sm:text-sm font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
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
                    className="w-20 sm:w-24 px-3 sm:px-4 py-2 sm:py-3 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-light text-center text-zinc-900 dark:text-white outline-none focus:border-brand-green"
                  />
                </div>
              </div>

              {/* Minimum Bathrooms & Surface */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2 sm:space-y-2.5">
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
                          className={`px-3.5 sm:px-4 py-2 sm:py-3 rounded-full text-xs font-light tracking-wider transition-all active:scale-95 cursor-pointer ${
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

                <div className="space-y-2 sm:space-y-2.5">
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
                    className="w-full px-4 sm:px-5 py-2 sm:py-3 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs sm:text-sm font-light tracking-wider text-zinc-900 dark:text-white outline-none focus:border-brand-green"
                  />
                </div>
              </div>
            </div>

            {/* Emplacement WC & Douche (Intérieur / Extérieur - Inspired by original Tranogasy) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 pt-2.5 sm:pt-3 border-t border-zinc-200/60 dark:border-zinc-800">
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
                        className={`px-3.5 sm:px-4.5 py-1.5 sm:py-2.5 rounded-full text-xs font-light tracking-wider transition-all cursor-pointer ${
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
                        className={`px-3.5 sm:px-4.5 py-1.5 sm:py-2.5 rounded-full text-xs font-light tracking-wider transition-all cursor-pointer ${
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

          {/* 5. ÉQUIPEMENTS & PRESTATIONS (SAME UI & UX AS CREATE PROPERTY PAGE) */}
          <div className="w-full space-y-3.5 sm:space-y-4">
            {/* Top Header Card - Ultra Rounded Squircle */}
            <div className="p-3.5 sm:p-5 rounded-2xl sm:rounded-[2rem] bg-gradient-to-br from-zinc-50/90 via-white to-zinc-50/50 dark:from-zinc-900/90 dark:via-zinc-900/60 dark:to-zinc-900/30 border border-zinc-200/70 dark:border-zinc-800 shadow-xs backdrop-blur-sm transition-all">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-normal tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                      Équipements & Prestations
                    </h3>
                    {/* Selected Count Pill */}
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-normal tracking-wide transition-all ${
                        selectedAmenitiesCount > 0
                          ? 'bg-brand-green/15 text-brand-green dark:bg-brand-green/25 border border-brand-green/30 shadow-xs'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60'
                      }`}
                    >
                      {selectedAmenitiesCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                      )}
                      {selectedAmenitiesCount} sélectionné{selectedAmenitiesCount > 1 ? 's' : ''}
                    </span>

                    {/* Clear Button */}
                    {selectedAmenitiesCount > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAmenities}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-light text-zinc-500 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-red-200 dark:hover:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        Effacer
                      </button>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-light text-zinc-500 dark:text-zinc-400">
                    Cochez les points forts pour affiner votre recherche sur la carte et la liste.
                  </p>
                </div>

                {/* Search Pill Input */}
                <div className="relative w-full md:w-64 shrink-0">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    value={amenitySearch}
                    onChange={(e) => setAmenitySearch(e.target.value)}
                    placeholder="Rechercher un équipement..."
                    className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm font-light tracking-wide rounded-full bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-4 focus:ring-brand-green/15 focus:border-brand-green transition-all shadow-xs"
                  />
                  {amenitySearch && (
                    <button
                      type="button"
                      onClick={() => setAmenitySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-500 dark:text-zinc-300 transition-colors cursor-pointer"
                      aria-label="Effacer la recherche"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Category Filter Pills (Capsule Bar) */}
            {!amenitySearch && (
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto p-1.5 rounded-full bg-zinc-100/70 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 no-scrollbar scrollbar-hide">
                <button
                  type="button"
                  onClick={() => setActiveAmenityTab('all')}
                  className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-normal tracking-wide whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-2 ${
                    activeAmenityTab === 'all'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/80 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <span>Tous les équipements</span>
                  <span
                    className={`w-5 h-5 rounded-full text-[10px] font-normal flex items-center justify-center transition-colors ${
                      activeAmenityTab === 'all'
                        ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-950'
                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {selectedAmenitiesCount}
                  </span>
                </button>

                {AMENITIES_CATEGORIES.map((cat) => {
                  const catSelectedCount = cat.items.filter((item) =>
                    Boolean(filters.features[item.key])
                  ).length;
                  const isCatActive = activeAmenityTab === cat.title;

                  return (
                    <button
                      key={cat.title}
                      type="button"
                      onClick={() => setActiveAmenityTab(cat.title)}
                      className={`px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-normal tracking-wide whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-2 ${
                        isCatActive
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/80 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white'
                      }`}
                    >
                      <span>{cat.title}</span>
                      {catSelectedCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-brand-green text-white text-[10px] font-normal flex items-center justify-center shadow-xs">
                          {catSelectedCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Categories and Amenities Grid */}
            <div className="space-y-3 sm:space-y-3.5">
              {filteredAmenityCategories.length === 0 ? (
                <div className="p-6 sm:p-8 text-center rounded-2xl sm:rounded-[2rem] bg-zinc-50/80 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800 space-y-3">
                  <p className="text-xs sm:text-sm font-normal text-zinc-600 dark:text-zinc-400">
                    Aucun équipement ne correspond à votre recherche &ldquo;{amenitySearch}&rdquo;.
                  </p>
                  <button
                    type="button"
                    onClick={() => setAmenitySearch('')}
                    className="px-4 py-2 rounded-full text-xs font-normal bg-brand-green text-white hover:bg-brand-green/90 transition-all cursor-pointer shadow-xs"
                  >
                    Réinitialiser la recherche
                  </button>
                </div>
              ) : (
                filteredAmenityCategories.map((category) => {
                  const originalCat =
                    AMENITIES_CATEGORIES.find((c) => c.title === category.title) || category;
                  const catSelectedCount = originalCat.items.filter((item) =>
                    Boolean(filters.features[item.key])
                  ).length;
                  const allInCatSelected =
                    catSelectedCount === originalCat.items.length && originalCat.items.length > 0;

                  return (
                    <div
                      key={category.title}
                      className="p-3.5 sm:p-5 rounded-2xl sm:rounded-[2.25rem] bg-white/70 dark:bg-zinc-900/40 border border-zinc-200/70 dark:border-zinc-800/80 shadow-xs backdrop-blur-xs space-y-3 sm:space-y-3.5 transition-all"
                    >
                      {/* Category Header Row */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 text-xs sm:text-sm font-normal text-zinc-800 dark:text-zinc-200 shadow-2xs">
                          <span>{category.title}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-light bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50">
                            {catSelectedCount} / {originalCat.items.length}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleToggleCategory(originalCat)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-light bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors border border-zinc-200/60 dark:border-zinc-700/60 cursor-pointer active:scale-95"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>{allInCatSelected ? 'Tout décocher' : 'Tout cocher'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Amenity Items Pills Flow (Natural wrap, fluid interactive click) */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                        {category.items.map((item) => {
                          const Icon = item.icon;
                          const isSelected = Boolean(filters.features[item.key]);
                          const isAnimating = animatingKey === item.key;

                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => handlePillClick(item.key)}
                              title={item.label}
                              className={`group relative inline-flex items-center gap-1.5 sm:gap-2 p-1.5 pr-3 sm:pr-3.5 rounded-full text-left transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer select-none border active:scale-[0.92] active:transition-transform active:duration-100 ${
                                isAnimating ? 'animate-pill-pop' : ''
                              } ${
                                isSelected
                                  ? 'bg-brand-green/12 dark:bg-brand-green/20 text-zinc-900 dark:text-white border-brand-green/50 ring-2 ring-brand-green/35 shadow-[0_2px_12px_rgba(124,189,30,0.22)]'
                                  : 'bg-zinc-50/80 hover:bg-zinc-100/90 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-zinc-200/70 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:-translate-y-0.5 hover:shadow-2xs active:translate-y-0'
                              }`}
                            >
                              {/* Fluid Expanding Ripple Wave on Click */}
                              {isAnimating && (
                                <span
                                  className={`absolute inset-0 rounded-full pointer-events-none animate-pill-ripple ${
                                    isSelected
                                      ? 'border-2 border-brand-green/60 bg-brand-green/15'
                                      : 'border-2 border-zinc-400/40 bg-zinc-300/10'
                                  }`}
                                />
                              )}

                              {/* Round Icon Badge */}
                              <div
                                className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-xs ${
                                  isAnimating ? 'animate-icon-pop' : 'group-hover:scale-105'
                                } ${
                                  isSelected
                                    ? 'bg-brand-green text-white shadow-brand-green/25 scale-105'
                                    : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 group-hover:bg-zinc-300/60 dark:group-hover:bg-zinc-700 scale-100'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-300" />
                              </div>

                              {/* Label */}
                              <span
                                className={`text-xs sm:text-sm whitespace-nowrap leading-tight select-none transition-colors duration-200 ${
                                  isSelected
                                    ? 'font-normal text-zinc-900 dark:text-white'
                                    : 'font-light text-zinc-700 dark:text-zinc-300'
                                }`}
                              >
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── STICKY FUTURISTIC FOOTER (Single Line to Save Vertical Space) ── */}
        <div className="px-3.5 sm:px-8 py-2.5 sm:py-4 border-t border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl flex items-center justify-between gap-2 sm:gap-3 shrink-0">
          {/* Left: Reset */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-6 py-2.5 sm:py-3.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs sm:text-sm font-light tracking-wider transition-all active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[1.75]" />
              <span>Réinitialiser</span>
            </button>

            {totalMatching === 0 && rawMatchingWithoutRadius > 0 && filters.searchRadius > 0 && (
              <button
                type="button"
                onClick={() => onSetFilter('searchRadius', 0)}
                className="hidden sm:inline-flex px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-[11px] sm:text-xs font-light tracking-wide cursor-pointer"
              >
                {rawMatchingWithoutRadius} hors radar • Voir tout
              </button>
            )}
          </div>

          {/* Right: Mode Selection (desktop) + Primary CTA Button */}
          <div className="flex-1 sm:flex-initial flex items-center justify-end gap-2 sm:gap-2.5 min-w-0">
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

            {/* Primary CTA Button */}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-full
                bg-zinc-950 dark:bg-white text-white dark:text-zinc-950
                hover:bg-brand-green dark:hover:bg-brand-green dark:hover:text-white
                shadow-[0_12px_32px_rgba(0,0,0,0.25)]
                text-xs sm:text-base font-light tracking-wider
                transition-all duration-300 active:scale-95 cursor-pointer min-w-0"
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-green shrink-0" />
              <span className="truncate">
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

