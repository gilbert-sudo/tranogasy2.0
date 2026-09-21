import { Search } from 'lucide-react';

export default function Hero() {
  return (
    <div className="relative flex flex-col items-center justify-center bg-white py-12 dark:bg-black">
      {/* Hand with keys image */}
      <div className="relative h-48 w-48 overflow-hidden rounded-full md:h-64 md:w-64 border-4 border-white shadow-sm">
        <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-7xl dark:bg-zinc-900">
          🔑
        </div>
      </div>
      
      <div className="mt-8">
        <button className="flex items-center gap-2 rounded-full bg-brand-green px-8 py-3 text-lg font-bold text-white shadow-lg transition hover:bg-green-600 active:scale-95">
          <Search className="h-5 w-5" />
          Recherche
        </button>
      </div>
    </div>
  );
}
