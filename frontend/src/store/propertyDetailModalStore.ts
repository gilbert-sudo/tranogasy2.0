import { create } from 'zustand';

const UNLOCK_RETURN_STORAGE_KEY = 'tranogasy_unlock_return_context';
const UNLOCK_RETURN_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
  closePropertyDetail: () => void;
  setIsTransitioning: (val: boolean) => void;
  setOriginUrl: (url: string | null) => void;
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
  autoOpenContactForPropertyId: null,
  unlockReturnContext: null,
  openPropertyDetail: (propertyId, initialProperty = null, transitionOrigin = null) => {
    set({
      isOpen: true,
      propertyId,
      initialProperty,
      transitionOrigin: transitionOrigin || null,
      isTransitioning: !!transitionOrigin,
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
  closePropertyDetail: () => {
    set({
      isOpen: false,
      propertyId: null,
      initialProperty: null,
      transitionOrigin: null,
      isTransitioning: false,
      originUrl: null,
    });
  },
  setIsTransitioning: (val: boolean) => {
    set({ isTransitioning: val });
  },
  setOriginUrl: (url: string | null) => {
    set({ originUrl: url });
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

