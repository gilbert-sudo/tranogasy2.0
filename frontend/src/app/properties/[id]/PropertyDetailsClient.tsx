'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { X, Share2, Phone, MapPin, Heart, ChevronLeft, BedDouble, Expand, Home, Utensils, Droplets, Grid2X2, ChevronRight, MessageCircle, Send } from 'lucide-react';
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
import { useUserStore } from '@/store/userStore';
import { useProperty } from '@/hooks/useProperty';
import { useFavorite } from '@/hooks/useFavorite';

// Dynamically code-split Google Maps and interactive drawers
const PropertyLocationDisplayer = dynamic(
  () => import('@/components/map/PropertyLocationDisplayer'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[300px] bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-2xl flex items-center justify-center text-zinc-400 text-xs font-semibold">
        Chargement de la carte...
      </div>
    ),
  }
);

const TikTokCommentsDrawer = dynamic(
  () => import('@/components/feed/TikTokCommentsDrawer'),
  { ssr: false }
);

const TikTokContactModal = dynamic(
  () => import('@/components/feed/TikTokContactModal'),
  { ssr: false }
);

const FEATURE_ICONS: Record<string, { icon: React.ElementType, label: string }> = {
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
  guardianHouse: { icon: FaShieldAlt, label: "Maison pour gardien" },
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
  securitySystem: { icon: FaShieldAlt, label: "Système de sécurité" },
  wifiAvailability: { icon: FaWifi, label: "Wi-Fi" },
  fiberOpticReady: { icon: MdOutlineFiberSmartRecord, label: "Pré-fibrée" },
  seaView: { icon: GiSeaDragon, label: "Vue mer" },
  mountainView: { icon: GiMountainCave, label: "Vue montagne" },
  panoramicView: { icon: GiSeatedMouse, label: "Vue panoramique" },
};

function formatDateAgo(dateString?: string) {
  if (!dateString) return 'Nouveau';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  const diffInMonths = Math.floor(diffInSeconds / (3600 * 24 * 30));
  if (diffInMonths > 0) return `il y a ${diffInMonths} mois`;
  const diffInDays = Math.floor(diffInSeconds / (3600 * 24));
  if (diffInDays > 0) return `il y a ${diffInDays} jours`;
  return "Récent";
}

function PropertyDetailsContent({ property }: { property: any }) {
  const router = useRouter();
  const [showContact, setShowContact] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentMobileImageIndex, setCurrentMobileImageIndex] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const lightboxRef = useRef<HTMLDivElement | null>(null);

  const userStore = useUserStore(state => state.user);
  const currentUser = userStore?.user || userStore;
  const { favorites, checkFavorite, toggleFavorite } = useFavorite();
  const isFavorite = favorites[property?._id] || false;

  useEffect(() => {
    if (currentUser && property?._id) {
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

  const images = property?.images && property.images.length > 0 
    ? property.images.map((img: any) => typeof img === 'string' ? img : img.src)
    : ['https://via.placeholder.com/1200x800?text=TranoGasy'];

  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
        if (lightboxRef.current) {
          lightboxRef.current.scrollBy({ left: -window.innerWidth, behavior: 'smooth' });
        }
      } else if (e.key === 'ArrowRight' && lightboxIndex < images.length - 1) {
        if (lightboxRef.current) {
          lightboxRef.current.scrollBy({ left: window.innerWidth, behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, images.length]);

  const displayPrice = property?.type === 'rent' ? property?.rent : property?.price;

  const formatCompactPrice = (val: number | string | undefined | null) => {
    if (!val) return 'Sur demande';
    const num = Number(val);
    if (isNaN(num)) return val;
    if (num >= 1_000_000) {
      const millions = num / 1_000_000;
      return `${millions % 1 === 0 ? millions : Number(millions.toFixed(1))}M`;
    }
    if (num >= 1_000) {
      const thousands = num / 1_000;
      return `${thousands % 1 === 0 ? thousands : Number(thousands.toFixed(1))}k`;
    }
    return num.toLocaleString('en-US');
  };

  const activeFeatures = property?.features 
    ? Object.entries(property.features).filter(([_, value]) => value).map(([key]) => key)
    : [];

  const position = property?.coords
    ? property.coords
    : property?.city?.coords
      ? property.city.coords
      : {
          lat: -18.905195365917766,
          lng: 47.52370521426201,
        };
  const useCircle = property?.coords ? false : true;

  const handleDirectMessage = () => {
    const phone = property?.phone1 || property?.phone2 || property?.phone3 || property?.owner?.phone;
    if (phone) {
      const cleanPhone = String(phone).replace(/\s+/g, '');
      const defaultText = encodeURIComponent(`Bonjour, je suis intéressé(e) par votre bien "${property?.title || 'TranoGasy'}" vu sur TranoGasy.`);
      window.location.href = `sms:${cleanPhone}?body=${defaultText}`;
    } else {
      setShowContact(true);
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: property?.title,
          text: property?.description,
          url: window.location.href,
        });
      } else {
        navigator.clipboard.writeText(window.location.href);
        alert('Lien copié dans le presse-papiers !');
      }
    } catch (error) {
      console.error('Erreur lors du partage:', error);
    }
  };

  const stats = [
    { value: property?.rooms || 0, label: "Chambres", icon: BedDouble },
    { value: property?.livingRoom || 0, label: "Salon", icon: Home },
    { value: property?.kitchen || 0, label: "Cuisine", icon: Utensils },
    { value: property?.bathrooms || 0, label: "Douches", icon: Droplets },
    { value: property?.toilet || 0, label: "W.C", icon: Grid2X2 },
    { value: property?.area ? `${property.area}` : 0, label: "Surface (m²)", icon: Expand },
  ];

  const handleMobileScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollPosition = e.currentTarget.scrollLeft;
    const width = e.currentTarget.clientWidth;
    const newIndex = Math.round(scrollPosition / width);
    setCurrentMobileImageIndex(newIndex);
  };

  const renderMobileGallery = () => (
    <div className="lg:hidden relative w-full h-[350px] sm:h-[450px] overflow-hidden mb-6 rounded-b-[2rem] shadow-sm">
      <div 
        className="flex overflow-x-auto snap-x snap-mandatory h-full w-full" 
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onScroll={handleMobileScroll}
      >
        {images.map((img: string, idx: number) => (
          <div key={idx} className="w-full flex-shrink-0 h-full relative snap-center" onClick={() => setLightboxIndex(idx)}>
            <Image 
              src={img} 
              fill 
              sizes="100vw"
              className="object-cover" 
              alt={`Photo ${idx+1}`} 
              priority={idx === 0} 
              loading={idx === 0 ? 'eager' : 'lazy'}
            />
          </div>
        ))}
      </div>
      
      {/* Mobile Top Actions */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none lg:hidden bg-gradient-to-b from-black/50 via-black/15 to-transparent pt-4 pb-10 px-4 flex justify-between items-start">
        <button 
          onClick={() => router.back()} 
          aria-label="Retour"
          className="pointer-events-auto h-10 w-10 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl flex items-center justify-center text-zinc-900 dark:text-zinc-100 shadow-sm border border-white/60 dark:border-white/10 hover:scale-105 active:scale-90 transition-all cursor-pointer"
        >
          <ChevronLeft className="h-6 w-6 pr-0.5" />
        </button>
        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={handleShare} 
            aria-label="Partager"
            className="h-10 w-10 cursor-pointer rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl flex items-center justify-center text-zinc-900 dark:text-zinc-100 shadow-sm border border-white/60 dark:border-white/10 hover:scale-105 active:scale-90 transition-all"
          >
            <Share2 className="h-4 w-4" />
          </button>
          <button 
            onClick={handleFavoriteClick} 
            aria-label="Ajouter aux favoris"
            className={`h-10 w-10 cursor-pointer rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl flex items-center justify-center shadow-sm border border-white/60 dark:border-white/10 hover:scale-105 active:scale-90 transition-all ${isFavorite ? 'text-brand-red' : 'text-zinc-700 dark:text-zinc-200'}`}
          >
            <Heart className={`h-5 w-5 transition-transform duration-300 ${isFavorite ? 'fill-brand-red scale-110 drop-shadow-[0_2px_6px_rgba(236,28,36,0.5)]' : ''}`} />
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2 pointer-events-none">
        {images.length > 0 && (
          <div className="bg-black/60 backdrop-blur-md text-white h-7 w-7 rounded-full flex items-center justify-center shadow-sm border border-white/10">
            <Expand className="h-3.5 w-3.5" />
          </div>
        )}

        {images.length > 1 && (
          <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-xs font-bold tracking-widest shadow-sm border border-white/10">
            {currentMobileImageIndex + 1} / {images.length}
          </div>
        )}
      </div>
    </div>
  );

  const renderDesktopGallery = () => {
    if (!images || images.length === 0) return null;

    if (images.length === 1) {
      return (
        <div 
          className="hidden lg:block w-full min-w-[340px] xl:min-w-[420px] min-h-[360px] xl:min-h-[420px] max-h-[80vh] aspect-[16/10] relative rounded-2xl lg:rounded-3xl overflow-hidden cursor-pointer group shadow-xs mb-6" 
          onClick={() => setLightboxIndex(0)}
        >
          <Image 
            src={images[0]} 
            fill 
            sizes="(max-width: 1280px) 50vw, 600px"
            className="object-cover group-hover:scale-105 transition-transform duration-700" 
            alt="Principale" 
            priority 
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
        </div>
      );
    }

    const rows = [];
    let i = 0;
    let rowIndex = 0;

    // Build alternating rows: 2 items, 3 items, 2 items, etc. (max 7 items for preview)
    while (i < images.length && i < 7) {
      const isEvenRow = rowIndex % 2 === 0;
      const itemsInRow = isEvenRow ? 2 : 3;
      const rowImages = images.slice(i, i + itemsInRow);
      
      if (rowImages.length === 1) {
        rows.push(
          <div key={`row-${rowIndex}`} className="flex gap-[3px] w-full flex-1 min-h-[160px] max-h-[38vh]">
            <div className="flex-1 relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(i)}>
              <Image 
                src={rowImages[0]} 
                fill 
                sizes="(max-width: 1280px) 50vw, 600px"
                className="object-cover group-hover:scale-105 transition-transform duration-700" 
                alt={`Photo ${i + 1}`} 
                priority={i === 0}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
            </div>
          </div>
        );
      } else if (rowImages.length === 2) {
        // Dynamic proportion: 40% / 60% split
        rows.push(
          <div key={`row-${rowIndex}`} className="flex gap-[3px] w-full flex-[1.2] min-h-[170px] max-h-[40vh]">
            <div className="flex-[4] relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(i)}>
              <Image 
                src={rowImages[0]} 
                fill 
                sizes="(max-width: 1280px) 25vw, 300px"
                className="object-cover group-hover:scale-105 transition-transform duration-700" 
                alt={`Photo ${i + 1}`} 
                priority={i === 0}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
            </div>
            <div className="flex-[6] relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(i + 1)}>
              <Image 
                src={rowImages[1]} 
                fill 
                sizes="(max-width: 1280px) 30vw, 360px"
                className="object-cover group-hover:scale-105 transition-transform duration-700" 
                alt={`Photo ${i + 2}`} 
                priority={i === 0}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
              {i + 1 === 6 && images.length > 7 && (
                <div className="absolute inset-0 bg-black/50 hover:bg-black/60 transition-colors flex flex-col items-center justify-center text-white text-center backdrop-blur-[2px]">
                  <Grid2X2 className="h-6 w-6 mb-1.5" />
                  <span className="font-bold text-xs sm:text-sm tracking-wide">+{images.length - 7} photos</span>
                </div>
              )}
            </div>
          </div>
        );
      } else if (rowImages.length === 3) {
        // Dynamic 3-item row: equal 1/3 split
        rows.push(
          <div key={`row-${rowIndex}`} className="flex gap-[3px] w-full flex-1 min-h-[130px] max-h-[32vh]">
            {rowImages.map((img: string, idx: number) => {
              const globalIdx = i + idx;
              const isLast = globalIdx === 6 && images.length > 7;
              return (
                <div key={globalIdx} className="flex-1 relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(globalIdx)}>
                  <Image 
                    src={img} 
                    fill 
                    sizes="(max-width: 1280px) 18vw, 220px"
                    className="object-cover group-hover:scale-105 transition-transform duration-700" 
                    alt={`Photo ${globalIdx + 1}`} 
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
                  {isLast && (
                    <div className="absolute inset-0 bg-black/50 hover:bg-black/60 transition-colors flex flex-col items-center justify-center text-white text-center backdrop-blur-[2px]">
                      <Grid2X2 className="h-6 w-6 mb-1.5" />
                      <span className="font-bold text-xs sm:text-sm tracking-wide">+{images.length - 7} photos</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      
      i += itemsInRow;
      rowIndex++;
    }

    return (
      <div className="hidden lg:flex flex-col gap-[3px] w-full min-w-[340px] xl:min-w-[420px] min-h-[360px] xl:min-h-[420px] max-h-[80vh] rounded-2xl lg:rounded-3xl overflow-hidden shadow-xs border border-zinc-200/60 dark:border-white/10">
        {rows}
      </div>
    );
  };

  const renderIdentityAndStats = (isMobile: boolean) => (
    <div className={isMobile ? "lg:hidden px-4" : "hidden lg:block"}>
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest shadow-sm ${
          property.type === 'rent'
            ? 'bg-brand-green text-white'
            : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
        }`}>
          {property.type === 'rent' ? 'En location' : 'En vente'}
        </span>
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          Réf: {property.propertyNumber || property._id.slice(-4).toUpperCase()}
        </span>
      </div>
      
      <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-zinc-900 dark:text-white leading-tight mb-2.5 lg:mb-3 tracking-tight">
        {property.title}
      </h1>
      
      <div className="flex items-start gap-2 text-zinc-600 dark:text-zinc-300 mb-5 lg:mb-6">
        <MapPin className="h-4.5 w-4.5 text-brand-green shrink-0 mt-0.5" />
        <span className="font-semibold text-sm sm:text-base">
          {property.city?.fokontany} {property.city?.commune} {property.city?.district}
        </span>
      </div>

      <div className="mb-5 lg:mb-6">
        <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1">
          {property.type === 'rent' ? 'Loyer Mensuel' : 'Prix de Vente'}
        </div>
        <div className="flex items-baseline gap-1 text-brand-green">
          <span className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight">
            {displayPrice ? displayPrice.toLocaleString('en-US') : 'Sur demande'}
          </span>
          {displayPrice && (
            <span className="text-xs sm:text-sm lg:text-base font-bold ml-1">
              AR{property.type === 'rent' ? '/mois' : ''}
            </span>
          )}
        </div>
      </div>

      {/* COMPACT STATS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-2.5 mb-6 lg:mb-8">
        {stats.map((stat, idx) => (stat.value && stat.value !== '-' && stat.value !== 0) ? (
          <div key={idx} className="flex items-center gap-2.5 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-2.5 sm:p-3 border border-zinc-100/80 dark:border-zinc-700/50 hover:border-zinc-200 dark:hover:border-zinc-600 transition-colors shadow-2xs">
            <div className="h-8 w-8 rounded-full bg-white dark:bg-zinc-800 shadow-2xs flex items-center justify-center shrink-0 border border-black/[0.04] dark:border-white/5">
               <stat.icon className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-black text-zinc-900 dark:text-white text-base leading-none truncate">{stat.value}</span>
              <span className="text-[9px] sm:text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mt-1 truncate">{stat.label}</span>
            </div>
          </div>
        ) : null)}
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-950">
      {/* ── Subtle Blue Liquid Glass Background (Capped at 30% intensity) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0">
        {/* Soft base liquid gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50/30 via-zinc-50/20 to-white dark:from-[#090d16]/30 dark:via-[#0c1322]/20 dark:to-zinc-950" />

        {/* Ambient liquid glass glow orbs (subtle & diffused) */}
        <div className="absolute -top-24 -left-20 w-[480px] h-[480px] rounded-full bg-sky-200/25 dark:bg-sky-900/15 blur-3xl" />
        <div className="absolute top-28 right-0 w-[420px] h-[420px] rounded-full bg-emerald-200/20 dark:bg-emerald-900/10 blur-3xl" />
        <div className="absolute top-[420px] left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-100/20 dark:bg-indigo-950/15 blur-3xl" />
      </div>

      {/* MOBILE GALLERY */}
      {renderMobileGallery()}

      <div className="relative z-10 max-w-[1680px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-20 lg:py-4 pb-0 lg:pb-6">
        
        {/* DESKTOP NAVIGATION (STICKY ON SCROLL) */}
        <div className="hidden lg:flex items-center justify-between mb-4 lg:mb-5 sticky top-5 z-50 pointer-events-none">
          <button 
            onClick={() => router.back()} 
            className="pointer-events-auto flex items-center gap-2.5 text-zinc-800 dark:text-zinc-100 hover:text-zinc-950 dark:hover:text-white font-bold text-sm transition-all bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl hover:bg-white dark:hover:bg-zinc-800 px-5 py-3 rounded-full border border-zinc-200/90 dark:border-white/15 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
            Retour
          </button>

          <div className="pointer-events-auto flex items-center gap-3">
            <button 
              onClick={handleShare} 
              aria-label="Partager"
              className="h-12 w-12 cursor-pointer rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex items-center justify-center text-zinc-800 dark:text-zinc-100 hover:text-zinc-950 dark:hover:text-white hover:bg-white dark:hover:bg-zinc-800 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] border border-zinc-200/90 dark:border-white/15 hover:scale-105 active:scale-90 transition-all"
            >
              <Share2 className="h-4.5 w-4.5" />
            </button>
            <button 
              onClick={handleFavoriteClick} 
              aria-label="Ajouter aux favoris"
              className={`h-12 w-12 cursor-pointer rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex items-center justify-center shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.6)] border border-zinc-200/90 dark:border-white/15 hover:scale-105 active:scale-90 transition-all ${isFavorite ? 'text-brand-red' : 'text-zinc-800 dark:text-zinc-100 hover:text-brand-red'}`}
            >
              <Heart className={`h-5 w-5 transition-transform duration-300 ${isFavorite ? 'fill-brand-red scale-110 drop-shadow-[0_2px_8px_rgba(236,28,36,0.45)]' : ''}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 lg:gap-8 xl:gap-10">
          
          {/* LEFT COLUMN: Gallery, Description, Features, Map */}
          <div className="w-full lg:w-[55%] xl:w-[65%]">
            
            {/* Mobile Identity */}
            {renderIdentityAndStats(true)}

            {/* Desktop Gallery */}
            {renderDesktopGallery()}

            {/* CONTENT UNDER GALLERY */}
            <div className="px-4 lg:px-0 mt-6 lg:mt-8 space-y-6 lg:space-y-8">
              
              {/* Features */}
              {activeFeatures.length > 0 && (
                <div className="scroll-mt-24">
                  <h3 className="text-lg lg:text-xl font-bold text-zinc-900 dark:text-white mb-3 lg:mb-4 flex items-center gap-3">
                     Équipements et atouts
                     <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                  </h3>
                  <div className="flex flex-wrap gap-2 lg:gap-2.5">
                    {activeFeatures.map(key => {
                       const feature = FEATURE_ICONS[key];
                       if (!feature) return null;
                       const Icon = feature.icon;
                       return (
                        <div key={key} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:-translate-y-0.5 transition-all cursor-default">
                          <Icon className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" />
                          <span className="text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-200">{feature.label}</span>
                        </div>
                       )
                    })}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="scroll-mt-24">
                <h3 className="text-lg lg:text-xl font-bold text-zinc-900 dark:text-white mb-3 lg:mb-4 flex items-center gap-3">
                   À propos de ce bien
                   <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                </h3>
                <div className={`text-zinc-600 dark:text-zinc-300 text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-medium ${!isDescriptionExpanded ? 'line-clamp-6 md:line-clamp-none' : ''}`}>
                  {property.description}
                </div>
                {property.description && property.description.length > 300 && (
                  <button 
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="mt-3 font-bold text-brand-green hover:text-green-700 text-xs sm:text-sm flex items-center gap-1 md:hidden"
                  >
                    {isDescriptionExpanded ? 'Voir moins' : 'Lire la suite'}
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isDescriptionExpanded ? '-rotate-90' : 'rotate-90'}`} />
                  </button>
                )}
              </div>

              {/* Location */}
              <div className="scroll-mt-24">
                 <h3 className="text-lg lg:text-xl font-bold text-zinc-900 dark:text-white mb-3 lg:mb-4 flex items-center gap-3">
                   Localisation
                   <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                 </h3>
                 <div className="h-[220px] lg:h-[280px] rounded-2xl lg:rounded-3xl overflow-hidden border border-zinc-100 dark:border-zinc-700 shadow-inner relative z-0">
                   <PropertyLocationDisplayer position={position} circle={useCircle} />
                 </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Desktop Identity & Sticky Contact Card */}
          <div className="w-full lg:w-[45%] xl:w-[35%] shrink-0 px-4 lg:px-0">
            <div className="lg:sticky lg:top-20 space-y-4 lg:space-y-5">
              
              {/* Desktop Identity */}
              {renderIdentityAndStats(false)}

              {/* Contact Action Area */}
              <div className="bg-white dark:bg-zinc-800 rounded-2xl lg:rounded-3xl border border-zinc-100 dark:border-zinc-700 p-4 sm:p-5 lg:p-6 shadow-xl shadow-black/[0.03] relative overflow-hidden">
                 {/* Subtle background accent */}
                 <div className="absolute top-0 right-0 w-28 h-28 bg-brand-green/5 rounded-bl-full pointer-events-none"></div>
                 
                 <div className="flex items-center gap-3.5 mb-5 relative z-10 bg-zinc-50/70 dark:bg-zinc-700/50 p-3 sm:p-3.5 rounded-xl border border-zinc-100/60 dark:border-zinc-600/50">
                   <div className="h-11 w-11 rounded-full overflow-hidden bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 shrink-0 shadow-2xs relative">
                      <Image 
                        src={
                          property.owner?.role === "admin"
                            ? (property.sources?.avatar || "/icon-logo.png")
                            : (property.owner?.avatar || "https://ui-avatars.com/api/?name=User&background=random")
                        }
                        alt="Avatar" 
                        fill
                        sizes="44px"
                        className="object-cover" 
                      />
                   </div>
                   <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Annonceur</span>
                      <span className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base truncate">
                        {property.owner?.role === "admin" ? (property.sources?.username || "TranoGasy") : (property.owner?.username || "Utilisateur")}
                      </span>
                      <span className="text-xs text-brand-green font-semibold mt-0.5">Annonce {formatDateAgo(property.created_at)}</span>
                   </div>
                 </div>

                 <div className="hidden lg:flex items-center gap-2 relative z-10">
                   <button 
                     type="button"
                     onClick={() => setShowContact(true)}
                     className="h-10 px-3.5 pr-4 rounded-full flex items-center gap-2 flex-1 justify-center transition-all active:scale-95 cursor-pointer bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
                   >
                     <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white">
                       <Phone className="h-3.5 w-3.5" />
                     </div>
                     <span className="text-xs sm:text-sm tracking-tight font-bold whitespace-nowrap">
                       Voir le contact
                     </span>
                   </button>
                   <button 
                     type="button"
                     onClick={handleDirectMessage}
                     aria-label="Contacter par message direct"
                     className="h-10 w-10 shrink-0 rounded-full bg-white/75 dark:bg-zinc-800/75 backdrop-blur-xl text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/10 flex items-center justify-center hover:border-brand-green hover:text-brand-green active:scale-95 transition-all shadow-2xs cursor-pointer"
                   >
                      <Send className="h-4 w-4 pr-0.5 pt-0.5" />
                   </button>
                   <button 
                     type="button"
                     onClick={() => setShowComments(true)}
                     aria-label="Commentaires"
                     className="h-10 w-10 shrink-0 rounded-full bg-white/75 dark:bg-zinc-800/75 backdrop-blur-xl text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/10 flex items-center justify-center hover:border-brand-green hover:text-brand-green active:scale-95 transition-all shadow-2xs cursor-pointer"
                   >
                      <MessageCircle className="h-4 w-4" />
                   </button>
                 </div>
                 
                 <div className="hidden lg:flex items-center justify-center gap-1.5 text-[11px] font-semibold text-zinc-400 mt-4">
                   <FaShieldAlt className="h-3 w-3 text-brand-green" />
                   <span>Contact sécurisé via TranoGasy</span>
                 </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      {/* MOBILE FIXED BOTTOM BAR */}
      <div 
        className="lg:hidden fixed left-0 right-0 bottom-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-200/80 dark:border-white/10 px-4 py-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)] flex items-center justify-between gap-3"
      >
        {/* Left: Price Section */}
        <div className="flex flex-col min-w-0 pr-1">
          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider leading-none mb-1">
            {property.type === 'rent' ? 'Loyer Mensuel' : 'Prix de vente'}
          </span>
          <div className="flex items-baseline gap-1 text-zinc-950 dark:text-white">
            <span className="text-xl sm:text-2xl font-black tracking-tight">
              {formatCompactPrice(displayPrice)}
            </span>
            {displayPrice && (
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-400">
                AR{property.type === 'rent' ? '/mois' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Right: Action Buttons Group (Message, Comment, Call) */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Message / SMS */}
          <button 
            type="button"
            onClick={handleDirectMessage}
            aria-label="Envoyer un message"
            className="h-13 w-13 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/10 active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            <Send className="h-5 w-5 pr-0.5 pt-0.5" />
          </button>

          {/* Comment Drawer Button */}
          <button 
            type="button"
            onClick={() => setShowComments(true)}
            aria-label="Commentaires"
            className="h-13 w-13 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 border border-zinc-200/80 dark:border-white/10 active:scale-95 transition-all cursor-pointer shadow-xs"
          >
            <MessageCircle className="h-5 w-5" />
          </button>

          {/* Contact / Call Button */}
          <button 
            type="button"
            onClick={() => setShowContact(true)}
            className="h-13 pl-3.5 pr-5.5 rounded-full flex items-center gap-2.5 shrink-0 transition-all active:scale-95 cursor-pointer bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-[0_4px_16px_rgba(0,0,0,0.18)]"
          >
            <div className="h-8.5 w-8.5 rounded-full flex items-center justify-center shrink-0 transition-colors bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white">
              <Phone className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight whitespace-nowrap">
              Contact
            </span>
          </button>
        </div>
      </div>

      {/* COMMENTS DRAWER */}
      <TikTokCommentsDrawer
        property={property}
        isOpen={showComments}
        onClose={() => setShowComments(false)}
      />

      {/* CONTACT MODAL */}
      {showContact && (
        <TikTokContactModal
          property={property}
          onClose={() => setShowContact(false)}
        />
      )}

      {/* LIGHTBOX VIEWER */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-xl transition-all duration-300"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-6 right-6 z-20 h-12 w-12 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors border border-white/20"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-6 w-6" />
          </button>

          {/* Prev arrow */}
          {lightboxIndex > 0 && (
            <button
              className="hidden md:flex absolute left-8 z-20 h-14 w-14 rounded-full bg-white/10 items-center justify-center text-white hover:bg-white/20 hover:scale-110 transition-all border border-white/20"
              onClick={(e) => { 
                e.stopPropagation(); 
                if (lightboxRef.current) {
                  lightboxRef.current.scrollBy({ left: -window.innerWidth, behavior: 'smooth' });
                }
              }}
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          )}

          {/* Next arrow */}
          {lightboxIndex < images.length - 1 && (
            <button
              className="hidden md:flex absolute right-8 z-20 h-14 w-14 rounded-full bg-white/10 items-center justify-center text-white hover:bg-white/20 hover:scale-110 transition-all border border-white/20"
              onClick={(e) => { 
                e.stopPropagation(); 
                if (lightboxRef.current) {
                  lightboxRef.current.scrollBy({ left: window.innerWidth, behavior: 'smooth' });
                }
              }}
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          )}

          {/* Image Container with Scroll Snap */}
          <div
            ref={(el) => {
              if (el && !el.dataset.initialized) {
                el.scrollTo({ left: el.clientWidth * lightboxIndex, behavior: 'instant' });
                el.dataset.initialized = 'true';
              }
              lightboxRef.current = el;
            }}
            className="w-full h-full flex overflow-x-auto snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onClick={(e) => e.stopPropagation()}
            onScroll={(e) => {
               const target = e.currentTarget;
               const index = Math.round(target.scrollLeft / target.clientWidth);
               if (index !== lightboxIndex) {
                 setLightboxIndex(index);
               }
            }}
          >
            {images.map((src: string, idx: number) => {
              const isNearby = Math.abs(idx - (lightboxIndex || 0)) <= 1;
              return (
                <div key={idx} className="min-w-full h-full flex items-center justify-center snap-center snap-always relative px-4 md:px-24">
                  <div className="relative w-full max-w-6xl h-[85vh]">
                    <Image
                      src={src}
                      alt={`Photo ${idx + 1}`}
                      fill
                      sizes="(max-width: 1280px) 90vw, 1152px"
                      className={`object-contain transition-transform duration-700 ${idx === lightboxIndex ? 'scale-100 opacity-100' : 'scale-95 opacity-50'}`}
                      priority={isNearby}
                      loading={isNearby ? 'eager' : 'lazy'}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Counter */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white px-5 py-2.5 rounded-full bg-white/10 border border-white/20 text-sm font-bold tracking-widest backdrop-blur-md z-20">
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}

    </div>
  );
}

export default function PropertyDetailsClient({ propertyId }: { propertyId: string }) {
  const { property, isLoading, error } = useProperty(propertyId);
  const router = useRouter();

  if (isLoading) {
    return <div className="min-h-screen bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-900 dark:text-white font-bold">Chargement...</div>;
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900 flex flex-col items-center justify-center text-zinc-900 dark:text-white font-bold gap-4">
        {error || 'Propriété introuvable.'}
        <button onClick={() => router.back()} className="px-5 py-2.5 bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold rounded-full text-sm shadow-sm hover:scale-105 active:scale-95 transition-all">Retour</button>
      </div>
    );
  }

  return <PropertyDetailsContent property={property} />;
}

