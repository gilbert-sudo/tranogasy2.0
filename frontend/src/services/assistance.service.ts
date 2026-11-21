import { apiFetch } from './api';
import type { AssistancePlanId } from '@/lib/platform';
import type { CheckoutPaymentMethod } from './payment.service';

export type { CheckoutPaymentMethod };

export interface AssistanceReceiptTransaction {
  _id: string;
  user: string;
  type: string;
  operator: string;
  reason: string;
  amount: number;
  phoneNumber: string;
  status: 'pending' | 'confirmed' | 'refused' | 'redone' | 'failed';
  ref: string;
  category?: string;
  subscriptionPlanId?: string;
  subscriptionDurationHours?: number;
  subscriptionExpiresAt?: string | null;
  assistancePlanId?: AssistancePlanId | string;
  assistanceDurationHours?: number;
  assistanceExpiresAt?: string | null;
  created_at: string;
}

export interface CreateAssistanceLinkPayload {
  userId?: string;
  userPhone?: string;
  planId: AssistancePlanId;
  paymentMethod?: CheckoutPaymentMethod;
  temporaryCode?: string;
  clientName?: string;
  payerEmail?: string;
  payerPhone?: string;
  successUrl?: string;
  failureUrl?: string;
}

export interface CreateAssistanceLinkResponse {
  success: boolean;
  mode?: 'direct' | 'link';
  status?: 'pending' | 'confirmed' | 'failed' | 'refused';
  paymentMethod?: CheckoutPaymentMethod | string;
  operator?: string;
  paymentLink?: string;
  ref: string;
  amount: number;
  phoneNumber?: string;
  assistancePlanId?: AssistancePlanId;
  assistanceDurationHours?: number;
  assistanceExpiresAt?: string | null;
  assistancePlanLabel?: string | null;
  notificationToken?: string;
  failureReason?: string;
}

export interface AssistanceStatusResponse {
  status: 'pending' | 'confirmed' | 'failed' | 'refused';
  ref: string;
  amount?: number;
  operator?: string;
  category?: string;
  subscriptionExpiresAt?: string | null;
  subscriptionPlanLabel?: string | null;
  assistancePlanId?: string;
  assistanceDurationHours?: number;
  assistanceExpiresAt?: string | null;
  assistancePlanLabel?: string | null;
  paymentLink?: string;
  failureReason?: string;
}

export interface AssistanceHistoryResponse {
  subscriptionExpiresAt?: string | null;
  subscriptionPlanLabel?: string | null;
  assistanceExpiresAt?: string | null;
  assistancePlanLabel?: string | null;
  payments: AssistanceReceiptTransaction[];
}

export const assistanceService = {
  createAssistanceLink: (
    payload: CreateAssistanceLinkPayload
  ): Promise<CreateAssistanceLinkResponse> => {
    return apiFetch<CreateAssistanceLinkResponse>('/payments/create-assistance-link', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAssistanceStatus: (ref: string): Promise<AssistanceStatusResponse> => {
    return apiFetch<AssistanceStatusResponse>(
      `/payments/status/${encodeURIComponent(ref)}`
    );
  },

  getUserAssistanceHistory: (
    identifier: string
  ): Promise<AssistanceHistoryResponse> => {
    return apiFetch<AssistanceHistoryResponse>(
      `/payments/wallet/${encodeURIComponent(identifier)}`
    );
  },
};
