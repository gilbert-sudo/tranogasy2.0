'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { Radar, Minus, Plus, ChevronUp, X, LocateFixed } from 'lucide-react';
import {
  SEARCH_RADIUS_OPTIONS,
  formatRadiusLabel,
  getPrevSearchRadius,
  getNextSearchRadius,
} from '@/store/searchStore';

interface SearchRadiusFloatingBarProps {
  placeName: string | null;
  searchRadius: number;
  onChangeRadius: (nextRadius: number) => void;
  onRefocusZone: () => void;
  onClearZone: () => void;
}

function SearchRadiusFloatingBarComponent({
  placeName,
  searchRadius,
  onChangeRadius,
  onRefocusZone,
  onClearZone,
}: SearchRadiusFloatingBarProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const prevRadius = getPrevSearchRadius(searchRadius);
  const nextRadius = getNextSearchRadius(searchRadius);

  // Close preset tray on outside click or Escape key
  useEffect(() => {
    if (!isPickerOpen) return;

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isPickerOpen]);

  const handleSelectPreset = (value: number) => {
    onChangeRadius(value);
    setIsPickerOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-[calc(100vw-0.75rem)] sm:w-fit max-w-[calc(100vw-0.75rem)] mx-auto pointer-events-none font-outfit select-none animate-glass-island"
    >
      {/* Expandable 1-Tap Range Presets Popover (opens cleanly above thumb bar, zero scrolling needed) */}
      {isPickerOpen && (
        <div
          role="dialog"
          aria-label="Choisir le rayon de recherche"
          className="pointer-events-auto absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-[min(calc(100vw-1rem),420px)] rounded-[1.75rem] p-3.5 sm:p-4 bg-white/97 dark:bg-zinc-900/97 backdrop-blur-3xl border border-brand-green/35 dark:border-brand-green/30 shadow-[0_18px_50px_rgba(0,0,0,0.28)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.72)] z-50 animate-glass-island"
        >
          <div className="flex items-center justify-between gap-2 px-1 pb-2.5 mb-2.5 border-b border-zinc-200/70 dark:border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-green/15 text-brand-green">
                <Radar className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 leading-none">
                  Rayon de recherche
                </p>
                {placeName && (
                  <p className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-white truncate mt-0.5 capitalize">
                    Autour de {placeName}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPickerOpen(false)}
              aria-label="Fermer le sélecteur de rayon"
              className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[2.25]" />
            </button>
          </div>

          {/* Preset Radius Grid (all options immediately visible without scrolling) */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {SEARCH_RADIUS_OPTIONS.map((opt) => {
              const isSelected = searchRadius === opt.value;
              const isUnlimited = opt.value === 0;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelectPreset(opt.value)}
                  className={`min-h-[42px] px-3 py-2 rounded-full text-xs sm:text-sm tracking-wide whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                    isUnlimited ? 'col-span-3 sm:col-span-2' : ''
                  } ${
                    isSelected
                      ? 'bg-brand-green text-white font-semibold shadow-[0_6px_18px_rgba(124,189,30,0.4)]'
                      : 'bg-zinc-100/90 dark:bg-zinc-800/90 text-zinc-800 dark:text-zinc-100 font-medium hover:bg-zinc-200/80 dark:hover:bg-zinc-700 border border-zinc-200/60 dark:border-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Always-Visible Thumb-Zone Floating Radius Control Capsule */}
      <div
        className="pointer-events-auto flex items-center justify-between sm:justify-center gap-1.5 sm:gap-2.5 px-2 py-1.5 rounded-full
          bg-white/95 dark:bg-zinc-900/95 backdrop-blur-3xl
          border border-brand-green/45 dark:border-brand-green/40
          shadow-[0_12px_34px_rgba(0,0,0,0.2),0_2px_10px_rgba(124,189,30,0.18),inset_0_1px_1px_rgba(255,255,255,0.65)]
          dark:shadow-[0_12px_34px_rgba(0,0,0,0.65),0_2px_10px_rgba(124,189,30,0.16),inset_0_1px_1px_rgba(255,255,255,0.08)]"
      >
        {/* Left: Zone Indicator & 1-Tap Recenter */}
        <button
          type="button"
          onClick={onRefocusZone}
          title="Recentrer la carte sur la zone de recherche"
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80 transition-colors active:scale-95 cursor-pointer min-w-0 flex-1 sm:flex-initial text-left"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-green/15 text-brand-green">
            <Radar className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
          </span>
          <div className="min-w-0 leading-tight">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-brand-green leading-none">
              <span>Rayon</span>
              <LocateFixed className="w-2.5 h-2.5 opacity-80 shrink-0" />
            </span>
            <span className="block text-xs sm:text-[13px] font-semibold text-zinc-900 dark:text-white truncate max-w-[105px] sm:max-w-[175px] mt-0.5 capitalize">
              {placeName || 'Zone active'}
            </span>
          </div>
        </button>

        {/* Center: Obvious Stepper (- / Current Range Picker / +) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => prevRadius !== null && onChangeRadius(prevRadius)}
            disabled={prevRadius === null}
            aria-label="Réduire le rayon de recherche"
            title={
              prevRadius !== null
                ? `Réduire à ${formatRadiusLabel(prevRadius)}`
                : 'Rayon minimum atteint'
            }
            className="flex h-9 w-9 sm:h-9.5 sm:w-9.5 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200/90 dark:hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed transition-all active:scale-90 cursor-pointer shrink-0 border border-zinc-200/70 dark:border-white/10"
          >
            <Minus className="w-4 h-4 stroke-[2.5]" />
          </button>

          <button
            type="button"
            onClick={() => setIsPickerOpen((prev) => !prev)}
            aria-expanded={isPickerOpen}
            aria-label="Choisir le rayon de recherche"
            title="Toucher pour choisir la distance du rayon"
            className="flex items-center justify-center gap-1 h-9 sm:h-9.5 min-w-[78px] sm:min-w-[92px] px-3 sm:px-3.5 rounded-full bg-brand-green hover:bg-brand-green/95 text-white text-xs sm:text-sm font-bold tracking-wide shadow-[0_4px_14px_rgba(124,189,30,0.4)] transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <span>{formatRadiusLabel(searchRadius, true)}</span>
            <ChevronUp
              className={`w-3.5 h-3.5 stroke-[2.5] transition-transform duration-200 shrink-0 ${
                isPickerOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => nextRadius !== null && onChangeRadius(nextRadius)}
            disabled={nextRadius === null}
            aria-label="Élargir le rayon de recherche"
            title={
              nextRadius !== null
                ? `Élargir à ${formatRadiusLabel(nextRadius)}`
                : 'Toute la carte déjà affichée'
            }
            className="flex h-9 w-9 sm:h-9.5 sm:w-9.5 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200/90 dark:hover:bg-zinc-700 disabled:opacity-35 disabled:cursor-not-allowed transition-all active:scale-90 cursor-pointer shrink-0 border border-zinc-200/70 dark:border-white/10"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Right: Clear Search Zone */}
        <button
          type="button"
          onClick={() => {
            setIsPickerOpen(false);
            onClearZone();
          }}
          aria-label="Supprimer la zone de recherche"
          title="Retirer la zone de recherche"
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 text-zinc-500 dark:text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-500 transition-colors active:scale-90 cursor-pointer shrink-0"
        >
          <X className="w-4 h-4 stroke-[2.25]" />
        </button>
      </div>
    </div>
  );
}

const SearchRadiusFloatingBar = memo(SearchRadiusFloatingBarComponent);
export default SearchRadiusFloatingBar;
