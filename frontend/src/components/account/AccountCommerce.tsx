'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Crown,
  Clock,
  ChevronRight,
  X,
  CheckCircle2,
  Receipt,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { usePayment } from '@/hooks/usePayment';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import type { PaymentTransaction } from '@/services/payment.service';
import { TIME_SUBSCRIPTION_PLANS } from '@/lib/platform';

function formatDate(value?: string | null): string {
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

function resolvePlanLabel(tx: PaymentTransaction): string {
  const planId = tx.subscriptionPlanId || tx.assistancePlanId;
  const matched = TIME_SUBSCRIPTION_PLANS.find(
    (p) => p.id === planId || p.id.replace('plan_', 'assistance_') === planId
  );
  if (matched) return `${matched.name} (${matched.durationLabel})`;
  const hours = tx.subscriptionDurationHours || tx.assistanceDurationHours;
  if (hours === 24) return 'Découverte (24 heures)';
  if (hours === 72) return 'Populaire (3 jours)';
  if (hours === 168) return 'Confort & Pro (1 semaine)';
  return tx.reason || 'Abonnement TranoGasy';
}

function formatRemainingLabel(expiresAt: string | null | undefined, nowMs: number | null): string | null {
  if (!expiresAt || nowMs === null) return null;
  const diffMs = new Date(expiresAt).getTime() - nowMs;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}j ${hours}h restants` : `${days}j restant${days > 1 ? 's' : ''}`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}min restantes` : `${hours}h restantes`;
  return `${Math.max(1, mins)} min restantes`;
}

export function useAccountCommerce() {
  const {
    transactions,
    hasActiveSubscription,
    subscriptionPlanLabel,
    subscriptionExpiresAt,
    fetchWallet,
  } = usePayment();
  const [showHistory, setShowHistory] = useState(false);

  const confirmedTransactions = transactions.filter(
    (tx) => tx.status === 'confirmed'
  );

  return {
    balance: hasActiveSubscription ? 1 : 0,
    transactions: confirmedTransactions,
    planLabel: subscriptionPlanLabel,
    expiresAt: subscriptionExpiresAt,
    hasActiveSubscription,
    subscriptionPlanLabel,
    subscriptionExpiresAt,
    refreshCommerce: fetchWallet,
    showHistory,
    setShowHistory,
  };
}

export function AccountHeaderBadge({ balance }: { balance: number }) {
  const isActive = balance > 0;
  return (
    <Link
      href="/pricing"
      onClick={() => usePropertyDetailModalStore.getState().clearUnlockReturnContext()}
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-zinc-900 shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:scale-105 active:scale-95 transition-all"
    >
      {isActive ? (
        <CheckCircle2 className="w-4 h-4 text-brand-green" />
      ) : (
        <Crown className="w-4 h-4 text-amber-500" />
      )}
      <span className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-white">
        {isActive ? 'Pass actif' : "S'abonner"}
      </span>
    </Link>
  );
}

export function AccountWalletSection({
  balance,
  transactions,
  planLabel,
  expiresAt,
  onOpenHistory,
}: {
  balance: number;
  transactions: PaymentTransaction[];
  planLabel?: string | null;
  expiresAt?: string | null;
  onOpenHistory: () => void;
}) {
  const isActive = balance > 0;
  const latestConfirmed = transactions[0];
  const resolvedExpiresAt =
    expiresAt ||
    latestConfirmed?.subscriptionExpiresAt ||
    latestConfirmed?.assistanceExpiresAt ||
    null;

  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isActive || !resolvedExpiresAt) return;
    const syncNow = () => setNowMs(Date.now());
    const initTimer = setTimeout(syncNow, 0);
    const interval = setInterval(syncNow, 60000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [isActive, resolvedExpiresAt]);

  const activeOfferTitle =
    planLabel?.trim() ||
    (latestConfirmed ? resolvePlanLabel(latestConfirmed) : 'Pass actif');
  const remainingLabel = isActive ? formatRemainingLabel(resolvedExpiresAt, nowMs) : null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-2">
        <h3 className="text-base sm:text-lg font-bold text-zinc-800 dark:text-zinc-200">
          Mon Abonnement
        </h3>
        {transactions.length > 0 && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Historique ({transactions.length})</span>
          </button>
        )}
      </div>

      {/* Minimalistic Premium Gradient Card */}
      <Link
        href="/pricing"
        onClick={() => usePropertyDetailModalStore.getState().clearUnlockReturnContext()}
        className={`group relative block overflow-hidden rounded-[2rem] sm:rounded-[2.25rem] p-5 sm:p-6 text-white ring-1 transition-all duration-300 active:scale-[0.99] ${
          isActive
            ? 'bg-gradient-to-br from-[#0b2618] via-[#144a28] to-[#3f821c] ring-white/15 shadow-[0_16px_40px_-14px_rgba(20,74,40,0.45)]'
            : 'bg-gradient-to-br from-[#13161c] via-[#1b2420] to-[#233d20] ring-white/12 shadow-[0_16px_40px_-14px_rgba(15,20,24,0.4)]'
        }`}
      >
        {/* Subtle Single Ambient Sheen */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-20 w-60 h-60 rounded-full blur-3xl opacity-60"
          style={{
            background: isActive
              ? 'radial-gradient(circle, rgba(163,230,53,0.35) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(124,189,30,0.32) 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
        />

        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
              {isActive ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                  <span className="text-[#d4ff91]">Offre active</span>
                </>
              ) : (
                <>
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>Pass TranoGasy</span>
                </>
              )}
            </div>

            <div className="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight truncate">
              {isActive ? activeOfferTitle : 'Offres & Abonnements'}
            </div>

            <p className="text-xs sm:text-sm text-white/70 font-medium truncate">
              {isActive
                ? remainingLabel ||
                  (resolvedExpiresAt
                    ? `Expire le ${formatDate(resolvedExpiresAt)}`
                    : 'Accès illimité activé')
                : 'Aucun abonnement actif'}
            </p>
          </div>

          <span className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-white text-zinc-950 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.2)] group-hover:bg-zinc-100 group-hover:translate-x-0.5 transition-all whitespace-nowrap shrink-0">
            <span>{isActive ? 'Gérer' : 'Voir les offres'}</span>
            <ArrowRight className="w-4 h-4 stroke-[2.25]" />
          </span>
        </div>
      </Link>
    </section>
  );
}

export function AccountPricingMenuItem() {
  return (
    <Link
      href="/pricing"
      onClick={() => usePropertyDetailModalStore.getState().clearUnlockReturnContext()}
      className="block"
    >
      <div className="flex items-center justify-between p-4 hover:bg-[#F5F5F7] dark:hover:bg-zinc-800/60 transition-colors cursor-pointer rounded-full">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 shrink-0">
            <Crown className="w-5 h-5 text-amber-500" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <span className="font-semibold text-zinc-800 dark:text-zinc-100 block truncate">
              Abonnements & Tarifs
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 block truncate">
              Accès illimité dès 3 000 Ar (24h, 3j, 1 sem.)
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
  transactions: PaymentTransaction[];
  onClose: () => void;
}) {
  const [selectedTx, setSelectedTx] = useState<PaymentTransaction | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  if (!open) return null;

  const confirmedList = transactions.filter((tx) => tx.status === 'confirmed');

  const handleClose = () => {
    setSelectedTx(null);
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
            {selectedTx ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedTx(null);
                  setCopiedRef(false);
                }}
                aria-label="Retour"
                className="w-8 h-8 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <Clock className="w-4 h-4 text-zinc-500" />
            )}
            <h4 className="text-base font-bold text-zinc-900 dark:text-white">
              {selectedTx ? 'Détails du reçu' : 'Historique des abonnements'}
            </h4>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fermer"
            className="w-10 h-10 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-300/90 dark:border-zinc-600/80 shadow-xs text-zinc-800 dark:text-zinc-100 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 transition-all active:scale-90 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5 stroke-[2.25]" />
          </button>
        </div>

        {selectedTx ? (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="text-center space-y-1.5 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green/12 text-brand-green text-[11px] font-extrabold uppercase tracking-wider">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Abonnement confirmé
              </span>
              <div className="text-xl font-extrabold text-zinc-950 dark:text-white">
                {resolvePlanLabel(selectedTx)}
              </div>
            </div>

            <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">Référence</span>
                <button
                  type="button"
                  onClick={() => handleCopyRef(selectedTx.ref)}
                  className="inline-flex items-center gap-1.5 font-mono font-bold text-zinc-900 dark:text-white hover:text-brand-green transition-colors cursor-pointer"
                >
                  <span>{selectedTx.ref}</span>
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
                  {Number(selectedTx.amount).toLocaleString('fr-FR')} Ar
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Mode de paiement</span>
                <span className="font-bold text-zinc-900 dark:text-white">
                  {formatOperatorLabel(selectedTx.operator)}
                </span>
              </div>
              {selectedTx.phoneNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">Numéro</span>
                  <span className="font-bold text-zinc-900 dark:text-white">
                    {selectedTx.phoneNumber}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">Date</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatDate(selectedTx.created_at)}
                </span>
              </div>
              {(selectedTx.subscriptionExpiresAt || selectedTx.assistanceExpiresAt) && (
                <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  <span className="text-zinc-500 dark:text-zinc-400">Valable jusqu’au</span>
                  <span className="font-bold text-zinc-900 dark:text-white">
                    {formatDate(
                      selectedTx.subscriptionExpiresAt ||
                        selectedTx.assistanceExpiresAt
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : confirmedList.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Aucun abonnement confirmé pour le moment.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {confirmedList.map((tx) => (
              <button
                key={tx._id || tx.ref}
                type="button"
                onClick={() => setSelectedTx(tx)}
                className="w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#F5F5F7] hover:bg-zinc-200/70 dark:bg-zinc-800/60 dark:hover:bg-zinc-800 text-xs sm:text-sm text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-zinc-900 dark:text-white truncate">
                      {resolvePlanLabel(tx)}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {formatOperatorLabel(tx.operator)} • {formatDate(tx.created_at)}
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
