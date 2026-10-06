import { apiFetch } from './api';

export const authService = {
  login: (phone: string, password: string) => {
    return apiFetch<any>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
  },

  checkUserExists: async (phone: string) => {
    try {
      // The API returns OK if user exists and we throw error in the component if so.
      // We can use apiFetch but if it throws we know the user doesn't exist.
      // Wait, let's look at the implementation in signup:
      // if (checkRes.ok) { throw new Error("Ce numéro..."); }
      // This means a 200 OK means user exists. A 404 means user does not exist.
      // apiFetch throws on non-200.
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/users/exist/${phone}`);
      if (res.ok) {
        return true; // User exists
      }
      return false; // User does not exist
    } catch (e) {
      return false;
    }
  },

  signup: (userData: any) => {
    return apiFetch<any>('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },
};
