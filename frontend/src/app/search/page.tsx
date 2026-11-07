import React, { Suspense } from 'react';
import { Metadata } from 'next';
import SearchEngineShell from '@/components/search/SearchEngineShell';

export const metadata: Metadata = {
  title: 'Recherche & Carte Interactive — TranoGasy',
  description:
    'Explorez les propriétés à louer et à vendre à Madagascar grâce à notre moteur de recherche cartographique futuriste.',
};

function SearchLoadingFallback() {
  return (
    <div className="w-full h-[100dvh] -mb-16 md:-mb-24 lg:-mb-8 bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6 select-none">
      <div className="relative flex items-center justify-center mb-5">
        <span className="w-20 h-20 rounded-full bg-brand-green/20 animate-radar-wave absolute" />
        <div className="w-14 h-14 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-2xl">
          <span className="w-3.5 h-3.5 rounded-full bg-brand-green animate-ping" />
        </div>
      </div>
      <p className="font-outfit font-light text-sm sm:text-base text-zinc-600 dark:text-zinc-400 tracking-wide">
        Initialisation du moteur spatial TranoGasy…
      </p>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchLoadingFallback />}>
      <SearchEngineShell />
    </Suspense>
  );
}

