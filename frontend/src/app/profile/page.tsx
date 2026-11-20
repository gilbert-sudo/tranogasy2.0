'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import UserProfileView from '@/components/profile/UserProfileView';

function ProfilePageContent() {
  const searchParams = useSearchParams();
  const rawId = searchParams.get('id');
  const sourceParam = searchParams.get('source');

  return (
    <UserProfileView
      identifier={rawId ? decodeURIComponent(rawId) : undefined}
      sourceName={sourceParam}
    />
  );
}

export default function MyPublicProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F8FA] dark:bg-zinc-950" />}>
      <ProfilePageContent />
    </Suspense>
  );
}
