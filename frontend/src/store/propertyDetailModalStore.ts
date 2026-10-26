import { create } from 'zustand';

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

interface PropertyDetailModalStore {
  isOpen: boolean;
  propertyId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialProperty: any | null;
  transitionOrigin: TransitionOriginInfo | null;
  isTransitioning: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openPropertyDetail: (
    propertyId: string, 
    initialProperty?: any, 
    transitionOrigin?: TransitionOriginInfo | null
  ) => void;
  closePropertyDetail: () => void;
  setIsTransitioning: (val: boolean) => void;
}

export const usePropertyDetailModalStore = create<PropertyDetailModalStore>((set) => ({
  isOpen: false,
  propertyId: null,
  initialProperty: null,
  transitionOrigin: null,
  isTransitioning: false,
  openPropertyDetail: (propertyId, initialProperty = null, transitionOrigin = null) => {
    set({
      isOpen: true,
      propertyId,
      initialProperty,
      transitionOrigin: transitionOrigin || null,
      isTransitioning: !!transitionOrigin,
    });
  },
  closePropertyDetail: () => {
    set({
      isOpen: false,
      propertyId: null,
      initialProperty: null,
      transitionOrigin: null,
      isTransitioning: false,
    });
  },
  setIsTransitioning: (val: boolean) => {
    set({ isTransitioning: val });
  },
}));
