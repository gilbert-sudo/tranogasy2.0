'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart } from 'lucide-react';
import Header from '@/components/Header';
import PropertyCard from '@/components/PropertyCard';
import { useUserStore } from '@/store/userStore';
import { useFavoriteStore } from '@/store/favoriteStore';
import { useRouter } from 'next/navigation';

export default function FavoritesPage() {
  const userStore = useUserStore(state => state.user);
  const currentUser = userStore?.user || userStore;
  const { favorites, favoritePropertiesData, fetchFavorites } = useFavoriteStore();
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

      <div className="md:hidden sticky top-[64px] z-40 bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl px-4 py-3 flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-800">
        <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-6 h-6 text-zinc-800 dark:text-zinc-200" strokeWidth={2.5} />
        </button>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
          Vos favoris
        </h1>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:pr-[120px] pb-8 pt-2 md:pt-4">
        {/* Title for desktop */}
        <div className="hidden md:flex items-center gap-4 sticky top-[64px] z-40 bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl py-4 mb-6">
          <button onClick={() => router.back()} className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-7 h-7 text-zinc-800 dark:text-zinc-200" strokeWidth={2.5} />
          </button>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">
            Vos favoris
          </h1>
        </div>

        {!currentUser && !loading ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm p-8">
            <div className="w-20 h-20 bg-brand-red/10 rounded-full flex items-center justify-center mb-6 text-brand-red">
              <Heart className="w-10 h-10 fill-current" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white mb-3">Connectez-vous pour voir vos favoris</h3>
            <p className="text-zinc-500 max-w-md mb-8">
              Vous devez être connecté pour enregistrer et retrouver vos annonces préférées sur TranoGasy.
            </p>
            <Link href="/" className="bg-brand-green text-white px-8 py-3 rounded-full font-bold shadow-lg hover:-translate-y-0.5 transition-transform">
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
          <div className="flex flex-col items-center justify-center h-[50vh] text-center bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 shadow-sm p-8">
            <div className="w-20 h-20 bg-brand-red/10 rounded-full flex items-center justify-center mb-6 text-brand-red">
              <Heart className="w-10 h-10 fill-current" />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white mb-3">Aucun favori pour le moment</h3>
            <p className="text-zinc-500 max-w-md mb-8">
              Explorez les annonces et ajoutez celles que vous aimez à vos favoris pour les retrouver facilement ici.
            </p>
            <Link href="/explore" className="bg-brand-green text-white px-8 py-3 rounded-full font-bold shadow-lg hover:-translate-y-0.5 transition-transform">
              Explorer les annonces
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
