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

export default async function ExplorePage() {
  const properties = await getProperties();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Découvrir les Propriétés</h1>
        </div>
        
        <div className="mt-8 grid grid-cols-1 gap-y-12 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-3 xl:gap-x-8">
          {properties.length > 0 ? (
            properties.map((property: any) => (
              <PropertyCard key={property._id} property={property} />
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-zinc-500">
              <p className="text-lg">Aucune propriété trouvée pour le moment.</p>
              <p className="text-sm mt-2">Veuillez vérifier que le backend est en cours d'exécution.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
