import { create } from 'zustand';
import {
  PublicProfileResponse,
  PublicProfileUser,
} from '@/services/user.service';

export type ProfileListingTab = 'all' | 'rent' | 'sale';

interface ProfileStoreState {
  profilesByKey: Record<string, PublicProfileResponse>;
  activeTab: ProfileListingTab;
  searchQuery: string;
  isEditModalOpen: boolean;

  // Synchronous setters
  setProfileData: (cacheKey: string, data: PublicProfileResponse) => void;
  patchCachedUser: (userId: string, updatedUser: Partial<PublicProfileUser>) => void;
  setActiveTab: (tab: ProfileListingTab) => void;
  setSearchQuery: (query: string) => void;
  setIsEditModalOpen: (open: boolean) => void;
}

export const useProfileStore = create<ProfileStoreState>((set) => ({
  profilesByKey: {},
  activeTab: 'all',
  searchQuery: '',
  isEditModalOpen: false,

  setProfileData: (cacheKey, data) =>
    set((state) => ({
      profilesByKey: {
        ...state.profilesByKey,
        [cacheKey]: data,
      },
    })),

  patchCachedUser: (userId, updatedUser) =>
    set((state) => {
      const next = { ...state.profilesByKey };
      Object.keys(next).forEach((key) => {
        const entry = next[key];
        if (entry && (entry.user._id === userId || key.startsWith(userId))) {
          next[key] = {
            ...entry,
            user: {
              ...entry.user,
              ...updatedUser,
            },
          };
        }
      });
      return { profilesByKey: next };
    }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsEditModalOpen: (open) => set({ isEditModalOpen: open }),
}));

