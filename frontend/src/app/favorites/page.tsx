'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart } from 'lucide-react';
import Header from '@/components/Header';
import PropertyCard from '@/components/PropertyCard';
import { useUserStore } from '@/store/userStore';
import { useFavorite } from '@/hooks/useFavorite';
import { useRouter } from 'next/navigation';

export default function FavoritesPage() {
  const userStore = useUserStore(state => state.user);
  const currentUser = userStore?.user || userStore;
  const { favorites, favoritePropertiesData, fetchFavorites } = useFavorite();
  const [loading, setLoading] = useState(!favoritePropertiesData);
  const router = useRouter();

  useEffect(() => {
    if (currentUser) {
      fetchFavorites(currentUser._id).then(() => {
        setLoading(false);
      });
    } else {
      // If not logged in, finish loading so we can show a message
      const timer = setTimeout(() => {
        setLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentUser, fetchFavorites]);

  const displayedProperties = favoritePropertiesData?.filter(prop => favorites[prop._id]) || [];

  return (
    <div className="bg-[#F8F9FA] dark:bg-zinc-950 font-sans flex flex-col min-h-full">
      <div className="sticky top-0 z-50">
        <Header />
      </div>

      <div className="sticky top-[64px] z-40 w-full bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 md:border-transparent">
        <div className="mx-auto flex max-w-7xl items-center px-4 sm:px-6 lg:px-8 py-2 md:py-4">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors mr-2">
            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6 text-zinc-800 dark:text-zinc-200" strokeWidth={2.5} />
          </button>
          <h1 className="text-lg md:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
            Vos favoris
          </h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:pr-[120px] pb-8 pt-2 w-full">

        {!currentUser && !loading ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
            <div className="w-20 h-20 bg-brand-red/10 rounded-full flex items-center justify-center mb-6 text-brand-red">
              <Heart className="w-10 h-10 fill-current" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white mb-2">Connectez-vous</h3>
            <p className="text-zinc-500 max-w-sm mb-8">
              Connectez-vous pour voir vos favoris.
            </p>
            <Link href="/" className="bg-brand-green text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-brand-green/20 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-green/30 transition-all duration-300">
              Retour à l'accueil
            </Link>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-[50vh]">
             <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-green"></div>
          </div>
        ) : displayedProperties.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedProperties.map((prop) => (
              <PropertyCard key={prop._id} property={prop} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
            <div className="w-full max-w-[280px] md:max-w-[320px] mb-8 relative group">
              <div className="absolute inset-0 bg-brand-green/5 dark:bg-brand-green/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <img 
                src="/no-favorite.svg" 
                alt="Aucun favori" 
                className="w-full h-auto drop-shadow-sm relative z-10 hover:scale-105 transition-transform duration-500 rounded-[2rem] dark:bg-white/95 p-2 dark:shadow-[0_0_40px_rgba(255,255,255,0.05)]" 
              />
            </div>
            <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white mb-2">
              Aucun coup de cœur
            </h3>
            <p className="text-zinc-500 text-sm md:text-base mb-8">
              Explorez nos annonces pour trouver votre bonheur.
            </p>
            <Link 
              href="/explore" 
              className="bg-brand-green text-white px-6 py-3 md:px-8 md:py-3.5 rounded-full font-semibold shadow-lg shadow-brand-green/20 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-green/30 transition-all duration-300 flex items-center gap-2"
            >
              Explorer les propriétés
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
