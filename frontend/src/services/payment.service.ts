import { apiFetch } from './api';

export const MIN_JP_TOKENS = 100;
export const MAX_JP_TOKENS = 1_000_000;
export const ARIARY_PER_JP = 10; // 100 JP = 1,000 Ar

export type MobileMoneyOperatorId = 'mvola' | 'airtel' | 'orange';

export interface MobileMoneyOperatorConfig {
  id: MobileMoneyOperatorId;
  name: string;
  carrier: string;
  tagline: string;
  logo: string;
  merchantName: string;
  merchantNumber: string;
  merchantNumberFormatted: string;
  prefixes: string[];
  accentColor: string;
  badgeBgClass: string;
  ussdHint: string;
}

export const MOBILE_MONEY_OPERATORS: MobileMoneyOperatorConfig[] = [
  {
    id: 'mvola',
    name: 'MVola',
    carrier: 'Telma',
    tagline: 'Paiement instantané via Telma MVola',
    logo: '/images/payments/mvola.png',
    merchantName: 'tranogasy_telma',
    merchantNumber: '0345189896',
    merchantNumberFormatted: '034 51 898 96',
    prefixes: ['034', '038'],
    accentColor: '#00703c',
    badgeBgClass: 'bg-[#ffd100]',
    ussdHint: '#111*1*2#',
  },
  {
    id: 'airtel',
    name: 'Airtel Money',
    carrier: 'Airtel',
    tagline: 'Transfert sécurisé via Airtel Money',
    logo: '/images/payments/airtel.png',
    merchantName: 'tranogasy_airtel',
    merchantNumber: '0335562455',
    merchantNumberFormatted: '033 55 624 55',
    prefixes: ['033', '037'],
    accentColor: '#ed1c24',
    badgeBgClass: 'bg-white',
    ussdHint: '*436*2*1#',
  },
  {
    id: 'orange',
    name: 'Orange Money',
    carrier: 'Orange',
    tagline: 'Envoi rapide via Orange Money',
    logo: '/images/payments/orange.png',
    merchantName: 'tranogasy_orange',
    merchantNumber: '0321902559',
    merchantNumberFormatted: '032 19 025 59',
    prefixes: ['032'],
    accentColor: '#ff6600',
    badgeBgClass: 'bg-[#222222]',
    ussdHint: '#144*1*1#',
  },
];

export interface PaymentTransaction {
  _id: string;
  user: string;
  type: string;
  operator: MobileMoneyOperatorId;
  reason: string;
  payload: string;
  amount: number;
  tokens: number;
  phoneNumber: string;
  status: 'pending' | 'confirmed' | 'refused' | 'redone';
  ref: string;
  created_at: string;
}

export interface PurchaseTokensPayload {
  userId?: string;
  userPhone?: string;
  tokens: number;
  operator: MobileMoneyOperatorId;
  senderPhone: string;
}

export interface PurchaseTokensResponse {
  message: string;
  payment: PaymentTransaction;
  user?: any;
  balance: number;
}

export interface SpendTokensPayload {
  userId: string;
  tokens: number;
  reason: string;
}

export interface SpendTokensResponse {
  message: string;
  user?: any;
  balance: number;
}

export interface WalletResponse {
  balance: number;
  payments: PaymentTransaction[];
}

export function tokensToAriary(tokens: number): number {
  const safeTokens = Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0;
  return safeTokens * ARIARY_PER_JP;
}

export const paymentService = {
  purchaseTokens: (payload: PurchaseTokensPayload): Promise<PurchaseTokensResponse> => {
    return apiFetch<PurchaseTokensResponse>('/payments/purchase-tokens', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  spendTokens: (payload: SpendTokensPayload): Promise<SpendTokensResponse> => {
    return apiFetch<SpendTokensResponse>('/payments/spend-tokens', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getUserWallet: (identifier: string): Promise<WalletResponse> => {
    return apiFetch<WalletResponse>(`/payments/wallet/${encodeURIComponent(identifier)}`);
  },
};
