import LandingNav from '@/components/LandingNav';
import TopPropertySection from '@/components/TopPropertySection';
import PropertyFeed from '@/components/PropertyFeed';

async function getProperties() {
  try {
    const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const apiUrl = rawUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${apiUrl}/properties?limit=20`, {
      next: { revalidate: 60 },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.properties || [];
  } catch (error) {
    return [];
  }
}

export default async function Home() {
  const properties = await getProperties();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <LandingNav />

      {/* ── Feed container — matches nav width with strictly symmetrical X margins ── */}
      <div className="mx-auto w-full max-w-[2000px] px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 py-4 sm:py-6">

        {/* Top Property Section header matching target design */}
        <TopPropertySection />

        {/* Property feed with cold start detection, auto-retry polling, and card skeletons */}
        <PropertyFeed initialProperties={properties} />
      </div>
    </div>
  );
}

