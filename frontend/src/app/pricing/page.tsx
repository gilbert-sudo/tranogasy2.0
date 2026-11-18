import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import PricingExperience from '@/components/pricing/PricingExperience';
import {
  PRICING_PAGE_TITLE,
  PRICING_PAGE_DESCRIPTION,
  PRICING_LOADING_TEXT,
} from '@/components/pricing/pricingMeta';

export const metadata: Metadata = {
  title: PRICING_PAGE_TITLE,
  description: PRICING_PAGE_DESCRIPTION,
};

function PricingLoadingFallback() {
  return (
    <div className="fixed inset-0 z-[130] w-full h-[100dvh] bg-[#F5F5F7] dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-full bg-brand-green/20 animate-pulse mb-4" />
      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        {PRICING_LOADING_TEXT}
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
