'use client';

import Link from 'next/link';
import { Headset } from 'lucide-react';

interface HeaderActionPillProps {
  isLoggedIn: boolean;
  hasActiveSubscription?: boolean;
}

export default function HeaderActionPill(props: HeaderActionPillProps) {
  void props;
  return (
    <Link
      href="/pricing"
      aria-label="Assistance Tranogasy"
      className="hidden sm:flex h-11 pl-3 pr-3.5 items-center gap-2 rounded-full
        bg-white/85 dark:bg-zinc-800/80 backdrop-blur-xl
        shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
        text-zinc-900 dark:text-zinc-100
        hover:scale-105 active:scale-95 transition-all"
    >
      <Headset className="w-4 h-4 text-brand-green" />
      <span className="text-xs font-extrabold tracking-tight">
        Assistance
      </span>
    </Link>
  );
}
