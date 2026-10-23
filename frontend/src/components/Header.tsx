'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Search, User } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';

export default function Header() {
  const { user } = useUserStore();
  const openModal = useModalStore((state) => state.openModal);
  
  const currentUser = user?.user || user;
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-800/80">
      <div className="mx-auto flex h-16 max-w-[2000px] items-center justify-between px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/assets/icon-512.png" alt="TranoGasy Logo" width={32} height={32} />
            <span className="text-xl font-bold tracking-tight leading-none text-zinc-900 dark:text-white">
              <span className="text-brand-green">Trano</span>Gasy.
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2.5">
          <DarkModeToggle />
          <button 
            aria-label="Rechercher"
            className="flex items-center gap-2 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-100 backdrop-blur-xl border border-white/20 dark:border-black/10 px-4 py-1.5 text-xs font-black shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <span>Rechercher</span>
            <Search className="h-3.5 w-3.5 text-brand-green" />
          </button>
          
          {/* User Profile Avatar */}
          {currentUser ? (
            <Link href="/account" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 dark:bg-zinc-800/70 backdrop-blur-xl transition-all hover:scale-105 active:scale-95 hover:ring-2 hover:ring-brand-green overflow-hidden border border-zinc-200/80 dark:border-white/10 shadow-xs relative">
              {currentUser.avatar ? (
                <Image src={currentUser.avatar} alt="Profile" fill className="object-cover" />
              ) : (
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase">
                  {currentUser.username?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
                </span>
              )}
            </Link>
          ) : (
            <button onClick={() => openModal('login')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 dark:bg-zinc-800/70 backdrop-blur-xl transition-all hover:scale-105 active:scale-95 hover:ring-2 hover:ring-brand-green overflow-hidden border border-zinc-200/80 dark:border-white/10 shadow-xs cursor-pointer">
              <User className="h-4 w-4 text-zinc-700 dark:text-zinc-200" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
