'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  MapPin,
  Bed,
  Bath,
  Maximize,
  Heart,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';

interface ListingLivePreviewCardProps {
  title: string;
  type: 'rent' | 'sale';
  houseType: string;
  floor?: string;
  price: number | null;
  rent: number | null;
  area: number;
  rooms: number;
  bathrooms: number;
  toilet: number;
  images: { src?: string; previewUrl?: string }[];
  cityLabel?: string;
}

export default function ListingLivePreviewCard({
  title,
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
}: ListingLivePreviewCardProps) {
  const [currentIdx, setCurrentIdx] = useState(0);

  const displayImages =
    images.length > 0
      ? images.map((img) => ({ src: img.src || img.previewUrl || '/hero-bg.jpg' }))
      : [{ src: '/hero-bg.jpg' }];

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIdx((prev) => (prev + 1) % displayImages.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIdx((prev) => (prev - 1 + displayImages.length) % displayImages.length);
  };

  const formattedAmount = () => {
    const val = type === 'rent' ? rent : price;
    if (!val || val <= 0) return 'Prix non défini';
    return `${val.toLocaleString('fr-FR')} Ar${type === 'rent' ? ' / mois' : ''}`;
  };

  return (
    <div className="w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl transition-all duration-300">
      {/* Live Preview Header Pill */}
      <div className="px-4 py-2.5 bg-zinc-950 text-white flex items-center justify-between text-xs font-semibold">
        <span className="flex items-center gap-1.5 text-brand-green">
          <Eye className="w-3.5 h-3.5" />
          <span>Aperçu en direct</span>
        </span>
        <span className="text-[10px] text-zinc-400 font-mono">TranoGasy 2.0</span>
      </div>

      {/* Image Carousel */}
      <div className="relative aspect-4/3 w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden group">
        <Image
          src={displayImages[currentIdx]?.src || '/hero-bg.jpg'}
          alt={title || 'Aperçu'}
          fill
          sizes="(max-width: 768px) 100vw, 380px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Status & Type Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-950/80 backdrop-blur-md text-white shadow-sm uppercase tracking-wider">
            {type === 'rent' ? 'À Louer' : 'À Vendre'}
          </span>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-green/90 backdrop-blur-md text-white shadow-sm capitalize">
            {houseType || 'Maison'}
            {houseType === 'appartement' && floor ? ` (${floor})` : ''}
          </span>
        </div>

        {/* Favorite Icon Mock */}
        <div className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md flex items-center justify-center text-zinc-800 dark:text-zinc-200 shadow-sm">
          <Heart className="w-4 h-4" />
        </div>

        {/* Carousel Arrows */}
        {displayImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={prevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 text-zinc-900 flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={nextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 text-zinc-900 flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10">
              {displayImages.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === currentIdx ? 'w-4 bg-brand-green' : 'w-1.5 bg-white/60'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Price */}
        <div className="text-lg sm:text-xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          {formattedAmount()}
        </div>

        {/* Title */}
        <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-100 line-clamp-1">
          {title || "Titre de votre annonce..."}
        </h4>

        {/* Location */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <MapPin className="w-3.5 h-3.5 text-brand-green shrink-0" />
          <span className="truncate">
            {cityLabel || "Localisation sélectionnée"}
          </span>
        </div>

        {/* Specs Grid */}
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center gap-1">
            <Bed className="w-3.5 h-3.5 text-zinc-400" />
            <span>{rooms || 0} ch.</span>
          </div>
          <div className="flex items-center gap-1">
            <Bath className="w-3.5 h-3.5 text-zinc-400" />
            <span>{bathrooms || 0} sdb.</span>
          </div>
          <div className="flex items-center gap-1">
            <Maximize className="w-3.5 h-3.5 text-zinc-400" />
            <span>{area || 0} m²</span>
          </div>
        </div>
      </div>
    </div>
  );
}
