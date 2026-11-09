import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import PricingExperience from '@/components/pricing/PricingExperience';

export const metadata: Metadata = {
  title: 'Jetons JP & Tarifs — TranoGasy',
  description:
    'Rechargez vos jetons JP par Mobile Money (MVola, Airtel Money, Orange Money) sur TranoGasy. Dès 100 JP (1 000 Ar).',
};

function PricingLoadingFallback() {
  return (
    <div className="min-h-[100dvh] -mb-16 md:-mb-24 lg:-mb-8 bg-[#F5F5F7] dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-full bg-amber-400/20 animate-pulse mb-4" />
      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        Chargement de l’espace Jetons JP…
      </p>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<PricingLoadingFallback />}>
      <PricingExperience />
    </Suspense>
  );
}
