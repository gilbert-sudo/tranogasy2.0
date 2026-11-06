'use client';

import React, { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import UserProfileView from '@/components/profile/UserProfileView';

function ProfileDynamicRouteContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const rawId = typeof params?.id === 'string' ? decodeURIComponent(params.id) : '';
  const sourceParam = searchParams.get('source');

  return <UserProfileView identifier={rawId} sourceName={sourceParam} />;
}

export default function UserProfileDynamicPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F8FA] dark:bg-zinc-950" />}>
      <ProfileDynamicRouteContent />
    </Suspense>
  );
}

