import LandingNav from '@/components/LandingNav';
import PropertyCard from '@/components/PropertyCard';

async function getProperties() {
  try {
    const res = await fetch('http://localhost:3001/api/properties?limit=12', { next: { revalidate: 60 } });
    if (!res.ok) {
      throw new Error('Failed to fetch data');
    }
    const data = await res.json();
    return data.properties || [];
  } catch (error) {
    console.error('Error fetching properties:', error);
    return [];
  }
}

export default async function Home() {
  const properties = await getProperties();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <LandingNav />

      {/* ── Feed container — matches the nav's max-width ── */}
      <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 lg:px-8 xl:px-12">

        {/* Tabs + Sort row */}
        <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800 mb-6">
          <div className="flex items-center gap-6">
            <button className="text-sm font-bold text-brand-green border-b-2 border-brand-green pb-1 transition-colors">
              Location
            </button>
            <button className="text-sm font-semibold text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors pb-1">
              Vente
            </button>
          </div>
          <select className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1.5 pl-3 pr-8 text-sm text-zinc-700 dark:text-zinc-200 focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green shadow-sm cursor-pointer">
            <option>Trier par</option>
            <option>Prix croissant</option>
            <option>Prix décroissant</option>
            <option>Plus récent</option>
          </select>
        </div>

        {/* Property grid
            Mobile: 1 col | sm: 2 col | lg: 3 col | xl: 4 col
        */}
        <div className="grid grid-cols-1 gap-5
          sm:grid-cols-2
          lg:grid-cols-3
          xl:grid-cols-4">
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
