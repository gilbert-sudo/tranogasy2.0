'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import {
  X,
  Eye,
  Heart,
  Phone,
  TrendingUp,
  BarChart3,
  Calendar,
  MapPin,
  Clock,
  Sparkles,
} from 'lucide-react';
import { DashboardProperty } from './DashboardPropertyCard';

interface PropertyStatsModalProps {
  isOpen: boolean;
  property: DashboardProperty | null;
  onClose: () => void;
}

function formatDateAgo(dateString?: string) {
  if (!dateString) return 'Récemment';
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

export default function PropertyStatsModal({
  isOpen,
  property,
  onClose,
}: PropertyStatsModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !property) return null;

  const views = property.views || 0;
  const favorites = property.favorites || 0;
  const leads = property.leads || 0;

  // Engagement conversion rates
  const favoriteRate = views > 0 ? ((favorites / views) * 100).toFixed(1) : '0.0';
  const conversionRate = views > 0 ? ((leads / views) * 100).toFixed(1) : '0.0';

  const isRent = property.type === 'rent';
  const displayPrice = isRent
    ? (property.rent ?? property.price)
    : (property.price ?? property.rent);

  const isActive = property.status === 'active' || property.status === 'available';
  const isPending = property.status === 'pending';

  const locationText = (() => {
    if (typeof property.city === 'object' && property.city !== null) {
      return [property.city.fokontany, property.city.commune || property.city.district]
        .filter(Boolean)
        .join(', ');
    }
    return [property.neighborhood, property.city].filter(Boolean).join(', ');
  })();

  const rawImages = property.images && property.images.length > 0 ? property.images : ['/hero-bg.jpg'];
  const firstImage = typeof rawImages[0] === 'string' ? rawImages[0] : rawImages[0]?.src || '/hero-bg.jpg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2rem] p-6 sm:p-7 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Icon, Title and Close */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-brand-green/10 text-brand-green flex items-center justify-center shrink-0 border border-brand-green/20">
              <BarChart3 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight">
                Statistiques de performance
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                Rapport d&apos;engagement en temps réel
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Property Identity Capsule */}
        <div className="mt-4 flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/50">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-zinc-200 dark:bg-zinc-700">
            <Image
              src={firstImage}
              alt={property.title}
              fill
              unoptimized
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
              {property.title}
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
              <MapPin className="w-3 h-3 text-brand-green shrink-0" />
              <span className="truncate">{locationText || 'Madagascar'}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black text-brand-green">
                {displayPrice ? `${displayPrice.toLocaleString('fr-FR')} Ar` : 'Sur demande'}
                {isRent && <span className="text-[10px] font-normal text-zinc-500">/mois</span>}
              </span>
              <span className="text-zinc-300 dark:text-zinc-600">•</span>
              {isActive ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  En ligne
                </span>
              ) : isPending ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
                  <Clock className="w-3 h-3" />
                  En attente
                </span>
              ) : (
                <span className="text-[10px] font-bold text-zinc-500">
                  En pause
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Core KPI Metrics Grid */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {/* Card 1: Vues */}
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 text-center flex flex-col items-center justify-between">
            <div className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1.5">
              <Eye className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
              Vues
            </span>
            <span className="text-lg font-black text-zinc-900 dark:text-white mt-0.5">
              {views.toLocaleString('fr-FR')}
            </span>
            <span className="text-[10px] text-zinc-400 font-light mt-0.5">
              Consultations
            </span>
          </div>

          {/* Card 2: Favoris */}
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 text-center flex flex-col items-center justify-between">
            <div className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-950/40 text-brand-red flex items-center justify-center mb-1.5">
              <Heart className="w-3.5 h-3.5 fill-brand-red text-brand-red" />
            </div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
              Favoris
            </span>
            <span className="text-lg font-black text-brand-red mt-0.5">
              {favorites.toLocaleString('fr-FR')}
            </span>
            <span className="text-[10px] text-zinc-400 font-light mt-0.5">
              {favoriteRate}% ratio
            </span>
          </div>

          {/* Card 3: Contacts */}
          <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 text-center flex flex-col items-center justify-between">
            <div className="w-7 h-7 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-brand-green flex items-center justify-center mb-1.5">
              <Phone className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
              Contacts
            </span>
            <span className="text-lg font-black text-brand-green mt-0.5">
              {leads.toLocaleString('fr-FR')}
            </span>
            <span className="text-[10px] text-zinc-400 font-light mt-0.5">
              {conversionRate}% conv.
            </span>
          </div>
        </div>

        {/* Funnel & Conversion Highlight Banner */}
        <div className="mt-4 p-3.5 rounded-2xl bg-gradient-to-br from-brand-green/10 via-brand-green/5 to-transparent border border-brand-green/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-100">
              <TrendingUp className="w-3.5 h-3.5 text-brand-green" />
              <span>Taux d&apos;efficacité commerciale</span>
            </div>
            <span className="text-xs font-black text-brand-green">
              {conversionRate}%
            </span>
          </div>
          {/* Funnel Progress Line */}
          <div className="w-full h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-700/80 overflow-hidden flex">
            <div
              style={{ width: `${Math.min(100, Math.max(10, Number(conversionRate) * 10))}%` }}
              className="h-full bg-brand-green rounded-full transition-all duration-500"
            />
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
            {leads > 0
              ? `Cette annonce suscite un grand intérêt : ${leads} personnes ont demandé à vous contacter.`
              : 'Pour booster vos contacts, veillez à garder un prix compétitif et des photos lumineuses.'}
          </p>
        </div>

        {/* Publication Timeline Info */}
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-400 dark:text-zinc-500 px-1">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            Publiée {formatDateAgo(property.created_at)}
          </span>
          <span className="inline-flex items-center gap-1 text-brand-green font-medium">
            <Sparkles className="w-3 h-3" />
            Annonce optimisée
          </span>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

