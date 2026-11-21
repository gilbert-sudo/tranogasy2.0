'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Phone,
  Loader2,
  ShieldCheck,
  X,
  RefreshCw,
  AlertCircle,
  Headset,
  Receipt,
  Clock,
  Smartphone,
  RotateCcw,
  Hash,
  Lock,
  Sparkles,
  Info,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { usePropertyStore } from '@/store/propertyStore';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import { propertyService, resolvePropertyHref } from '@/services/property.service';
import { getStoredSessionAuth } from '@/services/api';
import type { CheckoutPaymentMethod } from '@/services/assistance.service';
import { useAuth } from '@/hooks/useAuth';
import { useAssistance } from '@/hooks/useAssistance';
import { useHorizontalSwipeCarousel } from '@/hooks/useHorizontalSwipeCarousel';
import {
  AGENCY_ASSISTANCE_PLANS,
  AGENCY_SUPPORT_PHONE_DISPLAY,
  AGENCY_SUPPORT_PHONE_TEL,
  AgencyAssistancePlan,
} from '@/lib/platform';
import {
  PAYMENT_PROVIDERS,
  MOBILE_MONEY_PROVIDER_LIST,
  ALL_PAYMENT_PROVIDERS_LIST,
  normalizeMalagasyPhoneDigits,
  formatMalagasyPhoneDisplay,
  detectOperatorFromPhone,
  resolveProviderMeta,
  formatOperatorDisplayName,
  hasInvalidOperatorPrefix,
  getPhoneValidationError,
  getOrangeCodeValidationError,
} from './paymentProviders';

type CheckoutStep =
  | 'options'
  | 'waiting_approval'
  | 'card_iframe'
  | 'failed'
  | 'cancelled';

/**
 * Crisp, accessible SVG flag for Madagascar (+261).
 * Decorative when paired with an explicit country label; fixed dimensions prevent layout shift.
 */
function MadagascarFlagSvg({ className = 'w-5 h-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 16"
      width={20}
      height={14}
      aria-hidden="true"
      focusable="false"
      className={`${className} shrink-0 rounded-[3px] overflow-hidden shadow-2xs ring-1 ring-black/10 dark:ring-white/15`}
    >
      <rect x="0" y="0" width="8" height="16" fill="#FFFFFF" />
      <rect x="8" y="0" width="16" height="8" fill="#FC3D32" />
      <rect x="8" y="8" width="16" height="8" fill="#007E3A" />
    </svg>
  );
}

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
  const sessionAuthToken = user?.authToken || currentUser?.authToken;
  const isLoggedIn = !!currentUser;
  const hasAuthenticatedSession = Boolean(currentUser && sessionAuthToken);

  const [activePlanIndex, setActivePlanIndex] = useState<number>(1);
  const [selectedPlan, setSelectedPlan] = useState<AgencyAssistancePlan>(
    AGENCY_ASSISTANCE_PLANS[1]
  );
  const [pendingPlanAfterLogin, setPendingPlanAfterLogin] =
    useState<AgencyAssistancePlan | null>(null);

  // Active Checkout Sheet state
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);

  const {
    bindViewport: bindPlanViewport,
    bindTrack: bindPlanTrack,
    shouldSuppressClick: shouldSuppressPlanClick,
  } = useHorizontalSwipeCarousel({
    itemCount: AGENCY_ASSISTANCE_PLANS.length,
    currentIndex: activePlanIndex,
    onIndexChange: setActivePlanIndex,
    horizontalBias: 0.75,
    decisionSlopPx: 6,
    respectEdgeBack: true,
    enableMouseDrag: true,
    transitionDurationMs: 320,
    disabled: checkoutModalOpen,
  });
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('options');
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<CheckoutPaymentMethod>('MVOLA');
  const [orangeFormSlide, setOrangeFormSlide] = useState<'phone' | 'code'>('phone');
  const [orangeTemporaryCode, setOrangeTemporaryCode] = useState<string>('');
  const [phoneTouched, setPhoneTouched] = useState<boolean>(false);
  const [orangeCodeTouched, setOrangeCodeTouched] = useState<boolean>(false);
  const [isPhoneShaking, setIsPhoneShaking] = useState<boolean>(false);
  const [isOrangeCodeShaking, setIsOrangeCodeShaking] = useState<boolean>(false);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const orangeCodeInputRef = useRef<HTMLInputElement | null>(null);
  const [iframeLoading, setIframeLoading] = useState<boolean>(true);
  const [waitingSeconds, setWaitingSeconds] = useState<number>(0);
  const [papiPaymentLink, setPapiPaymentLink] = useState<string | null>(null);
  const [papiRef, setPapiRef] = useState<string | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState<boolean>(false);
  const [dismissedFailedBanner, setDismissedFailedBanner] = useState<boolean>(false);

  const [senderPhoneOverride, setSenderPhoneOverride] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  const rawSenderPhone = senderPhoneOverride ?? String(currentUser?.phone || '');
  const normalizedPhone = normalizeMalagasyPhoneDigits(rawSenderPhone);
  const formattedPhone = formatMalagasyPhoneDisplay(rawSenderPhone);
  const activeProvider = PAYMENT_PROVIDERS[selectedPaymentMethod];

  const phoneValidationError = getPhoneValidationError(
    selectedPaymentMethod,
    rawSenderPhone
  );
  const orangeCodeValidationError = getOrangeCodeValidationError(
    selectedPaymentMethod,
    orangeTemporaryCode
  );
  const prefixIsInvalid = hasInvalidOperatorPrefix(
    selectedPaymentMethod,
    rawSenderPhone
  );
  const isPhoneValid =
    selectedPaymentMethod !== 'CARD' &&
    !phoneValidationError &&
    normalizedPhone.length === 10;
  const showPhoneValidationHint =
    selectedPaymentMethod !== 'CARD' &&
    (phoneTouched || prefixIsInvalid || normalizedPhone.length >= 10) &&
    Boolean(phoneValidationError);
  const showOrangeCodeValidationHint =
    selectedPaymentMethod === 'ORANGE_MONEY' &&
    orangeCodeTouched &&
    Boolean(orangeCodeValidationError);

  const triggerPhoneShake = useCallback((focusInput = false) => {
    setIsPhoneShaking(false);
    setTimeout(() => {
      setIsPhoneShaking(true);
      if (focusInput) {
        phoneInputRef.current?.focus();
      }
    }, 10);
    setTimeout(() => setIsPhoneShaking(false), 420);
  }, []);

  const triggerOrangeCodeShake = useCallback((focusInput = false) => {
    setIsOrangeCodeShaking(false);
    setTimeout(() => {
      setIsOrangeCodeShaking(true);
      if (focusInput) {
        orangeCodeInputRef.current?.focus();
      }
    }, 10);
    setTimeout(() => setIsOrangeCodeShaking(false), 420);
  }, []);

  const showFailedBanner =
    searchParams.get('payment') === 'failed' && !dismissedFailedBanner;

  // Official Agency Assistance Receipt view
  const [completedReceipt, setCompletedReceipt] = useState<{
    ref: string;
    planLabel: string;
    amountPaid: number;
    operatorName: string;
    operatorKey: string;
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
  }, [initialize, refreshUserSession]);

  // Load receipts on mount and whenever a signed auth token becomes available
  useEffect(() => {
    fetchAssistanceHistory();
  }, [sessionAuthToken, fetchAssistanceHistory]);

  // Automatically open checkout modal once user finishes logging in on /pricing
  useEffect(() => {
    if (hasAuthenticatedSession && pendingPlanAfterLogin) {
      const planToOpen = pendingPlanAfterLogin;
      setPendingPlanAfterLogin(null);
      setSelectedPlan(planToOpen);
      const detected = detectOperatorFromPhone(
        senderPhoneOverride ?? String(currentUser?.phone || '')
      );
      if (detected) {
        setSelectedPaymentMethod(detected);
      }
      setCheckoutStep('options');
      setCheckoutNotice(null);
      setPhoneTouched(false);
      setOrangeCodeTouched(false);
      setPapiPaymentLink(null);
      setPapiRef(null);
      setCheckoutModalOpen(true);
    }
  }, [
    hasAuthenticatedSession,
    pendingPlanAfterLogin,
    senderPhoneOverride,
    currentUser?.phone,
  ]);

  // Track elapsed waiting time for phone confirmation / embedded card checkout
  useEffect(() => {
    if (
      !checkoutModalOpen ||
      (checkoutStep !== 'waiting_approval' && checkoutStep !== 'card_iframe')
    ) {
      setWaitingSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setWaitingSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [checkoutModalOpen, checkoutStep]);

  const handleConfirmedPaymentSuccess = useCallback(
    async (res: {
      ref?: string;
      assistancePlanLabel?: string | null;
      amount?: number;
      operator?: string;
    }) => {
      const opKey = res.operator || selectedPaymentMethod;
      setCheckoutModalOpen(false);
      setCheckoutStep('options');
      setCheckoutNotice(null);
      setOrangeTemporaryCode('');
      setOrangeCodeTouched(false);
      usePropertyStore.getState().clearUserProperties();
      usePropertyStore.getState().invalidateLockedPropertiesCache();
      await refreshUserSession();
      const didReturn = await returnToOriginProperty({ unlocked: true });
      if (didReturn) return;
      setCompletedReceipt({
        ref: res.ref || papiRef || '',
        planLabel: res.assistancePlanLabel || selectedPlan.durationLabel,
        amountPaid: res.amount || selectedPlan.amount,
        operatorName: formatOperatorDisplayName(opKey),
        operatorKey: opKey,
      });
    },
    [
      papiRef,
      selectedPlan,
      selectedPaymentMethod,
      refreshUserSession,
      returnToOriginProperty,
    ]
  );

  // Poll Papi payment status while waiting for phone confirmation or in-app Card iframe
  useEffect(() => {
    if (
      !checkoutModalOpen ||
      (checkoutStep !== 'waiting_approval' && checkoutStep !== 'card_iframe') ||
      !papiRef
    ) {
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
          await handleConfirmedPaymentSuccess(res);
        } else if (res.status === 'failed' || res.status === 'refused') {
          clearInterval(interval);
          setCheckoutStep('failed');
          setCheckoutNotice(
            res.failureReason || 'Le paiement a été refusé ou n’a pas abouti.'
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
    handleConfirmedPaymentSuccess,
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
            const opKey = res.operator || 'MVOLA';
            setCompletedReceipt({
              ref: res.ref || refParam,
              planLabel: res.assistancePlanLabel || selectedPlan.durationLabel,
              amountPaid: res.amount || selectedPlan.amount,
              operatorName: formatOperatorDisplayName(opKey),
              operatorKey: opKey,
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
    const { authToken } = getStoredSessionAuth();
    if (!isLoggedIn || !authToken) {
      setPendingPlanAfterLogin(plan);
      openModal('login');
      return;
    }
    const detected = detectOperatorFromPhone(rawSenderPhone);
    if (detected) {
      setSelectedPaymentMethod(detected);
    }
    setSelectedPlan(plan);
    setCheckoutStep('options');
    setOrangeFormSlide('phone');
    setCheckoutNotice(null);
    setPhoneTouched(false);
    setOrangeCodeTouched(false);
    setOrangeTemporaryCode('');
    setPapiPaymentLink(null);
    setPapiRef(null);
    setCheckoutModalOpen(true);
  };

  const handlePhoneInputChange = (value: string) => {
    if (error) clearError();
    if (checkoutNotice) setCheckoutNotice(null);
    const formatted = formatMalagasyPhoneDisplay(value);
    setSenderPhoneOverride(formatted);

    let targetMethod = selectedPaymentMethod;
    if (selectedPaymentMethod !== 'CARD') {
      const detected = detectOperatorFromPhone(formatted);
      if (detected && detected !== selectedPaymentMethod) {
        targetMethod = detected;
        setSelectedPaymentMethod(detected);
        setOrangeFormSlide('phone');
      }
    }

    const nextDigits = normalizeMalagasyPhoneDigits(formatted);
    const nextPrefixInvalid = hasInvalidOperatorPrefix(targetMethod, formatted);

    // Clear touched error immediately while the user is typing a valid prefix
    if (!nextPrefixInvalid && nextDigits.length < 10) {
      setPhoneTouched(false);
    }

    // Trigger subtle shake if user just entered a 3-digit prefix that is invalid
    if (nextPrefixInvalid && nextDigits.length === 3) {
      triggerPhoneShake(false);
    }
  };

  const handleAdvanceOrangeToCodeSlide = () => {
    if (error) clearError();
    if (checkoutNotice) setCheckoutNotice(null);
    setPhoneTouched(true);
    if (phoneValidationError) {
      setOrangeFormSlide('phone');
      triggerPhoneShake(true);
      return;
    }
    setOrangeFormSlide('code');
  };

  const handlePapiCheckout = async () => {
    if (error) clearError();
    setCheckoutNotice(null);
    setPhoneTouched(true);

    if (selectedPaymentMethod !== 'CARD' && phoneValidationError) {
      if (selectedPaymentMethod === 'ORANGE_MONEY') {
        setOrangeFormSlide('phone');
      }
      triggerPhoneShake(true);
      return;
    }

    if (selectedPaymentMethod === 'ORANGE_MONEY') {
      if (orangeFormSlide === 'phone') {
        setOrangeFormSlide('code');
        return;
      }
      setOrangeCodeTouched(true);
      if (orangeCodeValidationError) {
        triggerOrangeCodeShake(true);
        return;
      }
    }

    const res = await createAssistancePaymentLink(selectedPlan.id, {
      paymentMethod: selectedPaymentMethod,
      temporaryCode:
        selectedPaymentMethod === 'ORANGE_MONEY'
          ? orangeTemporaryCode.trim()
          : undefined,
      payerPhone: normalizedPhone || undefined,
    });

    if (res.requiresReauth) {
      setCheckoutModalOpen(false);
      setPendingPlanAfterLogin(selectedPlan);
      openModal('login');
      return;
    }

    if (!res.success) {
      return;
    }

    if (res.status === 'confirmed') {
      await handleConfirmedPaymentSuccess(res);
      return;
    }

    if (res.ref) {
      setPapiRef(res.ref);
    }

    if (selectedPaymentMethod === 'CARD' && res.paymentLink) {
      setPapiPaymentLink(res.paymentLink);
      setIframeLoading(true);
      setCheckoutStep('card_iframe');
      return;
    }

    setPapiPaymentLink(res.paymentLink || null);
    setCheckoutStep('waiting_approval');
  };

  const handleCancelActiveCheckout = () => {
    setIsPollingStatus(false);
    setCheckoutNotice(null);
    setCheckoutStep('cancelled');
  };

  const handleReturnToPaymentOptions = (switchMethod?: boolean) => {
    if (error) clearError();
    setCheckoutNotice(null);
    setPapiPaymentLink(null);
    setPapiRef(null);
    if (switchMethod) {
      setPhoneTouched(false);
      setOrangeCodeTouched(false);
      setOrangeFormSlide('phone');
    }
    setCheckoutStep('options');
  };

  const handleManualCheckStatus = async () => {
    if (!papiRef) return;
    setIsPollingStatus(true);
    try {
      const res = await checkAssistancePaymentStatus(papiRef);
      if (res.status === 'confirmed') {
        await handleConfirmedPaymentSuccess(res);
      } else if (res.status === 'failed' || res.status === 'refused') {
        setCheckoutStep('failed');
        setCheckoutNotice(
          res.failureReason || 'Le paiement a été refusé ou n’a pas abouti.'
        );
      } else {
        setCheckoutNotice(
          selectedPaymentMethod === 'CARD'
            ? 'Confirmation bancaire toujours en cours auprès de votre banque.'
            : 'En attente de votre confirmation sur votre téléphone. Consultez votre téléphone et approuvez la demande de paiement pour continuer.'
        );
      }
    } finally {
      setIsPollingStatus(false);
    }
  };

  // ============================================================================
  // VIEW: ASSISTANCE RECEIPT (REASSURING SUCCESS SCREEN)
  // ============================================================================
  if (completedReceipt) {
    const confirmedProvider = resolveProviderMeta(completedReceipt.operatorKey);
    return (
      <div className="fixed inset-0 z-[130] w-full h-[100dvh] max-h-[100dvh] bg-[#F5F5F7] dark:bg-zinc-950 flex flex-col justify-between p-4 pt-[calc(1rem+var(--ios-safe-top))] sm:p-6 sm:pt-[calc(1.5rem+var(--ios-safe-top))] font-sans select-none overflow-y-auto">
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
            <span>Reçu officiel confirmé</span>
          </span>
        </div>

        <div className="max-w-md w-full mx-auto bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 sm:p-8 text-center space-y-5 shadow-xl border border-zinc-200/60 dark:border-zinc-800 animate-in zoom-in-95 duration-200 my-auto">
          <div className="relative mx-auto w-20 h-20 rounded-3xl bg-brand-green/12 text-brand-green flex items-center justify-center shadow-inner">
            <img
              src={confirmedProvider.image}
              alt={confirmedProvider.name}
              className="w-14 h-14 rounded-2xl object-cover shadow-sm"
            />
            <span className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-brand-green text-white flex items-center justify-center shadow-md ring-4 ring-white dark:ring-zinc-900">
              <Check className="w-4 h-4" strokeWidth={3} />
            </span>
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green/12 text-brand-green text-[11px] font-extrabold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Reçu d&apos;assistance validé
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-zinc-950 dark:text-white tracking-tight">
              {completedReceipt.planLabel}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Plus d&apos;informations par agent et mise en relation TranoGasy
            </p>
          </div>

          <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-3xl p-4 space-y-3 text-xs text-left border border-zinc-200/50 dark:border-zinc-700/50">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                Montant réglé
              </span>
              <span className="text-base font-extrabold text-brand-green">
                {completedReceipt.amountPaid.toLocaleString('fr-FR')} Ar
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                Mode de paiement
              </span>
              <span className="inline-flex items-center gap-2 font-bold text-zinc-900 dark:text-white">
                <img
                  src={confirmedProvider.image}
                  alt={confirmedProvider.name}
                  className="w-5 h-5 rounded-md object-cover"
                />
                <span>{completedReceipt.operatorName}</span>
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                Référence reçu
              </span>
              <span className="font-mono font-bold text-zinc-900 dark:text-white">
                {completedReceipt.ref}
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
      {/* Header */}
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

        {/* Mobile Swipeable Carousel */}
        <div
          ref={bindPlanViewport}
          data-horizontal-carousel="true"
          onClickCapture={(e) => {
            if (shouldSuppressPlanClick()) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className="md:hidden w-[calc(100%+1.75rem)] sm:w-[calc(100%+2.5rem)] -mx-3.5 sm:-mx-5 overflow-x-clip max-h-[calc(100dvh-160px)] cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'pan-y' }}
        >
          <div
            ref={bindPlanTrack}
            className="flex w-full items-stretch will-change-transform"
            style={{ transform: `translate3d(-${activePlanIndex * 100}%, 0, 0)` }}
          >
            {AGENCY_ASSISTANCE_PLANS.map((plan) => {
              const isFeatured = Boolean(plan.isFeatured);

              return (
                <div
                  key={plan.id}
                  className="w-full min-w-0 shrink-0 px-3.5 sm:px-5 flex flex-col"
                >
                  <div
                    className={`flex-1 rounded-[2.25rem] p-5 sm:p-6 lg:p-7 flex flex-col justify-between transition-all duration-300 select-none ${
                      isFeatured
                        ? 'bg-zinc-950 text-white dark:bg-zinc-900 shadow-xl md:scale-[1.03] z-10 ring-1 ring-white/10'
                        : 'bg-white text-zinc-900 dark:bg-zinc-900/90 dark:text-white shadow-sm border border-zinc-200/60 dark:border-zinc-800'
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
                        className={`w-full h-13 sm:h-14 px-6 rounded-full font-extrabold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer ${
                          isFeatured
                            ? 'bg-white text-zinc-950 hover:bg-zinc-100'
                            : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100'
                        }`}
                      >
                        Payer {plan.amount.toLocaleString('fr-FR')} Ar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Desktop 3-Column Grid */}
        <div className="hidden md:grid w-full md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 items-stretch max-h-[calc(100dvh-160px)]">
          {AGENCY_ASSISTANCE_PLANS.map((plan) => {
            const isFeatured = Boolean(plan.isFeatured);

            return (
              <div
                key={plan.id}
                className={`rounded-[2.25rem] p-5 sm:p-6 lg:p-7 flex flex-col justify-between transition-all duration-300 select-none ${
                  isFeatured
                    ? 'bg-zinc-950 text-white dark:bg-zinc-900 shadow-xl md:scale-[1.03] z-10 ring-1 ring-white/10'
                    : 'bg-white text-zinc-900 dark:bg-zinc-900/90 dark:text-white shadow-sm border border-zinc-200/60 dark:border-zinc-800'
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
                    className={`w-full h-13 sm:h-14 px-6 rounded-full font-extrabold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer ${
                      isFeatured
                        ? 'bg-white text-zinc-950 hover:bg-zinc-100'
                        : 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100'
                    }`}
                  >
                    Payer {plan.amount.toLocaleString('fr-FR')} Ar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Trusted Payment Providers Footer Bar */}
      <footer className="max-w-5xl w-full mx-auto flex items-center justify-center gap-2 flex-wrap text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0 pt-1">
        <ShieldCheck className="w-4 h-4 text-brand-green shrink-0" />
        <div className="inline-flex items-center gap-1.5 flex-wrap justify-center">
          {ALL_PAYMENT_PROVIDERS_LIST.map((provider) => (
            <span
              key={provider.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-2xs text-[10px] font-bold text-zinc-800 dark:text-zinc-200"
            >
              <img
                src={provider.image}
                alt={provider.name}
                className="w-3.5 h-3.5 rounded-sm object-cover"
              />
              <span>{provider.shortName}</span>
            </span>
          ))}
        </div>
      </footer>

      {/* ========================================================================
          POLISHED MOBILE-FIRST CHECKOUT MODAL (iOS ASSISTANCE)
         ======================================================================== */}
      {checkoutModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-modal-title-ios"
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (
              e.target === e.currentTarget &&
              !isLoading &&
              checkoutStep !== 'waiting_approval' &&
              checkoutStep !== 'card_iframe'
            ) {
              setCheckoutModalOpen(false);
            }
          }}
        >
          <div
            className={`w-full ${
              checkoutStep === 'card_iframe' ? 'sm:max-w-lg' : 'sm:max-w-[460px]'
            } max-h-[96dvh] overflow-hidden flex flex-col justify-between bg-white dark:bg-zinc-900 rounded-t-[2.25rem] sm:rounded-[2.25rem] p-4 sm:p-6 shadow-2xl border border-zinc-200/70 dark:border-zinc-800 space-y-3 sm:space-y-4 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200`}
          >
            {/* Modal Top Header */}
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-brand-green/12 text-brand-green flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <span
                    id="checkout-modal-title-ios"
                    className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white block leading-tight"
                  >
                    Paiement sécurisé TranoGasy
                  </span>
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    Propulsé par Papi.mg • Sans quitter l’application
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  if (
                    checkoutStep === 'waiting_approval' ||
                    checkoutStep === 'card_iframe'
                  ) {
                    handleCancelActiveCheckout();
                  } else {
                    setCheckoutModalOpen(false);
                  }
                }}
                aria-label="Fermer la fenêtre de paiement"
                className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0 disabled:opacity-50"
              >
                <X className="w-4 h-4 stroke-[2.25]" />
              </button>
            </div>

            {/* ==================================================================
                STATE 0: LOADING ("Preparing secure payment")
               ================================================================== */}
            {isLoading && checkoutStep === 'options' && (
              <div className="py-8 px-4 text-center space-y-5 animate-in fade-in duration-150">
                <div className="relative mx-auto w-22 h-22 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-3xl bg-brand-green/15 animate-pulse" />
                  <img
                    src={activeProvider.image}
                    alt={activeProvider.name}
                    className="w-18 h-18 rounded-2xl object-cover shadow-md border border-black/10 dark:border-white/10"
                  />
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-md">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-extrabold text-zinc-950 dark:text-white">
                    Préparation du paiement sécurisé...
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
                    {selectedPaymentMethod === 'CARD'
                      ? 'Ouverture du terminal Carte Bancaire BRED directement dans cette fenêtre...'
                      : `Nous envoyons une demande de paiement sécurisée ${activeProvider.name} au +261 ${formattedPhone}...`}
                  </p>
                </div>

                <div className="max-w-xs mx-auto bg-[#F5F5F7] dark:bg-zinc-800/70 rounded-3xl p-4 space-y-2.5">
                  <div className="h-3 w-3/4 mx-auto rounded-full bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
                  <div className="h-2.5 w-1/2 mx-auto rounded-full bg-zinc-200/80 dark:bg-zinc-700/80 animate-pulse" />
                </div>
              </div>
            )}

            {/* ==================================================================
                STATE 1: AWAITING APPROVAL & PENDING ON PHONE
               ================================================================== */}
            {checkoutStep === 'waiting_approval' && (
              <div className="space-y-4 py-1 animate-in fade-in duration-200">
                <div className="text-center space-y-3">
                  <div className="relative mx-auto w-22 h-22 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-3xl bg-brand-green/20 animate-ping" />
                    <img
                      src={activeProvider.image}
                      alt={activeProvider.name}
                      className="relative w-18 h-18 rounded-2xl object-cover shadow-md border border-black/10 dark:border-white/10"
                    />
                    <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-brand-green text-white flex items-center justify-center shadow-md ring-2 ring-white dark:ring-zinc-900">
                      <Smartphone className="w-4 h-4" />
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-extrabold uppercase tracking-wider">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {waitingSeconds < 12
                        ? `En attente de votre confirmation (${waitingSeconds}s)`
                        : `Confirmation toujours en cours (${waitingSeconds}s)`}
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white tracking-tight">
                      Confirmez le paiement sur votre téléphone
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-xs mx-auto leading-relaxed">
                      Demande de paiement envoyée au{' '}
                      <strong className="font-bold text-zinc-900 dark:text-white">
                        +261 {formattedPhone}
                      </strong>
                      . Veuillez l’approuver sur votre téléphone.
                    </p>
                  </div>
                </div>

                {/* Prominent Step-by-Step Approval Panel */}
                <div className="rounded-3xl bg-brand-green/[0.07] dark:bg-brand-green/[0.12] border border-brand-green/25 p-4 space-y-2.5 text-sm">
                  <div className="font-extrabold text-zinc-900 dark:text-white flex items-center gap-2 text-xs sm:text-sm">
                    <Smartphone className="w-4 h-4 text-brand-green shrink-0" />
                    <span>
                      Consultez votre téléphone et approuvez la demande de paiement pour continuer :
                    </span>
                  </div>
                  <ol className="space-y-2 text-zinc-700 dark:text-zinc-200 font-medium pl-5 list-decimal text-xs sm:text-[13px] leading-relaxed">
                    <li>
                      Regardez votre téléphone{' '}
                      <strong className="font-extrabold text-zinc-950 dark:text-white">
                        +261 {formattedPhone}
                      </strong>
                      .
                    </li>
                    <li>
                      Approuvez la demande de paiement de{' '}
                      <strong className="font-extrabold text-brand-green">
                        {selectedPlan.amount.toLocaleString('fr-FR')} Ar
                      </strong>{' '}
                      avec votre code secret {activeProvider.name}.
                    </li>
                    <li>
                      Restez sur cette fenêtre : votre reçu officiel s’affiche dès votre confirmation.
                    </li>
                  </ol>
                </div>

                {/* Transaction Details Summary */}
                <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-3xl p-4 text-xs sm:text-sm space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 dark:text-zinc-400">Offre choisie</span>
                    <span className="font-bold text-zinc-900 dark:text-white">
                      {selectedPlan.durationLabel}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 dark:text-zinc-400">Méthode</span>
                    <span className="inline-flex items-center gap-2 font-bold text-zinc-900 dark:text-white">
                      <img
                        src={activeProvider.image}
                        alt={activeProvider.name}
                        className="w-5 h-5 rounded-md object-cover"
                      />
                      <span>{activeProvider.name}</span>
                    </span>
                  </div>
                  {papiRef && (
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-200 dark:border-zinc-700">
                      <span className="text-zinc-400 text-xs">Référence</span>
                      <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300">
                        {papiRef}
                      </span>
                    </div>
                  )}
                </div>

                {checkoutNotice && (
                  <div
                    role="status"
                    className="px-4 py-3 rounded-2xl bg-amber-500/12 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold flex items-center gap-2.5"
                  >
                    <Info className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{checkoutNotice}</span>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isPollingStatus}
                    onClick={handleManualCheckStatus}
                    className="w-full h-14 px-6 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-extrabold text-sm sm:text-base shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isPollingStatus ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {isPollingStatus
                        ? 'Vérification du statut en cours...'
                        : 'J’ai confirmé sur mon téléphone'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelActiveCheckout}
                    className="w-full h-12 px-6 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-sm transition-all cursor-pointer"
                  >
                    Annuler ou modifier le numéro
                  </button>
                </div>
              </div>
            )}

            {/* ==================================================================
                STATE 2: EMBEDDED IN-APP IFRAME FOR CARTE BANCAIRE
               ================================================================== */}
            {checkoutStep === 'card_iframe' && (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-3xl px-4 py-3 text-xs sm:text-sm border border-zinc-200/70 dark:border-zinc-700/60">
                  <div className="flex items-center gap-3">
                    <img
                      src={PAYMENT_PROVIDERS.CARD.image}
                      alt={PAYMENT_PROVIDERS.CARD.name}
                      className="w-11 h-11 rounded-xl object-cover border border-black/10"
                    />
                    <div>
                      <div className="font-extrabold text-zinc-900 dark:text-white text-sm">
                        Carte Bancaire • {selectedPlan.durationLabel}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        Réf : {papiRef}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-base text-brand-green">
                      {selectedPlan.amount.toLocaleString('fr-FR')} Ar
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-end gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-brand-green" />
                      <span>Vérification auto</span>
                    </div>
                  </div>
                </div>

                <div className="relative w-full h-[410px] sm:h-[450px] rounded-3xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white">
                  {iframeLoading && (
                    <div className="absolute inset-0 z-10 bg-white dark:bg-zinc-900 flex flex-col items-center justify-center gap-3.5 p-6 text-center">
                      <img
                        src={PAYMENT_PROVIDERS.CARD.image}
                        alt="BRED Madagascar Visa"
                        className="w-16 h-16 rounded-2xl object-cover shadow-sm border border-zinc-200"
                      />
                      <Loader2 className="w-7 h-7 animate-spin text-[#005596]" />
                      <div className="space-y-1">
                        <div className="text-sm font-extrabold text-zinc-900 dark:text-white">
                          Préparation du paiement sécurisé...
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          Connexion chiffrée avec Papi.mg &amp; BRED Madagasikara
                        </div>
                      </div>
                    </div>
                  )}
                  {papiPaymentLink && (
                    <iframe
                      src={papiPaymentLink}
                      title="Terminal de paiement Carte Bancaire Papi.mg"
                      onLoad={() => setIframeLoading(false)}
                      allow="payment *"
                      className="w-full h-full border-0"
                    />
                  )}
                </div>

                {checkoutNotice && (
                  <div className="px-4 py-2.5 rounded-2xl bg-amber-500/12 text-amber-800 dark:text-amber-300 text-xs sm:text-sm font-semibold text-center">
                    {checkoutNotice}
                  </div>
                )}

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleCancelActiveCheckout}
                    className="flex-1 h-12 px-5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs sm:text-sm transition-all cursor-pointer"
                  >
                    Changer de méthode
                  </button>
                  <button
                    type="button"
                    disabled={isPollingStatus}
                    onClick={handleManualCheckStatus}
                    className="flex-1 h-12 px-5 rounded-full bg-brand-green hover:bg-[#6da819] text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isPollingStatus ? 'animate-spin' : ''}`}
                    />
                    <span>Vérifier le paiement</span>
                  </button>
                </div>
              </div>
            )}

            {/* ==================================================================
                STATE 3: FAILURE STATE (STRONG RED RESERVED FOR PAYMENT FAILURE)
               ================================================================== */}
            {checkoutStep === 'failed' && (
              <div className="space-y-4 py-2 animate-in fade-in duration-200">
                <div className="text-center space-y-2.5">
                  <div className="mx-auto w-16 h-16 rounded-3xl bg-red-500/12 text-red-600 dark:text-red-400 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8" />
                  </div>

                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-red-500/12 text-red-600 dark:text-red-400 text-xs font-extrabold uppercase tracking-wider">
                      Paiement non abouti
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white">
                      La demande de paiement n’a pas abouti
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-xs mx-auto leading-relaxed">
                      {checkoutNotice ||
                        'La confirmation sur votre téléphone a expiré ou a été refusée. Vos informations ont été conservées.'}
                    </p>
                  </div>
                </div>

                <div className="bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-3xl p-4 text-xs sm:text-sm space-y-2.5 border border-zinc-200/60 dark:border-zinc-700/60">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 dark:text-zinc-400">Méthode choisie</span>
                    <span className="inline-flex items-center gap-2 font-bold text-zinc-900 dark:text-white">
                      <img
                        src={activeProvider.image}
                        alt={activeProvider.name}
                        className="w-5 h-5 rounded-md object-cover"
                      />
                      <span>{activeProvider.name}</span>
                    </span>
                  </div>
                  {selectedPaymentMethod !== 'CARD' && formattedPhone && (
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500 dark:text-zinc-400">Numéro conservé</span>
                      <span className="font-bold text-zinc-900 dark:text-white">
                        +261 {formattedPhone}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 dark:text-zinc-400">Montant</span>
                    <span className="font-extrabold text-zinc-900 dark:text-white">
                      {selectedPlan.amount.toLocaleString('fr-FR')} Ar
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleReturnToPaymentOptions(false)}
                    className="w-full h-14 px-6 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-extrabold text-sm sm:text-base shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Réessayer avec ces informations</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReturnToPaymentOptions(true)}
                    className="w-full h-12 px-6 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-sm transition-all cursor-pointer"
                  >
                    Choisir un autre mode de paiement
                  </button>
                </div>
              </div>
            )}

            {/* ==================================================================
                STATE 4: CANCELLATION (NEUTRAL ACKNOWLEDGEMENT, NOT AN ERROR)
               ================================================================== */}
            {checkoutStep === 'cancelled' && (
              <div className="space-y-4 py-2 animate-in fade-in duration-200">
                <div className="text-center space-y-2.5">
                  <div className="mx-auto w-16 h-16 rounded-3xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center">
                    <RotateCcw className="w-7 h-7" />
                  </div>

                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-extrabold uppercase tracking-wider">
                      Paiement annulé
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-white">
                      Demande de paiement interrompue
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto leading-relaxed">
                      Vous avez quitté l’étape de confirmation. Si vous n’avez pas approuvé la demande sur votre téléphone, aucun montant n’a été débité.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleReturnToPaymentOptions(false)}
                    className="w-full h-14 px-6 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-extrabold text-sm sm:text-base shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Retourner au paiement</span>
                  </button>

                  {papiRef && (
                    <button
                      type="button"
                      disabled={isPollingStatus}
                      onClick={handleManualCheckStatus}
                      className="w-full h-12 px-6 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${isPollingStatus ? 'animate-spin' : ''}`}
                      />
                      <span>J’avais déjà confirmé • Vérifier le statut</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setCheckoutModalOpen(false)}
                    className="w-full h-10 rounded-full text-sm font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            )}

            {/* ==================================================================
                STATE 5: PAYMENT METHOD SELECTION & ZERO-SCROLL STEP/SLIDER FORM
               ================================================================== */}
            {checkoutStep === 'options' && !isLoading && (
              <div className="space-y-3 sm:space-y-3.5">
                {/* Selected Plan Summary Pill */}
                <div className="flex items-center justify-between bg-[#F5F5F7] dark:bg-zinc-800/80 rounded-2xl px-3.5 py-2.5 border border-zinc-200/60 dark:border-zinc-700/50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-brand-green/15 text-brand-green flex items-center justify-center shrink-0">
                      <Headset className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-zinc-950 dark:text-white leading-tight">
                        {selectedPlan.name} • {selectedPlan.durationLabel}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {selectedPlan.description}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg sm:text-xl font-black text-zinc-950 dark:text-white leading-none">
                      {selectedPlan.amount.toLocaleString('fr-FR')}{' '}
                      <span className="text-xs font-bold">Ar</span>
                    </div>
                    <span className="text-[10px] font-bold text-brand-green">
                      Reçu officiel
                    </span>
                  </div>
                </div>

                {/* SECTION 1: MOBILE MONEY (PRIMARY, RECOMMENDED) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
                      1. Mobile Money
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-green/15 text-brand-green text-[10px] font-extrabold uppercase tracking-wider">
                      <Sparkles className="w-2.5 h-2.5" />
                      Recommandé
                    </span>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="Choisir un opérateur Mobile Money"
                    className="grid grid-cols-3 gap-2.5"
                  >
                    {MOBILE_MONEY_PROVIDER_LIST.map((provider) => {
                      const isSelected = selectedPaymentMethod === provider.id;
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => {
                            if (error) clearError();
                            if (checkoutNotice) setCheckoutNotice(null);
                            setSelectedPaymentMethod(provider.id);
                            if (provider.id === 'ORANGE_MONEY') {
                              setOrangeFormSlide('phone');
                            }
                            if (
                              rawSenderPhone &&
                              hasInvalidOperatorPrefix(provider.id, rawSenderPhone)
                            ) {
                              setPhoneTouched(true);
                              triggerPhoneShake(true);
                            }
                          }}
                          className={`relative aspect-square w-full flex flex-col items-center justify-center gap-1.5 p-2 rounded-3xl border transition-all cursor-pointer focus:outline-none overflow-hidden ${
                            isSelected
                              ? provider.cardActiveClass
                              : 'border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          {isSelected && (
                            <span
                              className={`absolute top-2 right-2 w-5 h-5 rounded-full ${provider.badgeClass} flex items-center justify-center shadow-xs`}
                            >
                              <Check className="w-3 h-3" strokeWidth={3} />
                            </span>
                          )}
                          <img
                            src={provider.image}
                            alt={provider.name}
                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover shadow-sm border border-black/10 dark:border-white/10 shrink-0"
                          />
                          <span className="w-full text-center text-[11px] sm:text-xs font-extrabold text-zinc-950 dark:text-white leading-none tracking-tight whitespace-nowrap truncate px-0.5">
                            {provider.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* SECTION 2: CARTE BANCAIRE (SEPARATE OPTION WITH BRED VISA IMAGE) */}
                <div className="space-y-1.5">
                  <span className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100 block">
                    2. Ou payer par Carte Bancaire
                  </span>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedPaymentMethod === 'CARD'}
                    onClick={() => {
                      if (error) clearError();
                      if (checkoutNotice) setCheckoutNotice(null);
                      setSelectedPaymentMethod('CARD');
                    }}
                    className={`w-full flex items-center justify-between p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                      selectedPaymentMethod === 'CARD'
                        ? PAYMENT_PROVIDERS.CARD.cardActiveClass
                        : 'border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={PAYMENT_PROVIDERS.CARD.image}
                        alt="Carte Bancaire BRED Visa"
                        className="w-11 h-11 rounded-xl object-cover shadow-xs border border-zinc-200 dark:border-zinc-700 shrink-0"
                      />
                      <div>
                        <div className="text-xs sm:text-sm font-extrabold text-zinc-950 dark:text-white leading-tight">
                          Carte Bancaire • Visa / MasterCard
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                          Guichet BRED Madagasikara intégré à l’application
                        </div>
                      </div>
                    </div>

                    <span
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        selectedPaymentMethod === 'CARD'
                          ? 'bg-[#005596] border-[#005596] text-white'
                          : 'border-zinc-300 dark:border-zinc-600'
                      }`}
                    >
                      {selectedPaymentMethod === 'CARD' && (
                        <Check className="w-3 h-3" strokeWidth={3} />
                      )}
                    </span>
                  </button>
                </div>

                {/* FOCUSED ZERO-SCROLL SLIDER / STEP PANEL FOR SELECTED METHOD */}
                {selectedPaymentMethod !== 'CARD' ? (
                  <div className="space-y-2.5 pt-0.5">
                    {/* Interactive 2-Step Slider Pill for Orange Money */}
                    {selectedPaymentMethod === 'ORANGE_MONEY' && (
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-full bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/70">
                        <button
                          type="button"
                          onClick={() => setOrangeFormSlide('phone')}
                          className={`h-8 px-3 rounded-full text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate ${
                            orangeFormSlide === 'phone'
                              ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-2xs'
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          {isPhoneValid ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-brand-green shrink-0" />
                          ) : (
                            <span className="w-4 h-4 rounded-full bg-[#ff6600] text-white text-[10px] flex items-center justify-center shrink-0">
                              1
                            </span>
                          )}
                          <span className="truncate">
                            {isPhoneValid ? formattedPhone : '1. Numéro Orange'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={handleAdvanceOrangeToCodeSlide}
                          className={`h-8 px-3 rounded-full text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer truncate ${
                            orangeFormSlide === 'code'
                              ? 'bg-[#ff6600] text-white shadow-2xs'
                              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center shrink-0 ${
                              orangeFormSlide === 'code'
                                ? 'bg-white text-[#ff6600]'
                                : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
                            }`}
                          >
                            2
                          </span>
                          <span className="truncate">Code #144*3*3#</span>
                        </button>
                      </div>
                    )}

                    {/* SLIDE 1: PHONE NUMBER INPUT (Used by MVola, Airtel, and Orange Step 1) */}
                    {(selectedPaymentMethod !== 'ORANGE_MONEY' ||
                      orangeFormSlide === 'phone') && (
                      <div className="space-y-1.5 animate-in fade-in slide-in-from-left-3 duration-200">
                        <label
                          htmlFor="mobile-money-phone-input-ios"
                          className="block text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100"
                        >
                          Numéro Mobile Money ({activeProvider.name})
                        </label>
                        <p
                          id="mobile-money-phone-help-ios"
                          className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug"
                        >
                          {selectedPaymentMethod === 'ORANGE_MONEY'
                            ? 'Étape 1/2 : Saisissez votre numéro Orange Money (032 ou 037).'
                            : `Saisissez votre numéro ${activeProvider.name}. Nous enverrons une demande de paiement sécurisée sur ce numéro.`}
                        </p>

                        <div
                          className={`flex items-center h-13 rounded-full border transition-all overflow-hidden ${
                            isPhoneShaking ? 'animate-input-shake' : ''
                          } ${
                            showPhoneValidationHint
                              ? 'border-red-500 dark:border-red-500 bg-red-50/75 dark:bg-red-950/30 ring-2 ring-red-500/20 focus-within:border-red-600 focus-within:ring-3 focus-within:ring-red-500/25'
                              : isPhoneValid
                                ? 'border-brand-green bg-brand-green/[0.03] dark:bg-zinc-900 ring-2 ring-brand-green/20'
                                : `border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 ${activeProvider.inputFocusClass}`
                          }`}
                        >
                          <div
                            aria-label="Madagascar (+261)"
                            className={`h-full pl-3.5 pr-3 border-r flex items-center gap-1.5 text-xs sm:text-sm font-extrabold select-none shrink-0 transition-colors ${
                              showPhoneValidationHint
                                ? 'bg-red-100/70 dark:bg-red-950/50 border-red-300 dark:border-red-800/70 text-red-700 dark:text-red-300'
                                : 'bg-zinc-100/90 dark:bg-zinc-800/90 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                            }`}
                          >
                            <MadagascarFlagSvg className="w-5 h-3.5" />
                            <span className="sr-only">Madagascar</span>
                            <span>+261</span>
                          </div>

                          <input
                            ref={phoneInputRef}
                            id="mobile-money-phone-input-ios"
                            name="mobileMoneyPhone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel-national"
                            value={formattedPhone}
                            onBlur={() => {
                              if (normalizedPhone.length > 0 && phoneValidationError) {
                                setPhoneTouched(true);
                                triggerPhoneShake(false);
                              }
                            }}
                            onChange={(e) => handlePhoneInputChange(e.target.value)}
                            placeholder={activeProvider.placeholder}
                            aria-invalid={showPhoneValidationHint}
                            aria-describedby={
                              showPhoneValidationHint
                                ? 'mobile-money-phone-validation-ios'
                                : 'mobile-money-phone-help-ios'
                            }
                            className="w-full h-full px-3.5 bg-transparent text-base font-extrabold text-zinc-950 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 placeholder:font-normal outline-none"
                          />

                          <div className="pr-3.5 flex items-center shrink-0">
                            {showPhoneValidationHint ? (
                              <AlertCircle
                                className="w-5 h-5 text-red-500 dark:text-red-400"
                                aria-hidden="true"
                              />
                            ) : isPhoneValid ? (
                              <CheckCircle2
                                className="w-5 h-5 text-brand-green"
                                aria-hidden="true"
                              />
                            ) : (
                              <img
                                src={activeProvider.image}
                                alt=""
                                className="w-5 h-5 rounded-md object-cover opacity-85"
                              />
                            )}
                          </div>
                        </div>

                        {showPhoneValidationHint && phoneValidationError && (
                          <div
                            id="mobile-money-phone-validation-ios"
                            role="alert"
                            aria-live="assertive"
                            className="flex items-center gap-1.5 pt-0.5 text-xs font-bold text-red-600 dark:text-red-400 animate-in fade-in duration-150"
                          >
                            <AlertCircle
                              className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{phoneValidationError}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SLIDE 2: ORANGE MONEY TEMPORARY CODE PANEL (Replaces phone input in-place with zero scroll) */}
                    {selectedPaymentMethod === 'ORANGE_MONEY' &&
                      orangeFormSlide === 'code' && (
                        <div className="space-y-1.5 animate-in fade-in slide-in-from-right-3 duration-200">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor="orange-temp-code-ios"
                              className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5"
                            >
                              <Hash className="w-4 h-4 text-[#ff6600]" />
                              <span>Code temporaire Orange Money</span>
                            </label>
                            <a
                              href="tel:%23144*3*3%23"
                              className="px-3 py-1 rounded-full bg-[#ff6600] text-white text-xs font-extrabold hover:bg-[#e05a00] transition-colors shadow-2xs shrink-0"
                            >
                              Composer #144*3*3#
                            </a>
                          </div>

                          <p
                            id="orange-temp-code-help-ios"
                            className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug"
                          >
                            Étape 2/2 : Composez le <strong>#144*3*3#</strong> sur le{' '}
                            <strong>+261 {formattedPhone}</strong> et saisissez le code reçu.
                          </p>

                          <div
                            className={`flex items-center h-13 rounded-full border px-4 transition-all ${
                              isOrangeCodeShaking ? 'animate-input-shake' : ''
                            } ${
                              showOrangeCodeValidationHint
                                ? 'border-red-500 dark:border-red-500 bg-red-50/75 dark:bg-red-950/30 ring-2 ring-red-500/20 focus-within:border-red-600 focus-within:ring-3 focus-within:ring-red-500/25'
                                : orangeTemporaryCode.trim().length >= 4
                                  ? 'border-brand-green bg-brand-green/[0.03] dark:bg-zinc-900 ring-2 ring-brand-green/20'
                                  : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus-within:border-[#ff6600] focus-within:ring-3 focus-within:ring-[#ff6600]/20'
                            }`}
                          >
                            <input
                              ref={orangeCodeInputRef}
                              id="orange-temp-code-ios"
                              name="orangeTemporaryCode"
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              autoFocus
                              value={orangeTemporaryCode}
                              onBlur={() => {
                                if (
                                  orangeTemporaryCode.trim().length > 0 &&
                                  orangeCodeValidationError
                                ) {
                                  setOrangeCodeTouched(true);
                                  triggerOrangeCodeShake(false);
                                }
                              }}
                              onChange={(e) => {
                                if (error) clearError();
                                if (checkoutNotice) setCheckoutNotice(null);
                                const nextVal = e.target.value;
                                setOrangeTemporaryCode(nextVal);
                                if (nextVal.trim().length >= 4 || nextVal.length === 0) {
                                  setOrangeCodeTouched(false);
                                }
                              }}
                              placeholder="Saisissez le code à 4 chiffres (ex : 1234)"
                              aria-invalid={showOrangeCodeValidationHint}
                              aria-describedby={
                                showOrangeCodeValidationHint
                                  ? 'orange-temp-code-validation-ios'
                                  : 'orange-temp-code-help-ios'
                              }
                              className="w-full h-full bg-transparent text-base font-extrabold text-zinc-950 dark:text-white placeholder:text-zinc-400 placeholder:font-normal outline-none"
                            />
                            {showOrangeCodeValidationHint ? (
                              <AlertCircle
                                className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0"
                                aria-hidden="true"
                              />
                            ) : orangeTemporaryCode.trim().length >= 4 ? (
                              <CheckCircle2
                                className="w-5 h-5 text-brand-green shrink-0"
                                aria-hidden="true"
                              />
                            ) : null}
                          </div>

                          {showOrangeCodeValidationHint && orangeCodeValidationError && (
                            <div
                              id="orange-temp-code-validation-ios"
                              role="alert"
                              aria-live="assertive"
                              className="flex items-center gap-1.5 pt-0.5 text-xs font-bold text-red-600 dark:text-red-400 animate-in fade-in duration-150"
                            >
                              <AlertCircle
                                className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{orangeCodeValidationError}</span>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                ) : (
                  /* Carte Bancaire In-App Explanation Card */
                  <div className="rounded-2xl bg-[#005596]/[0.06] dark:bg-[#005596]/[0.15] border border-[#005596]/25 p-3.5 flex items-center gap-3">
                    <img
                      src={PAYMENT_PROVIDERS.CARD.image}
                      alt="BRED Madagascar"
                      className="w-11 h-11 rounded-xl object-cover border border-zinc-200 shrink-0"
                    />
                    <div className="space-y-0.5 text-xs">
                      <div className="font-extrabold text-zinc-900 dark:text-white text-sm">
                        Paiement Carte Bancaire intégré
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug">
                        Le guichet sécurisé BRED / Visa s’ouvre directement dans cette fenêtre sans quitter TranoGasy.
                      </p>
                    </div>
                  </div>
                )}

                {/* Strong Red Error State Reserved Strictly for Actual Payment Failures */}
                {(error || checkoutNotice) && (
                  <div
                    role="alert"
                    className="px-3.5 py-2 rounded-2xl bg-red-500/12 border border-red-500/25 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate">{error || checkoutNotice}</span>
                  </div>
                )}

                {/* Always-Visible Primary Action Bar */}
                {selectedPaymentMethod === 'ORANGE_MONEY' &&
                orangeFormSlide === 'phone' ? (
                  <button
                    type="button"
                    onClick={handleAdvanceOrangeToCodeSlide}
                    className={`w-full h-13 sm:h-14 px-6 rounded-full font-extrabold text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${activeProvider.buttonClass}`}
                  >
                    <span>Continuer</span>
                    <ArrowRight className="w-5 h-5 shrink-0" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    {selectedPaymentMethod === 'ORANGE_MONEY' &&
                      orangeFormSlide === 'code' && (
                        <button
                          type="button"
                          onClick={() => setOrangeFormSlide('phone')}
                          aria-label="Modifier le numéro Orange Money"
                          className="h-13 sm:h-14 w-13 sm:w-14 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center justify-center shrink-0 active:scale-95 transition-all cursor-pointer"
                        >
                          <ArrowLeft className="w-5 h-5" />
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handlePapiCheckout}
                      className={`flex-1 h-13 sm:h-14 px-6 rounded-full font-extrabold text-base shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 whitespace-nowrap ${activeProvider.buttonClass}`}
                    >
                      <ShieldCheck className="w-5 h-5 shrink-0" />
                      <span>Payer {selectedPlan.amount.toLocaleString('fr-FR')} Ar</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
