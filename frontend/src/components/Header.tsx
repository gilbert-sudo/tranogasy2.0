import Link from 'next/link';
import { User, Home } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Home className="h-6 w-6 text-brand-red" />
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              <span className="text-brand-green">Trano</span>Gasy.
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800">
            <User className="h-4 w-4" />
            <span>Chargement</span>
          </button>
        </div>
      </div>
    </header>
  );
}
