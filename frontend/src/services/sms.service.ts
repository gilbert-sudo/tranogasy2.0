import { apiFetch } from './api';

export interface SendSmsResult {
  provider: 'befiana' | 'mapi';
  success: boolean;
  data: any;
}

export const smsService = {
  /**
   * 1️⃣ Befiana Provider (direct API call)
   */
  sendBefianaSMS: async (phoneNumber: string, message: string): Promise<SendSmsResult> => {
    // Normalize phone number (digits only, remove leading zeros)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const phoneNumberWithoutLeadingZero = cleanPhone.replace(/^0+/, '');
    const apiKey =
      process.env.NEXT_PUBLIC_BEFIANA_API_KEY || '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    try {
      const res = await fetch('https://api.befiana.cloud/api/smsko/v1/send/', {
        method: 'POST',
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNumberWithoutLeadingZero,
          message,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const json = await res.json().catch(() => ({}));

      if (!res.ok || json.error || json.status === false) {
        throw new Error(json.error || `Befiana SMS failed (HTTP ${res.status})`);
      }

      return { provider: 'befiana', success: true, data: json };
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw new Error(error.name === 'AbortError' ? 'Befiana request timeout (8s)' : error.message);
    }
  },

  /**
   * 2️⃣ MAPI Provider (via Backend proxy: /sms/send-sms)
   */
  sendMapiSMS: async (phoneNumber: string, message: string): Promise<SendSmsResult> => {
    try {
      const data = await apiFetch<any>('/sms/send-sms', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: phoneNumber,
          message,
        }),
      });

      return { provider: 'mapi', success: true, data };
    } catch (error: any) {
      throw new Error(error.message || 'MAPI SMS failed');
    }
  },

  /**
   * 3️⃣ Combined sendSMS:
   * Try Befiana first; on error or timeout, switch to backend proxy MAPI.
   */
  sendSMS: async (phoneNumber: string, message: string): Promise<SendSmsResult> => {
    try {
      return await smsService.sendBefianaSMS(phoneNumber, message);
    } catch {
      try {
        return await smsService.sendMapiSMS(phoneNumber, message);
      } catch (mapiError: any) {
        throw new Error(
          'Impossible d\'envoyer le SMS de confirmation. Veuillez vérifier votre connexion ou réessayer plus tard.'
        );
      }
    }
  },
};
