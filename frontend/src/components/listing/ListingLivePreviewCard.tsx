'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  BedDouble,
  Bath,
  Maximize,
  MapPin,
  Heart,
  Check,
  ChevronLeft,
  ChevronRight,
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

const FEATURE_ICONS: Record<string, React.ElementType> = {
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

interface ListingLivePreviewCardProps {
  title: string;
  description?: string;
  type: 'rent' | 'sale';
  houseType: string;
  floor?: string;
  price: number | null;
  rent: number | null;
  area: number;
  rooms: number;
  bathrooms: number;
  toilet?: number;
  images: { src?: string; previewUrl?: string }[];
  cityLabel?: string;
  features?: Record<string, boolean>;
}

export default function ListingLivePreviewCard({
  title,
  description,
  type,
  houseType,
  floor,
  price,
  rent,
  area,
  rooms,
  bathrooms,
  images,
  cityLabel,
  features = {},
}: ListingLivePreviewCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Extract valid image URLs from uploaded images or fallback to default
  const validImages = images
    .map((img) => img.src || img.previewUrl)
    .filter((src): src is string => Boolean(src && src.trim().length > 0));

  const displayImages = validImages.length > 0 ? validImages : ['/hero-bg.jpg'];

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentIndex < displayImages.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const displayPrice = type === 'rent' ? rent : price;

  const activeFeatures = Object.entries(features)
    .filter(([_, value]) => Boolean(value))
    .map(([key]) => key);

  return (
    <div className="w-full max-w-sm mx-auto select-none">
      <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-zinc-50 shadow-sm border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 relative">
        {/* Top Image Container */}
        <div className="relative h-48 w-full overflow-hidden rounded-t-3xl bg-zinc-200 dark:bg-zinc-700 group">
          <div
            className="flex h-full w-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {displayImages.map((img, idx) => (
              <div key={idx} className="relative h-full w-full shrink-0">
                <Image
                  src={img}
                  alt={`${title || 'Propriété'} - Photo ${idx + 1}`}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 380px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>

          {/* Carousel Controls */}
          {displayImages.length > 1 && (
            <>
              <button
                type="button"
                onClick={prevImage}
                className={`absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200 border border-white/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-90 opacity-0 group-hover:opacity-100 cursor-pointer ${
                  currentIndex === 0 ? 'hidden' : ''
                }`}
                aria-label="Image précédente"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={nextImage}
                className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200 border border-white/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-90 opacity-0 group-hover:opacity-100 cursor-pointer ${
                  currentIndex === displayImages.length - 1 ? 'hidden' : ''
                }`}
                aria-label="Image suivante"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              {/* Dots */}
              <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 z-10 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/10">
                {displayImages.map((_, idx) => (
                  <div
                    key={idx}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentIndex(idx);
                    }}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      idx === currentIndex
                        ? 'w-3.5 bg-white shadow-xs'
                        : 'w-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Depth vignette under curved separation */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 via-black/15 to-transparent pointer-events-none z-[5]" />

          {/* Type Badge (LOCATION / VENTE) */}
          <div
            className={`absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-sm z-10 ${
              type === 'rent'
                ? 'bg-brand-green text-white'
                : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
            }`}
          >
            {type === 'rent' ? 'Location' : 'Vente'}
          </div>

          {/* Time Badge */}
          <div className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-md border border-white/10 z-10">
            À l'instant
          </div>

          {/* Heart Icon (Signature look) */}
          <div className="group absolute bottom-6 right-3 z-20 flex h-9 w-9 items-center justify-center p-0 transition-transform duration-200">
            <Heart className="h-6 w-6 fill-black/25 text-white stroke-white stroke-[2] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
          </div>
        </div>

        {/* Text Area: S-Shaped Curved Overlap Sheet with 3D Elevation */}
        <div className="relative z-10 -mt-5 flex flex-col flex-1 rounded-tl-none rounded-tr-3xl bg-zinc-50 dark:bg-zinc-800 p-3.5 pt-4 shadow-[0_-8px_20px_rgba(0,0,0,0.12),0_-2px_6px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.55),0_-2px_6px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] border-t border-black/[0.08] dark:border-white/[0.10]">
          {/* Inverted Concave Corner on Upper Left Side with 3D Drop Shadow & Specular Bevel */}
          <svg
            className="absolute bottom-full left-0 w-6 h-6 pointer-events-none -mb-px overflow-visible [filter:drop-shadow(0_-5px_8px_rgba(0,0,0,0.12))] dark:[filter:drop-shadow(0_-5px_10px_rgba(0,0,0,0.5))]"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M 24,24 A 24,24 0 0,1 0,0 L 0,24 Z"
              className="fill-zinc-50 dark:fill-zinc-800"
            />
            <path
              d="M 24,24 A 24,24 0 0,1 0,0"
              className="stroke-black/[0.12] dark:stroke-black/60"
              strokeWidth="1.5"
              fill="none"
            />
            <path
              d="M 24,24 A 24,24 0 0,1 0,0"
              className="stroke-white/80 dark:stroke-white/20"
              strokeWidth="1"
              fill="none"
            />
          </svg>

          {/* Top line: Title & Price */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-1 flex-1 tracking-tight">
              {title.trim() || 'Titre de votre annonce...'}
            </h3>
            <p className="text-sm font-black text-brand-green whitespace-nowrap tracking-tight">
              {displayPrice && displayPrice > 0
                ? `${displayPrice.toLocaleString('fr-FR')} Ar`
                : 'Prix non défini'}
              {type === 'rent' && (
                <span className="text-[10px] font-normal text-zinc-500">
                  /mois
                </span>
              )}
            </p>
          </div>

          {/* Second line: Type & Location */}
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold">
              {houseType
                ? houseType.charAt(0).toUpperCase() + houseType.slice(1)
                : 'Propriété'}
              {houseType === 'appartement' && floor ? ` (${floor})` : ''}
            </span>
            <span>•</span>
            <MapPin className="h-3 w-3 text-brand-green shrink-0" />
            <span className="truncate">
              {cityLabel || 'Localisation sélectionnée'}
            </span>
          </div>

          {/* Third line: Description */}
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed whitespace-pre-wrap">
            {description?.trim() ||
              'Aucune description disponible pour cette propriété...'}
          </p>

          {/* Bottom line: Core Stats & Features Icons */}
          <div className="mt-1 flex items-center pt-1.5 border-t border-zinc-100 dark:border-zinc-700/60 overflow-hidden">
            {/* Core Stats */}
            <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 shrink-0 pr-3 border-r border-zinc-200 dark:border-zinc-700">
              <span className="flex items-center gap-1 text-[11px]" title="Pièces">
                <BedDouble className="h-3.5 w-3.5" />
                {rooms || 0}
              </span>
              <span className="flex items-center gap-1 text-[11px]" title="Salles de bain">
                <Bath className="h-3.5 w-3.5" />
                {bathrooms || 0}
              </span>
              <span className="flex items-center gap-1 text-[11px]" title="Surface">
                <Maximize className="h-3.5 w-3.5" />
                {area ? `${area}m²` : '-'}
              </span>
            </div>

            {/* Features Icons */}
            {activeFeatures.length > 0 ? (
              <div className="pl-3 flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-zinc-400 dark:text-zinc-500 font-bold tracking-widest leading-none">
                {activeFeatures.map((key) => {
                  const Icon = FEATURE_ICONS[key] || Check;
                  return (
                    <span
                      key={key}
                      title={key}
                      className="inline-block align-middle mr-2 text-zinc-500 dark:text-zinc-400"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="pl-3 text-[10px] text-zinc-400 italic truncate">
                Aucun équipement
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
