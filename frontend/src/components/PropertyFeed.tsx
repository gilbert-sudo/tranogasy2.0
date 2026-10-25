'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import PropertyCard from '@/components/PropertyCard';
import PropertyCardSkeleton from '@/components/PropertyCardSkeleton';
import { Loader2, RefreshCw, ServerCrash, Sparkles, CheckCircle2 } from 'lucide-react';

interface PropertyFeedProps {
  initialProperties?: any[];
}

const PAGE_LIMIT = 8;

export default function PropertyFeed({ initialProperties = [] }: PropertyFeedProps) {
  const [properties, setProperties] = useState<any[]>(initialProperties);
  const [page, setPage] = useState<number>(initialProperties.length > 0 ? 1 : 0);
  const [hasMore, setHasMore] = useState<boolean>(initialProperties.length >= PAGE_LIMIT);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(initialProperties.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isWakingUp, setIsWakingUp] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [hasFailed, setHasFailed] = useState<boolean>(false);

  const observerRef = useRef<HTMLDivElement | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  // Fetch initial page if SSR didn't return properties
  const fetchInitialProperties = useCallback(async (isAutoRetry = false) => {
    try {
      if (!isAutoRetry) {
        setIsLoadingInitial(true);
        setHasFailed(false);
      }

      const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const apiUrl = rawUrl.replace(/\/$/, '');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${apiUrl}/properties?page=1&limit=${PAGE_LIMIT}`, {
        cache: 'no-store',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        throw new Error(`API responded with status: ${res.status}`);
      }

      const data = await res.json();
      const fetched = data.properties || [];

      setProperties(fetched);
      setPage(1);
      setHasMore(fetched.length === PAGE_LIMIT && (data.page < data.totalPages || !data.totalPages));
      setIsLoadingInitial(false);
      setIsWakingUp(false);
      setRetryCount(0);
      setHasFailed(false);
    } catch (error) {
      console.warn('Backend wake-up / request error:', error);
      setIsWakingUp(true);

      setRetryCount((prev) => {
        const next = prev + 1;
        if (next < 12) {
          retryTimeoutRef.current = setTimeout(() => {
            fetchInitialProperties(true);
          }, 3500);
        } else {
          setIsLoadingInitial(false);
          setIsWakingUp(false);
          setHasFailed(true);
        }
        return next;
      });
    }
  }, []);

  // Fetch next page for infinite scroll
  const loadMoreProperties = useCallback(async () => {
    if (isFetchingRef.current || !hasMore || isLoadingMore || isLoadingInitial) {
      return;
    }

    isFetchingRef.current = true;
    setIsLoadingMore(true);

    try {
      const nextPage = page + 1;
      const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const apiUrl = rawUrl.replace(/\/$/, '');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`${apiUrl}/properties?page=${nextPage}&limit=${PAGE_LIMIT}`, {
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
      } else {
        setProperties((prev) => {
          // Deduplicate by _id
          const existingIds = new Set(prev.map((p) => p._id));
          const filtered = newProperties.filter((p: any) => !existingIds.has(p._id));
          return [...prev, ...filtered];
        });
        setPage(nextPage);
        const reachedEnd = data.totalPages ? nextPage >= data.totalPages : newProperties.length < PAGE_LIMIT;
        setHasMore(!reachedEnd);
      }
    } catch (err) {
      console.error('Failed to load more properties:', err);
    } finally {
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [page, hasMore, isLoadingMore, isLoadingInitial]);

  // Initial load effect
  useEffect(() => {
    if (initialProperties.length === 0) {
      fetchInitialProperties();
    }
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [initialProperties, fetchInitialProperties]);

  // IntersectionObserver for infinite scrolling
  useEffect(() => {
    const sentinel = observerRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoadingInitial) {
          loadMoreProperties();
        }
      },
      {
        root: null,
        rootMargin: '300px', // Pre-fetch before user reaches the very bottom
        threshold: 0.1,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoadingMore, isLoadingInitial, loadMoreProperties]);

  // Loading state (showing skeletons + cold start alert banner)
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
                  Démarrage du serveur Render en cours...
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                  Le serveur gratuit Render sort de sa mise en veille. Connexion automatique en cours (tentative {retryCount + 1})...
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
          {Array.from({ length: 8 }).map((_, i) => (
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
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Le backend met plus de temps que prévu à répondre</p>
          <p className="text-sm mt-1 max-w-md mx-auto text-zinc-500 dark:text-zinc-400">
            Render prend parfois jusqu&apos;à 50 secondes pour réveiller un serveur inactif. Cliquez ci-dessous pour réessayer.
          </p>
        </div>
        <button
          onClick={() => {
            setRetryCount(0);
            fetchInitialProperties(false);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 font-semibold text-sm shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Réessayer maintenant
        </button>
      </div>
    );
  }

  // Loaded properties grid
  if (properties.length === 0) {
    return (
      <div className="col-span-full py-16 text-center text-zinc-400 dark:text-zinc-500">
        <p className="text-lg font-medium">Aucune propriété trouvée.</p>
        <button
          onClick={() => fetchInitialProperties(false)}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
        {properties.map((property: any) => (
          <PropertyCard key={property._id} property={property} />
        ))}
      </div>

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
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Chargement de nouvelles annonces...</span>
          </div>
        )}
      </div>

      {/* End of list state */}
      {!hasMore && properties.length > 0 && (
        <div className="pt-4 pb-8 flex items-center justify-center gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>Vous avez vu toutes les propriétés disponibles.</span>
        </div>
      )}
    </div>
  );
}
