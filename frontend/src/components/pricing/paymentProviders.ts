import type { CheckoutPaymentMethod } from '@/services/payment.service';

export interface PaymentProviderMeta {
  id: CheckoutPaymentMethod;
  name: string;
  shortName: string;
  image: string;
  prefixesLabel: string;
  prefixes: string[];
  placeholder: string;
  accentHex: string;
  cardActiveClass: string;
  badgeClass: string;
  inputFocusClass: string;
  buttonClass: string;
  isCard?: boolean;
}

export const PAYMENT_PROVIDERS: Record<CheckoutPaymentMethod, PaymentProviderMeta> = {
  MVOLA: {
    id: 'MVOLA',
    name: 'MVola',
    shortName: 'MVola',
    image: '/images/payments/Mvola.jpg',
    prefixesLabel: '034 • 038',
    prefixes: ['034', '038'],
    placeholder: '034 12 345 67',
    accentHex: '#00703c',
    cardActiveClass:
      'border-[#00703c] bg-[#00703c]/[0.06] dark:bg-[#00703c]/[0.16] ring-2 ring-[#00703c]/25 shadow-sm',
    badgeClass: 'bg-[#00703c] text-white',
    inputFocusClass:
      'focus-within:border-[#00703c] focus-within:ring-3 focus-within:ring-[#00703c]/20',
    buttonClass: 'bg-[#00703c] hover:bg-[#005a30] text-white',
  },
  ORANGE_MONEY: {
    id: 'ORANGE_MONEY',
    name: 'Orange Money',
    shortName: 'Orange Money',
    image: '/images/payments/orange money.jpg',
    prefixesLabel: '032 • 037',
    prefixes: ['032', '037'],
    placeholder: '032 12 345 67',
    accentHex: '#ff6600',
    cardActiveClass:
      'border-[#ff6600] bg-[#ff6600]/[0.06] dark:bg-[#ff6600]/[0.16] ring-2 ring-[#ff6600]/25 shadow-sm',
    badgeClass: 'bg-[#ff6600] text-white',
    inputFocusClass:
      'focus-within:border-[#ff6600] focus-within:ring-3 focus-within:ring-[#ff6600]/20',
    buttonClass: 'bg-[#ff6600] hover:bg-[#e05a00] text-white',
  },
  AIRTEL_MONEY: {
    id: 'AIRTEL_MONEY',
    name: 'Airtel Money',
    shortName: 'Airtel Money',
    image: '/images/payments/airtel money.jpg',
    prefixesLabel: '033',
    prefixes: ['033'],
    placeholder: '033 12 345 67',
    accentHex: '#ed1c24',
    cardActiveClass:
      'border-[#ed1c24] bg-[#ed1c24]/[0.06] dark:bg-[#ed1c24]/[0.16] ring-2 ring-[#ed1c24]/25 shadow-sm',
    badgeClass: 'bg-[#ed1c24] text-white',
    inputFocusClass:
      'focus-within:border-[#ed1c24] focus-within:ring-3 focus-within:ring-[#ed1c24]/20',
    buttonClass: 'bg-[#ed1c24] hover:bg-[#cf171e] text-white',
  },
  CARD: {
    id: 'CARD',
    name: 'Carte Bancaire',
    shortName: 'Visa / BRED',
    image: '/images/payments/Bred Madagascar Visa card.jpg',
    prefixesLabel: 'Visa • MasterCard • BRED',
    prefixes: [],
    placeholder: '034 12 345 67',
    accentHex: '#005596',
    cardActiveClass:
      'border-[#005596] bg-[#005596]/[0.06] dark:bg-[#005596]/[0.18] ring-2 ring-[#005596]/25 shadow-sm',
    badgeClass: 'bg-[#005596] text-white',
    inputFocusClass:
      'focus-within:border-[#005596] focus-within:ring-3 focus-within:ring-[#005596]/20',
    buttonClass: 'bg-[#005596] hover:bg-[#00447a] text-white',
    isCard: true,
  },
};

export const MOBILE_MONEY_PROVIDER_LIST: PaymentProviderMeta[] = [
  PAYMENT_PROVIDERS.MVOLA,
  PAYMENT_PROVIDERS.ORANGE_MONEY,
  PAYMENT_PROVIDERS.AIRTEL_MONEY,
];

export const ALL_PAYMENT_PROVIDERS_LIST: PaymentProviderMeta[] = [
  PAYMENT_PROVIDERS.MVOLA,
  PAYMENT_PROVIDERS.ORANGE_MONEY,
  PAYMENT_PROVIDERS.AIRTEL_MONEY,
  PAYMENT_PROVIDERS.CARD,
];

/**
 * Normalizes a raw Malagasy phone input into up to 10 national digits (e.g. "0341234567").
 */
export function normalizeMalagasyPhoneDigits(rawPhone: string): string {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.startsWith('261')) {
    if (digits.length >= 11) {
      digits = digits.slice(3);
    }
  }
  if (digits.length > 0 && !digits.startsWith('0') && digits.startsWith('3')) {
    digits = `0${digits}`;
  }
  return digits.slice(0, 10);
}

/**
 * Formats a Malagasy phone number cleanly as the user types: "034 12 345 67"
 */
export function formatMalagasyPhoneDisplay(rawPhone: string): string {
  const digits = normalizeMalagasyPhoneDigits(rawPhone);
  if (!digits) return '';
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 5);
  const p3 = digits.slice(5, 8);
  const p4 = digits.slice(8, 10);
  return [p1, p2, p3, p4].filter(Boolean).join(' ');
}

export function detectOperatorFromPhone(
  rawPhone: string
): CheckoutPaymentMethod | null {
  const normalized = normalizeMalagasyPhoneDigits(rawPhone);
  if (normalized.startsWith('034') || normalized.startsWith('038')) {
    return 'MVOLA';
  }
  if (normalized.startsWith('032') || normalized.startsWith('037')) {
    return 'ORANGE_MONEY';
  }
  if (normalized.startsWith('033')) {
    return 'AIRTEL_MONEY';
  }
  return null;
}

export function resolveProviderMeta(
  methodOrOperator?: string | null
): PaymentProviderMeta {
  const value = String(methodOrOperator || '').toUpperCase();
  if (value.includes('ORANGE')) return PAYMENT_PROVIDERS.ORANGE_MONEY;
  if (value.includes('AIRTEL')) return PAYMENT_PROVIDERS.AIRTEL_MONEY;
  if (value.includes('CARD') || value.includes('CB') || value.includes('VISA') || value.includes('BRED')) {
    return PAYMENT_PROVIDERS.CARD;
  }
  return PAYMENT_PROVIDERS.MVOLA;
}

export function formatOperatorDisplayName(
  methodOrOperator?: string | null
): string {
  const value = String(methodOrOperator || '').toUpperCase();
  if (value.includes('MVOLA')) return 'MVola';
  if (value.includes('ORANGE')) return 'Orange Money';
  if (value.includes('AIRTEL')) return 'Airtel Money';
  if (value.includes('CARD') || value.includes('CB') || value.includes('VISA')) {
    return 'Carte Bancaire (Visa / BRED)';
  }
  return 'Mobile Money';
}

export function hasInvalidOperatorPrefix(
  method: CheckoutPaymentMethod,
  rawPhone: string
): boolean {
  if (method === 'CARD') return false;
  const normalized = normalizeMalagasyPhoneDigits(rawPhone);
  if (normalized.length === 0) return false;
  if (normalized.length >= 1 && !normalized.startsWith('0')) return true;
  if (normalized.length >= 2 && !normalized.startsWith('03')) return true;
  if (normalized.length >= 3) {
    if (
      method === 'MVOLA' &&
      !normalized.startsWith('034') &&
      !normalized.startsWith('038')
    ) {
      return true;
    }
    if (
      method === 'ORANGE_MONEY' &&
      !normalized.startsWith('032') &&
      !normalized.startsWith('037')
    ) {
      return true;
    }
    if (method === 'AIRTEL_MONEY' && !normalized.startsWith('033')) {
      return true;
    }
  }
  return false;
}

export function getPhoneValidationError(
  method: CheckoutPaymentMethod,
  rawPhone: string
): string | null {
  if (method === 'CARD') {
    return null;
  }
  const normalized = normalizeMalagasyPhoneDigits(rawPhone);
  if (!normalized) {
    if (method === 'ORANGE_MONEY') {
      return 'Saisissez un numéro Orange Money valide (032 ou 037).';
    }
    if (method === 'AIRTEL_MONEY') {
      return 'Saisissez un numéro Airtel Money valide (033).';
    }
    return 'Saisissez un numéro MVola valide (034 ou 038).';
  }
  if (
    method === 'MVOLA' &&
    (normalized.length < 3
      ? !'034'.startsWith(normalized) && !'038'.startsWith(normalized)
      : !normalized.startsWith('034') && !normalized.startsWith('038'))
  ) {
    return 'Saisissez un numéro MVola valide (034 ou 038).';
  }
  if (
    method === 'ORANGE_MONEY' &&
    (normalized.length < 3
      ? !'032'.startsWith(normalized) && !'037'.startsWith(normalized)
      : !normalized.startsWith('032') && !normalized.startsWith('037'))
  ) {
    return 'Saisissez un numéro Orange Money valide (032 ou 037).';
  }
  if (
    method === 'AIRTEL_MONEY' &&
    (normalized.length < 3
      ? !'033'.startsWith(normalized)
      : !normalized.startsWith('033'))
  ) {
    return 'Saisissez un numéro Airtel Money valide (033).';
  }
  if (!/^03[23478]\d{7}$/.test(normalized)) {
    return `Saisissez un numéro complet à 10 chiffres (${normalized.length}/10).`;
  }
  return null;
}

export function getOrangeCodeValidationError(
  method: CheckoutPaymentMethod,
  temporaryCode: string
): string | null {
  if (method !== 'ORANGE_MONEY') {
    return null;
  }
  const trimmed = temporaryCode.trim();
  if (!trimmed) {
    return 'Ce code temporaire est requis.';
  }
  if (trimmed.length < 4) {
    return 'Saisissez un code temporaire valide (4 chiffres min.).';
  }
  return null;
}
