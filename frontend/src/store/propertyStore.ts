import { create } from 'zustand';

interface PropertyStore {
  properties: Record<string, any>;
  addProperty: (property: any) => void;
  addProperties: (properties: any[]) => void;
  getProperty: (id: string) => any | undefined;
}

export const usePropertyStore = create<PropertyStore>((set, get) => ({
  properties: {},
  addProperty: (property) => {
    if (!property || !property._id) return;
    set((state) => ({
      properties: { ...state.properties, [property._id]: property }
    }));
  },
  addProperties: (properties) => {
    if (!Array.isArray(properties)) return;
    set((state) => {
      const newProps = { ...state.properties };
      properties.forEach(p => {
        if (p && p._id) {
          newProps[p._id] = p;
        }
      });
      return { properties: newProps };
    });
  },
  getProperty: (id) => get().properties[id],
}));
