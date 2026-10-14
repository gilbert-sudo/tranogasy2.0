'use client';

import React from 'react';
import { X, MapPin } from 'lucide-react';
import PropertyLocationDisplayer from '@/components/map/PropertyLocationDisplayer';
import { FeedProperty } from './types';

interface TikTokMapModalProps {
  property: FeedProperty | null;
  onClose: () => void;
}

export default function TikTokMapModal({ property, onClose }: TikTokMapModalProps) {
  if (!property) return null;

  const position = property.coords
    ? property.coords
    : property.city?.coords
    ? property.city.coords
    : {
        lat: -18.905195365917766,
        lng: 47.52370521426201,
      };

  const useCircle = !property.coords;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/40 text-brand-red flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-zinc-900 dark:text-white capitalize">
                {property.city?.fokontany || 'Localisation'}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                {property.city?.commune} {property.city?.district ? `• ${property.city.district}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map Container */}
        <div className="w-full h-72 md:h-96 rounded-2xl overflow-hidden relative border border-zinc-200 dark:border-zinc-700">
          <PropertyLocationDisplayer position={position} circle={useCircle} />
        </div>

        {/* Info Footer */}
        <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center flex items-center justify-center gap-2">
          <span>{useCircle ? 'Zone approximative basée sur la commune / quartier' : 'Localisation précise du bien'}</span>
        </div>
      </div>
    </div>
  );
}
