import { useState, useCallback } from 'react';
import {
  assistanceService,
  AssistanceReceiptTransaction,
  AssistanceStatusResponse,
  CheckoutPaymentMethod,
} from '@/services/assistance.service';
import { ApiError, getStoredSessionAuth } from '@/services/api';
import type { AssistancePlanId } from '@/lib/platform';
import { useUserStore } from '@/store/userStore';

const LOCAL_RECEIPTS_STORAGE_KEY = 'tranogasy_assistance_receipts';

function getLocalReceipts(userIdOrPhone: string): AssistanceReceiptTransaction[] {
  if (typeof window === 'undefined' || !userIdOrPhone) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_RECEIPTS_STORAGE_KEY}_${userIdOrPhone}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalReceipts(userIdOrPhone: string, list: AssistanceReceiptTransaction[]) {
  if (typeof window === 'undefined' || !userIdOrPhone) return;
  try {
    localStorage.setItem(
      `${LOCAL_RECEIPTS_STORAGE_KEY}_${userIdOrPhone}`,
      JSON.stringify(list.slice(0, 25))
    );
  } catch {
    // Ignore quota errors
  }
}

export function useAssistance() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<AssistanceReceiptTransaction[]>([]);
  const [assistanceExpiresAt, setAssistanceExpiresAt] = useState<string | null>(null);
  const [assistancePlanLabel, setAssistancePlanLabel] = useState<string | null>(null);
  const [hasActiveAssistance, setHasActiveAssistance] = useState(false);

  const user = useUserStore((state) => state.user);
  const updateAssistance = useUserStore((state) => state.updateAssistance);
  const currentUser = user?.user || user;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const syncExpirationStatus = useCallback(
    (expiresAt: string | null, planLabel?: string | null) => {
      setAssistanceExpiresAt(expiresAt);
      if (planLabel !== undefined) {
        setAssistancePlanLabel(planLabel);
      }
      setHasActiveAssistance(
        Boolean(expiresAt) && new Date(expiresAt as string).getTime() > Date.now()
      );
      updateAssistance(expiresAt, planLabel);
    },
    [updateAssistance]
  );

  const fetchAssistanceHistory = useCallback(async () => {
    const { user: startSession, sessionEpoch: startEpoch } = useUserStore.getState();
    const activeUser = startSession?.user || startSession;
    const identifier = activeUser?._id || activeUser?.phone;
    if (!identifier) return;

    const initialExpiry = activeUser?.assistanceExpiresAt || null;
    if (initialExpiry) {
      syncExpirationStatus(
        String(initialExpiry),
        activeUser.assistancePlanLabel || null
      );
    }

    const localKey = activeUser?.phone || activeUser?._id;
    const isSyntheticId = String(activeUser?._id || '').startsWith('tg_');
    const { authToken } = getStoredSessionAuth();

    if (authToken) {
      try {
        const targetParam = !isSyntheticId && activeUser?._id ? activeUser._id : activeUser?.phone;
        if (targetParam) {
          const res = await assistanceService.getUserAssistanceHistory(targetParam);
          const { user: latestSession, sessionEpoch: latestEpoch } = useUserStore.getState();
          if (latestEpoch !== startEpoch || !latestSession) {
            return;
          }

          const expiresAt = res?.assistanceExpiresAt;
          const planLabel = res?.assistancePlanLabel;
          if (expiresAt !== undefined) {
            syncExpirationStatus(expiresAt || null, planLabel ?? null);
          } else if (planLabel !== undefined) {
            setAssistancePlanLabel(planLabel || null);
          }
          if (Array.isArray(res?.payments)) {
            const onlyConfirmed = res.payments.filter(
              (tx) => tx.status === 'confirmed'
            );
            setReceipts(onlyConfirmed);
            if (localKey) {
              saveLocalReceipts(localKey, onlyConfirmed);
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
      const confirmedCached = getLocalReceipts(localKey).filter(
        (tx) => tx.status === 'confirmed'
      );
      setReceipts(confirmedCached);
    }
  }, [syncExpirationStatus]);

  const createAssistancePaymentLink = useCallback(
    async (
      planId: AssistancePlanId,
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
      assistanceExpiresAt?: string | null;
      assistancePlanLabel?: string | null;
      error?: string;
      requiresReauth?: boolean;
    }> => {
      setError(null);
      const activeUser = useUserStore.getState().user?.user || useUserStore.getState().user;
      if (!activeUser) {
        const msg = 'Veuillez vous connecter pour continuer.';
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
        const res = await assistanceService.createAssistanceLink({
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
          if (res.assistanceExpiresAt) {
            syncExpirationStatus(
              res.assistanceExpiresAt,
              res.assistancePlanLabel ?? null
            );
          }
          fetchAssistanceHistory();
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
          assistanceExpiresAt: res.assistanceExpiresAt,
          assistancePlanLabel: res.assistancePlanLabel,
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
    [fetchAssistanceHistory, syncExpirationStatus]
  );

  const checkAssistancePaymentStatus = useCallback(
    async (ref: string): Promise<AssistanceStatusResponse> => {
      try {
        const res = await assistanceService.getAssistanceStatus(ref);
        if (res.status === 'confirmed') {
          const expiresAt = res.assistanceExpiresAt || null;
          const planLabel = res.assistancePlanLabel ?? null;
          if (expiresAt) {
            syncExpirationStatus(expiresAt, planLabel);
          } else if (planLabel) {
            setAssistancePlanLabel(planLabel);
          }
          fetchAssistanceHistory();
        }
        return res;
      } catch {
        return { status: 'pending', ref };
      }
    },
    [fetchAssistanceHistory, syncExpirationStatus]
  );

  return {
    currentUser,
    receipts,
    assistanceExpiresAt,
    assistancePlanLabel,
    hasActiveAssistance,
    isLoading,
    error,
    clearError,
    fetchAssistanceHistory,
    createAssistancePaymentLink,
    checkAssistancePaymentStatus,
  };
}
