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

const PAGE_LIMIT = 10;

interface PrefetchedBatch {
  page: number;
  properties: any[];
  hasMore: boolean;
  cacheKey: string;
}

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

  // Ahead-of-time prefetch buffer & in-flight tracker
  const prefetchedBatchRef = useRef<PrefetchedBatch | null>(null);
  const isPrefetchingRef = useRef<boolean>(false);
  const prefetchPromiseRef = useRef<Promise<PrefetchedBatch | null> | null>(null);
  const prefetchAbortControllerRef = useRef<AbortController | null>(null);

  // Pre-load next 10 properties in background ahead of time so user never waits at bottom
  const prefetchNextPage = useCallback(
    async (
      nextPageNum: number,
      type: 'location' | 'vente',
      sort: string
    ): Promise<PrefetchedBatch | null> => {
      const currentCacheKey = `${type}_${sort}`;

      // If already prefetched this exact page for this filter, return existing
      if (
        prefetchedBatchRef.current &&
        prefetchedBatchRef.current.cacheKey === currentCacheKey &&
        prefetchedBatchRef.current.page === nextPageNum
      ) {
        return prefetchedBatchRef.current;
      }

      // If already prefetching, return in-flight promise
      if (isPrefetchingRef.current && prefetchPromiseRef.current) {
        return prefetchPromiseRef.current;
      }

      // Abort previous prefetch if still pending
      if (prefetchAbortControllerRef.current) {
        prefetchAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      prefetchAbortControllerRef.current = controller;
      isPrefetchingRef.current = true;

      const promise = (async () => {
        try {
          const url = buildApiUrl(nextPageNum, PAGE_LIMIT, type, sort);
          const timeoutId = setTimeout(() => controller.abort(), 12000);

          const res = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId));

          if (!res.ok) {
            return null;
          }

          const data = await res.json();
          const newProperties = data.properties || [];

          if (newProperties.length === 0) {
            const emptyBatch: PrefetchedBatch = {
              page: nextPageNum,
              properties: [],
              hasMore: false,
              cacheKey: currentCacheKey,
            };
            prefetchedBatchRef.current = emptyBatch;
            return emptyBatch;
          }

          const reachedEnd = data.totalPages
            ? nextPageNum >= data.totalPages
            : newProperties.length < PAGE_LIMIT;
          const newHasMore = !reachedEnd;

          const batch: PrefetchedBatch = {
            page: nextPageNum,
            properties: newProperties,
            hasMore: newHasMore,
            cacheKey: currentCacheKey,
          };
          prefetchedBatchRef.current = batch;

          // Pre-warm browser image cache for first photo of each preloaded property
          if (typeof window !== 'undefined') {
            newProperties.forEach((p: any) => {
              const firstImg = p.images?.[0];
              const src = typeof firstImg === 'string' ? firstImg : firstImg?.src;
              if (src && typeof src === 'string') {
                const img = new window.Image();
                img.src = src;
              }
            });
          }

          return batch;
        } catch {
          return null;
        } finally {
          isPrefetchingRef.current = false;
          prefetchPromiseRef.current = null;
        }
      })();

      prefetchPromiseRef.current = promise;
      return promise;
    },
    []
  );

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

        // Preload head of 10 properties right away even though user hasn't scrolled!
        if (newHasMore) {
          prefetchNextPage(2, type, sort);
        }
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
    [setTopPropertiesData, addPropertiesToGlobalStore, prefetchNextPage]
  );

  // Invalidate prefetch buffer when filterType or sortBy changes
  useEffect(() => {
    prefetchedBatchRef.current = null;
    if (prefetchAbortControllerRef.current) {
      prefetchAbortControllerRef.current.abort();
    }
  }, [filterType, sortBy]);

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
        if (cachedEntry.hasMore) {
          prefetchNextPage(cachedEntry.page + 1, filterType, sortBy);
        }
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
        if (initialHasMore) {
          prefetchNextPage(2, filterType, sortBy);
        }
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
      if (cachedEntry.hasMore) {
        prefetchNextPage(cachedEntry.page + 1, filterType, sortBy);
      }
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
    prefetchNextPage,
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

    const targetPage = page + 1;
    const currentCacheKey = `${filterType}_${sortBy}`;

    // 1. FAST PATH: Already pre-loaded in memory ahead of time!
    if (
      prefetchedBatchRef.current &&
      prefetchedBatchRef.current.cacheKey === currentCacheKey &&
      prefetchedBatchRef.current.page === targetPage
    ) {
      const batch = prefetchedBatchRef.current;
      prefetchedBatchRef.current = null; // consume buffer

      if (batch.properties.length === 0) {
        setHasMore(false);
        const currentEntry = usePropertyStore.getState().getTopPropertiesData(cacheKey);
        if (currentEntry) {
          setTopPropertiesData(cacheKey, {
            ...currentEntry,
            hasMore: false,
          });
        }
        return;
      }

      // Instantaneous append with 0ms wait for user
      appendTopPropertiesData(cacheKey, batch.properties, batch.page, batch.hasMore);
      addPropertiesToGlobalStore(batch.properties);

      setProperties((prev) => {
        const existingIds = new Set(prev.map((p) => p._id));
        const filtered = batch.properties.filter((p: any) => !existingIds.has(p._id));
        return [...prev, ...filtered];
      });
      setPage(batch.page);
      setHasMore(batch.hasMore);

      // Keep 10 pre-loaded properties ahead for the next scroll!
      if (batch.hasMore) {
        prefetchNextPage(batch.page + 1, filterType, sortBy);
      }
      return;
    }

    // 2. IN-FLIGHT PATH: Prefetch was initiated ahead of time and is currently in transit
    if (isPrefetchingRef.current && prefetchPromiseRef.current) {
      isFetchingRef.current = true;
      setIsLoadingMore(true);

      try {
        const batch = await prefetchPromiseRef.current;
        if (
          batch &&
          batch.cacheKey === currentCacheKey &&
          batch.page === targetPage
        ) {
          prefetchedBatchRef.current = null;

          if (batch.properties.length === 0) {
            setHasMore(false);
            const currentEntry = usePropertyStore.getState().getTopPropertiesData(cacheKey);
            if (currentEntry) {
              setTopPropertiesData(cacheKey, {
                ...currentEntry,
                hasMore: false,
              });
            }
          } else {
            appendTopPropertiesData(cacheKey, batch.properties, batch.page, batch.hasMore);
            addPropertiesToGlobalStore(batch.properties);

            setProperties((prev) => {
              const existingIds = new Set(prev.map((p) => p._id));
              const filtered = batch.properties.filter((p: any) => !existingIds.has(p._id));
              return [...prev, ...filtered];
            });
            setPage(batch.page);
            setHasMore(batch.hasMore);

            if (batch.hasMore) {
              prefetchNextPage(batch.page + 1, filterType, sortBy);
            }
          }
          return;
        }
      } catch (err) {
        console.error('In-flight prefetch error:', err);
      } finally {
        setIsLoadingMore(false);
        isFetchingRef.current = false;
      }
    }

    // 3. FALLBACK PATH: Standard network fetch if no prefetch in memory
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

        appendTopPropertiesData(cacheKey, newProperties, nextPage, newHasMore);
        addPropertiesToGlobalStore(newProperties);

        setProperties((prev) => {
          const existingIds = new Set(prev.map((p) => p._id));
          const filtered = newProperties.filter((p: any) => !existingIds.has(p._id));
          return [...prev, ...filtered];
        });
        setPage(nextPage);
        setHasMore(newHasMore);

        // Keep 10 pre-loaded properties ahead!
        if (newHasMore) {
          prefetchNextPage(nextPage + 1, filterType, sortBy);
        }
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
    prefetchNextPage,
  ]);

  // Clean up timeouts and abort controllers
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (prefetchAbortControllerRef.current) {
        prefetchAbortControllerRef.current.abort();
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
        rootMargin: '600px', // Pre-fetch 600px before bottom so user never waits
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
          {Array.from({ length: 5 }).map((_, i) => (
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
