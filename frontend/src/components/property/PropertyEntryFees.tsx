'use client';

import React, { useState } from 'react';
import { Briefcase, ShieldCheck, Ticket } from 'lucide-react';

export interface PropertyEntryFeesProperty {
  type?: 'rent' | 'sale' | string;
  visitFee?: number | string | null;
  cautionPercent?: number | string | null;
  cautionAmount?: number | string | null;
  commissionPercent?: number | string | null;
  commissionAmount?: number | string | null;
}

interface PropertyEntryFeesProps {
  property: PropertyEntryFeesProperty | null | undefined;
  displayPrice?: number | null;
  className?: string;
  style?: React.CSSProperties;
}

interface FeeItem {
  key: string;
  icon: React.ElementType;
  label: string;
  value: string;
  secondary?: string | null;
  note: string;
}

function parseFeeNumber(val: number | string | null | undefined): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function formatPercentNote(percent: number): string {
  return percent === 100 ? '1 mois' : `${percent}%`;
}

/**
 * Quiet, icon-led inline micro-chips for entry/agency fees (visit fee, deposit, commission).
 * Keeps fees visible to users without drawing heavy visual focus or adding clutter.
 */
export default function PropertyEntryFees({
  property,
  displayPrice,
  className = '',
  style,
}: PropertyEntryFeesProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!property) return null;

  const visitFee = parseFeeNumber(property.visitFee);
  const cautionPercent = parseFeeNumber(property.cautionPercent);
  const explicitCautionAmount = parseFeeNumber(property.cautionAmount);
  const resolvedCautionAmount =
    explicitCautionAmount !== null
      ? explicitCautionAmount
      : cautionPercent !== null && displayPrice
        ? Math.round((Number(displayPrice) * cautionPercent) / 100)
        : null;

  const commissionPercent = parseFeeNumber(property.commissionPercent);
  const explicitCommissionAmount = parseFeeNumber(property.commissionAmount);
  const resolvedCommissionAmount =
    explicitCommissionAmount !== null
      ? explicitCommissionAmount
      : commissionPercent !== null && displayPrice
        ? Math.round((Number(displayPrice) * commissionPercent) / 100)
        : null;

  const items: FeeItem[] = [];

  if (visitFee !== null) {
    items.push({
      key: 'visit',
      icon: Ticket,
      label: 'Visite',
      value: visitFee === 0 ? 'Gratuit' : `${visitFee.toLocaleString('fr-FR')} Ar`,
      secondary: visitFee > 0 ? `${(visitFee * 5).toLocaleString('fr-FR')} FMG` : null,
      note: 'Droit de visite à régler pour visiter les lieux',
    });
  }

  if (cautionPercent !== null || resolvedCautionAmount !== null) {
    items.push({
      key: 'caution',
      icon: ShieldCheck,
      label: 'Caution',
      value:
        resolvedCautionAmount !== null
          ? `${resolvedCautionAmount.toLocaleString('fr-FR')} Ar`
          : `${cautionPercent}% du loyer`,
      secondary:
        cautionPercent !== null && resolvedCautionAmount !== null
          ? formatPercentNote(cautionPercent)
          : null,
      note: 'Caution payable une seule fois au propriétaire en plus du loyer',
    });
  }

  if (commissionPercent !== null || resolvedCommissionAmount !== null) {
    const baseLabel = property.type === 'sale' ? 'prix' : 'loyer';
    items.push({
      key: 'commission',
      icon: Briefcase,
      label: 'Commission',
      value:
        resolvedCommissionAmount !== null
          ? `${resolvedCommissionAmount.toLocaleString('fr-FR')} Ar`
          : `${commissionPercent}% du ${baseLabel}`,
      secondary:
        commissionPercent !== null && resolvedCommissionAmount !== null
          ? formatPercentNote(commissionPercent)
          : null,
      note: "Commission d'agent immobilier avant de prendre le bien",
    });
  }

  if (items.length === 0) return null;

  const activeItem = items.find((item) => item.key === expandedKey);

  return (
    <div style={style} className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = expandedKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setExpandedKey((prev) => (prev === item.key ? null : item.key))}
              aria-expanded={isActive}
              title={item.note}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] leading-none transition-colors cursor-pointer ${
                isActive
                  ? 'bg-zinc-200/70 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200'
                  : 'bg-zinc-100/75 dark:bg-zinc-800/50 border-zinc-200/70 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:border-zinc-300/80 dark:hover:border-zinc-600'
              }`}
            >
              <Icon className="w-3 h-3 text-zinc-400 dark:text-zinc-500 shrink-0" />
              <span className="font-medium">{item.label}</span>
              <span className="font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">
                {item.value}
              </span>
              {item.secondary && (
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                  ({item.secondary})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeItem && (
        <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500 leading-snug">
          {activeItem.note}
        </p>
      )}
    </div>
  );
}
