import Image from 'next/image';

interface PropertyProps {
  property: {
    _id: string;
    title: string;
    price?: number;
    rent?: number;
    rooms: number;
    type: string;
    city?: {
      district: string;
      commune: string;
    };
    images?: string[];
  };
}

export default function PropertyCard({ property }: PropertyProps) {
  const displayPrice = property.type === 'rent' ? property.rent : property.price;
  const imageSrc = property.images && property.images.length > 0 
    ? property.images[0] 
    : 'https://via.placeholder.com/400x300?text=TranoGasy';

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
      <div className="relative h-48 w-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
        <Image
          src={imageSrc}
          alt={property.title}
          fill
          className="object-cover"
        />
        <div className="absolute top-4 left-4 rounded-full bg-brand-green px-3 py-1 text-xs font-bold text-white uppercase tracking-wider">
          {property.type === 'rent' ? 'A Louer' : 'A Vendre'}
        </div>
      </div>
      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-brand-red">
            {property.city?.commune || 'Antananarivo'}
          </p>
          <p className="text-lg font-bold text-brand-green">
            {displayPrice ? `${displayPrice.toLocaleString()} Ar` : 'Prix à débattre'}
          </p>
        </div>
        <h3 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-white line-clamp-2">
          {property.title}
        </h3>
        <div className="mt-4 flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            {property.rooms} Pièces
          </span>
        </div>
      </div>
    </div>
  );
}
