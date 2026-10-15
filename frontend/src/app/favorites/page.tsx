'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Heart, 
  Share2, 
  Compass, 
  Search, 
  Check, 
  X
} from 'lucide-react';
import Header from '@/components/Header';
import PropertyCard from '@/components/PropertyCard';
import { useUserStore } from '@/store/userStore';
import { useFavorite } from '@/hooks/useFavorite';
import { useModalStore } from '@/store/modalStore';
import { useImage } from '@/hooks/useImage';

type FilterCategory = 'all' | 'rent' | 'sale' | 'house' | 'apartment';
type SortOption = 'newest' | 'price-asc' | 'price-desc';

export default function FavoritesPage() {
  const router = useRouter();
  const { user: userStore, initialize } = useUserStore();
  const currentUser = userStore?.user || userStore;
  const { favorites, favoritePropertiesData, fetchFavorites } = useFavorite();
  const openModal = useModalStore((state) => state.openModal);
  const { noFavoriteImg } = useImage();

  const [loading, setLoading] = useState(!favoritePropertiesData);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (currentUser?._id) {
      fetchFavorites(currentUser._id).then(() => {
        setLoading(false);
      });
    } else {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (!stored) {
        setLoading(false);
      } else {
        const timer = setTimeout(() => {
          setLoading(false);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser, fetchFavorites]);

  // Extract all currently favorited properties
  const allFavorites = useMemo(() => {
    return favoritePropertiesData?.filter((prop) => favorites[prop._id]) || [];
  }, [favoritePropertiesData, favorites]);

  // Filtered & Sorted properties
  const filteredProperties = useMemo(() => {
    return allFavorites
      .filter((prop) => {
        if (activeCategory === 'rent') {
          const isRent = prop.type?.toLowerCase().includes('location') || (prop.rent && prop.rent > 0);
          if (!isRent) return false;
        } else if (activeCategory === 'sale') {
          const isSale = prop.type?.toLowerCase().includes('vente') || (!prop.rent && prop.price);
          if (!isSale) return false;
        } else if (activeCategory === 'house') {
          const isHouse = 
            prop.houseType?.toLowerCase().includes('maison') || 
            prop.houseType?.toLowerCase().includes('villa');
          if (!isHouse) return false;
        } else if (activeCategory === 'apartment') {
          const isApartment = 
            prop.houseType?.toLowerCase().includes('appartement') || 
            prop.houseType?.toLowerCase().includes('studio');
          if (!isApartment) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = prop.title?.toLowerCase().includes(q);
          const matchDistrict = prop.city?.district?.toLowerCase().includes(q);
          const matchCommune = prop.city?.commune?.toLowerCase().includes(q);
          const matchType = prop.houseType?.toLowerCase().includes(q) || prop.type?.toLowerCase().includes(q);
          if (!matchTitle && !matchDistrict && !matchCommune && !matchType) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') {
          return (a.price || a.rent || 0) - (b.price || b.rent || 0);
        }
        if (sortBy === 'price-desc') {
          return (b.price || b.rent || 0) - (a.price || a.rent || 0);
        }
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
  }, [allFavorites, activeCategory, searchQuery, sortBy]);

  // Share Action
  const handleShare = async () => {
    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    const shareData = {
      title: 'Mes favoris • TranoGasy',
      text: 'Découvrez ma sélection de biens immobiliers sur TranoGasy !',
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Clipboard copy failed:', e);
    }
  };

  const isPopulated = allFavorites.length > 0 && !loading && currentUser;

  return (
    <div className={`bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-sans flex flex-col ${isPopulated ? 'min-h-screen' : 'h-[calc(100dvh-4rem)] md:h-screen max-h-[calc(100dvh-4rem)] md:max-h-screen overflow-hidden'}`}>
      {/* TOP NAV BAR - Shown on mobile and desktop */}
      <div className="shrink-0">
        <Header />
      </div>

      {/* TOP BAR - Only shown when populated */}
      {isPopulated && (
        <div className="w-full px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.back()} 
              className="h-10 w-10 cursor-pointer rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200 shadow-sm border border-black/5 dark:border-white/10 hover:scale-105 active:scale-75 transition-all"
              title="Retour"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
              Vos favoris
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand-red/10 text-brand-red dark:bg-brand-red/20">
                {allFavorites.length}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              onClick={handleShare} 
              className="h-10 w-10 cursor-pointer rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200 shadow-sm border border-black/5 dark:border-white/10 hover:scale-105 active:scale-75 transition-all"
              title="Partager"
            >
              {copied ? <Check className="h-4 w-4 text-brand-green" /> : <Share2 className="h-4 w-4" />}
            </button>

            <div className="h-10 w-10 rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center text-brand-red shadow-sm border border-black/5 dark:border-white/10">
              <Heart className="h-5 w-5 fill-brand-red" />
            </div>
          </div>
        </div>
      )}

      {/* TOAST ALERT */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 dark:bg-zinc-100/95 text-white dark:text-zinc-900 px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-bold backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="w-4 h-4 text-brand-green" />
          <span>Lien copié dans le presse-papiers !</span>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* ========================================================= */}
        {/* CASE 1: NOT LOGGED IN — IMAGE AT TOP WITH ROUNDED BOTTOM  */}
        {/* ========================================================= */}
        {!currentUser && !loading ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-between text-center px-0 pb-3 sm:pb-6 animate-in fade-in zoom-in-95 duration-300">
            {/* HERO IMAGE AT VERY TOP - OCCUPIES 60% OF DYNAMIC SCREEN SIZE (CONSIDERING TOP NAV BAR) */}
            <div className="relative z-10 w-full h-[calc(60dvh-4rem)] min-h-[calc(60dvh-4rem)] sm:h-[calc(60dvh-4rem)] sm:min-h-[calc(60dvh-4rem)] max-h-[500px] overflow-hidden rounded-b-[2.5rem] sm:rounded-b-[3.5rem] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.7)] bg-zinc-50 dark:bg-zinc-800/40 flex items-center justify-center shrink-0">
              {/* Floating Top Actions - Clean, no top shadow */}
              <div className="absolute top-0 left-0 right-0 z-20 pt-4 px-4 sm:px-6 flex justify-between items-center pointer-events-none">
                <button 
                  onClick={() => router.back()} 
                  className="pointer-events-auto h-10 w-10 cursor-pointer rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-zinc-900 dark:text-zinc-100 shadow-md border border-black/5 dark:border-white/10 hover:scale-105 active:scale-75 transition-all"
                  title="Retour"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="pointer-events-auto h-10 w-10 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-brand-red shadow-md border border-black/5 dark:border-white/10">
                  <Heart className="h-5 w-5 fill-brand-red" />
                </div>
              </div>

              <img 
                src={noFavoriteImg()} 
                alt="Vos favoris TranoGasy" 
                className="w-full h-full object-contain select-none pointer-events-none"
              />
            </div>

            {/* MINIMAL CONCISE TEXT & PRIMARY CTA */}
            <div className="w-full max-w-md mx-auto px-6 py-2 sm:py-6 flex-1 min-h-0 flex flex-col items-center justify-center text-center">
              <h2 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-1 sm:mb-2 leading-tight">
                Connectez-vous pour voir vos favoris
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm md:text-base max-w-sm mx-auto mb-4 sm:mb-6 line-clamp-2">
                Retrouvez et synchronisez toutes vos propriétés enregistrées en un seul endroit.
              </p>

              {/* SINGLE PRIMARY CTA BUTTON */}
              <button
                onClick={() => openModal('login')}
                className="w-full max-w-xs sm:w-auto bg-brand-green hover:bg-green-700 text-white rounded-full py-3 sm:py-3.5 px-8 sm:px-10 font-bold text-xs sm:text-base shadow-lg shadow-brand-green/20 hover:shadow-brand-green/30 hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer"
              >
                Se connecter
              </button>

              {/* DISCREET SIGNUP TEXT */}
              <p className="text-xs sm:text-sm text-zinc-400 dark:text-zinc-500 mt-2.5 sm:mt-4">
                Pas encore de compte ?{' '}
                <button 
                  onClick={() => openModal('signup')} 
                  className="font-bold text-brand-green hover:underline cursor-pointer"
                >
                  Créer un compte
                </button>
              </p>
            </div>
          </div>
        ) : loading ? (
          /* ========================================================= */
          /* CASE 2: LOADING SKELETON                                  */
          /* ========================================================= */
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="relative w-12 h-12">
              <div className="w-12 h-12 rounded-full border-2 border-zinc-200 dark:border-zinc-700 border-t-brand-green animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-brand-red">
                <Heart className="w-4 h-4 fill-current animate-pulse" />
              </div>
            </div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
              Chargement...
            </p>
          </div>
        ) : allFavorites.length > 0 ? (
          /* ========================================================= */
          /* CASE 3: FAVORITES LIST (FULL SCREEN HIGH DENSITY)         */
          /* ========================================================= */
          <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            {/* SEARCH & FILTERS TOOLBAR */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Category Pills */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                {[
                  { id: 'all', label: 'Toutes', count: allFavorites.length },
                  { 
                    id: 'rent', 
                    label: 'En location', 
                    count: allFavorites.filter(p => p.type?.toLowerCase().includes('location') || (p.rent && p.rent > 0)).length 
                  },
                  { 
                    id: 'sale', 
                    label: 'En vente', 
                    count: allFavorites.filter(p => p.type?.toLowerCase().includes('vente') || (!p.rent && p.price)).length 
                  },
                  { 
                    id: 'house', 
                    label: 'Maisons', 
                    count: allFavorites.filter(p => p.houseType?.toLowerCase().includes('maison') || p.houseType?.toLowerCase().includes('villa')).length 
                  },
                  { 
                    id: 'apartment', 
                    label: 'Apparts', 
                    count: allFavorites.filter(p => p.houseType?.toLowerCase().includes('appartement') || p.houseType?.toLowerCase().includes('studio')).length 
                  },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id as FilterCategory)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold shadow-xs hover:-translate-y-0.5 transition-all cursor-pointer whitespace-nowrap ${
                      activeCategory === cat.id
                        ? 'bg-brand-green text-white border-brand-green shadow-brand-green/20'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      activeCategory === cat.id
                        ? 'bg-white/20 text-white'
                        : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}>
                      {cat.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* In-Favorites Search & Sort */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <div className="relative w-44 sm:w-52">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrer par ville..."
                    className="w-full pl-8 pr-7 py-2 text-xs rounded-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 focus:outline-none focus:ring-1.5 focus:ring-brand-green text-zinc-900 dark:text-white"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-3 py-2 text-xs rounded-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-1.5 focus:ring-brand-green cursor-pointer"
                >
                  <option value="newest">Plus récents</option>
                  <option value="price-asc">Prix croissant</option>
                  <option value="price-desc">Prix décroissant</option>
                </select>
              </div>
            </div>

            {/* PROPERTY CARDS GRID */}
            {filteredProperties.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                {filteredProperties.map((prop) => (
                  <PropertyCard key={prop._id} property={prop} />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center max-w-md mx-auto my-12">
                <Search className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
                <h3 className="text-base font-bold text-zinc-900 dark:text-white mb-1">
                  Aucun bien trouvé
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                  Aucun de vos favoris ne correspond aux critères sélectionnés.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('all');
                  }}
                  className="px-5 py-2.5 rounded-full bg-brand-green hover:bg-green-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* CASE 4: LOGGED IN EMPTY — IMAGE AT TOP WITH ROUNDED BOTTOM */
          /* ========================================================= */
          <div className="flex-1 min-h-0 flex flex-col items-center justify-between text-center px-0 pb-3 sm:pb-6 animate-in fade-in zoom-in-95 duration-300">
            {/* HERO IMAGE AT VERY TOP - OCCUPIES 60% OF DYNAMIC SCREEN SIZE (CONSIDERING TOP NAV BAR) */}
            <div className="relative z-10 w-full h-[calc(60dvh-4rem)] min-h-[calc(60dvh-4rem)] sm:h-[calc(60dvh-4rem)] sm:min-h-[calc(60dvh-4rem)] max-h-[500px] overflow-hidden rounded-b-[2.5rem] sm:rounded-b-[3.5rem] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.7)] bg-zinc-50 dark:bg-zinc-800/40 flex items-center justify-center shrink-0">
              {/* Floating Top Actions - Clean, no top shadow */}
              <div className="absolute top-0 left-0 right-0 z-20 pt-4 px-4 sm:px-6 flex justify-between items-center pointer-events-none">
                <button 
                  onClick={() => router.back()} 
                  className="pointer-events-auto h-10 w-10 cursor-pointer rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-zinc-900 dark:text-zinc-100 shadow-md border border-black/5 dark:border-white/10 hover:scale-105 active:scale-75 transition-all"
                  title="Retour"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="pointer-events-auto h-10 w-10 rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md flex items-center justify-center text-brand-red shadow-md border border-black/5 dark:border-white/10">
                  <Heart className="h-5 w-5 fill-brand-red" />
                </div>
              </div>

              <img 
                src={noFavoriteImg()} 
                alt="Aucun coup de cœur" 
                className="w-full h-full object-contain select-none pointer-events-none"
              />
            </div>

            <div className="w-full max-w-md mx-auto px-6 py-2 sm:py-6 flex-1 min-h-0 flex flex-col items-center justify-center text-center">
              <h2 className="text-lg sm:text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight mb-1 sm:mb-2 leading-tight">
                Aucun coup de cœur pour le moment
              </h2>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm md:text-base max-w-sm mx-auto mb-4 sm:mb-6 line-clamp-2">
                Cliquez sur l'icône cœur des annonces pour sauvegarder vos propriétés préférées.
              </p>

              <Link 
                href="/explore" 
                className="w-full max-w-xs sm:w-auto bg-brand-green hover:bg-green-700 text-white rounded-full py-3 sm:py-3.5 px-8 font-bold text-xs sm:text-base shadow-lg shadow-brand-green/20 hover:shadow-brand-green/30 hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Compass className="h-4 w-4" />
                <span>Explorer les annonces</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
