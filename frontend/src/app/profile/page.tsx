'use client';

import React, { Suspense } from 'react';
import UserProfileView from '@/components/profile/UserProfileView';

export default function MyPublicProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F8FA] dark:bg-zinc-950" />}>
      <UserProfileView />
    </Suspense>
  );
}
