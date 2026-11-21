import { useState, useCallback } from 'react';
import {
  paymentService,
  PaymentTransaction,
  PaymentStatusResponse,
  CheckoutPaymentMethod,
} from '@/services/payment.service';
import { ApiError, getStoredSessionAuth } from '@/services/api';
import type { SubscriptionPlanId } from '@/lib/platform';
import { useUserStore } from '@/store/userStore';
import { usePaymentStore } from '@/store/paymentStore';

const LOCAL_TRANSACTIONS_STORAGE_KEY = 'tranogasy_sub_transactions';

function getLocalTransactions(userIdOrPhone: string): PaymentTransaction[] {
  if (typeof window === 'undefined' || !userIdOrPhone) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_TRANSACTIONS_STORAGE_KEY}_${userIdOrPhone}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTransactions(userIdOrPhone: string, list: PaymentTransaction[]) {
  if (typeof window === 'undefined' || !userIdOrPhone) return;
  try {
    localStorage.setItem(
      `${LOCAL_TRANSACTIONS_STORAGE_KEY}_${userIdOrPhone}`,
      JSON.stringify(list.slice(0, 25))
    );
  } catch {
    // Ignore quota errors
  }
}

export function usePayment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(
    null
  );
  const [subscriptionPlanLabel, setSubscriptionPlanLabel] = useState<string | null>(
    null
  );
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  const user = useUserStore((state) => state.user);
  const updateSubscription = useUserStore((state) => state.updateSubscription);

  const transactions = usePaymentStore((state) => state.transactions);
  const setTransactions = usePaymentStore((state) => state.setTransactions);

  const currentUser = user?.user || user;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const syncSubscriptionState = useCallback(
    (expiresAt: string | null, planLabel?: string | null) => {
      setSubscriptionExpiresAt(expiresAt);
      if (planLabel !== undefined) {
        setSubscriptionPlanLabel(planLabel);
      }
      setHasActiveSubscription(
        Boolean(expiresAt) && new Date(expiresAt as string).getTime() > Date.now()
      );
      updateSubscription(expiresAt, planLabel);
    },
    [updateSubscription]
  );

  const fetchWallet = useCallback(async () => {
    const { user: startSession, sessionEpoch: startEpoch } = useUserStore.getState();
    const activeUser = startSession?.user || startSession;
    const identifier = activeUser?._id || activeUser?.phone;
    if (!identifier) return;

    if (activeUser?.subscriptionExpiresAt) {
      syncSubscriptionState(
        String(activeUser.subscriptionExpiresAt),
        activeUser.subscriptionPlanLabel || null
      );
    }

    const localKey = activeUser?.phone || activeUser?._id;
    const isSyntheticId = String(activeUser?._id || '').startsWith('tg_');
    const { authToken } = getStoredSessionAuth();

    if (authToken) {
      try {
        const targetParam = !isSyntheticId && activeUser?._id ? activeUser._id : activeUser?.phone;
        if (targetParam) {
          const res = await paymentService.getUserWallet(targetParam);
          const { user: latestSession, sessionEpoch: latestEpoch } = useUserStore.getState();
          if (latestEpoch !== startEpoch || !latestSession) {
            return;
          }

          if (res?.subscriptionExpiresAt !== undefined) {
            syncSubscriptionState(
              res.subscriptionExpiresAt || null,
              res.subscriptionPlanLabel ?? null
            );
          }
          if (Array.isArray(res?.payments)) {
            const confirmedSubs = res.payments.filter(
              (tx) => tx.status === 'confirmed'
            );
            setTransactions(confirmedSubs, identifier);
            if (localKey) {
              saveLocalTransactions(localKey, confirmedSubs);
            }
            return;
          }
        }
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          useUserStore.getState().clearAuthToken();
        }
        // Fallback to local cache when backend is unreachable or session expired
      }
    }

    const { user: latestSession, sessionEpoch: latestEpoch } = useUserStore.getState();
    if (latestEpoch !== startEpoch || !latestSession) {
      return;
    }

    if (localKey) {
      const cached = getLocalTransactions(localKey).filter(
        (tx) => tx.status === 'confirmed'
      );
      setTransactions(cached, identifier);
    }
  }, [setTransactions, syncSubscriptionState]);

  const createSubscriptionPaymentLink = useCallback(
    async (
      planId: SubscriptionPlanId,
      options?: {
        paymentMethod?: CheckoutPaymentMethod;
        temporaryCode?: string;
        payerEmail?: string;
        payerPhone?: string;
        successUrl?: string;
        failureUrl?: string;
      }
    ): Promise<{
      success: boolean;
      mode?: 'direct' | 'link';
      status?: 'pending' | 'confirmed' | 'failed' | 'refused';
      paymentMethod?: CheckoutPaymentMethod | string;
      operator?: string;
      paymentLink?: string;
      ref?: string;
      amount?: number;
      subscriptionExpiresAt?: string | null;
      subscriptionPlanLabel?: string | null;
      error?: string;
      requiresReauth?: boolean;
    }> => {
      setError(null);
      const activeUser = useUserStore.getState().user?.user || useUserStore.getState().user;
      if (!activeUser) {
        const msg = 'Veuillez vous connecter pour souscrire à un abonnement.';
        setError(msg);
        return { success: false, error: msg, requiresReauth: true };
      }

      const { authToken } = getStoredSessionAuth();
      if (!authToken) {
        const msg = 'Votre session a expiré. Veuillez vous reconnecter.';
        setError(msg);
        return { success: false, error: msg, requiresReauth: true };
      }

      setIsLoading(true);
      try {
        const isSyntheticId = String(activeUser._id || '').startsWith('tg_');
        const res = await paymentService.createSubscriptionLink({
          userId: !isSyntheticId ? activeUser._id : undefined,
          userPhone: activeUser.phone,
          planId,
          paymentMethod: options?.paymentMethod,
          temporaryCode: options?.temporaryCode,
          clientName: activeUser.username || undefined,
          payerEmail: options?.payerEmail || activeUser.email || undefined,
          payerPhone: options?.payerPhone || activeUser.phone || undefined,
          successUrl: options?.successUrl,
          failureUrl: options?.failureUrl,
        });

        if (res.status === 'confirmed') {
          if (res.subscriptionExpiresAt) {
            syncSubscriptionState(
              res.subscriptionExpiresAt,
              res.subscriptionPlanLabel ?? null
            );
          }
          fetchWallet();
        }

        return {
          success: true,
          mode: res.mode,
          status: res.status || 'pending',
          paymentMethod: res.paymentMethod,
          operator: res.operator,
          paymentLink: res.paymentLink,
          ref: res.ref,
          amount: res.amount,
          subscriptionExpiresAt: res.subscriptionExpiresAt,
          subscriptionPlanLabel: res.subscriptionPlanLabel,
        };
      } catch (err: unknown) {
        const isUnauthorized = err instanceof ApiError && err.status === 401;
        if (isUnauthorized) {
          useUserStore.getState().clearAuthToken();
        }
        const msg =
          err instanceof Error
            ? err.message
            : 'Erreur lors de l’initiation du paiement.';
        setError(msg);
        return { success: false, error: msg, requiresReauth: isUnauthorized };
      } finally {
        setIsLoading(false);
      }
    },
    [fetchWallet, syncSubscriptionState]
  );

  const checkPaymentStatus = useCallback(
    async (ref: string): Promise<PaymentStatusResponse> => {
      try {
        const res = await paymentService.getPaymentStatus(ref);
        if (res.status === 'confirmed') {
          if (res.subscriptionExpiresAt) {
            syncSubscriptionState(
              res.subscriptionExpiresAt,
              res.subscriptionPlanLabel ?? null
            );
          }
          fetchWallet();
        }
        return res;
      } catch {
        return { status: 'pending', ref };
      }
    },
    [fetchWallet, syncSubscriptionState]
  );

  return {
    currentUser,
    transactions,
    subscriptionExpiresAt,
    subscriptionPlanLabel,
    hasActiveSubscription,
    isLoading,
    error,
    clearError,
    fetchWallet,
    createSubscriptionPaymentLink,
    checkPaymentStatus,
  };
}
