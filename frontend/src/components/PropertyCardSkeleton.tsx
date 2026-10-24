import React from 'react';

export default function PropertyCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-zinc-50 shadow-sm border border-zinc-200 dark:bg-zinc-850 dark:border-zinc-800 animate-pulse relative">
      {/* Media placeholder */}
      <div className="relative h-48 w-full bg-zinc-200 dark:bg-zinc-800">
        <div className="absolute top-3 left-3 h-5 w-16 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <div className="absolute top-3 right-3 h-5 w-20 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      </div>

      {/* Info card overlap */}
      <div className="relative z-10 -mt-5 flex flex-col flex-1 rounded-tr-3xl bg-zinc-50 dark:bg-zinc-850 p-3.5 pt-4 border-t border-black/[0.05] dark:border-white/[0.05]">
        {/* Top row: Title + Price */}
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 w-3/5 rounded-md bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-4 w-1/4 rounded-md bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* Location row */}
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-3 w-3 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-3 w-28 rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* Description lines */}
        <div className="mt-3 space-y-1.5">
          <div className="h-2.5 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
          <div className="h-2.5 w-4/5 rounded bg-zinc-200 dark:bg-zinc-700" />
        </div>

        {/* Bottom features bar */}
        <div className="mt-4 flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="h-3 w-8 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3 w-8 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3 w-8 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-3.5 rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3.5 w-3.5 rounded bg-zinc-200 dark:bg-zinc-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
