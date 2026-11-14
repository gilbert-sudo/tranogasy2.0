import { apiFetch, ApiError } from './api';

export interface AuthUserPayload {
  username: string;
  phone: string;
  email?: string;
  password?: string;
}

export interface ClaimableListingPreview {
  _id: string;
  title: string;
  type: 'sale' | 'rent' | 'colocation' | string;
  price?: number | null;
  rent?: number | null;
  city?: {
    fokontany?: string;
    commune?: string;
    district?: string;
    region?: string;
  } | null;
  thumbnail?: string | null;
  matchedPhone?: string | null;
  sources?: {
    username?: string | null;
    avatar?: string | null;
  } | null;
}

export interface SuggestedFbProfile {
  username: string | null;
  avatar: string | null;
}

export interface OtpRequestResponse {
  success: boolean;
  phone: string;
  provider?: string;
  message?: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
  message: string;
  isNew: boolean;
  user: Record<string, unknown>;
  authToken: string;
  claimableListings: ClaimableListingPreview[];
  suggestedProfile: SuggestedFbProfile | null;
}

export const authService = {
  login: (phone: string, password?: string) => {
    return apiFetch<any>('/users/login', {
      method: 'POST',
      body: JSON.stringify(password ? { phone, password } : { phone }),
    });
  },

  phoneLogin: (phone: string, defaultUsername?: string) => {
    return apiFetch<{ message: string; isNew: boolean; user: any }>('/users/phone-login', {
      method: 'POST',
      body: JSON.stringify({ phone, username: defaultUsername }),
    });
  },

  requestOtp: (phone: string) => {
    return apiFetch<OtpRequestResponse>('/users/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  verifyOtp: (phone: string, code: string) => {
    return apiFetch<OtpVerifyResponse>('/users/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  },

  checkUserExists: async (phone: string): Promise<{ exists: boolean; user?: any }> => {
    try {
      const data = await apiFetch<any>(`/users/exist/${encodeURIComponent(phone)}`, {
        method: 'GET',
      });
      return {
        exists: true,
        user: data?.user || (data?._id ? data : null),
      };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { exists: false };
      }
      throw err;
    }
  },

  signup: (userData: AuthUserPayload) => {
    return apiFetch<any>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },
};
