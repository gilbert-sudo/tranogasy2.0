'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PropertyDetailsClient from '@/app/properties/[id]/PropertyDetailsClient';

function PropertyQueryContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';

  if (!id) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center p-6 text-center text-sm font-bold text-zinc-500">
        Annonce introuvable.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900">
      <PropertyDetailsClient propertyId={id} />
    </div>
  );
}

export default function StaticPropertyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-brand-green border-t-transparent animate-spin" />
        </div>
      }
    >
      <PropertyQueryContent />
    </Suspense>
  );
}
