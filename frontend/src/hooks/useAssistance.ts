import { useState, useCallback } from 'react';
import {
  assistanceService,
  AssistanceReceiptTransaction,
  AssistanceStatusResponse,
} from '@/services/assistance.service';
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
    } catch {
      // Fallback to local cache when backend is unreachable
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
        payerEmail?: string;
        payerPhone?: string;
        successUrl?: string;
        failureUrl?: string;
      }
    ): Promise<{
      success: boolean;
      paymentLink?: string;
      ref?: string;
      amount?: number;
      error?: string;
    }> => {
      setError(null);
      const activeUser = useUserStore.getState().user?.user || useUserStore.getState().user;
      if (!activeUser) {
        const msg = 'Veuillez vous connecter pour continuer.';
        setError(msg);
        return { success: false, error: msg };
      }

      setIsLoading(true);
      try {
        const isSyntheticId = String(activeUser._id || '').startsWith('tg_');
        const res = await assistanceService.createAssistanceLink({
          userId: !isSyntheticId ? activeUser._id : undefined,
          userPhone: activeUser.phone,
          planId,
          clientName: activeUser.username || undefined,
          payerEmail: options?.payerEmail || activeUser.email || undefined,
          payerPhone: options?.payerPhone || activeUser.phone || undefined,
          successUrl: options?.successUrl,
          failureUrl: options?.failureUrl,
        });

        return {
          success: true,
          paymentLink: res.paymentLink,
          ref: res.ref,
          amount: res.amount,
        };
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Erreur lors de la création du lien de paiement.';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setIsLoading(false);
      }
    },
    []
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
