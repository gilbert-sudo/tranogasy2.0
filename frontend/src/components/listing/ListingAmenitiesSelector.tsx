'use client';

import React, { useState } from 'react';
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
import { Check, Sparkles } from 'lucide-react';

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
}: ListingAmenitiesSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const selectedCount = Object.values(features).filter(Boolean).length;

  return (
    <div className="w-full space-y-5">
      {/* Header & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <span>Équipements & Prestations</span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold transition-colors ${
                selectedCount > 0
                  ? 'bg-brand-green/15 text-brand-green dark:bg-brand-green/25'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
              }`}
            >
              {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
            </span>
          </h3>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Cochez les points forts pour aider les acheteurs ou locataires à trouver votre bien.
          </p>
        </div>
      </div>

      {/* Category Pills (Filter for fast picking) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          type="button"
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeCategory === 'all'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
              : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          Tous les équipements
        </button>
        {AMENITIES_CATEGORIES.map((cat) => (
          <button
            key={cat.title}
            type="button"
            onClick={() => setActiveCategory(cat.title)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === cat.title
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {cat.title}
          </button>
        ))}
      </div>

      {/* Amenities Grid by Category */}
      <div className="space-y-6">
        {AMENITIES_CATEGORIES.filter(
          (cat) => activeCategory === 'all' || activeCategory === cat.title
        ).map((category) => (
          <div key={category.title} className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 pl-1">
              {category.title}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {category.items.map((item) => {
                const Icon = item.icon;
                const isSelected = Boolean(features[item.key]);

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onToggleFeature(item.key)}
                    className={`group relative flex items-center gap-2.5 p-3 rounded-2xl text-left transition-all duration-200 cursor-pointer select-none text-xs sm:text-sm font-medium ${
                      isSelected
                        ? 'bg-brand-green/10 text-zinc-900 dark:text-white ring-2 ring-brand-green shadow-xs'
                        : 'bg-zinc-50/80 hover:bg-zinc-100 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 ring-1 ring-zinc-200/70 dark:ring-zinc-800'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                        isSelected
                          ? 'bg-brand-green text-white shadow-xs'
                          : 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <span className="flex-1 truncate leading-tight">{item.label}</span>

                    {isSelected && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center bg-brand-green text-white shrink-0 animate-in zoom-in-75 duration-150">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

