'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Home, 
  Compass, 
  Heart, 
  User, 
  Plus, 
  LayoutDashboard, 
  Building2, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useModalStore } from '@/store/modalStore';
import { useUserStore } from '@/store/userStore';

export default function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const openModal = useModalStore((state) => state.openModal);
  const { user, initialize } = useUserStore();
  const isLoggedIn = !!user;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current && 
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    if (isMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen]);

  const handleActionClick = (targetTab: 'create' | 'overview' | 'listings') => {
    setIsMenuOpen(false);
    if (!isLoggedIn) {
      openModal('login');
      return;
    }
    router.push(`/dashboard?tab=${targetTab}`);
  };

  const isDashboardActive = pathname.startsWith('/dashboard');

  return (
    <>
      {/* ── Backdrop Overlay when center action menu is open ── */}
      {isMenuOpen && (
        <div 
          onClick={() => setIsMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      {/* ── Standout Center Quick Menu Popover ── */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className="fixed z-50 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200
            /* Mobile & Tablet: Centered above bottom navigation bar */
            bottom-22 left-1/2 -translate-x-1/2 w-[92%] max-w-[350px]
            md:bottom-24 md:w-[360px]
            /* Desktop: Floating to the left of the vertical right-dock */
            lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:left-auto lg:right-[100px] xl:right-[110px] lg:translate-x-0 lg:w-[340px]
            bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl
            rounded-3xl p-3 sm:p-4
            border border-zinc-200/80 dark:border-zinc-800
            shadow-[0_16px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_16px_50px_rgba(0,0,0,0.5)]"
        >
          {/* Popover Header */}
          <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-zinc-100 dark:border-zinc-800/80 mb-2">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                Espace Propriétaire
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Gérez vos annonces et visualisez vos performances
              </p>
            </div>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-green/10 text-brand-green dark:bg-brand-green/20">
              <Sparkles className="w-3 h-3" />
              TranoGasy
            </span>
          </div>

          {/* Action List */}
          <div className="flex flex-col gap-1.5">
            {/* 1. Create a listing */}
            <button
              type="button"
              onClick={() => handleActionClick('create')}
              className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-emerald-50/80 dark:hover:bg-emerald-950/30 transition-all text-left group cursor-pointer border border-transparent hover:border-brand-green/20"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-green to-emerald-500 text-white shadow-md shadow-brand-green/25 group-hover:scale-105 transition-transform">
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-brand-green transition-colors">
                    Créer une annonce
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Publier un bien en vente ou location
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-brand-green group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>

            {/* 2. Dashboard */}
            <button
              type="button"
              onClick={() => handleActionClick('overview')}
              className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 group-hover:scale-105 transition-transform">
                  <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">
                    Tableau de bord
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Statistiques de visites & contacts
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>

            {/* 3. My Listings */}
            <button
              type="button"
              onClick={() => handleActionClick('listings')}
              className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                  <Building2 className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white">
                    Mes annonces
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Gérer et modifier mes propriétés
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* ── Fixed Navigation Bar ── */}
      <nav className="fixed z-50 transition-all duration-300 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md border-zinc-200 dark:border-zinc-700 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.2)]
        bottom-0 left-0 w-full border-t pb-safe pt-2
        md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[380px] md:rounded-[2rem] md:border md:pb-2 md:shadow-xl
        lg:top-1/2 lg:right-6 xl:right-8 2xl:right-9 lg:left-auto lg:bottom-auto lg:translate-x-0 lg:-translate-y-1/2 lg:w-[85px] lg:h-[410px] lg:rounded-[2.5rem] lg:pt-4 lg:pb-4 lg:px-0">
        
        <div className="flex h-full items-center justify-around px-2 pb-2 md:pb-0 lg:flex-col lg:px-0 lg:py-2">
          
          {/* 1. Accueil */}
          <Link
            href="/"
            aria-label="Accueil"
            className={`flex flex-col items-center gap-1 p-2 transition-all hover:scale-105 ${
              pathname === '/' 
                ? 'text-brand-red font-semibold' 
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            <Home className="h-6 w-6" strokeWidth={pathname === '/' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Accueil</span>
          </Link>

          {/* 2. Explorer */}
          <Link
            href="/explore"
            aria-label="Explorer"
            className={`flex flex-col items-center gap-1 p-2 transition-all hover:scale-105 ${
              pathname === '/explore' 
                ? 'text-brand-red font-semibold' 
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            <Compass className="h-6 w-6" strokeWidth={pathname === '/explore' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Explorer</span>
          </Link>

          {/* ══════════════════════════════════════════════════════════
              3. CENTER STANDOUT OPTION: Create Listing / Dashboard
          ══════════════════════════════════════════════════════════ */}
          <div className="relative flex flex-col items-center">
            <button
              ref={buttonRef}
              type="button"
              id="center-create-listing-btn"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Créer une annonce et tableau de bord"
              aria-expanded={isMenuOpen}
              className={`relative flex items-center justify-center rounded-full transition-all duration-300 cursor-pointer
                /* Mobile & Tablet: Raised floating FAB style */
                -translate-y-3.5 md:-translate-y-4 h-12 w-12 md:h-13 md:w-13
                /* Desktop: Sits centered in dock with clean scaling */
                lg:translate-y-0 lg:h-12 lg:w-12 lg:my-1
                /* Vibrant Standout Gradient & Ring */
                bg-gradient-to-tr from-brand-green via-[#7cbd1e] to-emerald-500 text-white
                ring-4 ring-white dark:ring-zinc-800
                shadow-[0_8px_22px_rgba(124,189,30,0.45)] dark:shadow-[0_8px_22px_rgba(124,189,30,0.3)]
                hover:scale-110 active:scale-95
                ${isMenuOpen ? 'rotate-45 ring-brand-green/50 shadow-[0_0_24px_rgba(124,189,30,0.6)]' : ''}
                ${isDashboardActive && !isMenuOpen ? 'ring-brand-green/60' : ''}`}
            >
              <Plus 
                className="h-6 w-6 text-white transition-transform duration-300" 
                strokeWidth={2.8} 
              />
            </button>

            {/* Label below the center button */}
            <span className={`text-[10px] font-bold tracking-tight -mt-2 md:-mt-2 lg:mt-0.5 transition-colors ${
              isDashboardActive || isMenuOpen
                ? 'text-brand-green dark:text-emerald-400'
                : 'text-zinc-600 dark:text-zinc-300'
            }`}>
              Publier
            </span>
          </div>

          {/* 4. Favoris */}
          <Link
            href="/favorites"
            aria-label="Favoris"
            className={`flex flex-col items-center gap-1 p-2 transition-all hover:scale-105 ${
              pathname === '/favorites' 
                ? 'text-brand-red font-semibold' 
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            <Heart className="h-6 w-6" strokeWidth={pathname === '/favorites' ? 2.5 : 2} />
            <span className="text-[10px] font-medium">Favoris</span>
          </Link>

          {/* 5. Compte */}
          {isLoggedIn ? (
            <Link
              href="/account"
              aria-label="Mon compte"
              className={`flex flex-col items-center gap-1 p-2 transition-all hover:scale-105 ${
                pathname === '/account' 
                  ? 'text-brand-red font-semibold' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <User className="h-6 w-6" strokeWidth={pathname === '/account' ? 2.5 : 2} />
              <span className="text-[10px] font-medium">Compte</span>
            </Link>
          ) : (
            <button
              onClick={() => openModal('login')}
              aria-label="Se connecter"
              className={`flex flex-col items-center gap-1 p-2 transition-all hover:scale-105 cursor-pointer ${
                pathname === '/account' 
                  ? 'text-brand-red font-semibold' 
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <User className="h-6 w-6" strokeWidth={pathname === '/account' ? 2.5 : 2} />
              <span className="text-[10px] font-medium">Compte</span>
            </button>
          )}

        </div>
      </nav>
    </>
  );
}
