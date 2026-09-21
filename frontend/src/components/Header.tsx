import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80">
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
        </div>
      </div>
    </header>
  );
}
