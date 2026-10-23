'use client';

import React, { useRef, useEffect } from 'react';
import { X, MapPin, Phone, Share2, BedDouble, Home, Utensils, Droplets, Grid2X2, Expand, MessageCircle } from 'lucide-react';
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

import PropertyLocationDisplayer from '@/components/map/PropertyLocationDisplayer';
import { FeedProperty } from './types';

const FEATURE_DEFINITIONS: Record<string, { icon: React.ElementType; label: string }> = {
  electricityJirama: { icon: FaPlugCircleBolt, label: "Électricité JIRAMA" },
  waterPumpSupplyJirama: { icon: FaFaucetDrip, label: "Pompe JIRAMA" },
  waterWellSupply: { icon: GiWell, label: "Puits d'eau" },
  electricityPower: { icon: FaPlugCircleCheck, label: "Électricité privée" },
  waterPumpSupply: { icon: FaOilWell, label: "Pompe à eau privée" },
  solarPanels: { icon: GiSolarPower, label: "Panneaux solaires" },
  motoAccess: { icon: FaMotorcycle, label: "Accès moto" },
  carAccess: { icon: FaCar, label: "Accès voiture" },
  surroundedByWalls: { icon: GiBrickWall, label: "Clôturée" },
  courtyard: { icon: MdLandscape, label: "Cour" },
  parkingSpaceAvailable: { icon: FaParking, label: "Parking" },
  garage: { icon: FaCar, label: "Garage" },
  garden: { icon: GiWell, label: "Jardin" },
  independentHouse: { icon: TbBuildingCastle, label: "Indépendante" },
  guardianHouse: { icon: FaShieldAlt, label: "Maison gardien" },
  bassin: { icon: TbWash, label: "Bassin" },
  openKitchen: { icon: TfiLayoutSidebarLeft, label: "Cuisine ouverte" },
  kitchenFacilities: { icon: FaKitchenSet, label: "Cuisine équipée" },
  placardKitchen: { icon: FaBed, label: "Cuisine placardée" },
  hotWaterAvailable: { icon: FaHotTub, label: "Eau chaude" },
  furnishedProperty: { icon: MdOutlineLiving, label: "Meublé" },
  airConditionerAvailable: { icon: TbAirConditioning, label: "Climatisation" },
  bathtub: { icon: GiBathtub, label: "Baignoire" },
  fireplace: { icon: GiFireplace, label: "Cheminée" },
  elevator: { icon: TbBuildingCastle, label: "Ascenseur" },
  balcony: { icon: MdBalcony, label: "Balcon" },
  roofTop: { icon: GiCastle, label: "Toit terrasse" },
  swimmingPool: { icon: FaSwimmingPool, label: "Piscine" },
  securitySystem: { icon: FaShieldAlt, label: "Système sécurité" },
  wifiAvailability: { icon: FaWifi, label: "Wi-Fi" },
  fiberOpticReady: { icon: MdOutlineFiberSmartRecord, label: "Pré-fibrée" },
  seaView: { icon: GiSeaDragon, label: "Vue mer" },
  mountainView: { icon: GiMountainCave, label: "Vue montagne" },
  panoramicView: { icon: GiSeatedMouse, label: "Vue panoramique" },
};

function renderDescriptionWithLinks(text?: string) {
  if (!text) return 'Aucune description fournie.';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-green underline hover:text-green-600 break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

// Skeleton component for details drawer during loading or empty states
export function TikTokDetailsSkeleton({
  isDesktop = false,
  onClose,
}: {
  isDesktop?: boolean;
  onClose?: () => void;
}) {
  const content = (
    <div className="flex flex-col h-full overflow-hidden space-y-6 animate-pulse select-none">
      {/* Badges & Number skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-20 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-16 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          </div>
          {!isDesktop && onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Title skeleton */}
        <div className="w-3/4 h-8 rounded-xl bg-zinc-200 dark:bg-zinc-800" />

        {/* Location & price skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="w-48 h-4 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="w-36 h-7 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Specs Grid skeleton */}
      <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-700/60">
        <div className="w-36 h-3 rounded bg-zinc-200 dark:bg-zinc-800 mb-3" />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      </div>

      {/* Features chips skeleton */}
      <div className="space-y-3">
        <div className="w-32 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-28 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      </div>

      {/* Description skeleton */}
      <div className="space-y-2">
        <div className="w-24 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 space-y-2.5">
          <div className="w-full h-3.5 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="w-5/6 h-3.5 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="w-4/6 h-3.5 rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {/* Map skeleton */}
      <div className="h-44 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );

  if (isDesktop) {
    return (
      <div className="h-full bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-xl p-6 md:p-8 flex flex-col justify-between overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 flex flex-col">
      <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto -mt-2 mb-4 shrink-0" />
      {content}
    </div>
  );
}

interface TikTokDetailsDrawerProps {
  property: FeedProperty;
  isDesktop?: boolean;
  isOpen?: boolean;
  direction?: 'down' | 'up';
  isLoading?: boolean;
  onClose?: () => void;
  onOpenContact?: () => void;
  onShare?: () => void;
  onOpenComments?: () => void;
}

export default function TikTokDetailsDrawer({
  property,
  isDesktop = false,
  isOpen = false,
  direction = 'down',
  isLoading = false,
  onClose,
  onOpenContact,
  onShare,
  onOpenComments,
}: TikTokDetailsDrawerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Automatically reset scroll position to top when switching properties
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [property?._id]);

  if (isLoading || !property) {
    return <TikTokDetailsSkeleton isDesktop={isDesktop} onClose={onClose} />;
  }

  const displayPrice = property.type === 'rent' ? property.rent : property.price;

  const position = property.coords
    ? property.coords
    : property.city?.coords
    ? property.city.coords
    : {
        lat: -18.905195365917766,
        lng: 47.52370521426201,
      };

  const useCircle = !property.coords;

  const activeFeatures = property.features
    ? Object.entries(property.features)
        .filter(([_, val]) => !!val)
        .map(([key]) => key)
    : [];

  const specs = [
    { value: property.rooms || 0, label: 'Chambre(s)', icon: BedDouble },
    { value: property.livingRoom || 0, label: 'Salon', icon: Home },
    { value: property.kitchen || 0, label: 'Cuisine', icon: Utensils },
    {
      value: property.toilet || 0,
      label: `W.C (${property.features?.insideToilet ? 'Int.' : 'Ext.'})`,
      icon: Grid2X2,
    },
    {
      value: property.bathrooms || 0,
      label: `Douche (${property.features?.insideBathroom ? 'Int.' : 'Ext.'})`,
      icon: Droplets,
    },
    {
      value: property.area ? `${property.area} m²` : '-',
      label: 'Surface',
      icon: Expand,
    },
  ];

  // Micro-motion class matching scroll direction
  const animClass = direction === 'up' ? 'animate-feed-detail-down' : 'animate-feed-detail-up';

  const content = (
    <div
      ref={scrollContainerRef}
      className="flex flex-col h-full overflow-y-auto no-scrollbar space-y-6"
    >
      {/* Header Info */}
      <div className={`space-y-3 ${animClass}`} style={{ animationDelay: '0ms' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider shadow-sm ${
                property.type === 'rent'
                  ? 'bg-brand-green text-white'
                  : 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950'
              }`}
            >
              {property.type === 'rent' ? 'Location' : 'Vente'}
            </span>
            {property.propertyNumber && (
              <span className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                N° {property.propertyNumber}
              </span>
            )}
          </div>

          {!isDesktop && onClose && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white leading-snug">
          {property.title}
        </h2>

        {/* Location & Price */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 text-sm">
            <MapPin className="w-4 h-4 text-brand-green shrink-0" />
            <span className="capitalize font-medium">
              {property.city?.fokontany}, {property.city?.commune} {property.city?.district ? `(${property.city.district})` : ''}
            </span>
          </div>

          <div className="text-lg md:text-xl font-black text-brand-green">
            {displayPrice ? `${displayPrice.toLocaleString('fr-FR')} Ar` : 'Sur demande'}
            {property.type === 'rent' && <span className="text-xs font-normal text-zinc-500"> / mois</span>}
          </div>
        </div>
      </div>

      {/* Specifications Grid */}
      <div
        className={`bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-700/60 ${animClass}`}
        style={{ animationDelay: '40ms' }}
      >
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
          Caractéristiques principales
        </h4>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {specs.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="flex flex-col items-center justify-center text-center p-2 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/50 shadow-xs hover:border-brand-green/40 transition-colors"
              >
                <Icon className="w-4 h-4 text-zinc-600 dark:text-zinc-300 mb-1" />
                <span className="text-sm font-black text-zinc-900 dark:text-white leading-tight">
                  {item.value}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate w-full mt-0.5">
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Features & Amenities Chips */}
      {activeFeatures.length > 0 && (
        <div className={`space-y-3 ${animClass}`} style={{ animationDelay: '80ms' }}>
          <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
            Équipements & Atouts
          </h4>
          <div className="flex flex-wrap gap-2">
            {activeFeatures.map((key) => {
              const def = FEATURE_DEFINITIONS[key];
              if (!def) return null;
              const Icon = def.icon;
              return (
                <div
                  key={key}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-xs"
                >
                  <Icon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  <span>{def.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Description */}
      <div className={`space-y-2 ${animClass}`} style={{ animationDelay: '120ms' }}>
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          Description
        </h4>
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
          {renderDescriptionWithLinks(property.description)}
        </div>
      </div>

      {/* Location Map Preview */}
      <div className={`space-y-2 ${animClass}`} style={{ animationDelay: '160ms' }}>
        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
          <span>Localisation sur la carte</span>
          <span className="text-[10px] lowercase text-zinc-400">
            {property.city?.commune}
          </span>
        </h4>
        <div className="h-56 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 relative">
          <PropertyLocationDisplayer position={position} circle={useCircle} />
        </div>
      </div>

      {/* Advertiser Contact CTA Banner */}
      <div className="pt-2 sticky bottom-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md pb-2 flex gap-3 z-10">
        <button
          onClick={onOpenContact}
          className="flex-1 py-3.5 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-black/20 dark:shadow-white/10 backdrop-blur-md transition-all active:scale-95 cursor-pointer tracking-wide"
        >
          <Phone className="w-4 h-4 text-brand-green" />
          Contacter l&apos;annonceur
        </button>
        {onOpenComments && (
          <button
            onClick={onOpenComments}
            className="w-12 h-12 rounded-full border border-zinc-200/80 dark:border-white/10 bg-zinc-100/80 dark:bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 transition-all active:scale-95 cursor-pointer shrink-0"
            title="Commentaires et avis"
          >
            <MessageCircle className="w-5 h-5" />
          </button>
        )}
        {onShare && (
          <button
            onClick={onShare}
            className="w-12 h-12 rounded-full border border-zinc-200/80 dark:border-white/10 bg-zinc-100/80 dark:bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-800 dark:text-zinc-200 transition-all active:scale-95 cursor-pointer shrink-0"
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  // If Desktop mode: rendered inline
  if (isDesktop) {
    return (
      <div className="relative h-full bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-2xl p-6 md:p-8 flex flex-col justify-between overflow-hidden transition-all duration-300">
        {/* Shimmer sweep effect on property change */}
        <div
          key={`shimmer-${property._id}`}
          className="absolute inset-0 pointer-events-none overflow-hidden z-20"
        >
          <div className="w-full h-full bg-gradient-to-r from-transparent via-brand-green/10 dark:via-white/5 to-transparent -translate-x-full animate-feed-shimmer" />
        </div>
        {content}
      </div>
    );
  }

  // Mobile Bottom Sheet
  return (
    <>
      {/* Semi-transparent Backdrop */}
      <div
        className={`fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-Up Sheet */}
      <div
        className={`fixed left-0 right-0 bottom-0 z-[110] bg-white dark:bg-zinc-900 rounded-t-[2.5rem] shadow-2xl border-t border-zinc-200 dark:border-zinc-800 max-h-[88dvh] p-6 pb-24 transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Pull Indicator Pill */}
        <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto -mt-2 mb-4 shrink-0" />
        <div className="flex-1 overflow-hidden">{content}</div>
      </div>
    </>
  );
}
