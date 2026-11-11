'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Phone,
  Plus,
  Minus,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  X,
  ExternalLink,
  RefreshCw,
  CreditCard,
  AlertCircle,
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
    createPapiPaymentLink,
    checkPaymentStatus,
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

  // Active Checkout Sheet state
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [checkoutStep, setCheckoutStep] =
    useState<'options' | 'waiting_papi'>('options');
  const [papiPaymentLink, setPapiPaymentLink] = useState<string | null>(null);
  const [papiRef, setPapiRef] = useState<string | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState<boolean>(false);
  const [urlBannerMessage, setUrlBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [selectedTokens, setSelectedTokens] = useState<number>(500);
  const [senderPhone, setSenderPhone] = useState<string>('');

  // Success receipt view
  const [completedTx, setCompletedTx] = useState<{
    transaction?: PaymentTransaction;
    tokensAdded: number;
    amountPaid: number;
    newBalance: number;
    operatorName: string;
  } | null>(null);

  const checkoutAmountAriary = useMemo(
    () => tokensToAriary(selectedTokens),
    [selectedTokens]
  );

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

  // Polling Papi status during waiting_papi step
  useEffect(() => {
    if (!checkoutModalOpen || checkoutStep !== 'waiting_papi' || !papiRef) {
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      if (!isMounted) return;
      setIsPollingStatus(true);
      try {
        const res = await checkPaymentStatus(papiRef);
        if (!isMounted) return;
        if (res.status === 'confirmed') {
          clearInterval(interval);
          setCheckoutModalOpen(false);
          setCheckoutStep('options');
          setCompletedTx({
            tokensAdded: res.tokens || selectedTokens,
            amountPaid: res.amount || checkoutAmountAriary,
            newBalance: res.balance ?? balance + (res.tokens || selectedTokens),
            operatorName: res.operator ? res.operator.toUpperCase() : 'Paiement en ligne',
          });
        }
      } finally {
        if (isMounted) setIsPollingStatus(false);
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [
    checkoutModalOpen,
    checkoutStep,
    papiRef,
    checkPaymentStatus,
    selectedTokens,
    checkoutAmountAriary,
    balance,
  ]);

  // Handle returning from Papi hosted checkout (redirect with query params)
  useEffect(() => {
    const paymentParam = searchParams.get('payment');
    const refParam = searchParams.get('ref');

    if (paymentParam === 'success' && refParam) {
      let active = true;
      const verifyReturn = async () => {
        try {
          const res = await checkPaymentStatus(refParam);
          if (active && res.status === 'confirmed') {
            setCompletedTx({
              tokensAdded: res.tokens || selectedTokens,
              amountPaid: res.amount || checkoutAmountAriary,
              newBalance:
                res.balance ?? balance + (res.tokens || selectedTokens),
              operatorName: res.operator ? res.operator.toUpperCase() : 'Paiement en ligne',
            });
            router.replace('/pricing');
          }
        } catch {
          // Ignore
        }
      };
      verifyReturn();
      return () => {
        active = false;
      };
    } else if (paymentParam === 'failed') {
      setUrlBannerMessage({
        type: 'error',
        text: 'La transaction de paiement a été annulée ou n’a pas abouti. Vous pouvez réessayer.',
      });
      router.replace('/pricing');
    }
  }, [
    searchParams,
    checkPaymentStatus,
    selectedTokens,
    checkoutAmountAriary,
    balance,
    router,
  ]);

  const activePlan = PRICING_PLANS[activePlanIndex];

  // Authoritative calculations
  const parsedCustomTokens = useMemo(() => {
    const cleaned = customTokenInput.replace(/\D/g, '');
    if (!cleaned) return 0;
    return Math.min(MAX_JP_TOKENS, parseInt(cleaned, 10));
  }, [customTokenInput]);

  const openCheckoutForTokens = (tokens: number) => {
    if (error) clearError();
    if (!isLoggedIn) {
      openModal('login');
      return;
    }
    const safeTokens = Math.max(MIN_JP_TOKENS, tokens);
    setSelectedTokens(safeTokens);
    setCheckoutStep('options');
    setPapiPaymentLink(null);
    setPapiRef(null);
    setCheckoutModalOpen(true);
  };

  const handlePapiCheckout = async () => {
    if (error) clearError();
    const res = await createPapiPaymentLink(selectedTokens, {
      payerPhone: senderPhone || undefined,
    });

    if (res.success && res.paymentLink && res.ref) {
      setPapiPaymentLink(res.paymentLink);
      setPapiRef(res.ref);
      setCheckoutStep('waiting_papi');

      try {
        const opened = window.open(
          res.paymentLink,
          '_blank',
          'noopener,noreferrer'
        );
        if (!opened || opened.closed || typeof opened.closed === 'undefined') {
          // If popup blocker intervened, user can use the button inside modal
        }
      } catch {
        // Fallback to modal button
      }
    }
  };

  const handleManualCheckStatus = async () => {
    if (!papiRef) return;
    setIsPollingStatus(true);
    try {
      const res = await checkPaymentStatus(papiRef);
      if (res.status === 'confirmed') {
        setCheckoutModalOpen(false);
        setCheckoutStep('options');
        setCompletedTx({
          tokensAdded: res.tokens || selectedTokens,
          amountPaid: res.amount || checkoutAmountAriary,
          newBalance: res.balance ?? balance + (res.tokens || selectedTokens),
          operatorName: res.operator ? res.operator.toUpperCase() : 'Paiement en ligne',
        });
      }
    } finally {
      setIsPollingStatus(false);
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
              <span className="text-zinc-500 dark:text-zinc-400">Mode de paiement</span>
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

      {/* Banner for redirect status notices */}
      {urlBannerMessage && (
        <div
          className={`max-w-md w-full mx-auto px-4 py-2.5 rounded-full text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in duration-200 shrink-0 my-1 ${
            urlBannerMessage.type === 'error'
              ? 'bg-red-500/12 text-red-600 dark:text-red-400'
              : 'bg-brand-green/15 text-brand-green'
          }`}
        >
          <div className="flex items-center gap-2 truncate pr-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{urlBannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setUrlBannerMessage(null)}
            className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

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
          <span>Paiement sécurisé : MVola • Orange Money • Airtel Money • Carte Bancaire</span>
        </div>
        <div>Échelle officielle : 100 JP = 1 000 Ariary (1 JP = 10 Ar)</div>
      </footer>

      {/* ====================================================================
          VIEW: CHECKOUT SHEET
          - Step 1 ('options'): Overview, payment badges, phone input, primary CTA
          - Step 2 ('waiting_papi'): Real-time polling & external payment link
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
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 sm:p-8 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200">
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

            {checkoutStep === 'waiting_papi' ? (
              /* ==========================================================
                 WAITING FOR PAYMENT CONFIRMATION
              ========================================================== */
              <div className="text-center space-y-4 py-1">
                <div className="relative mx-auto w-18 h-18 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-brand-green/20 animate-ping" />
                  <div className="relative w-16 h-16 rounded-full bg-brand-green/15 flex items-center justify-center text-brand-green">
                    <ShieldCheck className="w-9 h-9" />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-400 text-[11px] font-extrabold uppercase tracking-wider">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    En attente de paiement
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white tracking-tight">
                    Paiement sécurisé
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                    Validez votre paiement via MVola, Orange Money, Airtel Money ou Carte bancaire.
                  </p>
                </div>

                <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-4 text-xs space-y-2 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 dark:text-zinc-400">Montant à régler :</span>
                    <span className="font-extrabold text-sm text-zinc-900 dark:text-white">
                      {checkoutAmountAriary.toLocaleString('fr-FR')} Ar
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 dark:text-zinc-400">Jetons à créditer :</span>
                    <span className="font-extrabold text-amber-500">
                      +{selectedTokens.toLocaleString('fr-FR')} JP
                    </span>
                  </div>
                  {papiRef && (
                    <div className="flex justify-between items-center pt-1 border-t border-zinc-200 dark:border-zinc-700">
                      <span className="text-zinc-400 text-[11px]">Réf. :</span>
                      <span className="font-mono text-[11px] text-zinc-600 dark:text-zinc-300 truncate max-w-[190px]">
                        {papiRef}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 pt-1">
                  {papiPaymentLink && (
                    <a
                      href={papiPaymentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-12 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-extrabold text-xs sm:text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Accéder à la page de paiement</span>
                    </a>
                  )}

                  <button
                    type="button"
                    disabled={isPollingStatus}
                    onClick={handleManualCheckStatus}
                    className="w-full h-11 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isPollingStatus ? 'animate-spin' : ''
                      }`}
                    />
                    <span>
                      {isPollingStatus
                        ? 'Vérification en cours...'
                        : 'Vérifier la réception du paiement'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutStep('options');
                      setCheckoutModalOpen(false);
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-medium transition-colors pt-1 cursor-pointer block mx-auto"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              /* ==========================================================
                 STEP 1: OPTIONS & CHECKOUT
              ========================================================== */
              <>
                {/* Icon + Big Price Display */}
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

                {/* Gateway Trust Box with 4 Methods */}
                <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-green" />
                      Paiement sécurisé
                    </span>
                    <span className="text-brand-green font-extrabold">Instant</span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-2xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00703c] mb-1" />
                      <span className="text-[10px] font-extrabold text-zinc-800 dark:text-zinc-200">
                        MVola
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-2xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff6600] mb-1" />
                      <span className="text-[10px] font-extrabold text-zinc-800 dark:text-zinc-200">
                        Orange
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-2xs">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ed1c24] mb-1" />
                      <span className="text-[10px] font-extrabold text-zinc-800 dark:text-zinc-200">
                        Airtel
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-zinc-900 shadow-2xs">
                      <CreditCard className="w-3 h-3 text-blue-600 mb-0.5" />
                      <span className="text-[10px] font-extrabold text-zinc-800 dark:text-zinc-200">
                        Carte CB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Structured Line Items */}
                <div className="space-y-2.5 pt-1 text-xs sm:text-sm">
                  {/* Sender Phone */}
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="sender-phone-checkout"
                      className="text-zinc-500 dark:text-zinc-400 font-medium shrink-0 text-xs"
                    >
                      Numéro de contact
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

                {/* Tonal User Wallet box */}
                <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-3 flex items-center justify-between">
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

                {/* Primary CTA: Online Checkout */}
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handlePapiCheckout}
                  className="w-full h-14 rounded-full bg-zinc-950 hover:bg-zinc-900 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-950 font-extrabold text-sm sm:text-base shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Connexion en cours...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5 text-brand-green" />
                      <span>Payer</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
