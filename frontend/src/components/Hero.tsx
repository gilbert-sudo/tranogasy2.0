import { Search } from 'lucide-react';
import Image from 'next/image';

export default function Hero() {
  return (
    <div className="relative flex flex-col items-center justify-center bg-zinc-50 py-12 dark:bg-zinc-800/50">
      {/* Hand with keys image */}
      <div className="relative h-48 w-48 md:h-64 md:w-64">
        <Image src="/hero-keys.png" alt="Remise de clés" fill className="object-contain" priority />
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
