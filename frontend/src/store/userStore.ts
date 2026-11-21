import { create } from 'zustand';
import { usePropertyStore } from './propertyStore';
import { usePaymentStore } from './paymentStore';
import { useFavoriteStore } from './favoriteStore';

interface UserStore {
  user: any | null;
  sessionEpoch: number;
  setUser: (user: any) => void;
  clearAuthToken: () => void;
  updateSubscription: (expiresAt: string | null, planLabel?: string | null) => void;
  updateAssistance: (expiresAt: string | null, planLabel?: string | null) => void;
  logout: () => void;
  initialize: () => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  sessionEpoch: 0,
  setUser: (user) => {
    const resolvedToken = user?.authToken || user?.user?.authToken;
    const normalizedUser =
      user && resolvedToken && !user.authToken
        ? { ...user, authToken: String(resolvedToken) }
        : user;
    set((state) => ({
      user: normalizedUser,
      sessionEpoch: normalizedUser ? state.sessionEpoch : state.sessionEpoch + 1,
    }));
    if (typeof window !== 'undefined' && resolvedToken) {
      try {
        localStorage.setItem('authToken', String(resolvedToken));
      } catch {
        // Ignore storage quota errors
      }
    }
  },
  clearAuthToken: () => {
    const current = get().user;
    if (current) {
      const cleaned = { ...current };
      delete cleaned.authToken;
      if (cleaned.user && typeof cleaned.user === 'object') {
        const cleanedNested = { ...cleaned.user };
        delete cleanedNested.authToken;
        cleaned.user = cleanedNested;
      }
      set({ user: cleaned });
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('user', JSON.stringify(cleaned));
        } catch {
          // Ignore storage quota errors
        }
      }
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('authToken');
      } catch {
        // Ignore storage errors
      }
    }
  },
  updateSubscription: (expiresAt: string | null, planLabel?: string | null) => {
    const current = get().user;
    if (!current) return;
    const patch = {
      subscriptionExpiresAt: expiresAt,
      ...(planLabel !== undefined ? { subscriptionPlanLabel: planLabel } : {}),
    };
    const updated = current.user
      ? { ...current, user: { ...current.user, ...patch } }
      : { ...current, ...patch };
    set({ user: updated });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('user', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist updated user subscription', e);
      }
    }
  },
  updateAssistance: (expiresAt: string | null, planLabel?: string | null) => {
    const current = get().user;
    if (!current) return;
    const patch = {
      assistanceExpiresAt: expiresAt,
      ...(planLabel !== undefined ? { assistancePlanLabel: planLabel } : {}),
    };
    const updated = current.user
      ? { ...current, user: { ...current.user, ...patch } }
      : { ...current, ...patch };
    set({ user: updated });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('user', JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to persist updated user assistance status', e);
      }
    }
  },
  logout: () => {
    set((state) => ({ user: null, sessionEpoch: state.sessionEpoch + 1 }));
    usePropertyStore.getState().clearUserProperties();
    usePaymentStore.getState().clearWallet();
    useFavoriteStore.getState().clearFavorites();
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('user');
        localStorage.removeItem('authToken');
        localStorage.removeItem('tranogasy_user_properties');
      } catch (e) {
        console.error('Failed to clear session storage on logout', e);
      }
    }
  },
  initialize: () => {
    if (typeof window !== 'undefined' && !get().user) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          const storedToken =
            parsed?.authToken ||
            parsed?.user?.authToken ||
            localStorage.getItem('authToken') ||
            undefined;
          const hydrated =
            storedToken && parsed && typeof parsed === 'object' && !parsed.authToken
              ? { ...parsed, authToken: String(storedToken) }
              : parsed;
          set({ user: hydrated });
        } catch (e) {
          console.error('Failed to parse user from local storage', e);
        }
      }
    }
  },
}));
