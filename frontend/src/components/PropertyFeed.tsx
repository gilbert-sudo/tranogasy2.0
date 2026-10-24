'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import PropertyCard from '@/components/PropertyCard';
import PropertyCardSkeleton from '@/components/PropertyCardSkeleton';
import { Loader2, RefreshCw, ServerCrash, Sparkles } from 'lucide-react';

interface PropertyFeedProps {
  initialProperties?: any[];
}

export default function PropertyFeed({ initialProperties = [] }: PropertyFeedProps) {
  const [properties, setProperties] = useState<any[]>(initialProperties);
  const [isLoading, setIsLoading] = useState<boolean>(initialProperties.length === 0);
  const [isWakingUp, setIsWakingUp] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [hasFailed, setHasFailed] = useState<boolean>(false);

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchProperties = useCallback(async (isAutoRetry = false) => {
    try {
      if (!isAutoRetry) {
        setIsLoading(true);
        setHasFailed(false);
      }

      const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const apiUrl = rawUrl.replace(/\/$/, '');

      // Controller with 15s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${apiUrl}/properties?limit=20`, {
        cache: 'no-store',
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        throw new Error(`API responded with status: ${res.status}`);
      }

      const data = await res.json();
      const fetched = data.properties || [];

      setProperties(fetched);
      setIsLoading(false);
      setIsWakingUp(false);
      setRetryCount(0);
      setHasFailed(false);
    } catch (error) {
      console.warn('Backend wake-up / request error:', error);

      // If we don't have properties loaded yet, consider the server sleeping
      setIsWakingUp(true);

      setRetryCount((prev) => {
        const next = prev + 1;
        // Keep retrying automatically up to 10 attempts (about 40-50s for Render cold start)
        if (next < 12) {
          retryTimeoutRef.current = setTimeout(() => {
            fetchProperties(true);
          }, 3500);
        } else {
          // Exceeded retry count, show friendly manual retry button
          setIsLoading(false);
          setIsWakingUp(false);
          setHasFailed(true);
        }
        return next;
      });
    }
  }, []);

  // When initialProperties is empty (e.g. Next.js SSR couldn't connect or cold started), start client polling immediately
  useEffect(() => {
    if (initialProperties.length === 0) {
      fetchProperties();
    }
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [initialProperties, fetchProperties]);

  // Loading state (showing skeletons + cold start alert banner)
  if (isLoading || isWakingUp) {
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
            fetchProperties(false);
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
          onClick={() => fetchProperties(false)}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
      {properties.map((property: any) => (
        <PropertyCard key={property._id} property={property} />
      ))}
    </div>
  );
}
