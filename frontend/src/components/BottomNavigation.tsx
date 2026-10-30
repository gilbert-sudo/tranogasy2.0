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
  const [clickedItem, setClickedItem] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const triggerClickEffect = (itemId: string) => {
    setClickedItem(itemId);
    setTimeout(() => {
      setClickedItem((prev) => (prev === itemId ? null : prev));
    }, 700);
  };

  useEffect(() => {
    initialize();
  }, [initialize]);

  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close menu on route change during render (React recommended pattern)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMenuOpen(false);
  }

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
    if (targetTab === 'create') {
      router.push('/create-listing');
      return;
    }
    router.push(`/dashboard?tab=${targetTab}`);
  };

  const isDashboardActive = pathname.startsWith('/dashboard');
  const isPropertyDetails = pathname.startsWith('/properties/');
  const isCreateListing = pathname.startsWith('/create-listing');

  if (isPropertyDetails) {
    return null;
  }

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
            lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:left-auto lg:right-[95px] lg:translate-x-0 lg:w-[340px]
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md group-hover:scale-105 transition-transform">
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
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 group-hover:bg-brand-green/15 group-hover:text-brand-green group-hover:scale-105 transition-all">
                  <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-brand-green transition-colors">
                    Tableau de bord
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Statistiques de visites & contacts
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-brand-green group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>

            {/* 3. My Listings */}
            <button
              type="button"
              onClick={() => handleActionClick('listings')}
              className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 group-hover:bg-brand-green/15 group-hover:text-brand-green group-hover:scale-105 transition-all">
                  <Building2 className="h-5 w-5" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-brand-green transition-colors">
                    Mes annonces
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Gérer et modifier mes propriétés
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-brand-green group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          </div>
        </div>
      )}

      {/* ── Fixed Navigation Bar ── */}
      <nav className={`fixed z-30 transition-all duration-300 bg-white/85 dark:bg-zinc-900/90 backdrop-blur-2xl border-zinc-200/70 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] ${isCreateListing ? "hidden lg:flex" : ""}
        bottom-0 left-0 right-0 border-t rounded-none pb-safe pt-1.5
        md:bottom-0 md:left-1/2 md:-translate-x-1/2 md:w-[390px] md:border-x md:border-t md:rounded-t-3xl md:rounded-b-none md:pb-1.5 md:pt-1.5 md:shadow-2xl
        lg:top-1/2 lg:right-0 lg:left-auto lg:bottom-auto lg:translate-x-0 lg:-translate-y-1/2 lg:w-[85px] lg:h-[410px] lg:border-y lg:border-l lg:border-r-0 lg:rounded-l-[2.5rem] lg:rounded-r-none lg:pt-4 lg:pb-4 lg:px-0`}>
        
        <div className="flex h-full items-center justify-around px-2 pb-1.5 md:pb-0 lg:flex-col lg:px-0 lg:py-2">
          
          {/* 1. Accueil */}
          {(() => {
            const isActive = pathname === '/';
            const isClicked = clickedItem === 'home';
            return (
              <Link
                href="/"
                aria-label="Accueil"
                onClick={() => triggerClickEffect('home')}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 select-none group cursor-pointer ${
                  isActive 
                    ? 'text-zinc-950 dark:text-white font-bold -translate-y-[1px] lg:translate-y-0 lg:-translate-x-[1px] scale-105' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:scale-105 active:scale-95'
                }`}
              >
                {/* Snappy Black Click Pulse */}
                {isClicked && (
                  <span className="absolute inset-0 rounded-2xl ring-2 ring-zinc-950/40 dark:ring-white/50 bg-zinc-950/10 dark:bg-white/15 animate-nav-pulse pointer-events-none" />
                )}

                <div className="relative">
                  <Home 
                    className={`h-6.5 w-6.5 sm:h-7 sm:w-7 transition-transform duration-200 ${
                      isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'
                    } ${isClicked ? 'animate-nav-bounce' : 'group-hover:scale-105'}`} 
                  />
                </div>

                <span className="text-[10px] font-semibold tracking-tight">Accueil</span>
              </Link>
            );
          })()}

          {/* 2. Explorer */}
          {(() => {
            const isActive = pathname === '/explore';
            const isClicked = clickedItem === 'explore';
            return (
              <Link
                href="/explore"
                aria-label="Explorer"
                onClick={() => triggerClickEffect('explore')}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 select-none group cursor-pointer ${
                  isActive 
                    ? 'text-zinc-950 dark:text-white font-bold -translate-y-[1px] lg:translate-y-0 lg:-translate-x-[1px] scale-105' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:scale-105 active:scale-95'
                }`}
              >
                {/* Snappy Black Click Pulse */}
                {isClicked && (
                  <span className="absolute inset-0 rounded-2xl ring-2 ring-zinc-950/40 dark:ring-white/50 bg-zinc-950/10 dark:bg-white/15 animate-nav-pulse pointer-events-none" />
                )}

                <div className="relative">
                  <Compass 
                    className={`h-6.5 w-6.5 sm:h-7 sm:w-7 transition-transform duration-200 ${
                      isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'
                    } ${isClicked ? 'animate-nav-bounce' : 'group-hover:scale-105'}`} 
                  />
                </div>

                <span className="text-[10px] font-semibold tracking-tight">Explorer</span>
              </Link>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════
              3. CENTER STANDOUT OPTION: Create Listing / Dashboard
          ══════════════════════════════════════════════════════════ */}
          <div className="relative flex flex-col items-center">
            {/* Click Pulse Ripple for Center FAB */}
            {clickedItem === 'publish' && (
              <span className="absolute -top-3.5 md:-top-4 lg:top-1 w-14 h-14 rounded-full ring-2 ring-zinc-950/40 dark:ring-white/50 animate-nav-pulse pointer-events-none z-10" />
            )}

            <button
              ref={buttonRef}
              type="button"
              id="center-create-listing-btn"
              onClick={() => {
                triggerClickEffect('publish');
                setIsMenuOpen(!isMenuOpen);
              }}
              aria-label="Créer une annonce et tableau de bord"
              aria-expanded={isMenuOpen}
              className={`relative flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer
                /* Mobile & Tablet: Raised floating FAB style */
                -translate-y-3.5 md:-translate-y-4 h-13 w-13 md:h-14 md:w-14
                /* Desktop: Sits centered in dock with clean scaling */
                lg:translate-y-0 lg:h-13 lg:w-13 lg:my-1
                /* Primary Black Liquid Glass Block Button */
                bg-zinc-950 dark:bg-white text-white dark:text-zinc-950
                border border-white/20 dark:border-black/10
                ring-4 ring-white/90 dark:ring-zinc-900/90
                shadow-[0_8px_24px_rgba(0,0,0,0.35)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)]
                hover:scale-105 active:scale-95
                ${isMenuOpen ? 'rotate-45' : ''}
                ${isDashboardActive && !isMenuOpen ? 'ring-zinc-950 dark:ring-white' : ''}
                ${clickedItem === 'publish' ? 'animate-nav-bounce' : ''}`}
            >
              <Plus 
                className="h-7 w-7 text-white dark:text-zinc-950 transition-transform duration-200" 
                strokeWidth={2.8} 
              />
            </button>

            {/* Label below the center button */}
            <span className={`text-[10px] font-bold tracking-tight -mt-2 md:-mt-2 lg:mt-0.5 transition-colors ${
              isDashboardActive || isMenuOpen
                ? 'text-zinc-950 dark:text-white font-bold'
                : 'text-zinc-800 dark:text-zinc-200'
            }`}>
              Publier
            </span>
          </div>

          {/* 4. Favoris */}
          {(() => {
            const isActive = pathname === '/favorites';
            const isClicked = clickedItem === 'favorites';
            return (
              <Link
                href="/favorites"
                aria-label="Favoris"
                onClick={() => triggerClickEffect('favorites')}
                className={`relative flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 select-none group cursor-pointer ${
                  isActive 
                    ? 'text-zinc-950 dark:text-white font-bold -translate-y-[1px] lg:translate-y-0 lg:-translate-x-[1px] scale-105' 
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:scale-105 active:scale-95'
                }`}
              >
                {/* Snappy Black Click Pulse */}
                {isClicked && (
                  <span className="absolute inset-0 rounded-2xl ring-2 ring-zinc-950/40 dark:ring-white/50 bg-zinc-950/10 dark:bg-white/15 animate-nav-pulse pointer-events-none" />
                )}

                <div className="relative">
                  <Heart 
                    className={`h-6.5 w-6.5 sm:h-7 sm:w-7 transition-transform duration-200 ${
                      isActive ? 'stroke-[2.5] fill-zinc-950 dark:fill-white text-zinc-950 dark:text-white' : 'stroke-[1.8]'
                    } ${isClicked ? 'animate-nav-bounce' : 'group-hover:scale-105'}`} 
                  />
                </div>

                <span className="text-[10px] font-semibold tracking-tight">Favoris</span>
              </Link>
            );
          })()}

          {/* 5. Compte */}
          {(() => {
            const isActive = pathname === '/account' || pathname === '/profile';
            const isClicked = clickedItem === 'account';
            const commonClasses = `relative flex flex-col items-center justify-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 select-none group cursor-pointer ${
              isActive 
                ? 'text-zinc-950 dark:text-white font-bold -translate-y-[1px] lg:translate-y-0 lg:-translate-x-[1px] scale-105' 
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:scale-105 active:scale-95'
            }`;

            const content = (
              <>
                {/* Snappy Black Click Pulse */}
                {isClicked && (
                  <span className="absolute inset-0 rounded-2xl ring-2 ring-zinc-950/40 dark:ring-white/50 bg-zinc-950/10 dark:bg-white/15 animate-nav-pulse pointer-events-none" />
                )}

                <div className="relative">
                  <User 
                    className={`h-6.5 w-6.5 sm:h-7 sm:w-7 transition-transform duration-200 ${
                      isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'
                    } ${isClicked ? 'animate-nav-bounce' : 'group-hover:scale-105'}`} 
                  />
                </div>

                <span className="text-[10px] font-semibold tracking-tight">Compte</span>
              </>
            );

            return isLoggedIn ? (
              <Link
                href="/account"
                aria-label="Mon compte"
                onClick={() => triggerClickEffect('account')}
                className={commonClasses}
              >
                {content}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  triggerClickEffect('account');
                  openModal('login');
                }}
                aria-label="Se connecter"
                className={commonClasses}
              >
                {content}
              </button>
            );
          })()}

        </div>
      </nav>
    </>
  );
}
