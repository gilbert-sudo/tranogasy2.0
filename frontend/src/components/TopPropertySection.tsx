'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface TopPropertySectionProps {
  onTabChange?: (tab: 'location' | 'vente') => void;
  onSortChange?: (sort: string) => void;
}

export default function TopPropertySection({
  onTabChange,
  onSortChange,
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

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        {/* Title matching Image 2 */}
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Top Property
        </h2>

        {/* Liquid glass Location / Vente segmented switch */}
        <div className="flex items-center p-1 rounded-full bg-white/70 dark:bg-zinc-800/60 backdrop-blur-xl border border-white/80 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
          <button
            type="button"
            onClick={() => handleTabClick('location')}
            className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
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
            className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
              activeTab === 'vente'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            Vente
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3.5 self-end sm:self-auto">
        {/* Liquid glass Sort select */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={handleSortChange}
            className="appearance-none rounded-full bg-white/70 dark:bg-zinc-800/60 backdrop-blur-xl border border-white/80 dark:border-white/10 py-1.5 pl-3.5 pr-8 text-xs font-medium text-zinc-700 dark:text-zinc-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer"
          >
            <option value="Trier par">Trier par</option>
            <option value="Prix croissant">Prix croissant</option>
            <option value="Prix décroissant">Prix décroissant</option>
            <option value="Plus récent">Plus récent</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
        </div>

        {/* View All link matching Image 2 */}
        <button
          type="button"
          className="text-xs sm:text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
        >
          View All
        </button>
      </div>
    </div>
  );
}
