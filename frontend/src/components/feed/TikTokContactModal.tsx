'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, Phone, Copy, Check, MessageSquare, ShieldCheck, MapPin, ChevronRight, Lock, Coins, Loader2 } from 'lucide-react';
import { FeedProperty } from './types';
import { resolveProfileHref } from '@/services/user.service';
import { propertyService } from '@/services/property.service';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { usePropertyStore } from '@/store/propertyStore';

interface TikTokContactModalProps {
  property: FeedProperty | any | null;
  onClose: () => void;
}

export default function TikTokContactModal({ property, onClose }: TikTokContactModalProps) {
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [unlockedPhones, setUnlockedPhones] = useState<string[] | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const userStore = useUserStore((state) => state.user);
  const updateBalance = useUserStore((state) => state.updateBalance);
  const openModal = useModalStore((state) => state.openModal);
  const currentUser = userStore?.user || userStore;

  if (!property) return null;

  const isLocked = Boolean(property.contactLocked) && !unlockedPhones;
  const unlockCostJp = Number(property.contactUnlockCostJp) > 0 ? Number(property.contactUnlockCostJp) : 50;
  const maskedPreview = property.maskedPhonePreview || '034 •• ••• ••';

  const phoneNumbers = (
    unlockedPhones || [
      property.phone1,
      property.phone2,
      property.phone3,
      property.owner?.phone,
    ]
  )
    .filter(Boolean)
    .map((num) => String(num).trim())
    .filter((num, index, self) => self.indexOf(num) === index && num.length > 0);

  const handleUnlockContact = async () => {
    setUnlockError(null);
    if (!currentUser?._id) {
      onClose();
      openModal('login');
      return;
    }

    setIsUnlocking(true);
    try {
      const token =
        userStore?.authToken ||
        currentUser?.authToken ||
        (typeof window !== 'undefined' ? localStorage.getItem('authToken') : null);
      const data = await propertyService.unlockPropertyContact(
        property._id,
        currentUser._id,
        token,
      );

      if (typeof data.balance === 'number') {
        updateBalance(data.balance);
      }

      const revealed = [data.phone1, data.phone2, data.phone3]
        .filter(Boolean)
        .map((n) => String(n).trim());
      setUnlockedPhones(revealed);

      // Update in-memory property object so subsequent opens in this session stay unlocked
      property.contactLocked = false;
      property.phone1 = data.phone1 || property.phone1;
      property.phone2 = data.phone2 || property.phone2;
      property.phone3 = data.phone3 || property.phone3;
      if (data.description) {
        property.description = data.description;
      }
      usePropertyStore.getState().addProperty({ ...property });
    } catch (err: any) {
      setUnlockError(err?.message || 'Erreur lors du déblocage du contact.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCopy = (phone: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const firstImage =
    property.images?.[0]
      ? typeof property.images[0] === 'string'
        ? property.images[0]
        : property.images[0].src
      : '/icon-logo.png';

  const avatar =
    property.owner?.role === 'admin'
      ? property.sources?.avatar || '/icon-logo.png'
      : property.owner?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(property.owner?.username || 'Annonceur')}&background=7cbd1e&color=fff`;

  const profileHref = resolveProfileHref(property.owner, property.sources);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 relative flex flex-col gap-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Property Brief Preview */}
        <div className="flex items-center gap-3 pr-8">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-700">
            <img src={firstImage} alt={property.title} className="w-full h-full object-cover" />
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

        {/* Advertiser info (Clickable to open User Profile Page) */}
        <Link
          href={profileHref}
          onClick={onClose}
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
                Annonceur vérifié • Voir le profil
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

        {/* Phone Numbers List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Numéros de téléphone
            </label>
            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
                <Lock className="w-3 h-3" /> Protégé ({unlockCostJp} JP)
              </span>
            )}
          </div>

          {isLocked ? (
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 space-y-3">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-base font-black tracking-wider text-zinc-800 dark:text-zinc-100 select-none">
                      {maskedPreview}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Numéro vérifié • Masqué jusqu&apos;au déblocage
                    </div>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">
                  {unlockCostJp} JP
                </span>
              </div>

              {unlockError && (
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-600 dark:text-red-300 flex flex-col gap-1.5">
                  <span>{unlockError}</span>
                  {unlockError.toLowerCase().includes('insuffisant') && (
                    <Link
                      href="/pricing"
                      onClick={onClose}
                      className="self-start inline-flex items-center gap-1 rounded-lg bg-brand-green px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-95 cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5" /> Recharger mes JP
                    </Link>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={isUnlocking}
                onClick={handleUnlockContact}
                className="w-full py-3 px-4 rounded-2xl bg-brand-green hover:bg-brand-green/90 disabled:opacity-60 text-white font-black text-sm shadow-lg shadow-brand-green/25 flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
              >
                {isUnlocking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Déblocage en cours...</span>
                  </>
                ) : (
                  <>
                    <Coins className="w-4 h-4" />
                    <span>
                      {currentUser
                        ? `Débloquer le contact (${unlockCostJp} JP)`
                        : `Se connecter pour débloquer (${unlockCostJp} JP)`}
                    </span>
                  </>
                )}
              </button>

              {currentUser && (
                <div className="text-[11px] text-center text-zinc-500 dark:text-zinc-400">
                  Votre solde actuel :{' '}
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {Number(currentUser.balance ?? 0).toLocaleString('fr-FR')} JP
                  </strong>{' '}
                  • Déblocage définitif pour votre compte
                </div>
              )}
            </div>
          ) : phoneNumbers.length > 0 ? (
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
                      className="px-4 py-2 rounded-full bg-zinc-950 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 text-xs font-black shadow-md shadow-black/20 dark:shadow-white/10 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                    >
                      Appeler
                    </a>
                  </div>
                </div>
              );
            })
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
            Mentionnez que vous avez trouvé cette annonce sur <strong>TranoGasy</strong> pour un traitement prioritaire.
          </span>
        </div>
      </div>
    </div>
  );
}
