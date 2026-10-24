"use client";

import { useState, useEffect } from 'react';
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
import { usePropertyStore } from '@/store/propertyStore';
import { useFavorite } from '@/hooks/useFavorite';
import { useUserStore } from '@/store/userStore';

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

export default function PropertyCard({ property, priority = false }: PropertyProps & { priority?: boolean }) {
  const addProperty = usePropertyStore(state => state.addProperty);
  const user = useUserStore(state => state.user);
  const { favorites, checkFavorite, toggleFavorite } = useFavorite();
  
  const isFavorite = favorites[property._id] || false;
  
  useEffect(() => {
    if (property) {
      addProperty(property);
    }
  }, [property, addProperty]);

  const currentUser = user?.user || user;
  
  useEffect(() => {
    if (currentUser && property) {
      checkFavorite(property._id, currentUser._id);
    }
  }, [currentUser, property, checkFavorite]);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) {
      alert('Veuillez vous connecter pour ajouter aux favoris');
      return;
    }
    await toggleFavorite(property._id, currentUser._id);
  };

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
      <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-zinc-50 shadow-sm border border-zinc-200 transition-transform hover:-translate-y-1 hover:shadow-md dark:bg-zinc-800 dark:border-zinc-700 relative">
        <div 
          className="relative h-48 w-full overflow-hidden rounded-t-3xl bg-zinc-200 dark:bg-zinc-700 group"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div 
            className="flex h-full w-full transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {images.map((img, idx) => {
              const isFirst = idx === 0;
              // Only load the current image or adjacent slides when interacting to avoid downloading 3x images per card upfront
              const shouldRenderImage = isFirst || Math.abs(idx - currentIndex) <= 1;

              return (
                <div key={idx} className="relative h-full w-full shrink-0">
                  {shouldRenderImage ? (
                    <Image 
                      src={img} 
                      alt={`${property.title} - Image ${idx + 1}`} 
                      fill 
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1536px) 33vw, 20vw"
                      priority={priority && isFirst}
                      loading={priority && isFirst ? 'eager' : 'lazy'}
                      className="object-cover" 
                    />
                  ) : (
                    <div className="w-full h-full bg-zinc-200 dark:bg-zinc-700" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Carousel Controls */}
          {images.length > 1 && (
            <>
              <button 
                onMouseEnter={prevImage}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); prevImage(e); }}
                className={`absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200 border border-white/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-90 opacity-0 group-hover:opacity-100 ${currentIndex === 0 ? 'hidden' : ''}`}
                aria-label="Image précédente"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                onMouseEnter={nextImage}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); nextImage(e); }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200 border border-white/80 dark:border-white/10 shadow-sm backdrop-blur-md transition-all hover:scale-105 active:scale-90 opacity-0 group-hover:opacity-100 ${currentIndex === images.length - 1 ? 'hidden' : ''}`}
                aria-label="Image suivante"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              
              {/* Dots */}
              <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1.5 z-10 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm border border-white/10">
                {images.map((_, idx) => (
                  <div 
                    key={idx} 
                    onMouseEnter={() => setCurrentIndex(idx)}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentIndex(idx); }}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${idx === currentIndex ? 'w-3.5 bg-white shadow-xs' : 'w-1.5 bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}
          
          {/* Depth vignette under the curved separation */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/35 via-black/15 to-transparent pointer-events-none z-[5]" />

          {/* Badges */}
          <div className={`absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider shadow-sm ${
            property.type === 'rent'
              ? 'bg-brand-green text-white'
              : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
          }`}>
            {property.type === 'rent' ? 'Location' : 'Vente'}
          </div>
          <div className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-md border border-white/10">
            {formatDateAgo(property.created_at)}
          </div>

          {/* Favorite Button (Borderless & Backgroundless with Red Heart) */}
          <button 
            onClick={handleFavoriteClick}
            className="group absolute bottom-6 right-3 z-20 flex h-9 w-9 cursor-pointer items-center justify-center p-0 transition-transform duration-200 active:scale-75 focus:outline-none"
            aria-label="Ajouter aux favoris"
          >
            <Heart 
              className={`h-6 w-6 transition-all duration-300 ${
                isFavorite 
                  ? 'fill-brand-red text-brand-red stroke-brand-red scale-110 drop-shadow-[0_2px_8px_rgba(236,28,36,0.45)]' 
                  : 'fill-black/25 text-white stroke-white stroke-[2] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] group-hover:scale-110 group-hover:fill-black/40'
              }`} 
            />
          </button>
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
            {/* Ambient contact edge */}
            <path 
              d="M 24,24 A 24,24 0 0,1 0,0" 
              className="stroke-black/[0.12] dark:stroke-black/60" 
              strokeWidth="1.5" 
              fill="none" 
            />
            {/* Crisp specular rim highlight */}
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
              {property.type === 'rent' && <span className="text-[10px] font-normal text-zinc-500">/mois</span>}
            </p>
          </div>

          {/* Second line: Type & Location */}
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold">
              {property.houseType ? property.houseType.charAt(0).toUpperCase() + property.houseType.slice(1) : 'Propriété'}
            </span>
            <span>•</span>
            <MapPin className="h-3 w-3 text-brand-green shrink-0" />
            <span className="truncate">
              {property.city?.fokontany}, {property.city?.commune}
            </span>
          </div>
          
          {/* Third line: Description */}
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed whitespace-pre-wrap">
            {property.description?.trim() || 'Aucune description disponible pour cette propriété...'}
          </p>

          {/* Bottom line: Icons & Features */}
          <div className="mt-1 flex items-center pt-1.5 border-t border-zinc-100 dark:border-zinc-700/60 overflow-hidden">
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
