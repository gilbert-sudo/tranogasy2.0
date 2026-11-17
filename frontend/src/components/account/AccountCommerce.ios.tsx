'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Headset,
  Receipt,
  ChevronRight,
  Clock,
  X,
  Phone,
  CheckCircle2,
  ArrowLeft,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { useAssistance } from '@/hooks/useAssistance';
import type { AssistanceReceiptTransaction } from '@/services/assistance.service';
import {
  AGENCY_ASSISTANCE_PLANS,
  AGENCY_SUPPORT_PHONE_DISPLAY,
  AGENCY_SUPPORT_PHONE_TEL,
} from '@/lib/platform';

function formatReceiptDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatOperatorLabel(operator?: string): string {
  const op = String(operator || '').toLowerCase();
  if (op.includes('mvola')) return 'MVola';
  if (op.includes('orange')) return 'Orange Money';
  if (op.includes('airtel')) return 'Airtel Money';
  if (op.includes('card') || op.includes('bred') || op.includes('visa')) {
    return 'Carte Bancaire';
  }
  return 'Mobile Money';
}

function resolvePlanDurationLabel(tx: AssistanceReceiptTransaction): string {
  const planId = tx.assistancePlanId || tx.subscriptionPlanId;
  const matched = AGENCY_ASSISTANCE_PLANS.find(
    (p) => p.id === planId || p.id.replace('assistance_', 'plan_') === planId
  );
  if (matched) return matched.durationLabel;
  const hours = tx.assistanceDurationHours || tx.subscriptionDurationHours;
  if (hours === 24) return '24 heures';
  if (hours === 72) return '3 jours';
  if (hours === 168) return '1 semaine';
  return 'Assistance Tranogasy';
}

export function useAccountCommerce() {
  const {
    receipts,
    hasActiveAssistance,
    assistancePlanLabel,
    assistanceExpiresAt,
    fetchAssistanceHistory,
  } = useAssistance();
  const [showHistory, setShowHistory] = useState(false);

  const confirmedReceipts = receipts.filter((tx) => tx.status === 'confirmed');

  return {
    balance: hasActiveAssistance ? 1 : 0,
    transactions: confirmedReceipts,
    hasActiveAssistance,
    assistancePlanLabel,
    assistanceExpiresAt,
    refreshCommerce: fetchAssistanceHistory,
    showHistory,
    setShowHistory,
  };
}

export function AccountHeaderBadge({ balance }: { balance: number }) {
  const isActive = balance > 0;
  return (
    <Link
      href="/pricing"
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-zinc-900 shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:scale-105 active:scale-95 transition-all"
    >
      <Headset className="w-4 h-4 text-brand-green" />
      <span className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-white">
        {isActive ? 'Assistance active' : 'Assistance'}
      </span>
    </Link>
  );
}

export function AccountWalletSection({
  balance,
  transactions,
  onOpenHistory,
}: {
  balance: number;
  transactions: AssistanceReceiptTransaction[];
  onOpenHistory: () => void;
}) {
  const isActive = balance > 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-2">
        <h3 className="text-base sm:text-lg font-bold text-zinc-800 dark:text-zinc-200">
          Assistance Tranogasy
        </h3>
        {transactions.length > 0 && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Reçus ({transactions.length})</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] sm:rounded-[2.25rem] px-4 py-3.5 sm:px-6 sm:py-4 shadow-[0_12px_40px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)] flex flex-row items-center justify-between gap-3 sm:gap-4">
        <div
          onClick={transactions.length > 0 ? onOpenHistory : undefined}
          className={`flex items-center gap-3 sm:gap-3.5 min-w-0 ${
            transactions.length > 0 ? 'cursor-pointer' : ''
          }`}
        >
          <div className="w-11 h-11 rounded-2xl bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0">
            <Headset className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white truncate">
                {isActive ? 'Assistance en cours' : 'Service client TranoGasy'}
              </span>
              {isActive && (
                <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0" />
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-1 truncate">
              Plus d’informations par agent • {AGENCY_SUPPORT_PHONE_DISPLAY}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`tel:${AGENCY_SUPPORT_PHONE_TEL}`}
            aria-label="Appeler l'agence"
            className="w-10 h-10 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-900 dark:text-white flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all"
          >
            <Phone className="w-4 h-4" />
          </a>
          <Link
            href="/pricing"
            className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center shadow-[0_6px_20px_rgba(124,189,30,0.28)] hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap"
          >
            <span>Offres</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function AccountPricingMenuItem() {
  return (
    <Link href="/pricing" className="block">
      <div className="flex items-center justify-between p-4 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/60 transition-colors cursor-pointer rounded-full">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
            <Headset className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-zinc-800 dark:text-zinc-100 block truncate">
              Assistance Tranogasy
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 block truncate">
              Plus d’informations par agent et mise en relation
            </span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-zinc-400 shrink-0" strokeWidth={1.75} />
      </div>
    </Link>
  );
}

export function AccountHistoryModal({
  open,
  transactions,
  onClose,
}: {
  open: boolean;
  transactions: AssistanceReceiptTransaction[];
  onClose: () => void;
}) {
  const [selectedReceipt, setSelectedReceipt] =
    useState<AssistanceReceiptTransaction | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  if (!open) return null;

  const confirmedList = transactions.filter((tx) => tx.status === 'confirmed');

  const handleClose = () => {
    setSelectedReceipt(null);
    setCopiedRef(false);
    onClose();
  };

  const handleCopyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 max-w-md w-full shadow-2xl space-y-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedReceipt ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedReceipt(null);
                  setCopiedRef(false);
                }}
                aria-label="Retour aux reçus"
                className="w-8 h-8 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <Receipt className="w-4 h-4 text-brand-green" />
            )}
            <h4 className="text-base font-bold text-zinc-900 dark:text-white">
              {selectedReceipt ? 'Détails du reçu' : "Reçus d'assistance"}
            </h4>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {selectedReceipt ? (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="text-center space-y-1.5 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green/12 text-brand-green text-[11px] font-extrabold uppercase tracking-wider">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Paiement confirmé
              </span>
              <div className="text-2xl font-extrabold text-zinc-950 dark:text-white">
                {resolvePlanDurationLabel(selectedReceipt)}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Plus d’informations par agent et mise en relation
              </p>
            </div>

            <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Référence</span>
                <button
                  type="button"
                  onClick={() => handleCopyRef(selectedReceipt.ref)}
                  className="inline-flex items-center gap-1.5 font-mono font-bold text-zinc-900 dark:text-white hover:text-brand-green transition-colors cursor-pointer"
                >
                  <span>{selectedReceipt.ref}</span>
                  {copiedRef ? (
                    <Check className="w-3.5 h-3.5 text-brand-green" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Montant payé</span>
                <span className="font-extrabold text-brand-green">
                  {Number(selectedReceipt.amount).toLocaleString('fr-FR')} Ar
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Mode de paiement</span>
                <span className="font-bold text-zinc-900 dark:text-white">
                  {formatOperatorLabel(selectedReceipt.operator)}
                </span>
              </div>
              {selectedReceipt.phoneNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Numéro</span>
                  <span className="font-bold text-zinc-900 dark:text-white">
                    {selectedReceipt.phoneNumber}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Date</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatReceiptDate(selectedReceipt.created_at)}
                </span>
              </div>
              {(selectedReceipt.assistanceExpiresAt ||
                selectedReceipt.subscriptionExpiresAt) && (
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <span className="text-zinc-500 dark:text-zinc-400">Valable jusqu’au</span>
                  <span className="font-bold text-zinc-900 dark:text-white">
                    {formatReceiptDate(
                      selectedReceipt.assistanceExpiresAt ||
                        selectedReceipt.subscriptionExpiresAt
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 px-1">
              <ShieldCheck className="w-4 h-4 text-brand-green shrink-0" />
              <span>Présentez cette référence lors de votre échange avec un agent.</span>
            </div>

            <a
              href={`tel:${AGENCY_SUPPORT_PHONE_TEL}`}
              className="w-full h-12 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-extrabold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              <span>Appeler TranoGasy ({AGENCY_SUPPORT_PHONE_DISPLAY})</span>
            </a>
          </div>
        ) : confirmedList.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Aucun reçu d&apos;assistance confirmé pour le moment.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {confirmedList.map((tx) => (
              <button
                key={tx._id || tx.ref}
                type="button"
                onClick={() => setSelectedReceipt(tx)}
                className="w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#F5F5F7] hover:bg-zinc-200/70 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-xs sm:text-sm text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-zinc-900 dark:text-white truncate">
                      {tx.ref}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {resolvePlanDurationLabel(tx)} • {formatReceiptDate(tx.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-bold text-brand-green text-xs">
                    {Number(tx.amount).toLocaleString('fr-FR')} Ar
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
