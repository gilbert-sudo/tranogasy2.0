import { create } from 'zustand';

export interface TopPropertiesCacheEntry {
  properties: any[];
  page: number;
  hasMore: boolean;
}

interface PropertyStore {
  properties: Record<string, any>;
  addProperty: (property: any) => void;
  addProperties: (properties: any[]) => void;
  getProperty: (id: string) => any | undefined;
  removeProperty: (id: string) => void;

  // Top properties (landing page) state
  topProperties: any[];
  isTopPropertiesLoaded: boolean;
  topPropertiesCache: Record<string, TopPropertiesCacheEntry>;
  activeTab: 'location' | 'vente';
  sortBy: string;

  // Actions for top properties
  setTopPropertiesData: (
    cacheKey: string,
    data: { properties: any[]; page: number; hasMore: boolean }
  ) => void;
  appendTopPropertiesData: (
    cacheKey: string,
    newProperties: any[],
    nextPage: number,
    hasMore: boolean
  ) => void;
  getTopPropertiesData: (cacheKey: string) => TopPropertiesCacheEntry | undefined;
  setActiveTab: (tab: 'location' | 'vente') => void;
  setSortBy: (sort: string) => void;
  clearTopPropertiesCache: () => void;

  // User properties (Owner space / My Listings dashboard) state
  userProperties: any[];
  isUserPropertiesLoaded: boolean;
  userPropertiesUserId: string | null;

  // Actions for user properties
  setUserProperties: (properties: any[], userId?: string) => void;
  addUserProperty: (property: any) => void;
  updateUserProperty: (propertyId: string, updated: any) => void;
  removeUserProperty: (propertyId: string) => void;
  clearUserProperties: () => void;
}

export const usePropertyStore = create<PropertyStore>((set, get) => ({
  properties: {},
  addProperty: (property) => {
    if (!property || (!property._id && !property.id)) return;
    const propId = property._id || property.id;
    set((state) => ({
      properties: { ...state.properties, [propId]: property },
    }));
  },
  addProperties: (properties) => {
    if (!Array.isArray(properties)) return;
    set((state) => {
      const newProps = { ...state.properties };
      properties.forEach((p) => {
        const propId = p?._id || p?.id;
        if (p && propId) {
          newProps[propId] = p;
        }
      });
      return { properties: newProps };
    });
  },
  getProperty: (id) => get().properties[id],
  removeProperty: (id) => {
    if (!id) return;
    set((state) => {
      const updatedProperties = { ...state.properties };
      delete updatedProperties[id];

      const updatedTopProperties = state.topProperties.filter(
        (p) => (p._id || p.id) !== id
      );
      const updatedUserProperties = state.userProperties.filter(
        (p) => (p._id || p.id) !== id
      );
      const updatedCache: Record<string, TopPropertiesCacheEntry> = {};

      Object.entries(state.topPropertiesCache).forEach(([key, entry]) => {
        updatedCache[key] = {
          ...entry,
          properties: entry.properties.filter((p) => (p._id || p.id) !== id),
        };
      });

      return {
        properties: updatedProperties,
        topProperties: updatedTopProperties,
        userProperties: updatedUserProperties,
        topPropertiesCache: updatedCache,
      };
    });
  },

  // Top properties state & actions
  topProperties: [],
  isTopPropertiesLoaded: false,
  topPropertiesCache: {},
  activeTab: 'location',
  sortBy: 'Trier par',

  setTopPropertiesData: (cacheKey, data) => {
    if (!data || !Array.isArray(data.properties)) return;

    // Index each property into the global dictionary as well
    get().addProperties(data.properties);

    set((state) => ({
      topProperties: data.properties,
      isTopPropertiesLoaded: true,
      topPropertiesCache: {
        ...state.topPropertiesCache,
        [cacheKey]: {
          properties: data.properties,
          page: data.page ?? 1,
          hasMore: data.hasMore ?? false,
        },
      },
    }));
  },

  appendTopPropertiesData: (cacheKey, newProperties, nextPage, hasMore) => {
    if (!Array.isArray(newProperties) || newProperties.length === 0) return;

    // Index new properties into dictionary
    get().addProperties(newProperties);

    set((state) => {
      const existing = state.topPropertiesCache[cacheKey] || {
        properties: [],
        page: 1,
        hasMore: true,
      };
      const existingIds = new Set(existing.properties.map((p) => p._id || p.id));
      const filtered = newProperties.filter(
        (p) => p && (p._id || p.id) && !existingIds.has(p._id || p.id)
      );
      const combined = [...existing.properties, ...filtered];

      return {
        topProperties: combined,
        topPropertiesCache: {
          ...state.topPropertiesCache,
          [cacheKey]: {
            properties: combined,
            page: nextPage,
            hasMore,
          },
        },
      };
    });
  },

  getTopPropertiesData: (cacheKey) => {
    return get().topPropertiesCache[cacheKey];
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSortBy: (sort) => set({ sortBy: sort }),

  clearTopPropertiesCache: () => {
    set({
      topProperties: [],
      isTopPropertiesLoaded: false,
      topPropertiesCache: {},
    });
  },

  // User properties (Owner space / My Listings dashboard)
  userProperties: [],
  isUserPropertiesLoaded: false,
  userPropertiesUserId: null,

  setUserProperties: (properties, userId) => {
    if (!Array.isArray(properties)) return;
    get().addProperties(properties);
    set((state) => ({
      userProperties: properties,
      isUserPropertiesLoaded: true,
      userPropertiesUserId: userId !== undefined ? userId : state.userPropertiesUserId,
    }));
  },

  addUserProperty: (property) => {
    if (!property || (!property._id && !property.id)) return;
    const propId = property._id || property.id;
    get().addProperty(property);
    set((state) => {
      const exists = state.userProperties.some((p) => (p._id || p.id) === propId);
      const updatedUserProps = exists
        ? state.userProperties.map((p) =>
            (p._id || p.id) === propId ? { ...p, ...property } : p
          )
        : [property, ...state.userProperties];
      return { userProperties: updatedUserProps };
    });
  },

  updateUserProperty: (propertyId, updated) => {
    if (!propertyId) return;
    set((state) => {
      const updatedUserProps = state.userProperties.map((p) => {
        if ((p._id || p.id) === propertyId) {
          return { ...p, ...updated };
        }
        return p;
      });
      const updatedDict = { ...state.properties };
      if (updatedDict[propertyId]) {
        updatedDict[propertyId] = { ...updatedDict[propertyId], ...updated };
      }
      return {
        userProperties: updatedUserProps,
        properties: updatedDict,
      };
    });
  },

  removeUserProperty: (propertyId) => {
    if (!propertyId) return;
    get().removeProperty(propertyId);
  },

  clearUserProperties: () => {
    set({
      userProperties: [],
      isUserPropertiesLoaded: false,
      userPropertiesUserId: null,
    });
  },
}));
