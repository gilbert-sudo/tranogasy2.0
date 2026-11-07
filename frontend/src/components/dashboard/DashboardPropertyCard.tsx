'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  BedDouble,
  Bath,
  Maximize,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  Pencil,
  Clock,
  Eye,
  Heart,
  Phone,
  BarChart3,
  Check,
  Grid2X2,
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
  FaShower,
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
  MdWc,
} from 'react-icons/md';
import { TbAirConditioning, TbBuildingCastle, TbWash } from 'react-icons/tb';
import { TfiLayoutSidebarLeft } from 'react-icons/tfi';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import PropertyStatsModal from './PropertyStatsModal';

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
  insideToilet: MdWc,
  insideBathroom: FaShower,
};

function extractSurfaceFromText(text?: string): number | null {
  if (!text) return null;
  const match = text.match(
    /\b(\d+(?:[.,]\d+)?)\s*(?:m2|m²|mètres\s*carrés|metres\s*carres)\b/i
  );
  if (match && match[1]) {
    const val = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

function formatDateAgo(dateString?: string) {
  if (!dateString) return 'Nouveau';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "À l'instant";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `Il y a ${diffInMinutes} min`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `Il y a ${diffInHours} h`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `Il y a ${diffInDays} j`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `Il y a ${diffInMonths} mois`;
  const diffInYears = Math.floor(diffInMonths / 12);
  return `Il y a ${diffInYears} an${diffInYears > 1 ? 's' : ''}`;
}

export interface DashboardProperty {
  id?: string;
  _id?: string;
  title: string;
  description?: string;
  type?: 'sale' | 'rent' | string;
  houseType?: string;
  price?: number;
  rent?: number;
  city?: any;
  neighborhood?: string;
  area?: number;
  rooms?: number;
  bathrooms?: number;
  toilet?: number;
  kitchen?: number;
  livingRoom?: number;
  features?: Record<string, boolean>;
  owner?: any;
  sources?: any;
  propertyNumber?: any;
  coords?: any;
  phone1?: string;
  phone2?: string;
  phone3?: string;
  images?: any[];
  status?: 'active' | 'available' | 'pending' | 'draft' | 'unavailable' | string;
  views?: number;
  favorites?: number;
  leads?: number;
  created_at?: string;
}

interface DashboardPropertyCardProps {
  property: DashboardProperty;
  onToggleStatus: (property: DashboardProperty) => void;
  onEdit: (property: DashboardProperty) => void;
  onDelete: (property: DashboardProperty) => void;
  onViewStats?: (property: DashboardProperty) => void;
}

function DashboardPropertyCardComponent({
  property,
  onToggleStatus,
  onEdit,
  onDelete,
  onViewStats,
}: DashboardPropertyCardProps) {
  const propertyId = property._id || property.id || '';
  const openPropertyDetail = usePropertyDetailModalStore((state) => state.openPropertyDetail);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

  // Normalize images to array of string URLs
  const rawImages = property.images && property.images.length > 0 ? property.images : ['/hero-bg.jpg'];
  const images = rawImages
    .slice(0, 5)
    .map((img: any) => (typeof img === 'string' ? img : img?.src || img?.previewUrl))
    .filter(Boolean);
  const displayImages = images.length > 0 ? images : ['/hero-bg.jpg'];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedIndices, setLoadedIndices] = useState<number[]>([0]);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const updateCurrentIndex = (newIndex: number) => {
    setCurrentIndex(newIndex);
    setLoadedIndices((prev) => (prev.includes(newIndex) ? prev : [...prev, newIndex]));
  };

  const isRent = property.type === 'rent';
  const displayPrice = isRent ? (property.rent ?? property.price) : (property.price ?? property.rent);

  const isActive = property.status === 'active' || property.status === 'available';
  const isPending = property.status === 'pending';

  // Active features list
  const activeFeatures = property.features
    ? Object.entries(property.features)
        .filter(([key, value]) => Boolean(value) && key !== '_id' && key !== '__v')
        .map(([key]) => key)
    : [];

  const toiletCount =
    property.toilet !== undefined && property.toilet !== null && Number(property.toilet) > 0
      ? Number(property.toilet)
      : property.features?.insideToilet
      ? 1
      : 0;

  const displayArea =
    property.area && Number(property.area) > 0
      ? Number(property.area)
      : extractSurfaceFromText(property.description);

  // Location string extraction
  const locationText = (() => {
    if (typeof property.city === 'object' && property.city !== null) {
      return [property.city.fokontany, property.city.commune || property.city.district]
        .filter(Boolean)
        .join(', ');
    }
    return [property.neighborhood, property.city].filter(Boolean).join(', ');
  })();

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentIndex < displayImages.length - 1) {
      updateCurrentIndex(currentIndex + 1);
    }
  };

  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentIndex > 0) {
      updateCurrentIndex(currentIndex - 1);
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > 50 && currentIndex < displayImages.length - 1) {
      updateCurrentIndex(currentIndex + 1);
    }
    if (distance < -50 && currentIndex > 0) {
      updateCurrentIndex(currentIndex - 1);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();

    let transitionOrigin = null;
    const cardEl = e.currentTarget as HTMLElement;
    const imgWrapper = cardEl.querySelector(`[data-property-card-image="${propertyId}"]`) as HTMLElement | null;
    if (imgWrapper) {
      const rect = imgWrapper.getBoundingClientRect();
      const imgEl = imgWrapper.querySelector('img') as HTMLImageElement | null;
      const activeSrc = imgEl?.currentSrc || imgEl?.src || displayImages[currentIndex] || displayImages[0] || '';
      transitionOrigin = {
        rect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        src: typeof activeSrc === 'string' ? activeSrc : (activeSrc as any)?.src || '',
        borderRadius: window.getComputedStyle(imgWrapper).borderRadius || '1.5rem 1.5rem 0 0',
      };
    }

    openPropertyDetail(propertyId, property, transitionOrigin);
  };

  return (
    <div
      onClick={handleCardClick}
      className="group flex h-full flex-col overflow-hidden rounded-3xl bg-zinc-50 shadow-sm border border-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-md dark:bg-zinc-800 dark:border-zinc-700 relative cursor-pointer"
    >
      {/* ── Top Image Container with Carousel ── */}
      <div
        data-property-card-image={propertyId}
        className="relative h-48 w-full overflow-hidden rounded-t-3xl bg-zinc-200 dark:bg-zinc-700 group/image"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full w-full transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {displayImages.map((img, idx) => {
            const shouldRender = loadedIndices.includes(idx);
            return (
              <div key={idx} className="relative h-full w-full shrink-0">
                {shouldRender && (
                  <Image
                    src={img}
                    alt={`${property.title} - Image ${idx + 1}`}
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Carousel Controls */}
        {displayImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={prevImage}
              className={`absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200 border border-white/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-90 opacity-0 group-hover/image:opacity-100 z-10 cursor-pointer ${
                currentIndex === 0 ? 'hidden' : ''
              }`}
              aria-label="Image précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={nextImage}
              className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200 border border-white/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-90 opacity-0 group-hover/image:opacity-100 z-10 cursor-pointer ${
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
                    updateCurrentIndex(idx);
                  }}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === currentIndex ? 'w-3.5 bg-white shadow-xs' : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Depth vignette under the curved separation */}
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 via-black/15 to-transparent pointer-events-none z-[5]" />

        {/* Badges on Image (Top-Left) */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          {/* Status Badge */}
          {isActive ? (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500 text-white shadow-sm backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              En ligne
            </span>
          ) : isPending ? (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-500 text-white shadow-sm backdrop-blur-md">
              <Clock className="w-3 h-3" />
              En attente
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-zinc-700/90 text-white shadow-sm backdrop-blur-md">
              En pause
            </span>
          )}

          {/* Type Badge */}
          <div
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-sm ${
              isRent
                ? 'bg-brand-green text-white'
                : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
            }`}
          >
            {isRent ? 'Location' : 'Vente'}
          </div>
        </div>

        {/* Top-Right: Time ago badge */}
        <div className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-md border border-white/10 z-10">
          {formatDateAgo(property.created_at)}
        </div>
      </div>

      {/* ── S-Shaped Curved Overlap Sheet with 3D Elevation ── */}
      <div className="relative z-10 -mt-5 flex flex-col flex-1 rounded-tl-none rounded-tr-3xl bg-zinc-50 dark:bg-zinc-800 p-3.5 pt-4 shadow-[0_-8px_20px_rgba(0,0,0,0.12),0_-2px_6px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.55),0_-2px_6px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] border-t border-black/[0.08] dark:border-white/[0.10]">
        {/* Inverted Concave Corner on Upper Left Side with 3D Drop Shadow & Specular Bevel */}
        <svg
          className="absolute bottom-full left-0 w-6 h-6 pointer-events-none -mb-px overflow-visible [filter:drop-shadow(0_-5px_8px_rgba(0,0,0,0.12))] dark:[filter:drop-shadow(0_-5px_10px_rgba(0,0,0,0.5))]"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M 24,24 A 24,24 0 0,1 0,0 L 0,24 Z" className="fill-zinc-50 dark:fill-zinc-800" />
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
            {property.title}
          </h3>
          <p className="text-sm font-black text-brand-green whitespace-nowrap tracking-tight">
            {displayPrice ? `${displayPrice.toLocaleString('fr-FR')} Ar` : 'Sur dmd'}
            {isRent && <span className="text-[10px] font-normal text-zinc-500">/mois</span>}
          </p>
        </div>

        {/* Second line: House Type & Location */}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="font-semibold">
            {property.houseType ? property.houseType.charAt(0).toUpperCase() + property.houseType.slice(1) : 'Propriété'}
          </span>
          <span>•</span>
          <MapPin className="h-3 w-3 text-brand-green shrink-0" />
          <span className="truncate">{locationText || 'Madagascar'}</span>
        </div>

        {/* Third line: Description */}
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed whitespace-pre-wrap">
          {property.description?.trim() || 'Aucune description disponible pour cette propriété...'}
        </p>

        {/* Fourth line: Specs (Rooms, Bathrooms, Toilet, Area) & Features Row */}
        <div className="mt-1 flex items-center pt-1.5 border-t border-zinc-100 dark:border-zinc-700/60 overflow-hidden text-zinc-500 dark:text-zinc-400">
          {/* Core Stats */}
          <div className="flex items-center gap-2.5 shrink-0 pr-3 border-r border-zinc-200 dark:border-zinc-700">
            <span className="flex items-center gap-1 text-[11px]" title="Chambres">
              <BedDouble className="h-3.5 w-3.5" />
              {property.rooms || 0}
            </span>
            <span className="flex items-center gap-1 text-[11px]" title="Salles de bain">
              <Bath className="h-3.5 w-3.5" />
              {property.bathrooms || 0}
            </span>
            {toiletCount > 0 && (
              <span className="flex items-center gap-1 text-[11px]" title="W.C / Toilettes">
                <Grid2X2 className="h-3.5 w-3.5" />
                {toiletCount}
              </span>
            )}
            <span className="flex items-center gap-1 text-[11px]" title="Surface">
              <Maximize className="h-3.5 w-3.5" />
              {displayArea ? `${displayArea}m²` : '-'}
            </span>
          </div>

          {/* Features Icons */}
          {activeFeatures.length > 0 && (
            <div 
              className="pl-3 flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-zinc-400 dark:text-zinc-500 font-bold tracking-widest leading-none"
            >
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
          )}
        </div>

        {/* Fifth line: Owner Actions Footer */}
        <div className="mt-2.5 pt-2 flex items-center justify-between gap-2 border-t border-zinc-200/60 dark:border-zinc-700/60">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleStatus(property);
            }}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-full transition-all cursor-pointer active:scale-95 ${
              isActive
                ? 'bg-zinc-200/80 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs'
            }`}
          >
            {isActive ? 'Mettre en pause' : 'Mettre en ligne'}
          </button>

          <div className="flex items-center gap-1">
            {/* View Stats Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onViewStats) {
                  onViewStats(property);
                } else {
                  setIsStatsModalOpen(true);
                }
              }}
              aria-label="Voir les statistiques"
              title="Statistiques de l'annonce"
              className="p-1.5 rounded-full text-zinc-500 hover:text-brand-green dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all active:scale-90 cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>

            {/* Quick View Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCardClick(e);
              }}
              aria-label="Voir l'annonce"
              title="Voir l'annonce"
              className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-700 transition-all active:scale-90 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            {/* Edit Property Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(property);
              }}
              aria-label="Modifier l'annonce"
              title="Modifier l'annonce"
              className="p-1.5 rounded-full text-zinc-500 hover:text-brand-green dark:text-zinc-400 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all active:scale-90 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            {/* Delete Property Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(property);
              }}
              aria-label="Supprimer l'annonce"
              title="Supprimer l'annonce"
              className="p-1.5 rounded-full text-zinc-400 hover:text-brand-red hover:bg-red-50 dark:hover:bg-red-950/30 transition-all active:scale-90 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Self-contained Stats Modal Fallback */}
      {!onViewStats && isStatsModalOpen && (
        <PropertyStatsModal
          isOpen={isStatsModalOpen}
          property={property}
          onClose={() => setIsStatsModalOpen(false)}
        />
      )}
    </div>
  );
}

const DashboardPropertyCard = React.memo(
  DashboardPropertyCardComponent,
  (prev, next) =>
    (prev.property._id || prev.property.id) === (next.property._id || next.property.id) &&
    prev.property.status === next.property.status &&
    prev.property.title === next.property.title &&
    prev.property.price === next.property.price &&
    prev.property.rent === next.property.rent &&
    prev.property.views === next.property.views &&
    prev.property.favorites === next.property.favorites &&
    prev.property.leads === next.property.leads &&
    prev.property.features === next.property.features
);

export default DashboardPropertyCard;
