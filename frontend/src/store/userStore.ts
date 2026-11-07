import { create } from 'zustand';
import { usePropertyStore } from './propertyStore';

interface UserStore {
  user: any | null;
  setUser: (user: any) => void;
  logout: () => void;
  initialize: () => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => {
    set({ user: null });
    usePropertyStore.getState().clearUserProperties();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
    }
  },
  initialize: () => {
    if (typeof window !== 'undefined' && !get().user) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          set({ user: JSON.parse(savedUser) });
        } catch (e) {
          console.error("Failed to parse user from local storage", e);
        }
      }
    }
  }
}));
