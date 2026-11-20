'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Phone,
  Loader2,
  ShieldCheck,
  X,
  ExternalLink,
  RefreshCw,
  CreditCard,
  AlertCircle,
  Headset,
  Receipt,
  Clock,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { usePropertyStore } from '@/store/propertyStore';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import { propertyService, resolvePropertyHref } from '@/services/property.service';
import { useAuth } from '@/hooks/useAuth';
import { useAssistance } from '@/hooks/useAssistance';
import {
  AGENCY_ASSISTANCE_PLANS,
  AGENCY_SUPPORT_PHONE_DISPLAY,
  AGENCY_SUPPORT_PHONE_TEL,
  AgencyAssistancePlan,
} from '@/lib/platform';

export default function PricingExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, initialize } = useUserStore();
  const openModal = useModalStore((state) => state.openModal);
  const { refreshUserSession } = useAuth();
  const {
    hasActiveAssistance,
    assistancePlanLabel,
    isLoading,
    error,
    clearError,
    fetchAssistanceHistory,
    createAssistancePaymentLink,
    checkAssistancePaymentStatus,
  } = useAssistance();

  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;

  const [activePlanIndex, setActivePlanIndex] = useState<number>(1);
  const [selectedPlan, setSelectedPlan] = useState<AgencyAssistancePlan>(
    AGENCY_ASSISTANCE_PLANS[1]
  );
  const [pendingPlanAfterLogin, setPendingPlanAfterLogin] =
    useState<AgencyAssistancePlan | null>(null);

  // Active Checkout Sheet state
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [checkoutStep, setCheckoutStep] = useState<'options' | 'waiting_papi'>('options');
  const [papiPaymentLink, setPapiPaymentLink] = useState<string | null>(null);
  const [papiRef, setPapiRef] = useState<string | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState<boolean>(false);
  const [dismissedFailedBanner, setDismissedFailedBanner] = useState<boolean>(false);

  const [senderPhoneOverride, setSenderPhoneOverride] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const senderPhone = senderPhoneOverride ?? String(currentUser?.phone || '');
  const showFailedBanner =
    searchParams.get('payment') === 'failed' && !dismissedFailedBanner;

  // Official Agency Assistance Receipt view
  const [completedReceipt, setCompletedReceipt] = useState<{
    ref: string;
    planLabel: string;
    amountPaid: number;
    operatorName: string;
  } | null>(null);

  const returnToOriginProperty = useCallback(
    async (options?: { unlocked?: boolean }): Promise<boolean> => {
      const modalStore = usePropertyDetailModalStore.getState();
      const returnCtx = modalStore.getUnlockReturnContext();
      if (!returnCtx || !returnCtx.propertyId) {
        return false;
      }

      let targetProperty =
        usePropertyStore.getState().getProperty(returnCtx.propertyId) ||
        returnCtx.propertySnapshot ||
        null;

      if (options?.unlocked) {
        try {
          const fresh = await propertyService.getPropertyById(returnCtx.propertyId);
          if (fresh) {
            targetProperty = fresh;
            usePropertyStore.getState().addProperty(fresh);
            modalStore.updateInitialProperty(fresh);
          }
        } catch {
          // Fallback to snapshot; useProperty will also re-fetch
        }
      }

      modalStore.clearUnlockReturnContext();
      if (returnCtx.openContactModal) {
        modalStore.setAutoOpenContactForPropertyId(returnCtx.propertyId);
      }

      if (returnCtx.wasModal) {
        modalStore.openPropertyDetail(returnCtx.propertyId, targetProperty);
        const destUrl =
          returnCtx.originUrl &&
          !returnCtx.originUrl.startsWith('/pricing') &&
          !returnCtx.originUrl.startsWith('/properties/')
            ? returnCtx.originUrl
            : '/';
        router.replace(destUrl);
      } else {
        router.replace(resolvePropertyHref(returnCtx.propertyId));
      }

      return true;
    },
    [router]
  );

  useEffect(() => {
    initialize();
    refreshUserSession();
    fetchAssistanceHistory();
  }, [initialize, refreshUserSession, fetchAssistanceHistory]);

  // Automatically open checkout modal once user finishes logging in on /pricing
  useEffect(() => {
    if (isLoggedIn && pendingPlanAfterLogin) {
      const planToOpen = pendingPlanAfterLogin;
      setPendingPlanAfterLogin(null);
      setSelectedPlan(planToOpen);
      setCheckoutStep('options');
      setCheckoutNotice(null);
      setPapiPaymentLink(null);
      setPapiRef(null);
      setCheckoutModalOpen(true);
    }
  }, [isLoggedIn, pendingPlanAfterLogin]);

  // Poll Papi payment status while waiting
  useEffect(() => {
    if (!checkoutModalOpen || checkoutStep !== 'waiting_papi' || !papiRef) {
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      if (!isMounted) return;
      setIsPollingStatus(true);
      try {
        const res = await checkAssistancePaymentStatus(papiRef);
        if (!isMounted) return;
        if (res.status === 'confirmed') {
          clearInterval(interval);
          setCheckoutModalOpen(false);
          setCheckoutStep('options');
          setCheckoutNotice(null);
          usePropertyStore.getState().clearUserProperties();
          usePropertyStore.getState().invalidateLockedPropertiesCache();
          await refreshUserSession();
          const didReturn = await returnToOriginProperty({ unlocked: true });
          if (didReturn || !isMounted) return;
          setCompletedReceipt({
            ref: res.ref || papiRef,
            planLabel: res.assistancePlanLabel || selectedPlan.durationLabel,
            amountPaid: res.amount || selectedPlan.amount,
            operatorName: res.operator ? res.operator.toUpperCase() : 'Mobile Money',
          });
        } else if (res.status === 'failed' || res.status === 'refused') {
          clearInterval(interval);
          setCheckoutStep('options');
          setCheckoutNotice(
            res.failureReason || 'Le paiement a été annulé ou n’a pas abouti.'
          );
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
    checkAssistancePaymentStatus,
    selectedPlan,
    refreshUserSession,
    returnToOriginProperty,
  ]);

  // Handle redirect return from Papi checkout
  useEffect(() => {
    const paymentParam = searchParams.get('payment');
    const refParam = searchParams.get('ref');

    if (paymentParam === 'success' && refParam) {
      let active = true;
      const verifyReturn = async () => {
        try {
          const res = await checkAssistancePaymentStatus(refParam);
          if (active && res.status === 'confirmed') {
            usePropertyStore.getState().clearUserProperties();
            usePropertyStore.getState().invalidateLockedPropertiesCache();
            await refreshUserSession();
            const didReturn = await returnToOriginProperty({ unlocked: true });
            if (didReturn || !active) return;
            setCompletedReceipt({
              ref: res.ref || refParam,
              planLabel: res.assistancePlanLabel || selectedPlan.durationLabel,
              amountPaid: res.amount || selectedPlan.amount,
              operatorName: res.operator ? res.operator.toUpperCase() : 'Mobile Money',
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
    }
  }, [
    searchParams,
    checkAssistancePaymentStatus,
    selectedPlan,
    router,
    refreshUserSession,
    returnToOriginProperty,
  ]);

  const openCheckoutForPlan = (plan: AgencyAssistancePlan) => {
    if (error) clearError();
    if (!isLoggedIn) {
      setPendingPlanAfterLogin(plan);
      openModal('login');
      return;
    }
    setSelectedPlan(plan);
    setCheckoutStep('options');
    setCheckoutNotice(null);
    setPapiPaymentLink(null);
    setPapiRef(null);
    setCheckoutModalOpen(true);
  };

  const handlePapiCheckout = async () => {
    if (error) clearError();
    setCheckoutNotice(null);
    const res = await createAssistancePaymentLink(selectedPlan.id, {
      payerPhone: senderPhone || undefined,
    });

    if (res.success && res.paymentLink && res.ref) {
      setPapiPaymentLink(res.paymentLink);
      setPapiRef(res.ref);
      setCheckoutStep('waiting_papi');

      try {
        window.open(res.paymentLink, '_blank', 'noopener,noreferrer');
      } catch {
        // Fallback to button inside modal
      }
    }
  };

  const handleManualCheckStatus = async () => {
    if (!papiRef) return;
    setIsPollingStatus(true);
    try {
      const res = await checkAssistancePaymentStatus(papiRef);
      if (res.status === 'confirmed') {
        setCheckoutModalOpen(false);
        setCheckoutStep('options');
        setCheckoutNotice(null);
        usePropertyStore.getState().clearUserProperties();
        usePropertyStore.getState().invalidateLockedPropertiesCache();
        await refreshUserSession();
        const didReturn = await returnToOriginProperty({ unlocked: true });
        if (didReturn) return;
        setCompletedReceipt({
          ref: res.ref || papiRef,
          planLabel: res.assistancePlanLabel || selectedPlan.durationLabel,
          amountPaid: res.amount || selectedPlan.amount,
          operatorName: res.operator ? res.operator.toUpperCase() : 'Mobile Money',
        });
      } else if (res.status === 'failed' || res.status === 'refused') {
        setCheckoutStep('options');
        setCheckoutNotice(
          res.failureReason || 'Le paiement a été annulé ou n’a pas abouti.'
        );
      } else {
        setCheckoutNotice('Paiement toujours en attente de validation.');
      }
    } finally {
      setIsPollingStatus(false);
    }
  };

  // ============================================================================
  // VIEW: ASSISTANCE RECEIPT
  // ============================================================================
  if (completedReceipt) {
    return (
      <div className="fixed inset-0 z-[130] w-full h-[100dvh] max-h-[100dvh] bg-[#F5F5F7] dark:bg-zinc-950 flex flex-col justify-between p-4 pt-[calc(1rem+var(--ios-safe-top))] sm:p-6 sm:pt-[calc(1.5rem+var(--ios-safe-top))] font-sans select-none overflow-hidden">
        <div className="max-w-md w-full mx-auto flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => router.push('/account')}
            className="h-10 px-4 rounded-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white text-xs font-semibold flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Mon compte</span>
          </button>
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white dark:bg-zinc-900 text-xs font-bold text-brand-green shadow-xs">
            <Receipt className="w-3.5 h-3.5" />
            <span>Reçu valide</span>
          </span>
        </div>

        <div className="max-w-md w-full mx-auto bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 text-center space-y-5 shadow-xl animate-in zoom-in-95 duration-200">
          <div className="relative mx-auto w-20 h-20 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center">
            <Headset className="w-9 h-9" />
            <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-green text-white flex items-center justify-center shadow-md">
              <Check className="w-4 h-4" strokeWidth={3} />
            </span>
          </div>

          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green/12 text-brand-green text-[11px] font-extrabold uppercase tracking-wider">
              <CheckCircle2 className="w-3 h-3" />
              Reçu d&apos;assistance
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
              {completedReceipt.planLabel}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Plus d&apos;informations par agent et mise en relation TranoGasy
            </p>
          </div>

          <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-[1.75rem] p-4 space-y-2.5 text-xs text-left">
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Référence reçu</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-white">
                {completedReceipt.ref}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Mode de paiement</span>
              <span className="font-bold text-zinc-900 dark:text-white">
                {completedReceipt.operatorName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Montant réglé</span>
              <span className="font-extrabold text-brand-green">
                {completedReceipt.amountPaid.toLocaleString('fr-FR')} Ar
              </span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <a
              href={`tel:${AGENCY_SUPPORT_PHONE_TEL}`}
              className="w-full h-12 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-extrabold text-xs shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Phone className="w-4 h-4" />
              <span>Appeler l&apos;agence ({AGENCY_SUPPORT_PHONE_DISPLAY})</span>
            </a>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setCompletedReceipt(null)}
                className="flex-1 h-11 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 transition-all cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => router.push('/account')}
                className="flex-1 h-11 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Mon compte
              </button>
            </div>
          </div>
        </div>

        <div className="text-center text-[11px] text-zinc-400">
          TranoGasy • Service client : {AGENCY_SUPPORT_PHONE_DISPLAY}
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN VIEW: MINIMALISTIC AGENCY ASSISTANCE
  // ============================================================================
  return (
    <div className="fixed inset-0 z-[130] w-full h-[100dvh] max-h-[100dvh] bg-[#F5F5F7] dark:bg-zinc-950 text-zinc-900 dark:text-white font-sans selection:bg-brand-green/20 flex flex-col justify-between p-3.5 pt-[calc(0.875rem+var(--ios-safe-top))] sm:p-5 sm:pt-[calc(1.25rem+var(--ios-safe-top))] lg:p-6 overflow-hidden select-none">
      {/* Header (Minimalist — No subtitle) */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              const didReturn = await returnToOriginProperty({
                unlocked: hasActiveAssistance,
              });
              if (didReturn) return;
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

          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-none">
            Assistance Tranogasy
          </h1>
        </div>

        {hasActiveAssistance && (
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-green/12 text-brand-green text-xs font-extrabold shrink-0"
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>{assistancePlanLabel || 'Active'}</span>
          </Link>
        )}
      </header>

      {showFailedBanner && (
        <div className="max-w-md w-full mx-auto px-4 py-2.5 rounded-full text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in duration-200 shrink-0 my-1 bg-red-500/12 text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2 truncate pr-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">Le paiement a été annulé ou n’a pas abouti.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setDismissedFailedBanner(true);
              router.replace('/pricing');
            }}
            className="w-5 h-5 rounded-full hover:bg-black/10 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 3 Minimalist Cards */}
      <main className="max-w-5xl w-full mx-auto flex-1 flex flex-col justify-center items-center my-auto min-h-0 py-2 sm:py-3">
        {/* Mobile Indicators */}
        <div className="flex md:hidden items-center justify-center gap-2 mb-2 shrink-0">
          {AGENCY_ASSISTANCE_PLANS.map((plan, idx) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setActivePlanIndex(idx)}
              aria-label={`Afficher ${plan.durationLabel}`}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                activePlanIndex === idx
                  ? 'w-7 bg-zinc-950 dark:bg-white'
                  : 'w-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400'
              }`}
            />
          ))}
        </div>

        {/* Mobile Tab Buttons */}
        <div className="flex md:hidden items-center justify-center gap-1.5 mb-3 w-full shrink-0">
          {AGENCY_ASSISTANCE_PLANS.map((plan, idx) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setActivePlanIndex(idx)}
              className={`flex-1 py-2 px-2 rounded-full text-[11px] font-bold truncate transition-all cursor-pointer ${
                activePlanIndex === idx
                  ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                  : 'bg-white/80 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {plan.durationLabel}
            </button>
          ))}
        </div>

        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 items-stretch max-h-[calc(100dvh-160px)]">
          {AGENCY_ASSISTANCE_PLANS.map((plan, idx) => {
            const isFeatured = Boolean(plan.isFeatured);
            const isMobileActive = activePlanIndex === idx;

            return (
              <div
                key={plan.id}
                className={`rounded-[2.25rem] p-5 sm:p-6 lg:p-7 flex flex-col justify-between transition-all duration-300 select-none ${
                  isMobileActive ? 'flex' : 'hidden md:flex'
                } ${
                  isFeatured
                    ? 'bg-zinc-950 text-white dark:bg-zinc-900 shadow-xl md:scale-[1.03] z-10'
                    : 'bg-white text-zinc-900 dark:bg-zinc-900/90 dark:text-white shadow-sm'
                }`}
              >
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm sm:text-base font-extrabold tracking-tight ${
                        isFeatured ? 'text-white' : 'text-zinc-900 dark:text-white'
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

                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight leading-none">
                        {plan.amount.toLocaleString('fr-FR')}
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${
                          isFeatured ? 'text-zinc-300' : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        Ar
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Clock
                        className={`w-3.5 h-3.5 ${
                          isFeatured ? 'text-amber-400' : 'text-brand-green'
                        }`}
                      />
                      <span
                        className={`text-xs font-bold ${
                          isFeatured ? 'text-amber-400' : 'text-brand-green'
                        }`}
                      >
                        {plan.durationLabel}
                      </span>
                    </div>
                  </div>

                  <p
                    className={`text-xs font-medium ${
                      isFeatured ? 'text-zinc-300' : 'text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {plan.description}
                  </p>
                </div>

                <div className="pt-5 sm:pt-6">
                  <button
                    type="button"
                    onClick={() => openCheckoutForPlan(plan)}
                    className={`w-full h-13 sm:h-14 px-6 rounded-full font-bold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer ${
                      isFeatured
                        ? 'bg-white text-zinc-950 hover:bg-zinc-100'
                        : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100'
                    }`}
                  >
                    Payer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto flex items-center justify-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0 pt-1">
        <ShieldCheck className="w-4 h-4 text-brand-green shrink-0" />
        <span>MVola • Orange Money • Airtel Money • Carte Bancaire</span>
      </footer>

      {/* Checkout Modal */}
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
                    <span className="text-zinc-500 dark:text-zinc-400">Offre :</span>
                    <span className="font-bold text-zinc-900 dark:text-white">
                      {selectedPlan.durationLabel}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 dark:text-zinc-400">Montant :</span>
                    <span className="font-extrabold text-sm text-zinc-900 dark:text-white">
                      {selectedPlan.amount.toLocaleString('fr-FR')} Ar
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
                    <RefreshCw className={`w-3.5 h-3.5 ${isPollingStatus ? 'animate-spin' : ''}`} />
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
              <>
                <div className="text-center space-y-1.5 -mt-3">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-green/12 text-brand-green mb-1">
                    <Headset className="w-7 h-7" />
                  </div>
                  <div className="text-4xl font-extrabold tracking-tight text-zinc-950 dark:text-white leading-none">
                    {selectedPlan.amount.toLocaleString('fr-FR')}{' '}
                    <span className="text-xl font-bold">Ar</span>
                  </div>
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {selectedPlan.durationLabel} • {selectedPlan.description}
                  </p>
                </div>

                <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-green" />
                      Paiement sécurisé
                    </span>
                    <span className="text-brand-green font-extrabold">Reçu officiel</span>
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

                <div className="space-y-2.5 pt-1 text-xs sm:text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      htmlFor="sender-phone-assistance"
                      className="text-zinc-500 dark:text-zinc-400 font-medium shrink-0 text-xs"
                    >
                      Numéro de contact
                    </label>
                    <input
                      id="sender-phone-assistance"
                      type="tel"
                      inputMode="numeric"
                      value={senderPhone}
                      onChange={(e) => {
                        if (error) clearError();
                        setSenderPhoneOverride(e.target.value);
                      }}
                      placeholder="034 00 000 00"
                      className="w-36 text-right px-3 py-1.5 rounded-full bg-[#F5F5F7] dark:bg-zinc-800 text-xs font-extrabold text-zinc-950 dark:text-white outline-none focus:ring-2 focus:ring-brand-green/40 transition-all"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      Total à payer
                    </span>
                    <span className="text-base font-extrabold text-zinc-950 dark:text-white">
                      {selectedPlan.amount.toLocaleString('fr-FR')} Ar
                    </span>
                  </div>
                </div>

                {(error || checkoutNotice) && (
                  <div className="px-4 py-2.5 rounded-full bg-red-500/12 text-red-600 dark:text-red-400 text-xs font-bold text-center">
                    {error || checkoutNotice}
                  </div>
                )}

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
