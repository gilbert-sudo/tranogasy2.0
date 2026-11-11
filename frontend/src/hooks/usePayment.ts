import { useState, useCallback } from 'react';
import {
  paymentService,
  MIN_JP_TOKENS,
  MAX_JP_TOKENS,
  ARIARY_PER_JP,
  MOBILE_MONEY_OPERATORS,
  MobileMoneyOperatorId,
  PaymentTransaction,
  tokensToAriary,
} from '@/services/payment.service';
import { useUserStore } from '@/store/userStore';
import { usePaymentStore } from '@/store/paymentStore';

const LOCAL_TRANSACTIONS_STORAGE_KEY = 'tranogasy_jp_transactions';
const KNOWN_ACCOUNTS_STORAGE_KEY = 'tranogasy_phone_accounts';

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

function syncBalanceInLocalRegistry(phone: string | undefined | null, balance: number) {
  if (typeof window === 'undefined' || !phone) return;
  try {
    const raw = localStorage.getItem(KNOWN_ACCOUNTS_STORAGE_KEY);
    if (!raw) return;
    const registry = JSON.parse(raw) || {};
    if (registry[phone]) {
      registry[phone] = { ...registry[phone], balance };
      localStorage.setItem(KNOWN_ACCOUNTS_STORAGE_KEY, JSON.stringify(registry));
    }
  } catch {
    // Ignore
  }
}

export function usePayment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const updateBalance = useUserStore((state) => state.updateBalance);

  const transactions = usePaymentStore((state) => state.transactions);
  const setTransactions = usePaymentStore((state) => state.setTransactions);
  const addTransaction = usePaymentStore((state) => state.addTransaction);

  const currentUser = user?.user || user;
  const balance: number = Number(currentUser?.balance) || 0;

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const normalizePhone = useCallback((rawPhone: string): string => {
    let cleaned = String(rawPhone || '').replace(/\D/g, '');
    if (cleaned.startsWith('261') && cleaned.length >= 12) {
      cleaned = cleaned.slice(3);
    }
    if (!cleaned.startsWith('0') && cleaned.length === 9) {
      cleaned = `0${cleaned}`;
    }
    return cleaned;
  }, []);

  const validatePurchaseInput = useCallback(
    (tokens: number, operatorId: MobileMoneyOperatorId, senderPhone: string): string | null => {
      if (!Number.isFinite(tokens) || !Number.isInteger(tokens) || tokens < MIN_JP_TOKENS) {
        return `Le minimum d'achat est de ${MIN_JP_TOKENS} JP (${(MIN_JP_TOKENS * ARIARY_PER_JP).toLocaleString('fr-FR')} Ar).`;
      }
      if (tokens > MAX_JP_TOKENS) {
        return `Le maximum par transaction est de ${MAX_JP_TOKENS.toLocaleString('fr-FR')} JP.`;
      }

      const operator = MOBILE_MONEY_OPERATORS.find((op) => op.id === operatorId);
      if (!operator) {
        return 'Veuillez choisir un opérateur Mobile Money valide.';
      }

      const cleanPhone = normalizePhone(senderPhone);
      if (!cleanPhone) {
        return "Veuillez saisir le numéro Mobile Money de l'expéditeur.";
      }

      const phoneRegex = /^03[23478]\d{7}$/;
      if (!phoneRegex.test(cleanPhone)) {
        return 'Numéro invalide. Utilisez un numéro malgache à 10 chiffres (032, 033, 034, 037 ou 038).';
      }

      const merchantNumbers = MOBILE_MONEY_OPERATORS.map((op) => op.merchantNumber);
      if (merchantNumbers.includes(cleanPhone)) {
        return "Veuillez saisir votre propre numéro d'expéditeur et non le numéro marchand TranoGasy.";
      }

      return null;
    },
    [normalizePhone]
  );

  const fetchWallet = useCallback(async () => {
    const activeUser = useUserStore.getState().user?.user || useUserStore.getState().user;
    const identifier = activeUser?._id || activeUser?.phone;
    if (!identifier) return;

    const localKey = activeUser?.phone || activeUser?._id;
    const isSyntheticId = String(activeUser?._id || '').startsWith('tg_');

    try {
      const targetParam = !isSyntheticId && activeUser?._id ? activeUser._id : activeUser?.phone;
      if (targetParam) {
        const res = await paymentService.getUserWallet(targetParam);
        if (typeof res?.balance === 'number') {
          updateBalance(res.balance);
          syncBalanceInLocalRegistry(activeUser?.phone, res.balance);
        }
        if (Array.isArray(res?.payments)) {
          setTransactions(res.payments, identifier);
          if (localKey) {
            saveLocalTransactions(localKey, res.payments);
          }
          return;
        }
      }
    } catch {
      // Fallback to local cache when backend is unreachable
    }

    if (localKey) {
      const cached = getLocalTransactions(localKey);
      setTransactions(cached, identifier);
    }
  }, [setTransactions, updateBalance]);

  const spendTokens = useCallback(
    async (tokens: number, reason: string): Promise<{ success: boolean; newBalance?: number }> => {
      setError(null);
      const activeUser = useUserStore.getState().user?.user || useUserStore.getState().user;
      if (!activeUser) {
        setError('Veuillez vous connecter pour utiliser vos jetons JP.');
        return { success: false };
      }

      const currentBalance = Number(activeUser.balance) || 0;
      if (currentBalance < tokens) {
        setError(`Solde JP insuffisant (${currentBalance} JP disponible, ${tokens} JP requis).`);
        return { success: false };
      }

      setIsLoading(true);
      try {
        let nextBalance = currentBalance - tokens;
        const isSyntheticId = String(activeUser._id || '').startsWith('tg_');

        if (!isSyntheticId && activeUser._id) {
          try {
            const res = await paymentService.spendTokens({
              userId: activeUser._id,
              tokens,
              reason,
            });
            if (typeof res?.balance === 'number') {
              nextBalance = res.balance;
            }
          } catch (apiErr: any) {
            if (apiErr?.status === 400) {
              throw apiErr;
            }
          }
        }

        updateBalance(nextBalance);
        syncBalanceInLocalRegistry(activeUser.phone, nextBalance);
        return { success: true, newBalance: nextBalance };
      } catch (err: any) {
        setError(err?.message || "Impossible d'utiliser les jetons JP.");
        return { success: false };
      } finally {
        setIsLoading(false);
      }
    },
    [updateBalance]
  );

  const createPapiPaymentLink = useCallback(
    async (
      tokens: number,
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
      tokens?: number;
      error?: string;
    }> => {
      setError(null);
      if (!Number.isFinite(tokens) || !Number.isInteger(tokens) || tokens < MIN_JP_TOKENS) {
        const msg = `Le minimum d'achat est de ${MIN_JP_TOKENS} JP (${(MIN_JP_TOKENS * ARIARY_PER_JP).toLocaleString('fr-FR')} Ar).`;
        setError(msg);
        return { success: false, error: msg };
      }

      const activeUser = useUserStore.getState().user?.user || useUserStore.getState().user;
      if (!activeUser) {
        const msg = 'Veuillez vous connecter pour acheter des jetons JP.';
        setError(msg);
        return { success: false, error: msg };
      }

      setIsLoading(true);
      try {
        const isSyntheticId = String(activeUser._id || '').startsWith('tg_');
        const res = await paymentService.createPaymentLink({
          userId: !isSyntheticId ? activeUser._id : undefined,
          userPhone: activeUser.phone,
          tokens,
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
          tokens: res.tokens,
        };
      } catch (err: any) {
        const msg =
          err?.message || 'Erreur lors de la création du lien de paiement.';
        setError(msg);
        return { success: false, error: msg };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const checkPaymentStatus = useCallback(
    async (
      ref: string
    ): Promise<{
      status: 'pending' | 'confirmed' | 'failed' | 'refused';
      tokens?: number;
      amount?: number;
      balance?: number;
      operator?: string;
      failureReason?: string;
    }> => {
      try {
        const res = await paymentService.getPaymentStatus(ref);
        if (res.status === 'confirmed' && typeof res.balance === 'number') {
          updateBalance(res.balance);
          const activeUser =
            useUserStore.getState().user?.user || useUserStore.getState().user;
          syncBalanceInLocalRegistry(activeUser?.phone, res.balance);
          fetchWallet();
        }
        return res;
      } catch {
        return { status: 'pending' };
      }
    },
    [updateBalance, fetchWallet]
  );

  return {
    balance,
    transactions,
    isLoading,
    error,
    clearError,
    fetchWallet,
    createPapiPaymentLink,
    checkPaymentStatus,
    spendTokens,
    validatePurchaseInput,
    normalizePhone,
  };
}
