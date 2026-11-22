'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  X,
  Phone,
  Copy,
  Check,
  ShieldCheck,
  MapPin,
  ChevronRight,
  Lock,
  Clock,
  RefreshCw,
  Receipt,
} from 'lucide-react';
import { FeedProperty } from './types';
import { resolveProfileHref } from '@/services/user.service';
import { propertyService } from '@/services/property.service';
import { useAuth } from '@/hooks/useAuth';
import { useAssistance } from '@/hooks/useAssistance';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { usePropertyStore } from '@/store/propertyStore';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import { useProfileStore } from '@/store/profileStore';

interface TikTokContactModalProps {
  property: FeedProperty | null;
  onClose: () => void;
}

export default function TikTokContactModal({
  property: propProperty,
  onClose,
}: TikTokContactModalProps) {
  const router = useRouter();
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [isRefreshingAccess, setIsRefreshingAccess] = useState(false);

  const userStore = useUserStore((state) => state.user);
  const openModal = useModalStore((state) => state.openModal);
  const { refreshUserSession } = useAuth();
  const { hasActiveAssistance, fetchAssistanceHistory } = useAssistance();

  const currentUser = userStore?.user || userStore;
  const viewerId = currentUser?._id ? String(currentUser._id) : '';
  const hasAllContactsUnlocked = Boolean(currentUser?.hasAllContactsUnlocked);
  const subscriptionExpiresAt = currentUser?.subscriptionExpiresAt
    ? String(currentUser.subscriptionExpiresAt)
    : '';
  const hasUserAssistance = hasActiveAssistance;

  const storeProperty = usePropertyStore((state) =>
    propProperty?._id ? state.properties[String(propProperty._id)] : undefined
  );

  const property: FeedProperty | null = React.useMemo(() => {
    if (!propProperty) return null;
    if (!storeProperty) return propProperty;
    if (storeProperty.contactLocked === false) {
      return { ...propProperty, ...storeProperty };
    }
    if (propProperty.contactLocked === false) {
      return { ...storeProperty, ...propProperty };
    }
    return { ...propProperty, ...storeProperty };
  }, [propProperty, storeProperty]);

  const propId = property?._id ? String(property._id) : '';

  const refreshContactUnlockStatus = async () => {
    if (!propId || propId.startsWith('prop-') || !viewerId) return;
    setIsRefreshingAccess(true);
    try {
      await Promise.all([refreshUserSession(), fetchAssistanceHistory()]);
      const fresh = await propertyService.getPropertyById(propId);
      if (fresh) {
        usePropertyStore.getState().addProperty(fresh);
        usePropertyDetailModalStore.getState().updateInitialProperty(fresh);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setIsRefreshingAccess(false);
    }
  };

  useEffect(() => {
    if (!viewerId) return;
    refreshUserSession();
    fetchAssistanceHistory();
  }, [viewerId, refreshUserSession, fetchAssistanceHistory]);

  useEffect(() => {
    const propId = property?._id ? String(property._id) : '';
    if (!propId || propId.startsWith('prop-') || !viewerId) return;
    if (!property?.contactLocked) return;

    let cancelled = false;
    propertyService
      .getPropertyById(propId)
      .then((fresh) => {
        if (!cancelled && fresh) {
          usePropertyStore.getState().addProperty(fresh);
          usePropertyDetailModalStore.getState().updateInitialProperty(fresh);
        }
      })
      .catch(() => {
        // Ignore transient network errors
      });

    return () => {
      cancelled = true;
    };
  }, [
    property?._id,
    property?.contactLocked,
    viewerId,
    hasAllContactsUnlocked,
    subscriptionExpiresAt,
  ]);

  if (!property) return null;

  const isLocked = Boolean(property.contactLocked);
  const maskedPreview = property.maskedPhonePreview || '034 •• ••• ••';

  const saveReturnContextForProperty = () => {
    const modalState = usePropertyDetailModalStore.getState();
    const isInsideDetailModal = Boolean(modalState.isOpen && modalState.propertyId);
    const currentPathWithSearch =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : `/properties/${property._id}`;
    const isStandalonePropertyPage =
      !isInsideDetailModal &&
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/properties/');
    const resolvedOriginUrl = isInsideDetailModal
      ? modalState.originUrl || '/'
      : currentPathWithSearch;

    modalState.saveUnlockReturnContext({
      propertyId: String(property._id),
      propertySnapshot: property,
      originUrl: resolvedOriginUrl,
      wasModal: !isStandalonePropertyPage,
      openContactModal: true,
    });

    return { isInsideDetailModal, resolvedOriginUrl };
  };

  const handleGoToPricing = (e: React.MouseEvent) => {
    e.preventDefault();
    const { isInsideDetailModal, resolvedOriginUrl } = saveReturnContextForProperty();

    if (
      isInsideDetailModal &&
      typeof window !== 'undefined' &&
      window.location.pathname.startsWith('/properties/')
    ) {
      try {
        History.prototype.replaceState.call(
          window.history,
          window.history.state,
          '',
          resolvedOriginUrl
        );
      } catch {
        window.history.replaceState(window.history.state, '', resolvedOriginUrl);
      }
    }

    onClose();
    router.push('/pricing');
  };

  const handleLoginToUnlock = () => {
    saveReturnContextForProperty();
    usePropertyDetailModalStore
      .getState()
      .setAutoOpenContactForPropertyId(String(property._id));
    openModal('login');
  };

  const phoneNumbers = (
    isLocked
      ? []
      : [
          property.phone1,
          property.phone2,
          property.phone3,
          property.owner?.phone,
        ]
  )
    .filter(Boolean)
    .map((num) => String(num).trim())
    .filter((num, index, self) => self.indexOf(num) === index && num.length > 0);

  const handleCopy = (phone: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const firstImage = property.images?.[0]
    ? typeof property.images[0] === 'string'
      ? property.images[0]
      : property.images[0].src
    : '/icon-logo.png';

  const avatar =
    property.owner?.role === 'admin'
      ? property.sources?.avatar || '/icon-logo.png'
      : property.owner?.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          property.owner?.username || 'Annonceur'
        )}&background=7cbd1e&color=fff`;

  const profileHref = resolveProfileHref(property.owner, property.sources);

  return (
    <div
      data-swipe-dismiss-ignore="true"
      data-modal-overlay-active="true"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 relative flex flex-col gap-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-300/90 dark:border-zinc-600/80 shadow-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 flex items-center justify-center text-zinc-800 dark:text-zinc-100 transition-all active:scale-90 cursor-pointer shrink-0"
        >
          <X className="w-5 h-5 stroke-[2.25]" />
        </button>

        {/* Property Brief Preview */}
        <div className="flex items-center gap-3 pr-8">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-700">
            <img
              src={firstImage}
              alt={property.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
              {property.title}
            </h4>
            <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
              <MapPin className="w-3.5 h-3.5 text-brand-green shrink-0" />
              <span>
                {property.city?.fokontany}, {property.city?.commune}
              </span>
            </div>
            <span className="text-xs font-bold text-brand-green mt-0.5 inline-block">
              {property.type === 'rent'
                ? property.rent
                  ? `${property.rent.toLocaleString('fr-FR')} Ar / mois`
                  : property.estimatedRent
                  ? `~${property.estimatedRent.toLocaleString('fr-FR')} Ar / mois (Est. IA)`
                  : 'Loyer sur demande'
                : property.price
                ? `${property.price.toLocaleString('fr-FR')} Ar`
                : property.estimatedPrice
                ? `~${property.estimatedPrice.toLocaleString('fr-FR')} Ar (Est. IA)`
                : 'Prix sur demande'}
            </span>
          </div>
        </div>

        {/* Advertiser info */}
        <Link
          href={profileHref}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            useProfileStore
              .getState()
              .openProfileFromOwner(property.owner, property.sources);
          }}
          className="flex items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-2xl border border-zinc-100 dark:border-zinc-700/60 hover:border-brand-green/40 transition-all group"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <img
              src={avatar}
              alt={property.owner?.username || 'Annonceur'}
              className="w-11 h-11 rounded-full object-cover border border-zinc-200 dark:border-zinc-600 shrink-0 group-hover:scale-105 transition-transform"
            />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Annonceur • Voir le profil
              </span>
              <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-brand-green transition-colors truncate block">
                {property.owner?.role === 'admin'
                  ? property.sources?.username || 'TranoGasy'
                  : property.owner?.username || 'Membre TranoGasy'}
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-brand-green group-hover:translate-x-0.5 transition-all shrink-0" />
        </Link>

        {/* Contact Numbers */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
            Numéros de téléphone
          </label>

          {phoneNumbers.length > 0 ? (
            phoneNumbers.map((phone, idx) => {
              const isCopied = copiedPhone === phone;
              const cleanTel = phone.replace(/\s+/g, '');
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-all hover:border-brand-green/40"
                >
                  <a
                    href={`tel:${cleanTel}`}
                    className="flex items-center gap-3 text-base font-bold text-zinc-900 dark:text-white hover:text-brand-green transition-colors flex-1 pl-1"
                  >
                    <div className="w-9 h-9 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <span>{phone}</span>
                  </a>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleCopy(cleanTel, e)}
                      title="Copier le numéro"
                      className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                    >
                      {isCopied ? (
                        <Check className="w-4 h-4 text-brand-green" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <a
                      href={`tel:${cleanTel}`}
                      className="px-4 py-2 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      Appeler
                    </a>
                  </div>
                </div>
              );
            })
          ) : isLocked ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center gap-3 min-w-0 pl-0.5">
                  <div className="w-9 h-9 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="text-sm sm:text-base font-extrabold tracking-wider text-zinc-900 dark:text-white select-none">
                    {maskedPreview}
                  </div>
                </div>
              </div>

              {currentUser && hasUserAssistance ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 font-medium">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Votre demande est enregistrée. Finalisez la mise en relation depuis votre reçu pour activer l&apos;accès aux contacts.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={refreshContactUnlockStatus}
                      disabled={isRefreshingAccess}
                      className="flex-1 py-3 px-4 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isRefreshingAccess ? 'animate-spin' : ''}`}
                      />
                      <span>{isRefreshingAccess ? 'Vérification...' : 'Actualiser'}</span>
                    </button>
                    <Link
                      href="/account"
                      onClick={onClose}
                      className="flex-1 py-3 px-4 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5 text-brand-green" />
                      <span>Voir mon reçu</span>
                    </Link>
                  </div>
                </div>
              ) : currentUser ? (
                <Link
                  href="/pricing"
                  onClick={handleGoToPricing}
                  className="w-full py-3.5 px-6 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs sm:text-sm shadow-md shadow-black/20 dark:shadow-white/10 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-brand-green" />
                  <span>Contacter l&apos;annonceur</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleLoginToUnlock}
                  className="w-full py-3.5 px-6 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-bold text-xs sm:text-sm shadow-md shadow-black/20 dark:shadow-white/10 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-brand-green" />
                  <span>Contacter l&apos;annonceur</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-sm font-medium text-center">
              Aucun numéro de contact public n&apos;est renseigné pour cette annonce.
            </div>
          )}
        </div>

        {/* Tip Box */}
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-green-50 dark:bg-brand-green/10 border border-green-100 dark:border-brand-green/20 text-xs text-brand-green font-medium">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Référence du bien :{' '}
            <strong>
              {property.propertyNumber || String(property._id).slice(-4).toUpperCase()}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}
