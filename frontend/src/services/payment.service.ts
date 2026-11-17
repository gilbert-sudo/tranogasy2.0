import { apiFetch } from './api';
import type { SubscriptionPlanId } from '@/lib/platform';

export type MobileMoneyOperatorId = 'mvola' | 'airtel' | 'orange' | 'card' | 'papi';

export interface PaymentTransaction {
  _id: string;
  user: string;
  type: string;
  operator: MobileMoneyOperatorId | string;
  reason: string;
  payload: string;
  amount: number;
  phoneNumber: string;
  status: 'pending' | 'confirmed' | 'refused' | 'redone' | 'failed';
  ref: string;
  category?: string;
  subscriptionPlanId?: SubscriptionPlanId | string;
  subscriptionDurationHours?: number;
  subscriptionExpiresAt?: string | null;
  assistancePlanId?: string;
  assistanceDurationHours?: number;
  assistanceExpiresAt?: string | null;
  papiPaymentLink?: string;
  created_at: string;
}

export interface CreateSubscriptionLinkPayload {
  userId?: string;
  userPhone?: string;
  planId: SubscriptionPlanId;
  clientName?: string;
  payerEmail?: string;
  payerPhone?: string;
  successUrl?: string;
  failureUrl?: string;
}

export interface CreateSubscriptionLinkResponse {
  success: boolean;
  paymentLink: string;
  ref: string;
  amount: number;
  subscriptionPlanId: SubscriptionPlanId;
  subscriptionDurationHours: number;
  notificationToken?: string;
}

export interface PaymentStatusResponse {
  status: 'pending' | 'confirmed' | 'failed' | 'refused';
  ref: string;
  amount?: number;
  operator?: string;
  category?: string;
  subscriptionPlanId?: string;
  subscriptionDurationHours?: number;
  subscriptionExpiresAt?: string | null;
  subscriptionPlanLabel?: string | null;
  paymentLink?: string;
  failureReason?: string;
}

export interface WalletResponse {
  subscriptionExpiresAt?: string | null;
  subscriptionPlanLabel?: string | null;
  payments: PaymentTransaction[];
}

export const paymentService = {
  createSubscriptionLink: (
    payload: CreateSubscriptionLinkPayload
  ): Promise<CreateSubscriptionLinkResponse> => {
    return apiFetch<CreateSubscriptionLinkResponse>(
      '/payments/create-subscription-link',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  getPaymentStatus: (ref: string): Promise<PaymentStatusResponse> => {
    return apiFetch<PaymentStatusResponse>(
      `/payments/status/${encodeURIComponent(ref)}`
    );
  },

  getUserWallet: (identifier: string): Promise<WalletResponse> => {
    return apiFetch<WalletResponse>(
      `/payments/wallet/${encodeURIComponent(identifier)}`
    );
  },
};
