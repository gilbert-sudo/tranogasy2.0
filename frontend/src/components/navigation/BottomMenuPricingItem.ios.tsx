'use client';

import Link from 'next/link';
import { ChevronRight, Headset } from 'lucide-react';

interface BottomMenuPricingItemProps {
  onSelect: () => void;
}

export default function BottomMenuPricingItem({
  onSelect,
}: BottomMenuPricingItemProps) {
  return (
    <Link
      href="/pricing"
      onClick={onSelect}
      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 transition-all text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 group-hover:bg-brand-green/15 group-hover:text-brand-green group-hover:scale-105 transition-all">
          <Headset className="h-5 w-5" strokeWidth={2} />
        </div>
        <div>
          <div className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-brand-green transition-colors">
            Assistance Tranogasy
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Plus d’informations par agent et mise en relation
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-brand-green group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}
