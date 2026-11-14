'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Check,
  Building2,
  MapPin,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react';
import { usePropertyClaim } from '@/hooks/usePropertyClaim';

interface ClaimableListingsBannerProps {
  onClaimed?: (claimedCount: number) => void;
}

export default function ClaimableListingsBanner({
  onClaimed,
}: ClaimableListingsBannerProps) {
  const {
    hasAuthToken,
    claimableListings,
    suggestedProfile,
    isChecking,
    isClaiming,
    claimError,
    checkClaimable,
    claimListings,
  } = usePropertyClaim();

  const [deselectedIds, setDeselectedIds] = useState<string[]>([]);
  const [adoptProfileOverride, setAdoptProfileOverride] = useState<boolean | null>(null);
  const [isExpandedOverride, setIsExpandedOverride] = useState<boolean | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!hasAuthToken) return;
    const timer = setTimeout(() => {
      void checkClaimable();
    }, 0);
    return () => clearTimeout(timer);
  }, [hasAuthToken, checkClaimable]);

  const selectedIds = useMemo(() => {
    const deselected = new Set(deselectedIds);
    return claimableListings.map((item) => item._id).filter((id) => !deselected.has(id));
  }, [claimableListings, deselectedIds]);

  const isExpanded = isExpandedOverride ?? claimableListings.length <= 4;
  const adoptProfile =
    adoptProfileOverride ?? Boolean(suggestedProfile?.username || suggestedProfile?.avatar);

  if (!hasAuthToken || isDismissed || (!isChecking && claimableListings.length === 0)) {
    return null;
  }

  if (isChecking && claimableListings.length === 0) {
    return null;
  }

  const toggleId = (id: string) => {
    setDeselectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleClaimSelected = async () => {
    const res = await claimListings({
      propertyIds: selectedIds,
      adoptUsername: adoptProfile,
      adoptAvatar: adoptProfile,
    });

    if (res.success && res.claimedCount > 0) {
      onClaimed?.(res.claimedCount);
    }
  };

  return (
    <div className="mb-6 rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-lime-50/70 dark:from-emerald-950/40 dark:via-zinc-900 dark:to-zinc-900 border border-brand-green/35 shadow-sm p-4 sm:p-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-green text-white shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white leading-snug">
              {claimableListings.length} annonce{claimableListings.length > 1 ? 's' : ''} associée{claimableListings.length > 1 ? 's' : ''} à votre numéro vérifié
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">
              Rattachez ces biens à votre espace propriétaire pour pouvoir les modifier, gérer leur disponibilité ou suivre leurs vues.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => setIsExpandedOverride(!isExpanded)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-brand-green transition cursor-pointer"
          >
            <span>{isExpanded ? 'Masquer' : 'Voir la liste'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Fermer"
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
            {claimableListings.map((item) => {
              const isSelected = selectedIds.includes(item._id);
              const displayAmount = item.type === 'rent' ? item.rent : item.price;
              const locationText = [item.city?.fokontany, item.city?.commune]
                .filter(Boolean)
                .join(', ');

              return (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => toggleId(item._id)}
                  className={`flex items-center gap-3 p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white dark:bg-zinc-800 border-brand-green shadow-2xs'
                      : 'bg-white/60 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700/70 opacity-70'
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-200 dark:bg-zinc-700 shrink-0">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400">
                        <Building2 className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                      {item.title}
                    </p>
                    {locationText && (
                      <p className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        <MapPin className="w-3 h-3 text-brand-green shrink-0" />
                        <span className="truncate">{locationText}</span>
                      </p>
                    )}
                    <p className="text-[11px] font-extrabold text-brand-green mt-0.5">
                      {displayAmount
                        ? `${Number(displayAmount).toLocaleString('fr-FR')} Ar${
                            item.type === 'rent' ? ' / mois' : ''
                          }`
                        : 'Prix sur demande'}
                    </p>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center border shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-brand-green border-brand-green text-white'
                        : 'border-zinc-300 dark:border-zinc-600'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {(suggestedProfile?.username || suggestedProfile?.avatar) ? (
              <button
                type="button"
                onClick={() => setAdoptProfileOverride(!adoptProfile)}
                className="inline-flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-left cursor-pointer hover:border-brand-green/50 transition"
              >
                {suggestedProfile.avatar ? (
                  <img
                    src={suggestedProfile.avatar}
                    alt={suggestedProfile.username || 'Profil'}
                    className="w-7 h-7 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <User className="w-4 h-4 text-brand-green shrink-0" />
                )}
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                  Importer aussi le nom/photo ({suggestedProfile.username || 'Profil'})
                </span>
                <div
                  className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                    adoptProfile
                      ? 'bg-brand-green border-brand-green text-white'
                      : 'border-zinc-300 dark:border-zinc-600'
                  }`}
                >
                  {adoptProfile && <Check className="w-3 h-3" strokeWidth={3} />}
                </div>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              disabled={isClaiming || selectedIds.length === 0}
              onClick={handleClaimSelected}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-brand-green hover:bg-emerald-600 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rattachement en cours...</span>
                </>
              ) : (
                <span>
                  Rattacher {selectedIds.length} annonce{selectedIds.length > 1 ? 's' : ''}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {claimError && (
        <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
          {claimError}
        </p>
      )}
    </div>
  );
}
