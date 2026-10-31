'use client';

import React, { useState, useMemo } from 'react';
import {
  MdOutlineLiving,
  MdBalcony,
  MdLandscape,
  MdOutlineFiberSmartRecord,
} from 'react-icons/md';
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
import { TbAirConditioning, TbBuildingCastle, TbWash } from 'react-icons/tb';
import { TfiLayoutSidebarLeft } from 'react-icons/tfi';
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
import { Search, X, CheckCheck } from 'lucide-react';

export interface AmenityDefinition {
  key: string;
  label: string;
  icon: React.ElementType;
}

export interface AmenityCategory {
  title: string;
  items: AmenityDefinition[];
}

export const AMENITIES_CATEGORIES: AmenityCategory[] = [
  {
    title: '⚡ Eau & Énergie',
    items: [
      { key: 'electricityJirama', label: 'Électricité JIRAMA', icon: FaPlugCircleBolt },
      { key: 'waterPumpSupplyJirama', label: 'Pompe JIRAMA', icon: FaFaucetDrip },
      { key: 'waterWellSupply', label: "Puits d'eau", icon: GiWell },
      { key: 'electricityPower', label: 'Électricité privée (Groupe)', icon: FaPlugCircleCheck },
      { key: 'waterPumpSupply', label: 'Pompe à eau privée', icon: FaOilWell },
      { key: 'solarPanels', label: 'Panneaux solaires', icon: GiSolarPower },
    ],
  },
  {
    title: '🚪 Accès & Espaces Extérieurs',
    items: [
      { key: 'carAccess', label: 'Accès voiture', icon: FaCar },
      { key: 'motoAccess', label: 'Accès moto', icon: FaMotorcycle },
      { key: 'parkingSpaceAvailable', label: 'Parking réservé', icon: FaParking },
      { key: 'garage', label: 'Garage fermé', icon: FaCar },
      { key: 'surroundedByWalls', label: 'Propriété clôturée', icon: GiBrickWall },
      { key: 'courtyard', label: 'Cour privative', icon: MdLandscape },
      { key: 'garden', label: 'Jardin arboré', icon: GiWell },
      { key: 'independentHouse', label: 'Maison indépendante', icon: TbBuildingCastle },
      { key: 'guardianHouse', label: 'Logement gardien', icon: FaShieldAlt },
      { key: 'bassin', label: "Bassin d'eau", icon: TbWash },
    ],
  },
  {
    title: '🏠 Confort Intérieur',
    items: [
      { key: 'kitchenFacilities', label: 'Cuisine équipée', icon: FaKitchenSet },
      { key: 'openKitchen', label: 'Cuisine ouverte (Américaine)', icon: TfiLayoutSidebarLeft },
      { key: 'placardKitchen', label: 'Cuisine avec placards', icon: FaBed },
      { key: 'hotWaterAvailable', label: 'Eau chaude (Cumulus)', icon: FaHotTub },
      { key: 'furnishedProperty', label: 'Logement meublé', icon: MdOutlineLiving },
      { key: 'airConditionerAvailable', label: 'Climatisation', icon: TbAirConditioning },
      { key: 'bathtub', label: 'Baignoire', icon: GiBathtub },
      { key: 'fireplace', label: 'Cheminée fonctionnelle', icon: GiFireplace },
      { key: 'elevator', label: 'Ascenseur', icon: TbBuildingCastle },
    ],
  },
  {
    title: '🌅 Terrasse, Piscine & Vue',
    items: [
      { key: 'balcony', label: 'Balcon', icon: MdBalcony },
      { key: 'roofTop', label: 'Toit-terrasse (Rooftop)', icon: GiCastle },
      { key: 'swimmingPool', label: 'Piscine', icon: FaSwimmingPool },
      { key: 'seaView', label: 'Vue sur mer', icon: GiSeaDragon },
      { key: 'mountainView', label: 'Vue sur montagne', icon: GiMountainCave },
      { key: 'panoramicView', label: 'Vue panoramique', icon: GiSeatedMouse },
    ],
  },
  {
    title: '🛡️ Sécurité & Connectivité',
    items: [
      { key: 'wifiAvailability', label: 'Wi-Fi disponible', icon: FaWifi },
      { key: 'fiberOpticReady', label: 'Fibre optique prête', icon: MdOutlineFiberSmartRecord },
      { key: 'securitySystem', label: 'Système de sécurité / Alarme', icon: FaShieldAlt },
    ],
  },
];

interface ListingAmenitiesSelectorProps {
  features: Record<string, boolean>;
  onToggleFeature: (key: string) => void;
  onSelectAllCategory?: (category: AmenityCategory) => void;
}

export default function ListingAmenitiesSelector({
  features,
  onToggleFeature,
  onSelectAllCategory,
}: ListingAmenitiesSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [animatingKey, setAnimatingKey] = useState<string | null>(null);

  const selectedCount = Object.values(features).filter(Boolean).length;

  // Filtered categories based on active category & search query
  const filteredCategories = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();

    return AMENITIES_CATEGORIES.map((cat) => {
      // Filter category items
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
      if (searchQuery.trim()) {
        return cat.items.length > 0;
      }
      return activeCategory === 'all' || activeCategory === cat.title;
    });
  }, [activeCategory, searchQuery]);

  const handleToggleCategory = (category: AmenityCategory) => {
    if (onSelectAllCategory) {
      onSelectAllCategory(category);
      return;
    }

    const allInCatSelected = category.items.every((item) => Boolean(features[item.key]));

    category.items.forEach((item) => {
      if (allInCatSelected) {
        if (features[item.key]) onToggleFeature(item.key);
      } else {
        if (!features[item.key]) onToggleFeature(item.key);
      }
    });
  };

  const handlePillClick = (key: string) => {
    setAnimatingKey(key);
    onToggleFeature(key);
    setTimeout(() => {
      setAnimatingKey((prev) => (prev === key ? null : prev));
    }, 450);
  };

  const handleClearAll = () => {
    Object.keys(features).forEach((key) => {
      if (features[key]) onToggleFeature(key);
    });
  };

  return (
    <div className="w-full space-y-5">
      {/* Top Header Card - Ultra Rounded Squircle */}
      <div className="p-4 sm:p-5 rounded-3xl sm:rounded-[2rem] bg-gradient-to-br from-zinc-50/90 via-white to-zinc-50/50 dark:from-zinc-900/90 dark:via-zinc-900/60 dark:to-zinc-900/30 border border-zinc-200/70 dark:border-zinc-800 shadow-xs backdrop-blur-sm transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                Équipements & Prestations
              </h3>
              {/* Selected Count Pill */}
              <span
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold transition-all ${
                  selectedCount > 0
                    ? 'bg-brand-green/15 text-brand-green dark:bg-brand-green/25 border border-brand-green/30 shadow-xs'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60'
                }`}
              >
                {selectedCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-brand-green animate-pulse" />
                )}
                {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
              </span>

              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium text-zinc-500 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-red-200 dark:hover:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Effacer
                </button>
              )}
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Cochez les points forts pour aider les acheteurs ou locataires à trouver votre bien.
            </p>
          </div>

          {/* Search Pill Input */}
          <div className="relative w-full md:w-64 shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un équipement..."
              className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm font-medium rounded-full bg-white dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-4 focus:ring-brand-green/15 focus:border-brand-green transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
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
      {!searchQuery && (
        <div className="flex items-center gap-2 overflow-x-auto p-1.5 rounded-full bg-zinc-100/70 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 scrollbar-hide">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-2 ${
              activeCategory === 'all'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/80 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <span>Tous les équipements</span>
            <span
              className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors ${
                activeCategory === 'all'
                  ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-950'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {selectedCount}
            </span>
          </button>

          {AMENITIES_CATEGORIES.map((cat) => {
            const catSelectedCount = cat.items.filter((item) =>
              Boolean(features[item.key])
            ).length;
            const isCatActive = activeCategory === cat.title;

            return (
              <button
                key={cat.title}
                type="button"
                onClick={() => setActiveCategory(cat.title)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer flex items-center gap-2 ${
                  isCatActive
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-white/80 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span>{cat.title}</span>
                {catSelectedCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-brand-green text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                    {catSelectedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Categories and Amenities Grid */}
      <div className="space-y-5">
        {filteredCategories.length === 0 ? (
          <div className="p-8 text-center rounded-3xl sm:rounded-[2rem] bg-zinc-50/80 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800 space-y-3">
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              Aucun équipement ne correspond à votre recherche &ldquo;{searchQuery}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 rounded-full text-xs font-bold bg-brand-green text-white hover:bg-brand-green/90 transition-all cursor-pointer shadow-xs"
            >
              Réinitialiser la recherche
            </button>
          </div>
        ) : (
          filteredCategories.map((category) => {
            const originalCat = AMENITIES_CATEGORIES.find((c) => c.title === category.title) || category;
            const catSelectedCount = originalCat.items.filter((item) =>
              Boolean(features[item.key])
            ).length;
            const allInCatSelected =
              catSelectedCount === originalCat.items.length && originalCat.items.length > 0;

            return (
              <div
                key={category.title}
                className="p-4 sm:p-5 rounded-3xl sm:rounded-[2.25rem] bg-white/70 dark:bg-zinc-900/40 border border-zinc-200/70 dark:border-zinc-800/80 shadow-xs backdrop-blur-xs space-y-3.5 transition-all"
              >
                {/* Category Header Row */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200 shadow-2xs">
                    <span>{category.title}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200/50 dark:border-zinc-700/50">
                      {catSelectedCount} / {originalCat.items.length}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleToggleCategory(originalCat)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors border border-zinc-200/60 dark:border-zinc-700/60 cursor-pointer active:scale-95"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{allInCatSelected ? 'Tout décocher' : 'Tout cocher'}</span>
                    </button>
                  </div>
                </div>

                {/* Amenity Items Pills Flow (Natural wrap, smooth fluid interactive click) */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  {category.items.map((item) => {
                    const Icon = item.icon;
                    const isSelected = Boolean(features[item.key]);
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
                              ? 'font-bold text-zinc-900 dark:text-white'
                              : 'font-medium text-zinc-700 dark:text-zinc-300'
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
  );
}
