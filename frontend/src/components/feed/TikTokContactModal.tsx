'use client';

import React, { useState } from 'react';
import { X, Phone, Copy, Check, MessageSquare, ShieldCheck, MapPin } from 'lucide-react';
import { FeedProperty } from './types';

interface TikTokContactModalProps {
  property: FeedProperty | null;
  onClose: () => void;
}

export default function TikTokContactModal({ property, onClose }: TikTokContactModalProps) {
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  if (!property) return null;

  const phoneNumbers = [
    property.phone1,
    property.phone2,
    property.phone3,
    property.owner?.phone,
  ]
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
                  : 'Loyer sur demande'
                : property.price
                ? `${property.price.toLocaleString('fr-FR')} Ar`
                : 'Prix sur demande'}
            </span>
          </div>
        </div>

        {/* Advertiser info */}
        <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-2xl border border-zinc-100 dark:border-zinc-700/60">
          <img
            src={avatar}
            alt={property.owner?.username || 'Annonceur'}
            className="w-11 h-11 rounded-full object-cover border border-zinc-200 dark:border-zinc-600 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
              Annonceur vérifié
            </span>
            <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate block">
              {property.owner?.role === 'admin'
                ? property.sources?.username || 'TranoGasy Officiel'
                : property.owner?.username || 'Utilisateur'}
            </span>
          </div>
        </div>

        {/* Phone Numbers List */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
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
