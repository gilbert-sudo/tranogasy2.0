import { create } from 'zustand';
import {
  PublicProfileResponse,
  PublicProfileUser,
  resolveProfileTarget,
  parseProfileHref,
} from '@/services/user.service';
import {
  allocateOverlayOrder,
  usePropertyDetailModalStore,
} from '@/store/propertyDetailModalStore';

export type ProfileListingTab = 'all' | 'rent' | 'sale';

export interface ProfileModalHistoryEntry {
  identifier: string;
  sourceName: string | null;
  initialUser: Partial<PublicProfileUser> | null;
  stackOrder: number;
  returnUrl: string | null;
  scrollTop: number;
  activeTab: ProfileListingTab;
  searchQuery: string;
}

interface OpenProfileModalOptions {
  sourceName?: string | null;
  initialUser?: Partial<PublicProfileUser> | null;
}

interface ProfileStoreState {
  profilesByKey: Record<string, PublicProfileResponse>;
  activeTab: ProfileListingTab;
  searchQuery: string;
  isEditModalOpen: boolean;

  // Quick Profile Overlay Modal State
  isModalOpen: boolean;
  modalIdentifier: string | null;
  modalSourceName: string | null;
  modalInitialUser: Partial<PublicProfileUser> | null;
  modalStackOrder: number;
  modalOriginUrl: string | null;
  modalReturnUrl: string | null;
  modalHistoryStack: ProfileModalHistoryEntry[];
  modalActiveScrollTop: number;
  modalRestoredScrollTop: number | null;

  // Synchronous setters
  setProfileData: (cacheKey: string, data: PublicProfileResponse) => void;
  patchCachedUser: (userId: string, updatedUser: Partial<PublicProfileUser>) => void;
  setActiveTab: (tab: ProfileListingTab) => void;
  setSearchQuery: (query: string) => void;
  setIsEditModalOpen: (open: boolean) => void;

  // Quick Profile Modal Actions
  openProfileModal: (identifier: string, options?: OpenProfileModalOptions) => void;
  openProfileFromOwner: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    owner?: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sources?: any,
    fallbackName?: string | null
  ) => void;
  openProfileFromHref: (
    href: string,
    initialUser?: Partial<PublicProfileUser> | null
  ) => void;
  popOrCloseProfileModal: () => {
    restoredEntry: ProfileModalHistoryEntry | null;
    returnUrlToRestore: string | null;
  };
  closeProfileModal: () => void;
  setModalActiveScrollTop: (scrollTop: number) => void;
  clearModalRestoredScrollTop: () => void;
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  profilesByKey: {},
  activeTab: 'all',
  searchQuery: '',
  isEditModalOpen: false,

  isModalOpen: false,
  modalIdentifier: null,
  modalSourceName: null,
  modalInitialUser: null,
  modalStackOrder: 0,
  modalOriginUrl: null,
  modalReturnUrl: null,
  modalHistoryStack: [],
  modalActiveScrollTop: 0,
  modalRestoredScrollTop: null,

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

  openProfileModal: (identifier, options) => {
    const cleanId = (identifier || '').trim();
    const sourceName = options?.sourceName ?? null;
    const initialUser = options?.initialUser ?? null;

    const state = get();
    const propModalState = usePropertyDetailModalStore.getState();

    // If this exact profile is already the topmost visible modal, just bring/keep it focused
    const isAlreadyTopmost =
      state.isModalOpen &&
      state.modalIdentifier === cleanId &&
      (state.modalSourceName || null) === (sourceName || null) &&
      (!propModalState.isOpen || state.modalStackOrder > propModalState.stackOrder);

    if (isAlreadyTopmost) {
      return;
    }

    const currentBrowserUrl =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : null;

    const nextOrder = allocateOverlayOrder();

    if (state.isModalOpen && state.modalIdentifier !== null) {
      const nextHistory: ProfileModalHistoryEntry[] = [
        ...state.modalHistoryStack,
        {
          identifier: state.modalIdentifier,
          sourceName: state.modalSourceName,
          initialUser: state.modalInitialUser,
          stackOrder: state.modalStackOrder,
          returnUrl: state.modalReturnUrl || state.modalOriginUrl,
          scrollTop: state.modalActiveScrollTop,
          activeTab: state.activeTab,
          searchQuery: state.searchQuery,
        },
      ];

      set({
        isModalOpen: true,
        modalIdentifier: cleanId,
        modalSourceName: sourceName,
        modalInitialUser: initialUser,
        modalStackOrder: nextOrder,
        modalReturnUrl: currentBrowserUrl || state.modalOriginUrl || '/',
        modalHistoryStack: nextHistory,
        modalActiveScrollTop: 0,
        modalRestoredScrollTop: null,
        activeTab: 'all',
        searchQuery: '',
        isEditModalOpen: false,
      });
      return;
    }

    set({
      isModalOpen: true,
      modalIdentifier: cleanId,
      modalSourceName: sourceName,
      modalInitialUser: initialUser,
      modalStackOrder: nextOrder,
      modalOriginUrl: currentBrowserUrl || '/',
      modalReturnUrl: currentBrowserUrl || '/',
      modalHistoryStack: [],
      modalActiveScrollTop: 0,
      modalRestoredScrollTop: null,
      activeTab: 'all',
      searchQuery: '',
      isEditModalOpen: false,
    });
  },

  openProfileFromOwner: (owner, sources, fallbackName) => {
    const target = resolveProfileTarget(owner, sources, fallbackName);
    get().openProfileModal(target.identifier, {
      sourceName: target.sourceName,
      initialUser: target.initialUser,
    });
  },

  openProfileFromHref: (href, initialUser = null) => {
    const parsed = parseProfileHref(href);
    get().openProfileModal(parsed.identifier, {
      sourceName: parsed.sourceName,
      initialUser,
    });
  },

  popOrCloseProfileModal: () => {
    const state = get();
    const returnUrlToRestore = state.modalReturnUrl || state.modalOriginUrl;

    if (state.modalHistoryStack.length > 0) {
      const nextHistory = state.modalHistoryStack.slice(0, -1);
      const restoredEntry =
        state.modalHistoryStack[state.modalHistoryStack.length - 1];
      set({
        isModalOpen: true,
        modalIdentifier: restoredEntry.identifier,
        modalSourceName: restoredEntry.sourceName,
        modalInitialUser: restoredEntry.initialUser,
        modalStackOrder: restoredEntry.stackOrder,
        modalReturnUrl: restoredEntry.returnUrl,
        modalHistoryStack: nextHistory,
        modalActiveScrollTop: restoredEntry.scrollTop,
        modalRestoredScrollTop: restoredEntry.scrollTop,
        activeTab: restoredEntry.activeTab,
        searchQuery: restoredEntry.searchQuery,
        isEditModalOpen: false,
      });
      return { restoredEntry, returnUrlToRestore };
    }

    set({
      isModalOpen: false,
      modalIdentifier: null,
      modalSourceName: null,
      modalInitialUser: null,
      modalStackOrder: 0,
      modalOriginUrl: null,
      modalReturnUrl: null,
      modalHistoryStack: [],
      modalActiveScrollTop: 0,
      modalRestoredScrollTop: null,
      isEditModalOpen: false,
    });
    return { restoredEntry: null, returnUrlToRestore };
  },

  closeProfileModal: () => {
    set({
      isModalOpen: false,
      modalIdentifier: null,
      modalSourceName: null,
      modalInitialUser: null,
      modalStackOrder: 0,
      modalOriginUrl: null,
      modalReturnUrl: null,
      modalHistoryStack: [],
      modalActiveScrollTop: 0,
      modalRestoredScrollTop: null,
      isEditModalOpen: false,
    });
  },

  setModalActiveScrollTop: (scrollTop) => {
    set({ modalActiveScrollTop: scrollTop });
  },

  clearModalRestoredScrollTop: () => {
    set({ modalRestoredScrollTop: null });
  },
}));
