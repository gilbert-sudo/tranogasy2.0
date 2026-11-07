'use client';

import React, { memo } from 'react';
import {
  Map as MapIcon,
  Columns2,
  LayoutGrid,
  Play,
  SlidersHorizontal,
  Sparkles,
  BedDouble,
} from 'lucide-react';
import {
  FaCar,
  FaMotorcycle,
  FaWifi,
  FaParking,
  FaShieldAlt,
  FaSwimmingPool,
  FaHotTub,
  FaBed,
} from 'react-icons/fa';
import {
  FaFaucetDrip,
  FaPlugCircleBolt,
  FaPlugCircleCheck,
  FaOilWell,
  FaKitchenSet,
} from 'react-icons/fa6';
import {
  GiWell,
  GiBrickWall,
  GiFireplace,
  GiBathtub,
  GiSolarPower,
  GiMountainCave,
  GiSeatedMouse,
  GiSeaDragon,
  GiCastle,
} from 'react-icons/gi';
import {
  MdOutlineLiving,
  MdBalcony,
  MdLandscape,
  MdOutlineFiberSmartRecord,
} from 'react-icons/md';
import { TbAirConditioning, TbBuildingCastle, TbWash } from 'react-icons/tb';
import { TfiLayoutSidebarLeft } from 'react-icons/tfi';
import { SearchFilters, SearchViewMode } from '@/store/searchStore';
import { formatCompactPrice } from '@/hooks/usePropertySearch';

const HUD_FEATURE_ICONS: Record<string, React.ElementType> = {
  electricityJirama: FaPlugCircleBolt,
  waterPumpSupplyJirama: FaFaucetDrip,
  waterWellSupply: GiWell,
  electricityPower: FaPlugCircleCheck,
  waterPumpSupply: FaOilWell,
  solarPanels: GiSolarPower,
  motoAccess: FaMotorcycle,
  carAccess: FaCar,
  surroundedByWalls: GiBrickWall,
  courtyard: MdLandscape,
  parkingSpaceAvailable: FaParking,
  garage: FaCar,
  garden: GiWell,
  independentHouse: TbBuildingCastle,
  guardianHouse: FaShieldAlt,
  bassin: TbWash,
  openKitchen: TfiLayoutSidebarLeft,
  kitchenFacilities: FaKitchenSet,
  placardKitchen: FaBed,
  hotWaterAvailable: FaHotTub,
  furnishedProperty: MdOutlineLiving,
  airConditionerAvailable: TbAirConditioning,
  bathtub: GiBathtub,
  fireplace: GiFireplace,
  elevator: TbBuildingCastle,
  balcony: MdBalcony,
  roofTop: GiCastle,
  swimmingPool: FaSwimmingPool,
  securitySystem: FaShieldAlt,
  wifiAvailability: FaWifi,
  fiberOpticReady: MdOutlineFiberSmartRecord,
  seaView: GiSeaDragon,
  mountainView: GiMountainCave,
  panoramicView: GiSeatedMouse,
};

interface SearchFloatingBottomHudProps {
  filters: SearchFilters;
  totalResults: number;
  activeFiltersCount: number;
  viewMode: SearchViewMode;
  onSetViewMode: (mode: SearchViewMode) => void;
  onOpenFilterModal: () => void;
}

function SearchFloatingBottomHudComponent({
  filters,
  totalResults,
  activeFiltersCount,
  viewMode,
  onSetViewMode,
  onOpenFilterModal,
}: SearchFloatingBottomHudProps) {
  const activeFeatureKeys = Object.entries(filters.features)
    .filter(([_, val]) => Boolean(val))
    .map(([key]) => key);

  const isFeedMode = viewMode === 'feed';

  return (
    <div className="w-[calc(100vw-0.75rem)] sm:w-fit max-w-[calc(100vw-0.75rem)] mx-auto pointer-events-none font-outfit select-none">
      <div
        className={`pointer-events-auto flex flex-row items-center justify-between sm:justify-center gap-1.5 sm:gap-2
          p-1.5 sm:p-2 rounded-full overflow-hidden transition-colors duration-300
          ${
            isFeedMode
              ? 'bg-zinc-950/85 backdrop-blur-2xl border border-white/15 shadow-[0_12px_36px_rgba(0,0,0,0.65)]'
              : 'bg-white/95 dark:bg-zinc-900/95 backdrop-blur-3xl border border-white/85 dark:border-white/15 shadow-[0_14px_40px_rgba(0,0,0,0.22),inset_0_1px_1px_rgba(255,255,255,0.65)] dark:shadow-[0_14px_40px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.1)]'
          }`}
      >
        {/* ── LEFT: Active Filters & Results Summary Pill ── */}
        <button
          type="button"
          onClick={onOpenFilterModal}
          title="Ouvrir les filtres avancés"
          className={`flex items-center gap-1.5 sm:gap-2.5 h-10 sm:h-11 px-2 sm:px-3.5 rounded-full
            transition-all active:scale-95 cursor-pointer shrink-0 ${
              isFeedMode
                ? 'bg-white/12 hover:bg-white/18 text-white'
                : 'bg-zinc-100/95 dark:bg-zinc-800/90 hover:bg-zinc-200/80 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-100'
            }`}
        >
          {/* Result Counter Badge */}
          <span
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium tracking-wide shrink-0 shadow-xs ${
              isFeedMode
                ? 'bg-white text-zinc-950'
                : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-green shrink-0" />
            <span>{totalResults}</span>
            <span className="hidden sm:inline">
              {totalResults > 1 ? 'biens' : 'bien'}
            </span>
          </span>

          {/* Summary Details (Shown on sm+ so mobile keeps full room for Carte / Liste / Feed) */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs sm:text-sm font-normal tracking-wide overflow-x-auto no-scrollbar min-w-0">
            <span className="capitalize shrink-0">
              {filters.type === 'sale'
                ? 'Vente'
                : filters.type === 'rent'
                ? 'Location'
                : 'Tous'}
            </span>

            {(filters.budgetMin || filters.budgetMax) && (
              <span className="hidden md:inline-flex items-center gap-1.5 shrink-0">
                <span className="opacity-40">•</span>
                <span className="text-brand-green font-medium">
                  {filters.budgetMin ? formatCompactPrice(filters.budgetMin) : '0'} -{' '}
                  {filters.budgetMax ? formatCompactPrice(filters.budgetMax) : '∞'} Ar
                </span>
              </span>
            )}

            {filters.minRooms > 0 && (
              <span className="hidden md:inline-flex items-center gap-1 shrink-0">
                <span className="opacity-40">•</span>
                <BedDouble className="w-3.5 h-3.5 opacity-60" />
                <span>{filters.minRooms}+p</span>
              </span>
            )}

            {activeFeatureKeys.length > 0 && (
              <div className="hidden lg:flex items-center gap-1.5 shrink-0 text-brand-green">
                <span className="text-zinc-400">•</span>
                {activeFeatureKeys.slice(0, 3).map((key) => {
                  const Icon = HUD_FEATURE_ICONS[key] || SlidersHorizontal;
                  return <Icon key={key} className="w-3.5 h-3.5" />;
                })}
                {activeFeatureKeys.length > 3 && (
                  <span className="text-xs font-medium">
                    +{activeFeatureKeys.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Compact Filter Icon / Active Counter */}
          {activeFiltersCount > 0 ? (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-brand-green text-white text-[11px] font-semibold shrink-0">
              {activeFiltersCount}
            </span>
          ) : (
            <SlidersHorizontal className="w-3.5 h-3.5 opacity-70 shrink-0" />
          )}
        </button>

        {/* Subtle Vertical Divider */}
        <div
          className={`h-5 sm:h-6 w-px shrink-0 ${
            isFeedMode ? 'bg-white/15' : 'bg-zinc-200/90 dark:bg-white/10'
          }`}
        />

        {/* ── RIGHT: Single-Row View Mode Switcher (Equal 3-col grid on mobile, auto flex on sm+) ── */}
        <div className="flex-1 grid grid-cols-3 sm:flex sm:flex-initial items-center gap-1 sm:gap-1.5 min-w-0">
          {/* 1. Carte */}
          <button
            type="button"
            onClick={() => onSetViewMode('map')}
            className={`flex items-center justify-center gap-1.5 h-10 sm:h-11 px-2 sm:px-4 rounded-full text-xs sm:text-sm font-normal tracking-wide transition-all duration-200 active:scale-95 cursor-pointer min-w-0 ${
              viewMode === 'map'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-medium shadow-sm'
                : isFeedMode
                ? 'text-zinc-200 hover:bg-white/10 hover:text-white'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <MapIcon className="w-4 h-4 stroke-[1.85] shrink-0" />
            <span className="truncate">Carte</span>
          </button>

          {/* 2. Split (Desktop Only) */}
          <button
            type="button"
            onClick={() => onSetViewMode('split')}
            className={`hidden lg:flex items-center justify-center gap-1.5 h-11 px-4 rounded-full text-sm font-normal tracking-wide transition-all duration-200 active:scale-95 cursor-pointer ${
              viewMode === 'split'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-medium shadow-sm'
                : isFeedMode
                ? 'text-zinc-200 hover:bg-white/10 hover:text-white'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Columns2 className="w-4 h-4 stroke-[1.85] shrink-0" />
            <span>Split</span>
          </button>

          {/* 3. Liste */}
          <button
            type="button"
            onClick={() => onSetViewMode('list')}
            className={`flex items-center justify-center gap-1.5 h-10 sm:h-11 px-2 sm:px-4 rounded-full text-xs sm:text-sm font-normal tracking-wide transition-all duration-200 active:scale-95 cursor-pointer min-w-0 ${
              viewMode === 'list'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-medium shadow-sm'
                : isFeedMode
                ? 'text-zinc-200 hover:bg-white/10 hover:text-white'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <LayoutGrid className="w-4 h-4 stroke-[1.85] shrink-0" />
            <span className="truncate">Liste</span>
          </button>

          {/* 4. Mode Immersif / TranoFeed (TikTok Mode) */}
          <button
            type="button"
            onClick={() => onSetViewMode('feed')}
            className={`flex items-center justify-center gap-1.5 h-10 sm:h-11 px-2 sm:px-4 rounded-full text-xs sm:text-sm font-normal tracking-wide transition-all duration-200 active:scale-95 cursor-pointer min-w-0 ${
              viewMode === 'feed'
                ? 'bg-brand-green text-white font-medium shadow-[0_4px_14px_rgba(124,189,30,0.45)]'
                : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[1.85] fill-current shrink-0" />
            <span className="truncate">Feed</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const SearchFloatingBottomHud = memo(SearchFloatingBottomHudComponent);
export default SearchFloatingBottomHud;

