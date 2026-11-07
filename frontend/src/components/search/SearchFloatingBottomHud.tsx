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

  return (
    <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 pointer-events-none font-outfit select-none">
      <div
        className="pointer-events-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3
          p-2 sm:p-2.5 rounded-[2.25rem] sm:rounded-full
          bg-white/90 dark:bg-zinc-900/92 backdrop-blur-3xl
          border border-white/85 dark:border-white/15
          shadow-[0_16px_50px_rgba(0,0,0,0.22),inset_0_1px_1px_rgba(255,255,255,0.65)]
          dark:shadow-[0_16px_50px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.1)]"
      >
        {/* ── LEFT: Active Filters & Results Summary Pill (FilterInfoBox Reimagined) ── */}
        <button
          type="button"
          onClick={onOpenFilterModal}
          className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2.5 px-4 sm:px-5 py-2.5 rounded-full
            bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200/70 dark:hover:bg-zinc-800
            transition-all active:scale-97 cursor-pointer min-w-0"
        >
          {/* Result Counter Badge */}
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-normal tracking-wide shrink-0 shadow-xs">
            <Sparkles className="w-3 h-3 text-brand-green" />
            <span>
              {totalResults} {totalResults > 1 ? 'biens' : 'bien'}
            </span>
          </span>

          {/* Summary Details (Offer Type • Budget • Rooms • Active Feature Icons) */}
          <div className="flex items-center gap-2 text-xs font-light tracking-wide text-zinc-700 dark:text-zinc-200 overflow-x-auto no-scrollbar min-w-0">
            <span className="capitalize shrink-0">
              {filters.type === 'sale'
                ? 'Vente'
                : filters.type === 'rent'
                ? 'Location'
                : 'Tous'}
            </span>

            {(filters.budgetMin || filters.budgetMax) && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">•</span>
                <span className="text-brand-green font-normal shrink-0">
                  {filters.budgetMin ? formatCompactPrice(filters.budgetMin) : '0'} -{' '}
                  {filters.budgetMax ? formatCompactPrice(filters.budgetMax) : '∞'} Ar
                </span>
              </>
            )}

            {filters.minRooms > 0 && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">•</span>
                <span className="flex items-center gap-1 shrink-0">
                  <BedDouble className="w-3.5 h-3.5 text-zinc-400" />
                  {filters.minRooms}+p
                </span>
              </>
            )}

            {activeFeatureKeys.length > 0 && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">•</span>
                <div className="flex items-center gap-1.5 shrink-0 text-brand-green">
                  {activeFeatureKeys.slice(0, 5).map((key) => {
                    const Icon = HUD_FEATURE_ICONS[key] || SlidersHorizontal;
                    return <Icon key={key} className="w-3.5 h-3.5" />;
                  })}
                  {activeFeatureKeys.length > 5 && (
                    <span className="text-[10px] font-normal">
                      +{activeFeatureKeys.length - 5}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {activeFiltersCount > 0 && (
            <span className="sm:hidden text-[11px] font-light text-brand-green shrink-0">
              Modifier
            </span>
          )}
        </button>

        {/* ── RIGHT: Futuristic View Mode Switcher (Big Padding, Thin Font, Very Rounded) ── */}
        <div className="w-full sm:w-auto flex items-center justify-around sm:justify-end gap-1">
          {/* 1. Carte */}
          <button
            type="button"
            onClick={() => onSetViewMode('map')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-full text-xs font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
              viewMode === 'map'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-[0_6px_20px_rgba(0,0,0,0.2)]'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Carte</span>
          </button>

          {/* 2. Split (Desktop Only) */}
          <button
            type="button"
            onClick={() => onSetViewMode('split')}
            className={`hidden lg:flex items-center justify-center gap-2 px-5 py-3 rounded-full text-xs font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
              viewMode === 'split'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-[0_6px_20px_rgba(0,0,0,0.2)]'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Split</span>
          </button>

          {/* 3. Liste */}
          <button
            type="button"
            onClick={() => onSetViewMode('list')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-full text-xs font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
              viewMode === 'list'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 font-normal shadow-[0_6px_20px_rgba(0,0,0,0.2)]'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 stroke-[1.75]" />
            <span>Liste</span>
          </button>

          {/* 4. Mode Immersif / TranoFeed (TikTok Mode) */}
          <button
            type="button"
            onClick={() => onSetViewMode('feed')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 sm:py-3 rounded-full text-xs font-light tracking-wider transition-all duration-300 active:scale-95 cursor-pointer ${
              viewMode === 'feed'
                ? 'bg-brand-green text-white font-normal shadow-[0_6px_20px_rgba(124,189,30,0.4)]'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Play className="w-3.5 h-3.5 stroke-[1.75] fill-current" />
            <span>Feed</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const SearchFloatingBottomHud = memo(SearchFloatingBottomHudComponent);
export default SearchFloatingBottomHud;

