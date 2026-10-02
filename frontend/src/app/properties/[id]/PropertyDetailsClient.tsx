'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { X, Share2, Phone, MapPin, Heart, ChevronLeft, BedDouble, Expand, Home, Utensils, Droplets, Grid2X2 } from 'lucide-react';
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

  const images = property.images && property.images.length > 0 
    ? property.images.map((img: any) => typeof img === 'string' ? img : img.src)
    : ['https://via.placeholder.com/1200x800?text=TranoGasy'];

  const displayPrice = property.type === 'rent' ? property.rent : property.price;

  const activeFeatures = property.features 
    ? Object.entries(property.features).filter(([_, value]) => value).map(([key]) => key)
    : [];

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

  return (
    <div className="bg-white min-h-screen relative pb-24">
      {/* HERO SECTION */}
      <div className="relative h-[450px] md:h-[550px] w-full">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image 
            src={images[0]} 
            alt={property.title} 
            fill 
            className="object-cover"
            priority
          />
        </div>
        
        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/70" />
        
        {/* Top Bar Items */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
          {/* User Info */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white overflow-hidden border-2 border-white/80 shadow-md">
              <Image 
                src="https://via.placeholder.com/40" // Replace with actual avatar if available
                alt="Avatar" 
                width={40} 
                height={40} 
                className="object-cover" 
              />
            </div>
            <div className="flex flex-col text-white drop-shadow-md">
              <span className="font-semibold text-sm leading-tight">Loïc James Immobilier</span>
              <span className="text-xs text-zinc-300">{formatDateAgo(property.created_at)}</span>
            </div>
          </div>
          
          {/* Close Button */}
          <button 
            onClick={() => router.back()}
            className="h-8 w-8 rounded-full border-2 border-white/80 flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-4 mt-8">
          <p className="text-white font-medium text-sm md:text-base drop-shadow-md mb-2">
            Détails de la propriété <span className="text-brand-red font-bold">n°{property.propertyNumber || property._id.slice(-4).toUpperCase()}</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-white/90 text-xs md:text-sm mb-4">
            <MapPin className="h-4 w-4 text-brand-red" />
            <span className="drop-shadow-sm font-medium">
              {property.city?.fokontany} {property.city?.commune} {property.city?.district}
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-brand-green tracking-tight drop-shadow-lg mb-6">
            {displayPrice ? `${displayPrice.toLocaleString('fr-FR')} Ar` : 'Sur dmd'}
            {property.type === 'rent' && <span className="text-xl md:text-2xl text-white/90 font-medium">/mois</span>}
          </h2>
          <button 
            onClick={() => setShowContact(true)}
            className="bg-[#2A2A2A] hover:bg-black text-white px-6 py-2.5 rounded-full flex items-center gap-2 text-sm font-semibold transition-colors shadow-lg border border-white/10"
          >
            <Phone className="h-4 w-4" />
            Voir contact
          </button>
        </div>

        {/* Favorite Button (Bottom Right) */}
        <div className="absolute bottom-4 right-4 z-10">
          <button className="h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform text-zinc-700 hover:text-brand-red">
            <Heart className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* CONTENT SECTION */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 md:py-8">
        
        {/* Title and Share */}
        <div className="flex justify-between items-start mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900">{property.title}</h1>
          <button 
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-medium transition-colors ml-4 shrink-0"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Partager</span>
          </button>
        </div>

        {/* Description Box */}
        <div className="border border-zinc-200 rounded-xl p-5 md:p-6 mb-8 text-zinc-700 text-sm md:text-base leading-relaxed bg-white shadow-sm whitespace-pre-wrap">
          {property.description}
        </div>

        {/* Features Pills */}
        {activeFeatures.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-10">
            {activeFeatures.map((key) => {
              const feature = FEATURE_ICONS[key];
              if (!feature) return null;
              const Icon = feature.icon;
              return (
                <div key={key} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-xs font-medium text-zinc-700 shadow-sm hover:border-zinc-300 transition-colors">
                  <Icon className="h-4 w-4 text-zinc-500" />
                  {feature.label}
                </div>
              );
            })}
          </div>
        )}

        {/* Details Divider */}
        <div className="relative flex py-5 items-center mb-6">
          <div className="flex-grow border-t border-zinc-200"></div>
          <span className="flex-shrink-0 mx-4 text-zinc-400 text-sm font-medium uppercase tracking-widest">Plus de détails</span>
          <div className="flex-grow border-t border-zinc-200"></div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-y-8 gap-x-2 mb-10">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-lg text-zinc-900">{property.rooms || 0}</span>
              <BedDouble className="h-4 w-4 text-zinc-500" />
            </div>
            <span className="text-[10px] md:text-xs text-zinc-500 font-medium">Chambre(s)</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-lg text-zinc-900">{property.livingRoom || 0}</span>
              <Home className="h-4 w-4 text-zinc-500" />
            </div>
            <span className="text-[10px] md:text-xs text-zinc-500 font-medium">Salon</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-lg text-zinc-900">{property.kitchen || 0}</span>
              <Utensils className="h-4 w-4 text-zinc-500" />
            </div>
            <span className="text-[10px] md:text-xs text-zinc-500 font-medium">Cuisine(s)</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-lg text-zinc-900">{property.toilet || 0}</span>
              <Grid2X2 className="h-4 w-4 text-zinc-500" />
            </div>
            <span className="text-[10px] md:text-xs text-zinc-500 font-medium">W.C</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-lg text-zinc-900">{property.bathrooms || 0}</span>
              <Droplets className="h-4 w-4 text-zinc-500" />
            </div>
            <span className="text-[10px] md:text-xs text-zinc-500 font-medium">Douche</span>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center gap-1 mb-1">
              <span className="font-bold text-lg text-zinc-900">{property.area || 0}</span>
              <span className="text-xs font-bold">m²</span>
              <Expand className="h-4 w-4 text-zinc-500" />
            </div>
            <span className="text-[10px] md:text-xs text-zinc-500 font-medium">Surface</span>
          </div>
        </div>

        {/* Masonry / Mosaic Property Gallery */}
        {images.length > 0 && (
          <div className="mb-10">
            <div className="rounded-xl overflow-hidden">
              {/* Row 1: Featured large image + 2 stacked small images */}
              <div className="flex gap-[2px]" style={{ height: 'clamp(250px, 40vw, 420px)' }}>
                {/* Featured image — takes ~65% width */}
                <div
                  className="relative flex-[2] cursor-pointer overflow-hidden group"
                  onClick={() => setLightboxIndex(0)}
                >
                  <Image
                    src={images[0]}
                    alt="Photo principale"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    priority
                  />
                </div>
                {/* Right column — 2 stacked images */}
                {images.length > 1 && (
                  <div className="flex flex-col flex-[1] gap-[2px]">
                    {images.slice(1, 3).map((img: string, idx: number) => (
                      <div
                        key={idx}
                        className="relative flex-1 cursor-pointer overflow-hidden group"
                        onClick={() => setLightboxIndex(idx + 1)}
                      >
                        <Image
                          src={img}
                          alt={`Photo ${idx + 2}`}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Row 2+: Remaining images in mosaic rows of 3 */}
              {images.length > 3 && (
                <div className="mt-[2px]">
                  {Array.from({ length: Math.ceil((images.length - 3) / 3) }).map((_, rowIdx) => {
                    const rowImages = images.slice(3 + rowIdx * 3, 3 + rowIdx * 3 + 3);
                    return (
                      <div
                        key={rowIdx}
                        className="flex gap-[2px]"
                        style={{
                          height: 'clamp(120px, 22vw, 220px)',
                          marginTop: rowIdx > 0 ? '2px' : 0,
                        }}
                      >
                        {rowImages.map((img: string, imgIdx: number) => {
                          const globalIdx = 3 + rowIdx * 3 + imgIdx;
                          return (
                            <div
                              key={imgIdx}
                              className="relative flex-1 cursor-pointer overflow-hidden group"
                              onClick={() => setLightboxIndex(globalIdx)}
                            >
                              <Image
                                src={img}
                                alt={`Photo ${globalIdx + 1}`}
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lightbox Viewer */}
        {lightboxIndex !== null && (
          <div
            className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center"
            onClick={() => setLightboxIndex(null)}
          >
            {/* Close button */}
            <button
              className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              onClick={() => setLightboxIndex(null)}
            >
              <X className="h-6 w-6" />
            </button>

            {/* Prev arrow */}
            {lightboxIndex > 0 && (
              <button
                className="absolute left-3 md:left-6 z-10 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Next arrow */}
            {lightboxIndex < images.length - 1 && (
              <button
                className="absolute right-3 md:right-6 z-10 h-10 w-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
              >
                <ChevronLeft className="h-6 w-6 rotate-180" />
              </button>
            )}

            {/* Image */}
            <div
              className="relative w-[90vw] h-[80vh] max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={images[lightboxIndex]}
                alt={`Photo ${lightboxIndex + 1}`}
                fill
                className="object-contain"
              />
            </div>

            {/* Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">
              {lightboxIndex + 1} / {images.length}
            </div>
          </div>
        )}

        {/* Location Map Placeholder */}
        <div className="w-full h-64 md:h-96 bg-zinc-100 rounded-xl border border-zinc-200 overflow-hidden relative mb-4 flex items-center justify-center">
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'url("https://maps.googleapis.com/maps/api/staticmap?center=-18.87919,47.507905&zoom=13&size=800x400&sensor=false")', backgroundSize: 'cover' }}></div>
          <div className="relative z-10 flex flex-col items-center text-zinc-500">
            <MapPin className="h-10 w-10 text-brand-red mb-2" />
            <p className="font-medium text-sm">Zone approximative: {property.city?.fokontany}</p>
            <p className="text-xs">L'intégration Google Maps est requise ici</p>
          </div>
        </div>
      </div>

      {/* FIXED BOTTOM BAR */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-zinc-200 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50 flex items-center justify-between px-4 md:px-8">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-1 text-zinc-600 hover:text-zinc-900 font-medium text-sm px-2 py-2"
        >
          <ChevronLeft className="h-5 w-5" />
          Fermer
        </button>

        <div className="w-12 h-1.5 rounded-full bg-zinc-200"></div>

        <button 
          onClick={() => setShowContact(true)}
          className="bg-brand-green hover:bg-green-700 text-white px-6 py-2 rounded-full flex items-center gap-2 text-sm font-bold shadow-md hover:shadow-lg transition-all"
        >
          <Phone className="h-4 w-4" />
          Voir contact
        </button>
      </div>

      {/* CONTACT MODAL */}
      {showContact && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowContact(false)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowContact(false)}
              className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="text-center mb-6 pt-2">
              <div className="h-16 w-16 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-4">
                <Phone className="h-8 w-8 text-brand-green" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">Contactez le propriétaire</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Mentionnez que vous avez vu l'annonce sur TranoGasy
              </p>
            </div>
            
            <div className="space-y-3">
              {(property.phone1 || property.phone2 || property.phone3 || property.owner?.phone) ? (
                <>
                  {[property.phone1, property.phone2, property.phone3, property.owner?.phone]
                    .filter(Boolean)
                    // Remove duplicates
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .map((phone, idx) => (
                      <a 
                        key={idx}
                        href={`tel:${phone}`} 
                        className="flex items-center justify-center py-3 rounded-xl bg-green-50 text-brand-green border border-green-100 font-bold text-xl tracking-wider hover:bg-green-100 transition-colors"
                      >
                        {phone}
                      </a>
                    ))}
                </>
              ) : (
                <div className="text-center py-4 text-zinc-500 font-medium">
                  Aucun numéro de téléphone fourni
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
