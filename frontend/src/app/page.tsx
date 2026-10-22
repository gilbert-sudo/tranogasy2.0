import LandingNav from '@/components/LandingNav';
import PropertyCard from '@/components/PropertyCard';
import TopPropertySection from '@/components/TopPropertySection';

async function getProperties() {
  try {
    const rawUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const apiUrl = rawUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

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

        {/* Property grid
            Mobile: 1 col | sm: 2 col | lg: 3 col | xl: 4 col | 2xl: 5 col | ultrawide: 6 col
        */}
        <div className="grid grid-cols-1 gap-5
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-4
          2xl:grid-cols-5
          min-[2100px]:grid-cols-6">
          {properties.length > 0 ? (
            properties.map((property: any) => (
              <PropertyCard key={property._id} property={property} />
            ))
          ) : (
            <div className="col-span-full py-16 text-center text-zinc-400 dark:text-zinc-500">
              <p className="text-lg font-medium">Aucune propriété trouvée.</p>
              <p className="text-sm mt-1">Vérifiez que le backend est en cours d&apos;exécution.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
