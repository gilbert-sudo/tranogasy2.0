'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart,
  MapPin,
  Phone,
  Share2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Compass,
  MessageCircle
} from 'lucide-react';
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

import { FeedProperty } from './types';
import { useFavorite } from '@/hooks/useFavorite';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';

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

interface TikTokCardProps {
  property: FeedProperty;
  isActive: boolean;
  isDesktop?: boolean;
  onOpenDetails: () => void;
  onOpenMap: () => void;
  onOpenContact: () => void;
  onShare: () => void;
  onOpenComments?: () => void;
}

export default function TikTokCard({
  property,
  isActive,
  isDesktop = false,
  onOpenDetails,
  onOpenMap,
  onOpenContact,
  onShare,
  onOpenComments,
}: TikTokCardProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const [isLikedAnimation, setIsLikedAnimation] = useState(false);
  const touchStartX = useRef<number>(0);

  const userStore = useUserStore((state) => state.user);
  const currentUser = userStore?.user || userStore;
  const openModal = useModalStore((state) => state.openModal);

  const { favorites, toggleFavorite } = useFavorite();
  const isFavorite = favorites[property._id] || false;

  const rawImages = property.images && property.images.length > 0 ? property.images : [];
  const images = rawImages.map((img) => (typeof img === 'string' ? img : img.src));

  const displayPrice = property.type === 'rent' ? property.rent : property.price;

  const activeFeatures = property.features
    ? Object.entries(property.features)
        .filter(([_, val]) => !!val)
        .map(([key]) => key)
        .slice(0, 8)
    : [];

  const avatar =
    property.owner?.role === 'admin'
      ? property.sources?.avatar || '/icon-logo.png'
      : property.owner?.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          property.owner?.username || 'Annonceur'
        )}&background=7cbd1e&color=fff`;

  const ownerName =
    property.owner?.role === 'admin'
      ? property.sources?.username || 'TranoGasy'
      : property.owner?.username || 'Utilisateur';

  const nextImage = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (imageIndex < images.length - 1) {
        setImageIndex((prev) => prev + 1);
      }
    },
    [imageIndex, images.length]
  );

  const prevImage = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (imageIndex > 0) {
        setImageIndex((prev) => prev - 1);
      }
    },
    [imageIndex]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        prevImage();
      } else {
        nextImage();
      }
    }
  };

  // Keyboard navigation for carousel images (ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevImage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextImage();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isActive, prevImage, nextImage]);

  const handleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      openModal('login');
      return;
    }

    // Play like sound
    try {
      const audio = new Audio('/sounds/Like Sound Effect.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch (err) {}

    setIsLikedAnimation(true);
    setTimeout(() => setIsLikedAnimation(false), 500);

    await toggleFavorite(property._id, currentUser._id);
  };

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Photo Viewport */}
      <div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden">
        {images.length > 0 ? (
          <>
            {/* Ambient Blurred Backdrop for soft letterbox fill */}
            <div
              className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-110 opacity-35 pointer-events-none transition-all duration-500"
              style={{ backgroundImage: `url(${images[imageIndex]})` }}
            />
            {/* Full Image: 100% visible overview, no cropping */}
            <img
              src={images[imageIndex]}
              alt={property.title}
              className="relative z-[1] w-full h-full object-contain drop-shadow-md transition-opacity duration-300"
              loading="lazy"
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-500 gap-2">
            <Compass className="w-12 h-12" />
            <p className="text-sm">Pas d&apos;image disponible</p>
          </div>
        )}
      </div>

      {/* Top Gradient Overlay */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none z-10" />

      {/* Bottom Gradient Overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none z-10" />

      {/* Top Header Badges */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <span
          className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider text-white shadow-md ${
            property.type === 'rent' ? 'bg-brand-green' : 'bg-brand-red'
          }`}
        >
          {property.type === 'rent' ? 'Location' : 'Vente'}
        </span>
        {property.propertyNumber && (
          <span className="px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold">
            #{property.propertyNumber}
          </span>
        )}
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {images.length > 1 && (
          <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white text-xs font-semibold">
            {imageIndex + 1}/{images.length}
          </span>
        )}
        <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/90 text-xs font-medium">
          {formatDateAgo(property.created_at)}
        </span>
      </div>

      {/* Horizontal Thumbnail Gallery at Top (Classic Tranogasy Feed feature!) */}
      {images.length > 1 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 max-w-[92%] flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/50 backdrop-blur-md border border-white/10 overflow-x-auto no-scrollbar">
          {images.map((src, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setImageIndex(idx);
              }}
              className={`relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                imageIndex === idx
                  ? 'border-white scale-105 shadow-md opacity-100'
                  : 'border-white/30 opacity-90 hover:opacity-100'
              }`}
            >
              <img src={src} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}



      {/* RIGHT ACTION COLUMN (True TikTok / Reels Style - Pure Icon-Oriented, No Background) */}
      <div className="absolute bottom-20 md:bottom-24 right-2.5 md:right-3.5 z-20 flex flex-col items-center gap-4.5">
        {/* Advertiser Avatar with Plus Badge */}
        <div className="relative group cursor-pointer mb-1" onClick={onOpenContact}>
          <div className="w-11 h-11 md:w-12 md:h-12 rounded-full overflow-hidden border-2 border-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] bg-zinc-900 transition-transform group-hover:scale-105">
            <img src={avatar} alt={ownerName} className="w-full h-full object-cover" />
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-full bg-[#FF2D55] text-white flex items-center justify-center shadow-md border border-white">
            <Plus className="w-3 h-3 stroke-[3]" />
          </div>
        </div>

        {/* Favorite (Like) Button */}
        <button
          onClick={handleLikeClick}
          className="flex flex-col items-center gap-1 group cursor-pointer bg-transparent border-none p-0 focus:outline-none transition-transform hover:scale-110 active:scale-90"
          title="Ajouter aux favoris"
        >
          <Heart
            className={`w-7 h-7 md:w-8 md:h-8 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] transition-colors duration-300 ${
              isLikedAnimation ? 'animate-heart-pop' : ''
            } ${
              isFavorite
                ? 'fill-[#FF2D55] text-[#FF2D55]'
                : 'text-white stroke-[2.2] fill-transparent'
            }`}
          />
          <span className="text-[11px] font-semibold text-white tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {isFavorite ? 'Aimé' : "J'aime"}
          </span>
        </button>

        {/* Comment Button */}
        {onOpenComments && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments();
            }}
            className="flex flex-col items-center gap-1 group cursor-pointer bg-transparent border-none p-0 focus:outline-none transition-transform hover:scale-110 active:scale-90"
            title="Commentaires et questions"
          >
            <MessageCircle className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] stroke-[2.2]" />
            <span className="text-[11px] font-semibold text-white tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              Avis
            </span>
          </button>
        )}

        {/* Map Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenMap();
          }}
          className="flex flex-col items-center gap-1 group cursor-pointer bg-transparent border-none p-0 focus:outline-none transition-transform hover:scale-110 active:scale-90"
          title="Voir la carte"
        >
          <MapPin className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] stroke-[2.2]" />
          <span className="text-[11px] font-semibold text-white tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            Plan
          </span>
        </button>

        {/* Contact Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenContact();
          }}
          className="flex flex-col items-center gap-1 group cursor-pointer bg-transparent border-none p-0 focus:outline-none transition-transform hover:scale-110 active:scale-90"
          title="Contacter l'annonceur"
        >
          <Phone className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] stroke-[2.2]" />
          <span className="text-[11px] font-semibold text-white tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            Contact
          </span>
        </button>

        {/* Share Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          className="flex flex-col items-center gap-1 group cursor-pointer bg-transparent border-none p-0 focus:outline-none transition-transform hover:scale-110 active:scale-90"
          title="Partager"
        >
          <Share2 className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] stroke-[2.2]" />
          <span className="text-[11px] font-semibold text-white tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            Partager
          </span>
        </button>

        {/* Details Button (Icon-oriented, no background) */}
        {!isDesktop && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails();
            }}
            className="flex flex-col items-center gap-1 group cursor-pointer bg-transparent border-none p-0 focus:outline-none transition-transform hover:scale-110 active:scale-90"
            title="Détails du bien"
          >
            <Compass className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)] stroke-[2.2]" />
            <span className="text-[11px] font-semibold text-white tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              Détails
            </span>
          </button>
        )}
      </div>

      {/* BOTTOM SECTION: TikTok Carousel Pill (directly on image) + Property Details */}
      <div className="absolute bottom-6 md:bottom-8 left-0 right-0 z-20 pointer-events-none flex flex-col items-center">
        {/* TikTok Carousel Controls: directly on the image, right above property info */}
        {images.length > 1 && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mb-3 pointer-events-auto flex items-center gap-1.5 select-none"
          >
            {/* Left Arrow Button (Separated Circular Background) */}
            <button
              onClick={prevImage}
              disabled={imageIndex === 0}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md backdrop-blur-md border ${
                imageIndex === 0
                  ? 'bg-black/20 border-white/5 text-white/20 cursor-not-allowed'
                  : 'bg-black/40 hover:bg-black/70 border-white/15 text-white hover:scale-105 active:scale-95 cursor-pointer drop-shadow-md'
              }`}
              title="Image précédente (Flèche Gauche)"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            {/* Dots Indicator (Separated Ultra-Thin Pill Background) */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/15 shadow-md max-w-[140px] overflow-x-auto no-scrollbar">
              {images.map((_, idx) => {
                const isActiveDot = imageIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      setImageIndex(idx);
                    }}
                    className={`rounded-full transition-all duration-300 cursor-pointer ${
                      isActiveDot
                        ? 'w-1.5 h-1.5 bg-white scale-125 shadow-[0_0_4px_rgba(255,255,255,0.9)]'
                        : 'w-1 h-1 bg-white/45 hover:bg-white/80'
                    }`}
                    title={`Aller à l'image ${idx + 1}`}
                  />
                );
              })}
            </div>

            {/* Right Arrow Button (Separated Circular Background) */}
            <button
              onClick={nextImage}
              disabled={imageIndex === images.length - 1}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-md backdrop-blur-md border ${
                imageIndex === images.length - 1
                  ? 'bg-black/20 border-white/5 text-white/20 cursor-not-allowed'
                  : 'bg-black/40 hover:bg-black/70 border-white/15 text-white hover:scale-105 active:scale-95 cursor-pointer drop-shadow-md'
              }`}
              title="Image suivante (Flèche Droite)"
            >
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}

        {/* BOTTOM LEFT PROPERTY INFO OVERLAY */}
        <div className="w-full px-4 pr-20 text-white space-y-2 pointer-events-auto">
          {/* Advertiser handle */}
          <p
            className="text-sm font-black text-white hover:underline cursor-pointer flex items-center gap-1 w-max"
            onClick={onOpenContact}
          >
            @{ownerName}
          </p>

          {/* Title */}
          <h3
            className="text-base md:text-lg font-bold text-white line-clamp-2 leading-tight cursor-pointer hover:text-brand-green transition-colors"
            onClick={onOpenDetails}
          >
            {property.title}
          </h3>

          {/* Location line */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-200 capitalize">
            <MapPin className="w-3.5 h-3.5 text-brand-red shrink-0" />
            <span className="truncate">
              {property.city?.fokontany}, {property.city?.commune}
            </span>
          </div>

          {/* Feature Icons line */}
          {activeFeatures.length > 0 && (
            <div className="flex items-center gap-2 overflow-hidden text-zinc-300 py-0.5">
              {activeFeatures.map((key) => {
                const Icon = FEATURE_ICONS[key];
                if (!Icon) return null;
                return <Icon key={key} className="w-4 h-4 shrink-0 text-white/90" />;
              })}
            </div>
          )}

          {/* Price & Description Snippet */}
          <div className="flex items-center gap-2 pt-0.5">
            <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-brand-green text-sm font-black shadow-sm">
              {displayPrice ? `${displayPrice.toLocaleString('fr-FR')} Ar` : 'Sur dmd'}
              {property.type === 'rent' && <span className="text-[10px] text-zinc-300"> / mois</span>}
            </span>

            <button
              onClick={onOpenDetails}
              className="text-xs text-white/80 hover:text-white underline cursor-pointer"
            >
              voir plus...
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
