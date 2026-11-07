'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import PropertyCard from '@/components/PropertyCard';
import PropertyCardSkeleton from '@/components/PropertyCardSkeleton';
import { Loader2, RefreshCw, ServerCrash, Sparkles, CheckCircle2 } from 'lucide-react';
import { usePropertyStore } from '@/store/propertyStore';

interface PropertyFeedProps {
  initialProperties?: any[];
  filterType?: 'location' | 'vente';
  sortBy?: string;
}

const PAGE_LIMIT = 8;

function buildApiUrl(
  pageNum: number,
  limit: number,
  filterType: 'location' | 'vente' = 'location',
  sortBy: string = 'Trier par'
): string {
  const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const apiUrl = rawUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('page', String(pageNum));
  params.set('limit', String(limit));

  // Type filter
  if (filterType === 'location') {
    params.set('type', 'rent');
  } else if (filterType === 'vente') {
    params.set('type', 'sale');
  }

  // Sort filter
  if (sortBy === 'Prix croissant') {
    params.set('sortBy', 'price_asc');
  } else if (sortBy === 'Prix décroissant') {
    params.set('sortBy', 'price_desc');
  } else if (sortBy === 'Plus récent') {
    params.set('sortBy', 'newest');
  }

  return `${apiUrl}/properties/search?${params.toString()}`;
}

export default function PropertyFeed({
  initialProperties = [],
  filterType = 'location',
  sortBy = 'Trier par',
}: PropertyFeedProps) {
  const cacheKey = `${filterType}_${sortBy}`;

  // Zustand actions & getters
  const setTopPropertiesData = usePropertyStore((state) => state.setTopPropertiesData);
  const appendTopPropertiesData = usePropertyStore((state) => state.appendTopPropertiesData);
  const addPropertiesToGlobalStore = usePropertyStore((state) => state.addProperties);

  // Check if this query is already stored in Zustand store
  const cachedData = usePropertyStore.getState().getTopPropertiesData(cacheKey);

  // Initialize from Zustand store if available (instant on second render / revisit)
  const [properties, setProperties] = useState<any[]>(() => {
    if (cachedData && cachedData.properties.length > 0) {
      return cachedData.properties;
    }
    return initialProperties;
  });

  const [page, setPage] = useState<number>(() => {
    if (cachedData && cachedData.properties.length > 0) {
      return cachedData.page;
    }
    return initialProperties.length > 0 ? 1 : 0;
  });

  const [hasMore, setHasMore] = useState<boolean>(() => {
    if (cachedData && cachedData.properties.length > 0) {
      return cachedData.hasMore;
    }
    return initialProperties.length >= PAGE_LIMIT;
  });

  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(() => {
    if (cachedData && cachedData.properties.length > 0) {
      return false; // Already in Zustand store! No skeleton on second render
    }
    return initialProperties.length === 0;
  });

  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isFilterLoading, setIsFilterLoading] = useState<boolean>(false);
  const [isWakingUp, setIsWakingUp] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [hasFailed, setHasFailed] = useState<boolean>(false);

  const observerRef = useRef<HTMLDivElement | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const isFirstMountRef = useRef<boolean>(true);
  const activeReqIdRef = useRef<number>(0);

  // Fetch a page with current filters and save into Zustand store
  const fetchPage = useCallback(
    async (
      pageNum: number,
      type: 'location' | 'vente',
      sort: string,
      isAutoRetry = false
    ) => {
      const currentCacheKey = `${type}_${sort}`;
      const reqId = ++activeReqIdRef.current;
      const isInitial = pageNum === 1;

      try {
        if (!isAutoRetry) {
          if (isInitial) {
            setIsFilterLoading(true);
          }
          setHasFailed(false);
        }

        const url = buildApiUrl(pageNum, PAGE_LIMIT, type, sort);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(url, {
          cache: 'no-store',
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!res.ok) {
          throw new Error(`API responded with status: ${res.status}`);
        }

        const data = await res.json();

        // Discard stale responses if user switched filter rapidly
        if (reqId !== activeReqIdRef.current) {
          return;
        }

        const fetched = data.properties || [];
        const reachedEnd = data.totalPages
          ? 1 >= data.totalPages
          : fetched.length < PAGE_LIMIT;
        const newHasMore = fetched.length === PAGE_LIMIT && !reachedEnd;

        // Persist to Zustand store so on second renter it will be taken from Zustand!
        setTopPropertiesData(currentCacheKey, {
          properties: fetched,
          page: 1,
          hasMore: newHasMore,
        });
        addPropertiesToGlobalStore(fetched);

        setProperties(fetched);
        setPage(1);
        setHasMore(newHasMore);
        setIsLoadingInitial(false);
        setIsFilterLoading(false);
        setIsWakingUp(false);
        setRetryCount(0);
        setHasFailed(false);
      } catch (error) {
        if (reqId !== activeReqIdRef.current) return;
        console.warn('Backend request error:', error);
        setIsWakingUp(true);

        setRetryCount((prev) => {
          const next = prev + 1;
          if (next < 8) {
            retryTimeoutRef.current = setTimeout(() => {
              fetchPage(pageNum, type, sort, true);
            }, 3000);
          } else {
            setIsLoadingInitial(false);
            setIsFilterLoading(false);
            setIsWakingUp(false);
            setHasFailed(true);
          }
          return next;
        });
      }
    },
    [setTopPropertiesData, addPropertiesToGlobalStore]
  );

  // Sync with Zustand store on mount and on filterType/sortBy change
  useEffect(() => {
    const cachedEntry = usePropertyStore.getState().getTopPropertiesData(cacheKey);

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;

      // 1. If already in Zustand store, use it immediately and DO NOT FETCH
      if (cachedEntry && cachedEntry.properties.length > 0) {
        setProperties(cachedEntry.properties);
        setPage(cachedEntry.page);
        setHasMore(cachedEntry.hasMore);
        setIsLoadingInitial(false);
        setIsFilterLoading(false);
        return;
      }

      // 2. If initialProperties provided, seed Zustand store and use it
      if (initialProperties && initialProperties.length > 0) {
        const initialHasMore = initialProperties.length >= PAGE_LIMIT;
        setTopPropertiesData(cacheKey, {
          properties: initialProperties,
          page: 1,
          hasMore: initialHasMore,
        });
        addPropertiesToGlobalStore(initialProperties);
        setProperties(initialProperties);
        setPage(1);
        setHasMore(initialHasMore);
        setIsLoadingInitial(false);
        return;
      }

      // 3. First time entering landing page: fetch properties just one time
      fetchPage(1, filterType, sortBy);
      return;
    }

    // Subsequent filter / sort change:
    // If this filter was already loaded into Zustand, use it directly without network call
    if (cachedEntry && cachedEntry.properties.length > 0) {
      setProperties(cachedEntry.properties);
      setPage(cachedEntry.page);
      setHasMore(cachedEntry.hasMore);
      setIsFilterLoading(false);
      setIsLoadingInitial(false);
      return;
    }

    // Not yet cached for this filter combination: fetch it once
    fetchPage(1, filterType, sortBy);
  }, [
    cacheKey,
    filterType,
    sortBy,
    fetchPage,
    setTopPropertiesData,
    addPropertiesToGlobalStore,
    initialProperties,
  ]);

  // Infinite scroll: fetch next page and append to Zustand store
  const loadMoreProperties = useCallback(async () => {
    if (
      isFetchingRef.current ||
      !hasMore ||
      isLoadingMore ||
      isLoadingInitial ||
      isFilterLoading
    ) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      const url = buildApiUrl(nextPage, PAGE_LIMIT, filterType, sortBy);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      const newProperties = data.properties || [];

      if (newProperties.length === 0) {
        setHasMore(false);
        const currentEntry = usePropertyStore.getState().getTopPropertiesData(cacheKey);
        if (currentEntry) {
          setTopPropertiesData(cacheKey, {
            ...currentEntry,
            hasMore: false,
          });
        }
      } else {
        const reachedEnd = data.totalPages
          ? nextPage >= data.totalPages
          : newProperties.length < PAGE_LIMIT;
        const newHasMore = !reachedEnd;

        // Append to Zustand store
        appendTopPropertiesData(cacheKey, newProperties, nextPage, newHasMore);
        addPropertiesToGlobalStore(newProperties);

        setProperties((prev) => {
          const existingIds = new Set(prev.map((p) => p._id));
          const filtered = newProperties.filter((p: any) => !existingIds.has(p._id));
          return [...prev, ...filtered];
        });
        setPage(nextPage);
        setHasMore(newHasMore);
      }
    } catch (err) {
      console.error('Failed to load more properties:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [
    page,
    hasMore,
    isLoadingMore,
    isLoadingInitial,
    isFilterLoading,
    filterType,
    sortBy,
    cacheKey,
    appendTopPropertiesData,
    addPropertiesToGlobalStore,
    setTopPropertiesData,
  ]);

  // Clean up timeouts
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // IntersectionObserver for infinite scrolling
  useEffect(() => {
    const sentinel = observerRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !isLoadingMore &&
          !isLoadingInitial &&
          !isFilterLoading
        ) {
          loadMoreProperties();
        }
      },
      {
        root: null,
        rootMargin: '350px', // Pre-fetch 350px before bottom
        threshold: 0.05,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, isLoadingInitial, isFilterLoading, loadMoreProperties]);

  // Initial loading state (showing skeletons + cold start alert banner)
  if (isLoadingInitial || isWakingUp) {
    return (
      <div className="w-full space-y-6">
        {isWakingUp && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 backdrop-blur-md transition-all animate-fadeIn">
            <div className="flex items-center gap-3 text-sm">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <div>
                <p className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Démarrage du serveur en cours...
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                  Connexion au serveur de données (tentative {retryCount + 1})...
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 dark:text-amber-400" />
            </div>
          </div>
        )}

        {/* Skeleton Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
          {Array.from({ length: PAGE_LIMIT }).map((_, i) => (
            <PropertyCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Failed state with retry button
  if (hasFailed && properties.length === 0) {
    return (
      <div className="col-span-full py-16 text-center text-zinc-400 dark:text-zinc-500 space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 mb-2">
          <ServerCrash className="w-7 h-7" />
        </div>
        <div>
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            Le serveur met plus de temps que prévu à répondre
          </p>
          <p className="text-sm mt-1 max-w-md mx-auto text-zinc-500 dark:text-zinc-400">
            Vérifiez votre connexion internet ou réessayez dans quelques instants.
          </p>
        </div>
        <button
          onClick={() => {
            setRetryCount(0);
            fetchPage(1, filterType, sortBy, false);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 font-semibold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Réessayer maintenant
        </button>
      </div>
    );
  }

  // Empty state
  if (!isFilterLoading && properties.length === 0) {
    return (
      <div className="col-span-full py-16 text-center text-zinc-400 dark:text-zinc-500">
        <p className="text-lg font-medium">Aucune propriété disponible pour le moment.</p>
        <button
          onClick={() => fetchPage(1, filterType, sortBy, false)}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      {/* If changing filter/sort, display subtle smooth skeleton shimmer */}
      {isFilterLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6 animate-pulse">
          {Array.from({ length: PAGE_LIMIT }).map((_, i) => (
            <PropertyCardSkeleton key={`skeleton-filter-${i}`} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
          {properties.map((property: any) => (
            <PropertyCard key={property._id} property={property} />
          ))}
        </div>
      )}

      {/* Loading more skeletons indicator */}
      {isLoadingMore && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <PropertyCardSkeleton key={`skeleton-more-${i}`} />
          ))}
        </div>
      )}

      {/* Bottom sentinel trigger for IntersectionObserver */}
      <div ref={observerRef} className="h-6 w-full flex items-center justify-center">
        {isLoadingMore && (
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin text-brand-green" />
            <span>Chargement de nouvelles annonces...</span>
          </div>
        )}
      </div>

      {/* End of list state */}
      {!hasMore && properties.length > 0 && !isFilterLoading && (
        <div className="pt-4 pb-8 flex items-center justify-center gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>Vous avez vu toutes les propriétés disponibles ({properties.length}).</span>
        </div>
      )}
    </div>
  );
}
