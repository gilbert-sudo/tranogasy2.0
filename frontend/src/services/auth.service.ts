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

  checkUserExists: async (phone: string): Promise<boolean> => {
    try {
      await apiFetch<{ exists: boolean }>(`/users/exist/${encodeURIComponent(phone)}`, {
        method: 'GET',
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return false;
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
