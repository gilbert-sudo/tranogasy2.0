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
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="TranoGasy Logo" width={32} height={32} />
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              <span className="text-brand-green">Trano</span>Gasy.
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <DarkModeToggle />
          <button className="flex items-center gap-2 rounded-full border-2 border-brand-green px-4 py-1 text-sm font-medium text-brand-green transition hover:bg-brand-green hover:text-white dark:hover:bg-brand-green">
            <span>Chercher</span>
            <Search className="h-4 w-4" />
          </button>
          
          {/* User Profile Avatar */}
          {currentUser ? (
            <Link href="/account" className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 transition-colors hover:ring-2 hover:ring-brand-green overflow-hidden border border-zinc-300 dark:border-zinc-600 relative">
              {currentUser.avatar ? (
                <Image src={currentUser.avatar} alt="Profile" fill className="object-cover" />
              ) : (
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300 uppercase">
                  {currentUser.username?.charAt(0) || currentUser.email?.charAt(0) || 'U'}
                </span>
              )}
            </Link>
          ) : (
            <button onClick={() => openModal('login')} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700 transition-colors hover:ring-2 hover:ring-brand-green overflow-hidden border border-zinc-300 dark:border-zinc-600">
              <User className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
