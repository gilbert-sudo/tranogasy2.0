'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, User, Bell } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';

interface HeaderProps {
  onSearchClick?: () => void;
}

export default function Header({ onSearchClick }: HeaderProps) {
  const { user } = useUserStore();
  const openModal = useModalStore((state) => state.openModal);
  const router = useRouter();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchClick) {
      onSearchClick();
    } else {
      router.push('/');
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full h-16 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60 shadow-sm transition-colors duration-300">
      <div className="mx-auto flex h-full max-w-[2000px] items-center gap-2 sm:gap-3.5 px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36">
        
        {/* ── LEFT: Branded Logo (Matches LandingNav scrolled) ── */}
        <div className="flex items-center gap-2 flex-shrink-0 -ml-1 sm:ml-0">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="relative flex h-11 w-11 items-center justify-center rounded-full
                bg-white dark:bg-white backdrop-blur-xl
                border border-zinc-200/80 dark:border-white/20
                shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]
                hover:scale-105 active:scale-95 transition-all flex-shrink-0"
            >
              <div className="relative w-[34px] h-[34px] rounded-full overflow-hidden">
                <Image src="/assets/icon-512.png" alt="TranoGasy" fill className="object-contain rounded-full" priority />
              </div>
            </div>
            <span className="font-extrabold tracking-tight text-lg sm:text-xl leading-none">
              <span className="text-brand-green">Trano</span>
              <span className="text-zinc-900 dark:text-white">Gasy.</span>
            </span>
          </Link>
        </div>

        {/* ── CENTER: Search bar (Desktop & Tablet) ── */}
        <div className="hidden md:flex justify-center items-center min-w-0 flex-1">
          <form
            onSubmit={handleSearchSubmit}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 w-full
              bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md
              max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl
              shadow-sm min-w-0
              ${searchFocused ? 'ring-2 ring-zinc-400 dark:ring-zinc-600' : 'ring-1 ring-zinc-200/80 dark:ring-zinc-700/80'}`}
          >
            <Search className="h-4 w-4 flex-shrink-0 text-zinc-400" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Rechercher une ville, quartier…"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 outline-none min-w-0"
            />
            <button
              type="submit"
              aria-label="Filtres"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 transition-transform active:scale-90 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="21" y1="6" x2="13" y2="6" /><line x1="9" y1="6" x2="3" y2="6" /><circle cx="11" cy="6" r="2" />
                <line x1="21" y1="12" x2="17" y2="12" /><line x1="13" y1="12" x2="3" y2="12" /><circle cx="15" cy="12" r="2" />
                <line x1="21" y1="18" x2="9" y2="18" /><line x1="5" y1="18" x2="3" y2="18" /><circle cx="7" cy="18" r="2" />
              </svg>
            </button>
          </form>
        </div>

        {/* ── RIGHT: Actions & Mobile Search Button ── */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0 ml-auto">
          {/* Liquid Glass Circular Notification Button matching Image 2 */}
          <button
            id="header-notif-btn"
            aria-label="Notifications"
            className="relative flex h-11 w-11 items-center justify-center rounded-full
              bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
              border border-white/80 dark:border-white/10
              shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
              text-zinc-800 dark:text-zinc-200
              hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-brand-red ring-2 ring-white dark:ring-zinc-800" />
          </button>

          {/* Mobile-only Shiny Dark Search Button positioned between notification and avatar */}
          <div className="flex md:hidden items-center">
            <button
              type="button"
              id="header-mobile-search-btn"
              aria-label="Rechercher"
              onClick={() => {
                if (onSearchClick) {
                  onSearchClick();
                } else {
                  router.push('/');
                }
              }}
              className="relative h-11 px-3.5 rounded-full flex items-center gap-2 flex-shrink-0 transition-all duration-200 active:scale-95 cursor-pointer
                bg-gradient-to-b from-zinc-800 via-zinc-900 to-black text-white
                border border-white/20 dark:border-white/25
                shadow-[0_4px_20px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)]
                hover:from-zinc-700 hover:to-zinc-950 hover:border-white/30
                group"
            >
              <Search className="h-4 w-4 text-white/90 group-hover:text-brand-green group-hover:scale-110 transition-all duration-200 flex-shrink-0" />
              <span className="text-xs font-semibold tracking-tight text-white">
                Rechercher
              </span>
            </button>
          </div>

          {/* User Profile Avatar / Login Button */}
          <div className="-mr-1 sm:mr-0 flex items-center">
            {isLoggedIn ? (
              <Link
                href="/account"
                aria-label="Mon compte"
                className="flex h-11 w-11 items-center justify-center rounded-full
                  bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
                  border-2 border-white dark:border-zinc-700
                  ring-1 ring-zinc-200/80 dark:ring-white/15
                  shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]
                  overflow-hidden hover:scale-105 active:scale-95 transition-all relative"
              >
                {currentUser?.avatar ? (
                  <Image src={currentUser.avatar} alt="Profile" fill className="object-cover rounded-full" />
                ) : (
                  <span className="text-sm font-bold uppercase text-zinc-800 dark:text-zinc-200">
                    {currentUser?.username?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                  </span>
                )}
              </Link>
            ) : (
              <button
                onClick={() => openModal('login')}
                aria-label="Connexion"
                className="flex h-11 w-11 items-center justify-center rounded-full
                  bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
                  border border-white/80 dark:border-white/10
                  shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
                  hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <User className="h-5 w-5 text-zinc-700 dark:text-zinc-200" />
              </button>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
