'use client';

import React, { useEffect, useRef, useMemo, memo } from 'react';
import Image from 'next/image';
import {
  MapPin,
  BedDouble,
  Bath,
  Maximize,
  Heart,
  X,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Navigation,
} from 'lucide-react';
import { useFavorite } from '@/hooks/useFavorite';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import { formatNumberWithSpaces } from '@/hooks/usePropertySearch';

interface MapPropertyPreviewCarouselProps {
  properties: any[];
  selectedPropertyId: string | null;
  onSelectProperty: (property: any | null) => void;
}

function MapPropertyPreviewCarouselComponent({
  properties,
  selectedPropertyId,
  onSelectProperty,
}: MapPropertyPreviewCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const isProgrammaticScrollRef = useRef(false);
  const scrollIdleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const user = useUserStore((s) => s.user);
  const currentUser = user?.user || user;
  const openAuthModal = useModalStore((s) => s.openModal);
  const { favorites, toggleFavorite } = useFavorite();
  const openPropertyDetail = usePropertyDetailModalStore((s) => s.openPropertyDetail);

  // Build a window of up to 30 properties that is guaranteed to include selectedPropertyId
  const carouselSlice = useMemo(() => {
    if (!selectedPropertyId || properties.length === 0) return [];
    const selectedFullIdx = properties.findIndex((p) => p._id === selectedPropertyId);
    if (selectedFullIdx === -1) return properties.slice(0, 30);
    if (selectedFullIdx < 30) return properties.slice(0, 30);
    const start = Math.max(0, selectedFullIdx - 10);
    return properties.slice(start, start + 30);
  }, [properties, selectedPropertyId]);

  // Scroll carousel to selectedPropertyId when marker is tapped
  useEffect(() => {
    if (!selectedPropertyId || !scrollRef.current) return;
    const el = cardRefs.current[selectedPropertyId];
    if (el) {
      isProgrammaticScrollRef.current = true;
      el.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
      const timer = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 450);
      return () => clearTimeout(timer);
    }
  }, [selectedPropertyId]);

  if (!selectedPropertyId || carouselSlice.length === 0) {
    return null;
  }

  const currentIdx = carouselSlice.findIndex((p) => p._id === selectedPropertyId);

  const handleOpenDetails = (property: any, e: React.MouseEvent) => {
    e.stopPropagation();
    openPropertyDetail(property._id, property, null);
  };

  const handleFavorite = async (property: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    await toggleFavorite(property._id, currentUser._id);
  };

  const handleStep = (delta: number) => {
    if (currentIdx === -1) return;
    const nextIdx = Math.min(
      carouselSlice.length - 1,
      Math.max(0, currentIdx + delta)
    );
    const target = carouselSlice[nextIdx];
    if (target) {
      onSelectProperty(target);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto pointer-events-auto font-outfit animate-glass-island">
      {/* Desktop Navigation Arrows & Counter Header */}
      <div className="flex items-center justify-between px-4 mb-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-950/90 dark:bg-white/95 text-white dark:text-zinc-950 text-[11px] font-light tracking-wider shadow-md">
          <span>
            Bien {currentIdx >= 0 ? currentIdx + 1 : 1} sur {carouselSlice.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            disabled={currentIdx <= 0}
            className="w-8 h-8 rounded-full bg-white/95 dark:bg-zinc-900/95 border border-white/80 dark:border-white/15 flex items-center justify-center text-zinc-800 dark:text-zinc-100 disabled:opacity-35 shadow-md cursor-pointer transition-transform active:scale-90"
            aria-label="Propriété précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleStep(1)}
            disabled={currentIdx >= carouselSlice.length - 1}
            className="w-8 h-8 rounded-full bg-white/95 dark:bg-zinc-900/95 border border-white/80 dark:border-white/15 flex items-center justify-center text-zinc-800 dark:text-zinc-100 disabled:opacity-35 shadow-md cursor-pointer transition-transform active:scale-90"
            aria-label="Propriété suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onSelectProperty(null)}
            className="w-8 h-8 rounded-full bg-zinc-950/90 dark:bg-white/95 text-white dark:text-zinc-950 flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-90 ml-1"
            aria-label="Fermer l'aperçu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Snap-Scrolling Cards Carousel (Debounced scroll-settle detection to prevent layout thrashing) */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          if (isProgrammaticScrollRef.current) return;
          const container = e.currentTarget;
          if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);

          scrollIdleTimerRef.current = setTimeout(() => {
            if (!container || isProgrammaticScrollRef.current) return;
            const centerLine = container.scrollLeft + container.clientWidth / 2;

            let closestId: string | null = null;
            let minDiff = Infinity;

            for (let i = 0; i < carouselSlice.length; i++) {
              const p = carouselSlice[i];
              const cardEl = cardRefs.current[p._id];
              if (cardEl) {
                const cardCenter = cardEl.offsetLeft + cardEl.offsetWidth / 2;
                const diff = Math.abs(centerLine - cardCenter);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestId = p._id;
                }
              }
            }

            if (closestId && closestId !== selectedPropertyId) {
              const found = carouselSlice.find((p) => p._id === closestId);
              if (found) onSelectProperty(found);
            }
          }, 120);
        }}
        className="flex items-stretch gap-3.5 overflow-x-auto snap-x snap-mandatory px-4 pb-1 no-scrollbar"
      >
        {carouselSlice.map((property) => {
          const isSelected = property._id === selectedPropertyId;
          const rawImg = property.images?.[0];
          const imgUrl =
            typeof rawImg === 'string'
              ? rawImg
              : rawImg?.src || 'https://via.placeholder.com/400x300?text=TranoGasy';
          const displayPrice =
            property.type === 'sale' ? property.price : property.rent;
          const isFav = Boolean(favorites[property._id]);

          return (
            <div
              key={property._id}
              ref={(el) => {
                cardRefs.current[property._id] = el;
              }}
              onClick={(e) => handleOpenDetails(property, e)}
              className={`snap-center shrink-0 w-[88vw] max-w-[410px] sm:w-[390px] rounded-[2rem] p-3
                bg-white/95 dark:bg-zinc-900/95 backdrop-blur-3xl
                border transition-all duration-300 cursor-pointer
                flex items-center gap-3.5
                shadow-[0_18px_45px_rgba(0,0,0,0.22)]
                ${
                  isSelected
                    ? 'border-brand-green ring-2 ring-brand-green/35 scale-100'
                    : 'border-white/80 dark:border-white/10 opacity-85 scale-96'
                }`}
            >
              {/* Left Thumbnail Squircle */}
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-[1.5rem] overflow-hidden shrink-0 bg-zinc-200 dark:bg-zinc-800">
                <Image
                  src={imgUrl}
                  alt={property.title || 'Propriété'}
                  fill
                  sizes="140px"
                  className="object-cover"
                />
                <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/65 backdrop-blur-md text-white text-[9px] font-light uppercase tracking-wider">
                  {property.type === 'sale' ? 'Vente' : 'Location'}
                </div>
                <button
                  type="button"
                  onClick={(e) => handleFavorite(property, e)}
                  className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center text-white hover:scale-110 active:scale-90 transition-transform cursor-pointer"
                  aria-label="Favoris"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      isFav ? 'fill-brand-red text-brand-red' : 'text-white'
                    }`}
                  />
                </button>
              </div>

              {/* Right Content */}
              <div className="flex-1 min-w-0 flex flex-col justify-between h-28 sm:h-32 py-0.5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm sm:text-base font-medium text-brand-green tracking-tight truncate">
                      {displayPrice
                        ? `${formatNumberWithSpaces(displayPrice)} Ar`
                        : 'Prix sur dmd'}
                      {property.type === 'rent' && (
                        <span className="text-[10px] font-light text-zinc-400">
                          /mois
                        </span>
                      )}
                    </span>

                    {typeof property._distanceMeters === 'number' && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-light text-zinc-500 dark:text-zinc-400 shrink-0">
                        <Navigation className="w-2.5 h-2.5 text-brand-green" />
                        {property._distanceMeters >= 1000
                          ? `${(property._distanceMeters / 1000).toFixed(1)} km`
                          : `${property._distanceMeters} m`}
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs sm:text-sm font-normal text-zinc-900 dark:text-white truncate mt-0.5">
                    {property.title}
                  </h4>

                  <div className="flex items-center gap-1 text-[11px] font-light text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                    <MapPin className="w-3 h-3 text-brand-green shrink-0" />
                    <span className="capitalize truncate">
                      {property.city?.fokontany}, {property.city?.commune}
                    </span>
                  </div>
                </div>

                {/* Bottom Specs + Big-Padding Rounded Action Pill */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2.5 text-[11px] font-light text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1">
                      <BedDouble className="w-3.5 h-3.5" />
                      {property.rooms || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Bath className="w-3.5 h-3.5" />
                      {property.bathrooms || 0}
                    </span>
                    {property.area > 0 && (
                      <span className="flex items-center gap-1">
                        <Maximize className="w-3 h-3" />
                        {property.area}m²
                      </span>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 text-[11px] font-light tracking-wider">
                    <span>Voir</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MapPropertyPreviewCarousel = memo(MapPropertyPreviewCarouselComponent);
export default MapPropertyPreviewCarousel;

