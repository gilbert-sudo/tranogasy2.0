'use client';

import PhoneAuthFlow from '@/components/auth/PhoneAuthFlow';

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100dvh-4rem)] md:min-h-[100dvh] bg-[#EAEAE6] dark:bg-zinc-950 flex flex-col md:items-center md:justify-center md:p-6 font-sans overflow-x-hidden">
      <PhoneAuthFlow mode="page" redirectUrl="/profile" />
    </div>
  );
}
