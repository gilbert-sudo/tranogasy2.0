import LandingNav from '@/components/LandingNav';
import LandingSectionFeed from '@/components/LandingSectionFeed';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <LandingNav />

      {/* ── Feed container — matches nav width with strictly symmetrical X margins ── */}
      <div className="mx-auto w-full max-w-[2000px] px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 py-4 sm:py-6">
        {/* Landing section feed with progressive chunk loading (little by little) */}
        <LandingSectionFeed />
      </div>
    </div>
  );
}
