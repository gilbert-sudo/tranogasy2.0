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
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <LandingNav />
      
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Tabs and Sort */}
        <div className="flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <div className="flex items-center gap-6">
            <button className="text-sm font-bold text-brand-green border-b-2 border-brand-green pb-1">
              Location
            </button>
            <button className="text-sm font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
              Vente
            </button>
          </div>
          <div>
            <select className="rounded-md border-zinc-300 py-1.5 pl-3 pr-8 text-sm focus:border-brand-green focus:outline-none focus:ring-brand-green dark:bg-zinc-900 dark:border-zinc-700 dark:text-white">
              <option>Trier par</option>
              <option>Prix croissant</option>
              <option>Prix décroissant</option>
              <option>Plus récent</option>
            </select>
          </div>
        </div>
        
        {/* Feed */}
        <div className="mt-8 grid grid-cols-1 gap-y-12 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3 xl:gap-x-8">
          {properties.length > 0 ? (
            properties.map((property: any) => (
              <PropertyCard key={property._id} property={property} />
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-zinc-500">
              <p className="text-lg">Aucune propriété trouvée pour le moment.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
