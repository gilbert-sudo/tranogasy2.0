import { create } from 'zustand';

interface PropertyDetailModalStore {
  isOpen: boolean;
  propertyId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialProperty: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openPropertyDetail: (propertyId: string, initialProperty?: any) => void;
  closePropertyDetail: () => void;
}

export const usePropertyDetailModalStore = create<PropertyDetailModalStore>((set) => ({
  isOpen: false,
  propertyId: null,
  initialProperty: null,
  openPropertyDetail: (propertyId, initialProperty = null) => {
    set({
      isOpen: true,
      propertyId,
      initialProperty,
    });
  },
  closePropertyDetail: () => {
    set({
      isOpen: false,
      propertyId: null,
      initialProperty: null,
    });
  },
}));
