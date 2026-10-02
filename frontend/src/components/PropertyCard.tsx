"use client";

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BedDouble, Bath, Maximize, MapPin, Heart, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  FaCar, FaMotorcycle, FaWifi, FaParking, FaShieldAlt, FaSwimmingPool, FaHotTub, FaBed
} from "react-icons/fa";
import {
  FaFaucetDrip, FaPlugCircleBolt, FaPlugCircleCheck, FaOilWell, FaKitchenSet
} from "react-icons/fa6";
import {
  GiWell, GiBrickWall, GiFireplace, GiBathtub, GiSolarPower, GiMountainCave, GiSeatedMouse, GiSeaDragon, GiCastle
} from "react-icons/gi";
import { MdOutlineLiving, MdBalcony, MdLandscape, MdOutlineFiberSmartRecord } from "react-icons/md";
import { TbAirConditioning, TbBuildingCastle, TbWash } from "react-icons/tb";
import { TfiLayoutSidebarLeft } from "react-icons/tfi";

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

interface PropertyProps {
  property: {
    _id: string;
    title: string;
    description?: string;
    price?: number;
    rent?: number;
    rooms: number;
    bathrooms: number;
    area: number;
    type: string;
    houseType: string;
    city?: {
      district: string;
      commune: string;
      fokontany: string;
    };
    images?: string[];
    features?: Record<string, boolean>;
    created_at: string;
  };
}

export default function PropertyCard({ property }: PropertyProps) {
  const displayPrice = property.type === 'rent' ? property.rent : property.price;
  
  const images = property.images && property.images.length > 0 
    ? property.images.slice(0, 3) 
    : ['https://via.placeholder.com/400x300?text=TranoGasy'];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50; 

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
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe && currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentIndex < images.length - 1) setCurrentIndex(prev => prev + 1);
  };
  
  const prevImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  const activeFeatures = property.features 
    ? Object.entries(property.features).filter(([_, value]) => value).map(([key]) => key)
    : [];

  return (
    <Link href={`/properties/${property._id}`} className="block h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-xl bg-zinc-50 shadow-sm border border-zinc-200 transition-transform hover:-translate-y-1 hover:shadow-md dark:bg-zinc-800 dark:border-zinc-700 relative">
        <div 
          className="relative h-44 w-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 group"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div 
            className="flex h-full w-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {images.map((img, idx) => (
              <div key={idx} className="relative h-full w-full shrink-0">
                <Image src={img} alt={`${property.title} - Image ${idx + 1}`} fill className="object-cover" />
              </div>
            ))}
          </div>

          {/* Carousel Controls */}
          {images.length > 1 && (
            <>
              <button 
                onMouseEnter={prevImage}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); prevImage(e); }}
                className={`absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-zinc-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100 ${currentIndex === 0 ? 'hidden' : ''}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                onMouseEnter={nextImage}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); nextImage(e); }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-zinc-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100 ${currentIndex === images.length - 1 ? 'hidden' : ''}`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              
              {/* Dots */}
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 z-10">
                {images.map((_, idx) => (
                  <div 
                    key={idx} 
                    onMouseEnter={() => setCurrentIndex(idx)}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentIndex(idx); }}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${idx === currentIndex ? 'w-3 bg-white' : 'w-1.5 bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
          
          {/* Badges */}
          <div className="absolute top-2 left-2 rounded bg-brand-green px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide shadow-sm">
            {property.type === 'rent' ? 'Location' : 'Vente'}
          </div>
          <div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {formatDateAgo(property.created_at)}
          </div>

          {/* Favorite Button */}
          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            className="group absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-400 shadow-lg ring-1 ring-black/5 transition-all duration-300 hover:scale-110 hover:text-brand-red hover:shadow-xl active:scale-90 dark:bg-zinc-900 dark:ring-white/10 dark:hover:bg-zinc-800"
            aria-label="Ajouter aux favoris"
          >
            <Heart className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" strokeWidth={2} />
          </button>
        </div>

        <div className="flex flex-col flex-1 p-3">
          {/* Top line: Title & Price */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white line-clamp-1 flex-1">
              {property.title}
            </h3>
            <p className="text-sm font-bold text-brand-green whitespace-nowrap">
              {displayPrice ? `${displayPrice.toLocaleString('fr-FR')} Ar` : 'Sur dmd'}
              {property.type === 'rent' && <span className="text-[10px] font-normal text-zinc-500">/mo</span>}
            </p>
          </div>

          {/* Second line: Type & Location */}
          <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold">
              {property.houseType ? property.houseType.charAt(0).toUpperCase() + property.houseType.slice(1) : 'Propriété'}
            </span>
            <span>•</span>
            <MapPin className="h-3 w-3 text-brand-red shrink-0" />
            <span className="truncate">
              {property.city?.fokontany}, {property.city?.commune}
            </span>
          </div>
          
          {/* Third line: Description */}
          <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 flex-1 leading-relaxed">
            {property.description || 'Aucune description disponible pour cette propriété...'}
          </p>

          {/* Bottom line: Icons & Features */}
          <div className="mt-2 flex items-center pt-2 border-t border-zinc-100 dark:border-zinc-700/60 overflow-hidden">
            {/* Core Stats */}
            <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400 shrink-0 pr-3 border-r border-zinc-200 dark:border-zinc-700">
              <span className="flex items-center gap-1 text-[11px]" title="Pièces">
                <BedDouble className="h-3.5 w-3.5" />
                {property.rooms || 0}
              </span>
              <span className="flex items-center gap-1 text-[11px]" title="Salles de bain">
                <Bath className="h-3.5 w-3.5" />
                {property.bathrooms || 0}
              </span>
              <span className="flex items-center gap-1 text-[11px]" title="Surface">
                <Maximize className="h-3.5 w-3.5" />
                {property.area ? `${property.area}m²` : '-'}
              </span>
            </div>

            {/* Features */}
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
        </div>
      </div>
    </Link>
  );
}
