'use client';

export default function TikTokSkeleton({
  embeddedInSearch = false,
}: {
  embeddedInSearch?: boolean;
}) {
  return (
    <div
      className={`w-full ${
        embeddedInSearch ? 'h-[100dvh]' : 'h-full'
      } bg-black text-white relative overflow-hidden flex items-center justify-center`}
    >
      {/* Desktop Wrapper */}
      <div
        className={`w-full h-full max-w-[1440px] mx-auto flex items-center justify-center lg:gap-6 xl:gap-8 lg:pl-6 lg:pr-[120px] xl:pl-8 xl:pr-[130px] ${
          embeddedInSearch ? 'lg:pt-20 lg:pb-8' : 'lg:py-3 xl:py-4'
        }`}
      >
        {/* Left Column: Phone Frame Reel */}
        <div
          className={`w-full lg:w-[480px] xl:w-[500px] h-full ${
            embeddedInSearch ? 'lg:h-[calc(100dvh-105px)]' : ''
          } relative bg-zinc-950 overflow-hidden lg:rounded-[2.5rem] lg:border lg:border-white/10 shrink-0 animate-pulse`}
        >
          {/* Top thumbnail bar skeleton */}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex gap-2 p-2 bg-black/40 backdrop-blur-md rounded-xl">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-10 h-10 rounded-lg bg-zinc-800 shrink-0" />
            ))}
          </div>

          {/* Top badges */}
          <div className="absolute top-4 left-4 z-20 w-16 h-6 rounded-full bg-zinc-800" />
          <div className="absolute top-4 right-4 z-20 w-20 h-6 rounded-full bg-zinc-800" />

          {/* Right vertical action column */}
          <div className="absolute bottom-28 right-4 z-20 flex flex-col items-center gap-5">
            <div className="w-12 h-12 rounded-full bg-zinc-800" />
            <div className="w-9 h-9 rounded-full bg-zinc-800" />
            <div className="w-9 h-9 rounded-full bg-zinc-800" />
            <div className="w-9 h-9 rounded-full bg-zinc-800" />
            <div className="w-9 h-9 rounded-full bg-zinc-800" />
          </div>

          {/* Bottom info section */}
          <div className="absolute bottom-16 left-4 right-20 z-20 space-y-2.5">
            <div className="w-28 h-4 rounded bg-zinc-800" />
            <div className="w-48 h-5 rounded bg-zinc-800" />
            <div className="w-36 h-3 rounded bg-zinc-800" />
            <div className="w-32 h-6 rounded-full bg-zinc-800" />
            <div className="w-64 h-8 rounded bg-zinc-800/60" />
          </div>

          {/* Background image placeholder */}
          <div className="w-full h-full bg-gradient-to-b from-zinc-900 via-zinc-950 to-black" />
        </div>

        {/* Right Column: Desktop Details Panel Skeleton */}
        <div
          className={`hidden lg:flex flex-1 ${
            embeddedInSearch ? 'h-[calc(100dvh-105px)]' : 'h-full'
          } bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl p-8 flex-col justify-between animate-pulse`}
        >
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="w-32 h-6 rounded-full bg-zinc-800" />
              <div className="w-24 h-4 rounded bg-zinc-800" />
            </div>

            <div className="w-3/4 h-8 rounded-lg bg-zinc-800" />
            <div className="w-1/2 h-5 rounded bg-zinc-800" />

            <div className="w-40 h-10 rounded-xl bg-zinc-800" />

            {/* Specs row */}
            <div className="grid grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-zinc-800/80" />
              ))}
            </div>

            {/* Features */}
            <div className="flex flex-wrap gap-2 pt-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-28 h-8 rounded-full bg-zinc-800/70" />
              ))}
            </div>

            {/* Description lines */}
            <div className="space-y-2 pt-4">
              <div className="w-full h-4 rounded bg-zinc-800/50" />
              <div className="w-5/6 h-4 rounded bg-zinc-800/50" />
              <div className="w-4/6 h-4 rounded bg-zinc-800/50" />
            </div>
          </div>

          {/* Bottom contact CTA */}
          <div className="h-14 w-full rounded-full bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
