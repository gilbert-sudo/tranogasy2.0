import { create } from 'zustand';

const UNLOCK_RETURN_STORAGE_KEY = 'tranogasy_unlock_return_context';
const UNLOCK_RETURN_TTL_MS = 30 * 60 * 1000; // 30 minutes

let globalOverlayOrderCounter = 0;
let lastClaimedDismissEvent: Event | null = null;
let lastClaimedDismissTimestamp = 0;

/**
 * Allocates a monotonically increasing integer order for stacked overlays
 * (`PropertyDetailsModal` and `UserProfileModal`) so the most recently opened
 * overlay always renders on top and receives Back / Escape actions first.
 */
export function allocateOverlayOrder(): number {
  globalOverlayOrderCounter += 1;
  return globalOverlayOrderCounter;
}

/**
 * Ensures a single `popstate` or `Escape` event is only claimed by one overlay
 * in the same synchronous dispatch cycle.
 */
export function claimOverlayDismissEvent(e?: Event | null): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (e && lastClaimedDismissEvent === e) {
    return false;
  }
  if (now - lastClaimedDismissTimestamp < 24) {
    return false;
  }
  if (e) {
    lastClaimedDismissEvent = e;
  }
  lastClaimedDismissTimestamp = now;
  return true;
}

export interface TransitionOriginInfo {
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  src: string;
  borderRadius?: string;
}

export interface UnlockReturnContext {
  propertyId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  propertySnapshot?: any | null;
  originUrl: string;
  wasModal: boolean;
  openContactModal: boolean;
  savedAt: number;
}

export interface PropertyModalHistoryEntry {
  propertyId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialProperty: any | null;
  stackOrder: number;
  returnUrl: string | null;
  scrollTop: number;
}

function readStoredReturnContext(): UnlockReturnContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      sessionStorage.getItem(UNLOCK_RETURN_STORAGE_KEY) ||
      localStorage.getItem(UNLOCK_RETURN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UnlockReturnContext;
    if (
      !parsed ||
      !parsed.propertyId ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > UNLOCK_RETURN_TTL_MS
    ) {
      sessionStorage.removeItem(UNLOCK_RETURN_STORAGE_KEY);
      localStorage.removeItem(UNLOCK_RETURN_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredReturnContext(ctx: UnlockReturnContext | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx) {
      sessionStorage.removeItem(UNLOCK_RETURN_STORAGE_KEY);
      localStorage.removeItem(UNLOCK_RETURN_STORAGE_KEY);
    } else {
      const serialized = JSON.stringify(ctx);
      sessionStorage.setItem(UNLOCK_RETURN_STORAGE_KEY, serialized);
      localStorage.setItem(UNLOCK_RETURN_STORAGE_KEY, serialized);
    }
  } catch {
    // Ignore storage quota errors
  }
}

interface PropertyDetailModalStore {
  isOpen: boolean;
  propertyId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialProperty: any | null;
  transitionOrigin: TransitionOriginInfo | null;
  isTransitioning: boolean;
  originUrl: string | null;
  currentReturnUrl: string | null;
  stackOrder: number;
  historyStack: PropertyModalHistoryEntry[];
  activeScrollTop: number;
  restoredScrollTop: number | null;
  autoOpenContactForPropertyId: string | null;
  unlockReturnContext: UnlockReturnContext | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openPropertyDetail: (
    propertyId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialProperty?: any,
    transitionOrigin?: TransitionOriginInfo | null
  ) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateInitialProperty: (property: any) => void;
  popOrClosePropertyDetail: () => {
    restoredEntry: PropertyModalHistoryEntry | null;
    returnUrlToRestore: string | null;
  };
  closePropertyDetail: () => void;
  setIsTransitioning: (val: boolean) => void;
  setOriginUrl: (url: string | null) => void;
  setActiveScrollTop: (scrollTop: number) => void;
  clearRestoredScrollTop: () => void;
  setAutoOpenContactForPropertyId: (propertyId: string | null) => void;
  saveUnlockReturnContext: (ctx: Omit<UnlockReturnContext, 'savedAt'>) => void;
  getUnlockReturnContext: () => UnlockReturnContext | null;
  clearUnlockReturnContext: () => void;
}

export const usePropertyDetailModalStore = create<PropertyDetailModalStore>((set, get) => ({
  isOpen: false,
  propertyId: null,
  initialProperty: null,
  transitionOrigin: null,
  isTransitioning: false,
  originUrl: null,
  currentReturnUrl: null,
  stackOrder: 0,
  historyStack: [],
  activeScrollTop: 0,
  restoredScrollTop: null,
  autoOpenContactForPropertyId: null,
  unlockReturnContext: null,
  openPropertyDetail: (propertyId, initialProperty = null, transitionOrigin = null) => {
    const state = get();
    const currentBrowserUrl =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : null;
    const isOverlayRoute =
      typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/pricing') ||
        window.location.pathname.startsWith('/login') ||
        window.location.pathname.startsWith('/signup'));

    const nextOrder = allocateOverlayOrder();

    // If a property is already open (e.g. underneath UserProfileModal) and user opens another property,
    // push the previous property onto historyStack so clicking "Retour" returns to the profile and preserves the earlier property.
    if (state.isOpen && state.propertyId) {
      const nextHistory: PropertyModalHistoryEntry[] = [
        ...state.historyStack,
        {
          propertyId: state.propertyId,
          initialProperty: state.initialProperty,
          stackOrder: state.stackOrder,
          returnUrl: state.currentReturnUrl || state.originUrl,
          scrollTop: state.activeScrollTop,
        },
      ];
      set({
        isOpen: true,
        propertyId,
        initialProperty,
        transitionOrigin: transitionOrigin || null,
        isTransitioning: !!transitionOrigin,
        stackOrder: nextOrder,
        currentReturnUrl: currentBrowserUrl || state.originUrl || '/',
        historyStack: nextHistory,
        activeScrollTop: 0,
        restoredScrollTop: null,
      });
      return;
    }

    const baseOriginUrl =
      !isOverlayRoute && currentBrowserUrl
        ? currentBrowserUrl
        : state.originUrl || '/';

    set({
      isOpen: true,
      propertyId,
      initialProperty,
      transitionOrigin: transitionOrigin || null,
      isTransitioning: !!transitionOrigin,
      originUrl: baseOriginUrl,
      currentReturnUrl: currentBrowserUrl || baseOriginUrl,
      stackOrder: nextOrder,
      historyStack: [],
      activeScrollTop: 0,
      restoredScrollTop: null,
    });
  },
  updateInitialProperty: (property) => {
    if (!property) return;
    set((state) => {
      const propId = property._id || property.id;
      if (state.propertyId && propId && String(state.propertyId) === String(propId)) {
        return {
          initialProperty: { ...(state.initialProperty || {}), ...property },
        };
      }
      return state;
    });
  },
  popOrClosePropertyDetail: () => {
    const state = get();
    const returnUrlToRestore = state.currentReturnUrl || state.originUrl;
    if (state.historyStack.length > 0) {
      const nextHistory = state.historyStack.slice(0, -1);
      const restoredEntry = state.historyStack[state.historyStack.length - 1];
      set({
        isOpen: true,
        propertyId: restoredEntry.propertyId,
        initialProperty: restoredEntry.initialProperty,
        transitionOrigin: null,
        isTransitioning: false,
        stackOrder: restoredEntry.stackOrder,
        currentReturnUrl: restoredEntry.returnUrl,
        historyStack: nextHistory,
        activeScrollTop: restoredEntry.scrollTop,
        restoredScrollTop: restoredEntry.scrollTop,
      });
      return { restoredEntry, returnUrlToRestore };
    }

    set({
      isOpen: false,
      propertyId: null,
      initialProperty: null,
      transitionOrigin: null,
      isTransitioning: false,
      originUrl: null,
      currentReturnUrl: null,
      stackOrder: 0,
      historyStack: [],
      activeScrollTop: 0,
      restoredScrollTop: null,
    });
    return { restoredEntry: null, returnUrlToRestore };
  },
  closePropertyDetail: () => {
    set({
      isOpen: false,
      propertyId: null,
      initialProperty: null,
      transitionOrigin: null,
      isTransitioning: false,
      originUrl: null,
      currentReturnUrl: null,
      stackOrder: 0,
      historyStack: [],
      activeScrollTop: 0,
      restoredScrollTop: null,
    });
  },
  setIsTransitioning: (val: boolean) => {
    set({ isTransitioning: val });
  },
  setOriginUrl: (url: string | null) => {
    set((state) => ({
      originUrl: url,
      currentReturnUrl: state.currentReturnUrl || url,
    }));
  },
  setActiveScrollTop: (scrollTop: number) => {
    set({ activeScrollTop: scrollTop });
  },
  clearRestoredScrollTop: () => {
    set({ restoredScrollTop: null });
  },
  setAutoOpenContactForPropertyId: (propertyId: string | null) => {
    set({ autoOpenContactForPropertyId: propertyId });
  },
  saveUnlockReturnContext: (ctx) => {
    const fullCtx: UnlockReturnContext = {
      ...ctx,
      savedAt: Date.now(),
    };
    writeStoredReturnContext(fullCtx);
    set({ unlockReturnContext: fullCtx });
  },
  getUnlockReturnContext: () => {
    const inMemory = get().unlockReturnContext;
    if (inMemory && Date.now() - inMemory.savedAt <= UNLOCK_RETURN_TTL_MS) {
      return inMemory;
    }
    const stored = readStoredReturnContext();
    if (stored) {
      set({ unlockReturnContext: stored });
    }
    return stored;
  },
  clearUnlockReturnContext: () => {
    writeStoredReturnContext(null);
    set({ unlockReturnContext: null });
  },
}));
