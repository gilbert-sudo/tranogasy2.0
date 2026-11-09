import { create } from 'zustand';
import type { PaymentTransaction } from '@/services/payment.service';

interface PaymentStore {
  transactions: PaymentTransaction[];
  isWalletLoaded: boolean;
  walletUserId: string | null;
  setTransactions: (transactions: PaymentTransaction[], userId?: string | null) => void;
  addTransaction: (transaction: PaymentTransaction) => void;
  clearWallet: () => void;
}

export const usePaymentStore = create<PaymentStore>((set) => ({
  transactions: [],
  isWalletLoaded: false,
  walletUserId: null,
  setTransactions: (transactions, userId = null) =>
    set({
      transactions,
      isWalletLoaded: true,
      walletUserId: userId,
    }),
  addTransaction: (transaction) =>
    set((state) => ({
      transactions: [transaction, ...state.transactions],
    })),
  clearWallet: () =>
    set({
      transactions: [],
      isWalletLoaded: false,
      walletUserId: null,
    }),
}));
