'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  CheckCircle2,
  Phone,
  Plus,
  Minus,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  X,
  ChevronDown,
} from 'lucide-react';
import JpTokenIcon from '@/components/ui/JpTokenIcon';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { useAuth } from '@/hooks/useAuth';
import { usePayment } from '@/hooks/usePayment';
import {
  MIN_JP_TOKENS,
  MAX_JP_TOKENS,
  ARIARY_PER_JP,
  MOBILE_MONEY_OPERATORS,
  MobileMoneyOperatorId,
  tokensToAriary,
  PaymentTransaction,
} from '@/services/payment.service';

interface PricingPlan {
  id: string;
  tokens: number;
  name: string;
  badge?: string;
  isFeatured?: boolean;
  tagline: string;
  features: string[];
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'decouverte',
    tokens: 100,
    name: 'Découverte',
    badge: 'Minimum',
    isFeatured: false,
    tagline: 'Idéal pour débloquer vos premiers contacts et tester le service.',
    features: [
      '100 Jetons JP crédités immédiatement',
      'Déblocage direct des numéros propriétaires',
      'Sans abonnement ni expiration',
      'Paiement sécurisé MVola, Airtel, Orange',
    ],
  },
  {
    id: 'populaire',
    tokens: 500,
    name: 'Populaire',
    badge: 'Le plus choisi',
    isFeatured: true,
    tagline: 'Le pack recommandé pour trouver rapidement un logement.',
    features: [
      '500 Jetons JP crédités immédiatement',
      'Déblocage multiple de contacts vérifiés',
      'Accès prioritaire aux nouvelles annonces',
      'Validité illimitée de tous vos jetons',
      'Idéal particuliers & familles en recherche',
    ],
  },
  {
    id: 'pro',
    tokens: 1000,
    name: 'Confort & Pro',
    badge: 'Recommandé Pro',
    isFeatured: false,
    tagline: 'Pour les propriétaires actifs et les recherches intensives.',
    features: [
      '1 000 Jetons JP crédités immédiatement',
      'Publication & mise en avant d’annonces',
      'Déblocages de contacts en illimité',
      'Validité illimitée sans frais cachés',
      'Parfait pour bailleurs et professionnels',
    ],
  },
];

export default function PricingExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, initialize } = useUserStore();
  const openModal = useModalStore((state) => state.openModal);
  const { refreshUserSession } = useAuth();
  const {
    balance,
    isLoading,
    error,
    clearError,
    fetchWallet,
    purchaseTokens,
  } = usePayment();

  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;

  // Active view: 'packs' (Image 1 style) or 'custom' (montant libre)
  const [pricingMode, setPricingMode] = useState<'packs' | 'custom'>('packs');

  // Selected pack index for mobile carousel/tabs (default to index 1: Populaire)
  const [activePlanIndex, setActivePlanIndex] = useState<number>(1);

  // Custom token input (for 'custom' mode)
  const initialTokensParam = Number(searchParams.get('tokens'));
  const [customTokenInput, setCustomTokenInput] = useState<string>(
    initialTokensParam >= MIN_JP_TOKENS ? String(initialTokensParam) : '250'
  );

  // Active Checkout Sheet state (Image 3 style)
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [selectedTokens, setSelectedTokens] = useState<number>(500);
  const [selectedOperator, setSelectedOperator] =
    useState<MobileMoneyOperatorId>('mvola');
  const [senderPhone, setSenderPhone] = useState<string>('');
  const [copiedMerchant, setCopiedMerchant] = useState<boolean>(false);
  const [operatorDropdownOpen, setOperatorDropdownOpen] = useState<boolean>(false);

  // Success receipt view
  const [completedTx, setCompletedTx] = useState<{
    transaction?: PaymentTransaction;
    tokensAdded: number;
    amountPaid: number;
    newBalance: number;
    operatorName: string;
  } | null>(null);

  useEffect(() => {
    initialize();
    refreshUserSession();
    fetchWallet();
  }, [initialize, refreshUserSession, fetchWallet]);

  useEffect(() => {
    if (currentUser?.phone && !senderPhone) {
      setSenderPhone(String(currentUser.phone));
    }
  }, [currentUser?.phone, senderPhone]);

  const activePlan = PRICING_PLANS[activePlanIndex];

  // Authoritative calculations
  const parsedCustomTokens = useMemo(() => {
    const cleaned = customTokenInput.replace(/\D/g, '');
    if (!cleaned) return 0;
    return Math.min(MAX_JP_TOKENS, parseInt(cleaned, 10));
  }, [customTokenInput]);

  const checkoutAmountAriary = useMemo(
    () => tokensToAriary(selectedTokens),
    [selectedTokens]
  );

  const activeOperator = useMemo(
    () =>
      MOBILE_MONEY_OPERATORS.find((op) => op.id === selectedOperator) ||
      MOBILE_MONEY_OPERATORS[0],
    [selectedOperator]
  );

  const openCheckoutForTokens = (tokens: number) => {
    if (error) clearError();
    if (!isLoggedIn) {
      openModal('login');
      return;
    }
    const safeTokens = Math.max(MIN_JP_TOKENS, tokens);
    setSelectedTokens(safeTokens);
    setCheckoutModalOpen(true);
  };

  const handleCopyMerchantNumber = async () => {
    try {
      await navigator.clipboard.writeText(activeOperator.merchantNumber);
      setCopiedMerchant(true);
      setTimeout(() => setCopiedMerchant(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error) clearError();

    const cleanSender = senderPhone.replace(/\D/g, '');
    if (cleanSender.length < 9) {
      await purchaseTokens(selectedTokens, selectedOperator, senderPhone);
      return;
    }

    const res = await purchaseTokens(
      selectedTokens,
      selectedOperator,
      senderPhone
    );

    if (res.success) {
      setCheckoutModalOpen(false);
      setCompletedTx({
        transaction: res.transaction,
        tokensAdded: selectedTokens,
        amountPaid: checkoutAmountAriary,
        newBalance: res.newBalance ?? balance + selectedTokens,
        operatorName: activeOperator.name,
      });
    }
  };

  // ============================================================================
  // VIEW: PAYMENT COMPLETED RECEIPT (Compact single-screen)
  // ============================================================================
  if (completedTx) {
    return (
      <div className="h-[100dvh] max-h-[100dvh] bg-[#F5F5F7] dark:bg-zinc-950 flex flex-col justify-between p-4 sm:p-6 font-sans select-none overflow-hidden">
        {/* Top bar */}
        <div className="max-w-md w-full mx-auto flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => router.push('/account')}
            className="h-10 px-4 rounded-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-xs font-semibold flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Mon compte</span>
          </button>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-900 dark:text-white shadow-xs">
            <JpTokenIcon size={18} />
            <span>{completedTx.newBalance.toLocaleString('fr-FR')} JP</span>
          </div>
        </div>

        {/* Center Receipt Card */}
        <div className="max-w-md w-full mx-auto bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 text-center space-y-5 shadow-xl animate-in zoom-in-95 duration-200">
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
            <JpTokenIcon size={76} glow priority />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-green text-white flex items-center justify-center shadow-md">
              <Check className="w-4 h-4" strokeWidth={3} />
            </span>
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green/12 text-brand-green text-[11px] font-extrabold uppercase tracking-wider">
              <CheckCircle2 className="w-3 h-3" />
              Recharge réussie
            </span>
            <div className="text-3xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
              +{completedTx.tokensAdded.toLocaleString('fr-FR')} JP
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Crédits ajoutés sur votre compte TranoGasy.
            </p>
          </div>

          <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-[1.75rem] p-4 space-y-2.5 text-xs text-left">
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Opérateur</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                {completedTx.operatorName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Montant payé</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                {completedTx.amountPaid.toLocaleString('fr-FR')} Ar
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Nouveau solde</span>
              <span className="font-extrabold text-brand-green inline-flex items-center gap-1">
                <JpTokenIcon size={14} />
                {completedTx.newBalance.toLocaleString('fr-FR')} JP
              </span>
            </div>
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setCompletedTx(null)}
              className="flex-1 h-12 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer"
            >
              Autre pack
            </button>
            <button
              type="button"
              onClick={() => router.push('/account')}
              className="flex-1 h-12 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
            >
              Voir mon compte
            </button>
          </div>
        </div>

        <div className="text-center text-[11px] text-zinc-400">
          TranoGasy • Système de jetons JP (100 JP = 1 000 Ar)
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN VIEW: NO-SCROLL MINIMALIST PRICING (Image 1 Style)
  // ============================================================================
  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-[#F5F5F7] dark:bg-zinc-950 text-zinc-900 dark:text-white font-sans selection:bg-brand-green/20 relative flex flex-col justify-between p-3.5 sm:p-5 lg:p-6 overflow-hidden select-none">
      {/* ── TOP BAR: Navigation, Title & Segmented Toggle (Matching Image 1) ── */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/account');
              }
            }}
            aria-label="Retour"
            className="w-10 h-10 rounded-full bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center justify-center shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2.2} />
          </button>

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-none">
              Tarifs JP
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5 hidden xs:block">
              100 JP = 1 000 Ar • Min. 100 JP
            </p>
          </div>
        </div>

        {/* Right side: Apple Segmented Pill Toggle (Packs / Libre) + User Balance */}
        <div className="flex items-center gap-2">
          {/* Segmented Pill matching Image 1 top right */}
          <div className="bg-[#E5E5EA] dark:bg-zinc-800/90 p-1 rounded-full flex items-center gap-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setPricingMode('packs')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                pricingMode === 'packs'
                  ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Packs
            </button>
            <button
              type="button"
              onClick={() => setPricingMode('custom')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                pricingMode === 'custom'
                  ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              Libre
            </button>
          </div>

          {/* Quick Balance indicator */}
          <Link
            href="/account"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 text-xs font-extrabold shadow-xs hover:scale-105 active:scale-95 transition-all shrink-0"
          >
            <JpTokenIcon size={16} />
            <span>{balance.toLocaleString('fr-FR')} JP</span>
          </Link>
        </div>
      </header>

      {/* ── CORE CONTENT AREA: Fills remaining height cleanly with ZERO SCROLL ── */}
      <main className="max-w-5xl w-full mx-auto flex-1 flex flex-col justify-center items-center my-auto min-h-0 py-2 sm:py-3">
        {pricingMode === 'packs' ? (
          <>
            {/* Mobile-only Pack Indicators (Dash / dots matching Image 1 top right of card: — • •) */}
            <div className="flex md:hidden items-center justify-center gap-2 mb-2 shrink-0">
              {PRICING_PLANS.map((plan, idx) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setActivePlanIndex(idx)}
                  aria-label={`Afficher ${plan.name}`}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    activePlanIndex === idx
                      ? 'w-7 bg-zinc-950 dark:bg-white'
                      : 'w-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400'
                  }`}
                />
              ))}
            </div>

            {/* Mobile Tab Buttons */}
            <div className="flex md:hidden items-center justify-center gap-1.5 mb-2.5 w-full shrink-0">
              {PRICING_PLANS.map((plan, idx) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setActivePlanIndex(idx)}
                  className={`flex-1 py-1.5 px-2 rounded-full text-[11px] font-bold truncate transition-all cursor-pointer ${
                    activePlanIndex === idx
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                      : 'bg-white/80 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {plan.tokens} JP
                </button>
              ))}
            </div>

            {/* Desktop: 3 Cards side-by-side | Mobile: Active single card (matching Image 1) */}
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 items-stretch max-h-[calc(100dvh-150px)]">
              {PRICING_PLANS.map((plan, idx) => {
                const isFeatured = plan.isFeatured;
                const isMobileActive = activePlanIndex === idx;
                const priceAr = tokensToAriary(plan.tokens);

                return (
                  <div
                    key={plan.id}
                    className={`rounded-[2.25rem] p-5 sm:p-6 lg:p-7 flex flex-col justify-between transition-all duration-300 select-none ${
                      /* Mobile display: only the active tab is shown */
                      isMobileActive ? 'flex' : 'hidden md:flex'
                    } ${
                      isFeatured
                        ? 'bg-zinc-950 text-white dark:bg-zinc-900 shadow-xl md:scale-[1.03] z-10'
                        : 'bg-white text-zinc-900 dark:bg-zinc-900/90 dark:text-white shadow-sm'
                    }`}
                  >
                    {/* Card Top: Plan Name & Badge */}
                    <div className="space-y-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm sm:text-base font-extrabold tracking-tight ${
                            isFeatured
                              ? 'text-white'
                              : 'text-zinc-900 dark:text-white'
                          }`}
                        >
                          {plan.name}
                        </span>

                        {plan.badge && (
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                              isFeatured
                                ? 'bg-amber-400 text-zinc-950'
                                : 'bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            {plan.badge}
                          </span>
                        )}
                      </div>

                      {/* Big Price Headline (Image 1 style) */}
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight leading-none">
                            {priceAr.toLocaleString('fr-FR')}
                          </span>
                          <span
                            className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${
                              isFeatured
                                ? 'text-zinc-300'
                                : 'text-zinc-500 dark:text-zinc-400'
                            }`}
                          >
                            Ar
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <JpTokenIcon size={18} />
                          <span
                            className={`text-xs font-bold ${
                              isFeatured
                                ? 'text-amber-400'
                                : 'text-brand-green'
                            }`}
                          >
                            {plan.tokens.toLocaleString('fr-FR')} Jetons JP
                          </span>
                        </div>
                      </div>

                      <p
                        className={`text-[12px] leading-relaxed line-clamp-2 ${
                          isFeatured
                            ? 'text-zinc-300 dark:text-zinc-400'
                            : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {plan.tagline}
                      </p>

                      {/* Feature Checklist (Image 1 style with green checkmarks) */}
                      <div className="space-y-2 pt-2 border-t border-zinc-200/40 dark:border-zinc-800/60">
                        {plan.features.map((feat, fIdx) => (
                          <div
                            key={fIdx}
                            className="flex items-center gap-2.5 text-xs font-medium"
                          >
                            <span className="w-4 h-4 rounded-full bg-brand-green/20 text-brand-green flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5" strokeWidth={3} />
                            </span>
                            <span
                              className={`truncate ${
                                isFeatured
                                  ? 'text-zinc-200'
                                  : 'text-zinc-700 dark:text-zinc-300'
                              }`}
                            >
                              {feat}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Big Padded Action Button at Card Bottom (Matching Image 1) */}
                    <div className="pt-4 sm:pt-5">
                      <button
                        type="button"
                        onClick={() => openCheckoutForTokens(plan.tokens)}
                        className={`w-full h-13 sm:h-14 px-6 rounded-full font-bold text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          isFeatured
                            ? 'bg-white text-zinc-950 hover:bg-zinc-100'
                            : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100'
                        }`}
                      >
                        <JpTokenIcon size={20} />
                        <span>Acheter {plan.tokens} JP</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* ================================================================
              VIEW: MONTANT LIBRE (Custom Tokens Studio - Fits in single viewport)
          ================================================================ */
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 shadow-lg flex flex-col justify-between space-y-6">
            <div className="text-center space-y-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-brand-green">
                Montant libre
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
                Choisissez vos jetons JP
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Achetez exactement la quantité souhaitée (minimum 100 JP).
              </p>
            </div>

            {/* Stepper Input */}
            <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-[2rem] p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(
                      MIN_JP_TOKENS,
                      (parsedCustomTokens || MIN_JP_TOKENS) - 50
                    );
                    setCustomTokenInput(String(next));
                  }}
                  className="w-12 h-12 rounded-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white flex items-center justify-center shadow-xs active:scale-90 transition-all cursor-pointer"
                >
                  <Minus className="w-5 h-5" strokeWidth={2.5} />
                </button>

                <div className="text-center min-w-0">
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customTokenInput}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setCustomTokenInput(digits);
                      }}
                      onBlur={() => {
                        if (!parsedCustomTokens || parsedCustomTokens < MIN_JP_TOKENS) {
                          setCustomTokenInput(String(MIN_JP_TOKENS));
                        }
                      }}
                      className="w-28 text-center text-4xl font-extrabold bg-transparent text-zinc-950 dark:text-white outline-none"
                    />
                    <span className="text-lg font-extrabold text-amber-500">JP</span>
                  </div>
                  <div className="text-xs font-bold text-brand-green mt-0.5">
                    ={(
                      (parsedCustomTokens < MIN_JP_TOKENS
                        ? MIN_JP_TOKENS
                        : parsedCustomTokens) * ARIARY_PER_JP
                    ).toLocaleString('fr-FR')}{' '}
                    Ariary
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(
                      MAX_JP_TOKENS,
                      (parsedCustomTokens || MIN_JP_TOKENS) + 50
                    );
                    setCustomTokenInput(String(next));
                  }}
                  className="w-12 h-12 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-xs active:scale-90 transition-all cursor-pointer"
                >
                  <Plus className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center justify-center gap-2 pt-1">
                {[100, 250, 500, 1000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCustomTokenInput(String(val))}
                    className="px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950 hover:text-white active:scale-95 transition-all cursor-pointer shadow-2xs"
                  >
                    {val} JP
                  </button>
                ))}
              </div>
            </div>

            {/* Big Action Button */}
            <button
              type="button"
              onClick={() => {
                const finalTokens =
                  parsedCustomTokens < MIN_JP_TOKENS
                    ? MIN_JP_TOKENS
                    : parsedCustomTokens;
                openCheckoutForTokens(finalTokens);
              }}
              className="w-full h-14 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <JpTokenIcon size={20} />
              <span>
                Recharger{' '}
                {(parsedCustomTokens < MIN_JP_TOKENS
                  ? MIN_JP_TOKENS
                  : parsedCustomTokens
                ).toLocaleString('fr-FR')}{' '}
                JP
              </span>
            </button>
          </div>
        )}
      </main>

      {/* ── FOOTER: Single-line Apple reference & Trust info ── */}
      <footer className="max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0 pt-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-green shrink-0" />
          <span>Mobile Money : MVola • Airtel Money • Orange Money</span>
        </div>
        <div>Échelle officielle : 100 JP = 1 000 Ariary (1 JP = 10 Ar)</div>
      </footer>

      {/* ====================================================================
          VIEW: LAST PAYMENT STEP SHEET (Matching Image 3 Design Rules)
          - Bottom sheet / Apple modal
          - Large icon at top
          - Big bold price (e.g. 5 000 Ar)
          - Structured line items (Pay with, Recipients, License, Total Pay)
          - Tonal wallet section
          - Big black button "Deposit" / "Payer avec..."
          - Zero double borders
      ==================================================================== */}
      {checkoutModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isLoading) {
              setCheckoutModalOpen(false);
            }
          }}
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-5 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
            {/* Top Close icon */}
            <div className="flex items-center justify-end -mt-1 -mr-1">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setCheckoutModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-500 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Icon + Big Price Display matching Image 3 */}
            <div className="text-center space-y-1.5 -mt-3">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-400/10 mb-1">
                <JpTokenIcon size={48} glow priority />
              </div>
              <div className="text-4xl sm:text-[44px] font-extrabold tracking-tight text-zinc-950 dark:text-white leading-none">
                {checkoutAmountAriary.toLocaleString('fr-FR')}{' '}
                <span className="text-xl sm:text-2xl font-bold">Ar</span>
              </div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {selectedTokens.toLocaleString('fr-FR')} JP • Monnaie TranoGasy
              </p>
            </div>

            {/* Structured Line Items matching Image 3 (Pay With, Recipients, etc.) */}
            <div className="space-y-3 pt-2 text-sm">
              {/* Pay With row */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Payer avec
                </span>

                {/* Operator Selector Pills */}
                <div className="flex items-center gap-1.5 bg-[#F5F5F7] dark:bg-zinc-800 p-1 rounded-full">
                  {MOBILE_MONEY_OPERATORS.map((op) => {
                    const isSelected = selectedOperator === op.id;
                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => setSelectedOperator(op.id)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: op.accentColor }}
                        />
                        <span>{op.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recipients row */}
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Destinataire
                </span>
                <button
                  type="button"
                  onClick={handleCopyMerchantNumber}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-xs font-bold text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer"
                >
                  <span>{activeOperator.merchantNumberFormatted}</span>
                  {copiedMerchant ? (
                    <Check className="w-3 h-3 text-brand-green" />
                  ) : (
                    <Copy className="w-3 h-3 text-zinc-400" />
                  )}
                </button>
              </div>

              {/* Sender Phone row */}
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="sender-phone-checkout"
                  className="text-zinc-500 dark:text-zinc-400 font-medium shrink-0"
                >
                  Votre numéro
                </label>
                <input
                  id="sender-phone-checkout"
                  type="tel"
                  inputMode="numeric"
                  value={senderPhone}
                  onChange={(e) => {
                    if (error) clearError();
                    setSenderPhone(e.target.value);
                  }}
                  placeholder="034 00 000 00"
                  className="w-36 text-right px-3 py-1.5 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-xs font-extrabold text-zinc-950 dark:text-white outline-none focus:ring-2 focus:ring-brand-green/40 transition-all"
                  required
                />
              </div>

              {/* Total Pay row */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Total à payer
                </span>
                <span className="text-base font-extrabold text-zinc-950 dark:text-white">
                  {checkoutAmountAriary.toLocaleString('fr-FR')} Ar
                </span>
              </div>
            </div>

            {/* Tonal User Wallet box matching Image 3 bottom "ORB WALLET" */}
            <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-400">
                  Portefeuille TranoGasy
                </div>
                <div className="text-xs font-extrabold text-zinc-900 dark:text-white mt-0.5">
                  Solde actuel : {balance.toLocaleString('fr-FR')} JP
                </div>
              </div>
              <JpTokenIcon size={24} />
            </div>

            {error && (
              <div className="px-4 py-2.5 rounded-full bg-red-500/12 text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {error}
              </div>
            )}

            {/* Big Black Deposit / Pay CTA button matching Image 3 */}
            <button
              type="button"
              disabled={isLoading}
              onClick={handleConfirmPayment}
              className="w-full h-15 rounded-full bg-zinc-950 hover:bg-zinc-900 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-extrabold text-sm sm:text-base shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Validation du transfert...</span>
                </>
              ) : (
                <span>Payer avec {activeOperator.name}</span>
              )}
            </button>

            <div className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
              Paiement sécurisé par Mobile Money
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
