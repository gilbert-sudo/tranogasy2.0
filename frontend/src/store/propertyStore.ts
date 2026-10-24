import { create } from 'zustand';

interface PropertyStore {
  // Individual properties keyed by ID
  properties: Record<string, any>;
  
  // Feed cache (home / latest list)
  feedProperties: any[];
  feedLastFetched: number | null;
  
  // Explore (TikTok-style feed) cache
  exploreProperties: any[];
  explorePage: number;
  exploreHasMore: boolean;
  exploreLastFetched: number | null;

  // Actions
  addProperty: (property: any) => void;
  addProperties: (properties: any[]) => void;
  getProperty: (id: string) => any | undefined;
  
  // Feed actions
  setFeedProperties: (properties: any[]) => void;
  
  // Explore actions
  setExploreData: (properties: any[], page: number, hasMore: boolean) => void;
  appendExploreProperties: (newProperties: any[], page: number, hasMore: boolean) => void;
}

export const usePropertyStore = create<PropertyStore>((set, get) => ({
  properties: {},
  feedProperties: [],
  feedLastFetched: null,

  exploreProperties: [],
  explorePage: 1,
  exploreHasMore: true,
  exploreLastFetched: null,

  addProperty: (property) => {
    if (!property || !property._id) return;
    set((state) => ({
      properties: { ...state.properties, [property._id]: property }
    }));
  },

  addProperties: (properties) => {
    if (!Array.isArray(properties) || properties.length === 0) return;
    set((state) => {
      const newProps = { ...state.properties };
      let changed = false;
      for (const p of properties) {
        if (p && p._id) {
          newProps[p._id] = p;
          changed = true;
        }
      }
      return changed ? { properties: newProps } : state;
    });
  },

  getProperty: (id) => get().properties[id],

  setFeedProperties: (properties) => {
    if (!Array.isArray(properties)) return;
    // Also index individual properties for instant access elsewhere
    get().addProperties(properties);
    set({
      feedProperties: properties,
      feedLastFetched: Date.now(),
    });
  },

  setExploreData: (properties, page, hasMore) => {
    if (!Array.isArray(properties)) return;
    get().addProperties(properties);
    set({
      exploreProperties: properties,
      explorePage: page,
      exploreHasMore: hasMore,
      exploreLastFetched: Date.now(),
    });
  },

  appendExploreProperties: (newProperties, page, hasMore) => {
    if (!Array.isArray(newProperties)) return;
    get().addProperties(newProperties);
    set((state) => {
      const existingIds = new Set(state.exploreProperties.map((p) => p._id));
      const filteredNew = newProperties.filter((p) => !existingIds.has(p._id));
      return {
        exploreProperties: [...state.exploreProperties, ...filteredNew],
        explorePage: page,
        exploreHasMore: hasMore,
      };
    });
  },
}));
