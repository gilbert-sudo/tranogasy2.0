'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { X, Share2, Phone, MapPin, Heart, ChevronLeft, BedDouble, Expand, Home, Utensils, Droplets, Grid2X2, ChevronRight } from 'lucide-react';
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

export default function PropertyDetailsClient({ property }: { property: any }) {
  const router = useRouter();
  const [showContact, setShowContact] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [currentMobileImageIndex, setCurrentMobileImageIndex] = useState(0);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const lightboxRef = useRef<HTMLDivElement | null>(null);

  const images = property.images && property.images.length > 0 
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

  const displayPrice = property.type === 'rent' ? property.rent : property.price;

  const activeFeatures = property.features 
    ? Object.entries(property.features).filter(([_, value]) => value).map(([key]) => key)
    : [];

  const position = property.coords
    ? property.coords
    : property.city?.coords
      ? property.city.coords
      : {
          lat: -18.905195365917766,
          lng: 47.52370521426201,
        };
  const useCircle = property.coords ? false : true;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: property.title,
          text: property.description,
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
    { value: property.rooms || 0, label: "Chambres", icon: BedDouble },
    { value: property.livingRoom || 0, label: "Salon", icon: Home },
    { value: property.kitchen || 0, label: "Cuisine", icon: Utensils },
    { value: property.bathrooms || 0, label: "Douches", icon: Droplets },
    { value: property.toilet || 0, label: "W.C", icon: Grid2X2 },
    { value: property.area ? `${property.area}` : 0, label: "Surface (m²)", icon: Expand },
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
            <Image src={img} fill className="object-cover" alt={`Photo ${idx+1}`} priority={idx === 0} />
          </div>
        ))}
      </div>
      
      {/* Mobile Top Actions */}
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none lg:hidden bg-gradient-to-b from-black/40 via-black/10 to-transparent pt-4 pb-10 px-4 flex justify-between items-start">
        <button onClick={() => router.back()} className="pointer-events-auto h-10 w-10 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-zinc-900 dark:text-zinc-100 shadow-sm border border-black/5 dark:border-white/10 hover:scale-105 transition-transform">
          <ChevronLeft className="h-6 w-6 pr-0.5" />
        </button>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={handleShare} className="h-10 w-10 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-zinc-900 dark:text-zinc-100 shadow-sm border border-black/5 dark:border-white/10 hover:scale-105 transition-transform">
            <Share2 className="h-4 w-4" />
          </button>
          <button className="h-10 w-10 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-brand-red shadow-sm border border-black/5 dark:border-white/10 hover:scale-105 transition-transform">
            <Heart className="h-5 w-5" />
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
        <div className="hidden lg:block w-full h-[400px] xl:h-[500px] relative rounded-[2rem] overflow-hidden cursor-pointer group shadow-sm mb-6" onClick={() => setLightboxIndex(0)}>
          <Image src={images[0]} fill className="object-cover group-hover:scale-105 transition-transform duration-700" alt="Principale" priority />
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
          <div key={`row-${rowIndex}`} className="flex gap-[2px] h-[220px] xl:h-[260px] w-full">
            <div className="flex-1 relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(i)}>
              <Image src={rowImages[0]} fill className="object-cover group-hover:scale-105 transition-transform duration-700" alt={`Photo ${i + 1}`} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
            </div>
          </div>
        );
      } else if (rowImages.length === 2) {
        // Recreate the 40% / 60% split seen in the old app for 2-item rows
        rows.push(
          <div key={`row-${rowIndex}`} className="flex gap-[2px] h-[220px] xl:h-[260px] w-full">
            <div className="flex-[4] relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(i)}>
              <Image src={rowImages[0]} fill className="object-cover group-hover:scale-105 transition-transform duration-700" alt={`Photo ${i + 1}`} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
            </div>
            <div className="flex-[6] relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(i + 1)}>
              <Image src={rowImages[1]} fill className="object-cover group-hover:scale-105 transition-transform duration-700" alt={`Photo ${i + 2}`} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
              {i + 1 === 6 && images.length > 7 && (
                <div className="absolute inset-0 bg-black/50 hover:bg-black/60 transition-colors flex flex-col items-center justify-center text-white text-center backdrop-blur-[2px]">
                  <Grid2X2 className="h-7 w-7 mb-2" />
                  <span className="font-bold text-sm tracking-wide">+{images.length - 7} photos</span>
                </div>
              )}
            </div>
          </div>
        );
      } else if (rowImages.length === 3) {
        // Recreate the 33% / 33% / 33% split for 3-item rows
        rows.push(
          <div key={`row-${rowIndex}`} className="flex gap-[2px] h-[150px] xl:h-[180px] w-full">
            {rowImages.map((img: string, idx: number) => {
              const globalIdx = i + idx;
              const isLast = globalIdx === 6 && images.length > 7;
              return (
                <div key={globalIdx} className="flex-1 relative cursor-pointer group overflow-hidden" onClick={() => setLightboxIndex(globalIdx)}>
                  <Image src={img} fill className="object-cover group-hover:scale-105 transition-transform duration-700" alt={`Photo ${globalIdx + 1}`} />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500" />
                  {isLast && (
                    <div className="absolute inset-0 bg-black/50 hover:bg-black/60 transition-colors flex flex-col items-center justify-center text-white text-center backdrop-blur-[2px]">
                      <Grid2X2 className="h-7 w-7 mb-2" />
                      <span className="font-bold text-sm tracking-wide">+{images.length - 7} photos</span>
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
      <div className="hidden lg:flex flex-col gap-[2px] w-full rounded-[2rem] overflow-hidden shadow-sm">
        {rows}
      </div>
    );
  };

  const renderIdentityAndStats = (isMobile: boolean) => (
    <div className={isMobile ? "lg:hidden px-4" : "hidden lg:block"}>
      <div className="flex items-center gap-3 mb-4">
        <span className="px-3 py-1.5 bg-brand-green text-white rounded-full text-[10px] font-extrabold uppercase tracking-widest shadow-sm">
          {property.type === 'rent' ? 'En location' : 'En vente'}
        </span>
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
          Réf: {property.propertyNumber || property._id.slice(-4).toUpperCase()}
        </span>
      </div>
      
      <h1 className="text-2xl lg:text-3xl xl:text-4xl font-extrabold text-zinc-900 dark:text-white leading-tight mb-4 tracking-tight">
        {property.title}
      </h1>
      
      <div className="flex items-start gap-2.5 text-zinc-600 dark:text-zinc-300 mb-8">
        <MapPin className="h-5 w-5 text-brand-red shrink-0 mt-0.5" />
        <span className="font-medium text-base lg:text-lg">
          {property.city?.fokontany} {property.city?.commune} {property.city?.district}
        </span>
      </div>

      <div className="mb-10">
        <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-2">
          {property.type === 'rent' ? 'Loyer Mensuel' : 'Prix de Vente'}
        </div>
        <div className="flex items-baseline gap-1 text-brand-green">
          <span className="text-4xl lg:text-5xl font-black tracking-tighter">
            {displayPrice ? displayPrice.toLocaleString('en-US') : 'Sur demande'}
          </span>
          {displayPrice && (
            <span className="text-xl lg:text-2xl font-bold ml-1">
              AR{property.type === 'rent' ? '/mois' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 mb-8">
        {stats.map((stat, idx) => (stat.value && stat.value !== '-' && stat.value !== 0) ? (
          <div key={idx} className="flex items-center gap-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-zinc-100/80 dark:border-zinc-700/50 hover:border-zinc-200 dark:hover:border-zinc-600 transition-colors shadow-sm">
            <div className="h-10 w-10 rounded-full bg-white dark:bg-zinc-800 shadow-sm flex items-center justify-center shrink-0 border border-black/[0.02] dark:border-white/5">
               <stat.icon className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-zinc-900 dark:text-white text-lg leading-none">{stat.value}</span>
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mt-1.5">{stat.label}</span>
            </div>
          </div>
        ) : null)}
      </div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-zinc-900 min-h-screen">
      {/* MOBILE GALLERY */}
      {renderMobileGallery()}

      <div className="max-w-[1440px] mx-auto lg:px-6 xl:px-8 lg:py-6">
        
        {/* DESKTOP NAVIGATION */}
        <div className="hidden lg:flex items-center justify-between mb-8 sticky top-6 z-50">
          <button onClick={() => router.back()} className="flex items-center gap-2 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white font-bold text-sm transition-all bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md hover:bg-zinc-50 dark:hover:bg-zinc-700 px-5 py-2.5 rounded-full border border-zinc-200/80 dark:border-zinc-700/80 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)]">
            <ChevronLeft className="h-4 w-4" />
            Retour à la recherche
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 xl:gap-16">
          
          {/* LEFT COLUMN: Gallery, Description, Features, Map */}
          <div className="w-full lg:w-[55%] xl:w-[65%]">
            
            {/* Mobile Identity */}
            {renderIdentityAndStats(true)}

            {/* Desktop Gallery */}
            {renderDesktopGallery()}

            {/* CONTENT UNDER GALLERY */}
            <div className="px-4 lg:px-0 mt-10 lg:mt-16 space-y-12 lg:space-y-16">
              
              {/* Features */}
              {activeFeatures.length > 0 && (
                <div className="scroll-mt-24">
                  <h3 className="text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white mb-6 lg:mb-8 flex items-center gap-4">
                     Équipements et atouts
                     <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                  </h3>
                  <div className="flex flex-wrap gap-2.5 lg:gap-3">
                    {activeFeatures.map(key => {
                       const feature = FEATURE_ICONS[key];
                       if (!feature) return null;
                       const Icon = feature.icon;
                       return (
                        <div key={key} className="flex items-center gap-2.5 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:-translate-y-0.5 transition-all cursor-default">
                          <Icon className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{feature.label}</span>
                        </div>
                       )
                    })}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="scroll-mt-24">
                <h3 className="text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white mb-6 lg:mb-8 flex items-center gap-4">
                   À propos de ce bien
                   <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                </h3>
                <div className={`text-zinc-600 dark:text-zinc-300 text-base leading-relaxed whitespace-pre-wrap font-medium ${!isDescriptionExpanded ? 'line-clamp-6 md:line-clamp-none' : ''}`}>
                  {property.description}
                </div>
                {property.description && property.description.length > 300 && (
                  <button 
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="mt-4 font-bold text-brand-green hover:text-green-700 text-sm flex items-center gap-1 md:hidden"
                  >
                    {isDescriptionExpanded ? 'Voir moins' : 'Lire la suite'}
                    <ChevronRight className={`h-4 w-4 transition-transform ${isDescriptionExpanded ? '-rotate-90' : 'rotate-90'}`} />
                  </button>
                )}
              </div>

              {/* Location */}
              <div className="scroll-mt-24">
                 <h3 className="text-xl lg:text-2xl font-bold text-zinc-900 dark:text-white mb-6 lg:mb-8 flex items-center gap-4">
                   Localisation
                   <div className="h-px bg-zinc-100 dark:bg-zinc-800 flex-1"></div>
                 </h3>
                 <div className="h-[250px] lg:h-[350px] rounded-[2rem] overflow-hidden border border-zinc-100 dark:border-zinc-700 shadow-inner relative z-0">
                   <PropertyLocationDisplayer position={position} circle={useCircle} />
                 </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Desktop Identity & Sticky Contact Card */}
          <div className="w-full lg:w-[45%] xl:w-[35%] shrink-0 px-4 lg:px-0">
            <div className="lg:sticky lg:top-24 space-y-8">
              
              {/* Desktop Identity */}
              {renderIdentityAndStats(false)}

              {/* Contact Action Area */}
              <div className="bg-white dark:bg-zinc-800 rounded-[2rem] border border-zinc-100 dark:border-zinc-700 p-6 lg:p-8 shadow-2xl shadow-black/[0.03] relative overflow-hidden">
                 {/* Subtle background accent */}
                 <div className="absolute top-0 right-0 w-32 h-32 bg-brand-green/5 rounded-bl-full -mr-4 -mt-4 pointer-events-none"></div>
                 
                 <div className="flex items-center gap-4 lg:mb-8 relative z-10 bg-zinc-50/50 dark:bg-zinc-700/50 p-4 rounded-2xl border border-zinc-100/50 dark:border-zinc-600/50">
                   <div className="h-14 w-14 rounded-full overflow-hidden bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 shrink-0 shadow-sm">
                      <img 
                        src={
                          property.owner?.role === "admin"
                            ? (property.sources?.avatar || "/icon-logo.png")
                            : (property.owner?.avatar || "https://ui-avatars.com/api/?name=User&background=random")
                        }
                        alt="Avatar" 
                        className="w-full h-full object-cover" 
                        onError={(e) => {
                          e.currentTarget.src = "https://ui-avatars.com/api/?name=User&background=random";
                        }}
                      />
                   </div>
                   <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Annonceur</span>
                      <span className="font-bold text-zinc-900 dark:text-white text-base truncate">
                        {property.owner?.role === "admin" ? (property.sources?.username || "TranoGasy") : (property.owner?.username || "Utilisateur")}
                      </span>
                      <span className="text-xs text-brand-green font-semibold mt-0.5">Annonce {formatDateAgo(property.created_at)}</span>
                   </div>
                 </div>

                 <div className="hidden lg:flex gap-3 relative z-10">
                   <button onClick={() => setShowContact(true)} className="flex-1 bg-brand-green hover:bg-green-700 text-white rounded-2xl py-4 flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-brand-green/20 hover:shadow-brand-green/30 hover:-translate-y-0.5 transition-all">
                      <Phone className="h-5 w-5" />
                      Voir contact
                   </button>
                   <button className="h-[52px] w-[52px] shrink-0 rounded-2xl bg-red-50 dark:bg-red-900/30 text-brand-red flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/50 hover:-translate-y-0.5 transition-all">
                      <Heart className="h-5 w-5" />
                   </button>
                   <button onClick={handleShare} className="h-[52px] w-[52px] shrink-0 rounded-2xl bg-zinc-50 dark:bg-zinc-700/50 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:-translate-y-0.5 transition-all">
                      <Share2 className="h-5 w-5" />
                   </button>
                 </div>
                 
                 <div className="hidden lg:flex items-center justify-center gap-2 text-xs font-semibold text-zinc-400 mt-6">
                   <FaShieldAlt className="h-3.5 w-3.5" />
                   <span>Contact sécurisé via TranoGasy</span>
                 </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* MOBILE FIXED BOTTOM BAR */}
      <div 
        className="lg:hidden fixed left-0 right-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-t border-zinc-200/50 dark:border-zinc-800/50 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.3)] z-40 px-5 py-3.5 flex gap-3 transition-all"
        style={{ bottom: 'calc(65px + env(safe-area-inset-bottom))' }}
      >
        <button onClick={() => setShowContact(true)} className="flex-1 bg-brand-green hover:bg-green-700 text-white rounded-2xl py-3.5 flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-brand-green/20 hover:shadow-brand-green/30 hover:-translate-y-0.5 transition-all">
           <Phone className="h-5 w-5" />
           Voir contact
        </button>
        <button className="h-[50px] w-[50px] shrink-0 rounded-2xl bg-red-50 dark:bg-red-900/30 text-brand-red flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/50 hover:-translate-y-0.5 transition-all">
           <Heart className="h-5 w-5" />
        </button>
        <button onClick={handleShare} className="h-[50px] w-[50px] shrink-0 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:-translate-y-0.5 transition-all">
           <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* MODALS */}
      {showContact && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowContact(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 md:p-8 shadow-2xl max-w-sm w-full relative transform transition-all animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowContact(false)}
              className="absolute top-4 right-4 h-10 w-10 flex items-center justify-center rounded-full bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="text-center mb-8 pt-4">
              <div className="h-20 w-20 mx-auto rounded-full bg-green-50 dark:bg-brand-green/20 flex items-center justify-center mb-5 border border-green-100 dark:border-brand-green/30 shadow-sm">
                <Phone className="h-8 w-8 text-brand-green" />
              </div>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Contactez l'annonceur</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
                Mentionnez que vous avez vu l'annonce sur TranoGasy pour un meilleur accueil.
              </p>
            </div>
            
            <div className="space-y-3">
              {(property.phone1 || property.phone2 || property.phone3 || property.owner?.phone) ? (
                <>
                  {[property.phone1, property.phone2, property.phone3, property.owner?.phone]
                    .filter(Boolean)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((phone, idx) => (
                      <a 
                        key={idx}
                        href={`tel:${phone}`} 
                        className="flex items-center justify-center py-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 text-brand-green border border-zinc-100 dark:border-zinc-700 font-black text-xl tracking-wider hover:bg-green-50 dark:hover:bg-zinc-700 hover:border-green-200 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
                      >
                        {phone}
                      </a>
                    ))}
                </>
              ) : (
                <div className="text-center py-6 text-zinc-500 font-semibold bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                  Aucun numéro de téléphone fourni
                </div>
              )}
            </div>
          </div>
        </div>
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
            {images.map((src: string, idx: number) => (
              <div key={idx} className="min-w-full h-full flex items-center justify-center snap-center snap-always relative px-4 md:px-24">
                <div className="relative w-full max-w-6xl h-[85vh]">
                  <Image
                    src={src}
                    alt={`Photo ${idx + 1}`}
                    fill
                    className={`object-contain transition-transform duration-700 ${idx === lightboxIndex ? 'scale-100 opacity-100' : 'scale-95 opacity-50'}`}
                    priority={idx === lightboxIndex || idx === lightboxIndex + 1 || idx === lightboxIndex - 1}
                  />
                </div>
              </div>
            ))}
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

