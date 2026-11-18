'use client';

import Link from 'next/link';
import { ChevronRight, Crown } from 'lucide-react';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';

interface BottomMenuPricingItemProps {
  onSelect: () => void;
}

export default function BottomMenuPricingItem({
  onSelect,
}: BottomMenuPricingItemProps) {
  return (
    <Link
      href="/pricing"
      onClick={() => {
        usePropertyDetailModalStore.getState().clearUnlockReturnContext();
        onSelect();
      }}
      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-amber-50/80 dark:hover:bg-amber-950/25 transition-all text-left group cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 group-hover:scale-105 transition-all">
          <Crown className="w-5 h-5" strokeWidth={2} />
        </div>
        <div>
          <div className="text-xs font-bold text-zinc-900 dark:text-white group-hover:text-amber-500 transition-colors">
            Abonnements & Tarifs
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Accès illimité dès 3 000 Ar (24h, 3j, 1 sem.)
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}
