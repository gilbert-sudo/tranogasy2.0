'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowRight } from 'lucide-react';

interface TopPropertySectionProps {
  onTabChange?: (tab: 'location' | 'vente') => void;
  onSortChange?: (sort: string) => void;
  onViewAll?: () => void;
  viewAllHref?: string;
  className?: string;
}

export default function TopPropertySection({
  onTabChange,
  onSortChange,
  onViewAll,
  viewAllHref,
  className = '',
}: TopPropertySectionProps) {
  const [activeTab, setActiveTab] = useState<'location' | 'vente'>('location');
  const [sortBy, setSortBy] = useState('Trier par');

  const handleTabClick = (tab: 'location' | 'vente') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
    onSortChange?.(e.target.value);
  };

  const viewAllContent = (
    <span className="group inline-flex items-center gap-1.5 py-1 text-xs sm:text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer select-none touch-manipulation active:scale-95">
      <span>View All</span>
      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
    </span>
  );

  return (
    <div
      className={`w-full grid grid-cols-[auto_auto] items-center justify-between gap-y-3 gap-x-2 sm:flex sm:items-center sm:gap-3.5 md:gap-4 mb-4 sm:mb-6 ${className}`}
    >
      {/* 1. Section Title */}
      <div className="col-start-1 row-start-1 justify-self-start sm:order-1 sm:justify-self-auto">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Top Property
        </h2>
      </div>

      {/* 2. Liquid glass Location / Vente segmented switch */}
      <div className="col-start-1 row-start-2 justify-self-start sm:order-2 sm:justify-self-auto sm:mr-auto">
        <div className="inline-flex items-center p-1 rounded-full bg-white/70 dark:bg-zinc-800/60 backdrop-blur-xl border border-white/80 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.04)] select-none">
          <button
            type="button"
            onClick={() => handleTabClick('location')}
            className={`px-3 sm:px-3.5 py-1.5 sm:py-1 text-xs font-semibold rounded-full transition-all cursor-pointer touch-manipulation active:scale-95 ${
              activeTab === 'location'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            Location
          </button>
          <button
            type="button"
            onClick={() => handleTabClick('vente')}
            className={`px-3 sm:px-3.5 py-1.5 sm:py-1 text-xs font-semibold rounded-full transition-all cursor-pointer touch-manipulation active:scale-95 ${
              activeTab === 'vente'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            Vente
          </button>
        </div>
      </div>

      {/* 3. Liquid glass Sort select */}
      <div className="col-start-2 row-start-2 justify-self-end sm:order-3 sm:justify-self-auto">
        <div className="relative group">
          <select
            value={sortBy}
            onChange={handleSortChange}
            aria-label="Trier les propriétés"
            className="appearance-none rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-750 py-1.5 pl-3.5 pr-8 text-xs font-semibold text-zinc-800 dark:text-zinc-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.35)] hover:border-zinc-300 dark:hover:border-zinc-650 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/15 cursor-pointer touch-manipulation transition-all duration-200 active:scale-95 select-none max-w-[130px] sm:max-w-none truncate"
          >
            <option value="Trier par" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
              Trier par
            </option>
            <option value="Prix croissant" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
              Prix croissant
            </option>
            <option value="Prix décroissant" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
              Prix décroissant
            </option>
            <option value="Plus récent" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
              Plus récent
            </option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
        </div>
      </div>

      {/* 4. View All action link */}
      <div className="col-start-2 row-start-1 justify-self-end sm:order-4 sm:justify-self-auto">
        {viewAllHref ? (
          <Link href={viewAllHref} className="inline-block">
            {viewAllContent}
          </Link>
        ) : (
          <button type="button" onClick={onViewAll} className="inline-block">
            {viewAllContent}
          </button>
        )}
      </div>
    </div>
  );
}
