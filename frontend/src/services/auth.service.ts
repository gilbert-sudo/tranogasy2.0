import { apiFetch, ApiError } from './api';

export interface AuthUserPayload {
  username: string;
  phone: string;
  email?: string;
  password?: string;
}

export const authService = {
  login: (phone: string, password: string) => {
    return apiFetch<any>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
  },

  phoneLogin: (phone: string, defaultUsername?: string) => {
    return apiFetch<{ message: string; isNew: boolean; user: any }>('/users/phone-login', {
      method: 'POST',
      body: JSON.stringify({ phone, username: defaultUsername }),
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
