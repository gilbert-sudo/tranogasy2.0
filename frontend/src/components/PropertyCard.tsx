import Image from 'next/image';
import { BedDouble, Bath, Maximize, MapPin, Heart } from 'lucide-react';

interface PropertyProps {
  property: {
    _id: string;
    title: string;
    price?: number;
    rent?: number;
    rooms: number;
    bathrooms: number;
    area: number;
    type: string;
    houseType: string;
    city?: {
      district: string;
      commune: string;
      fokontany: string;
    };
    images?: string[];
    features?: {
      parkingSpaceAvailable: boolean;
      garage: boolean;
    };
    created_at: string;
  };
}

export default function PropertyCard({ property }: PropertyProps) {
  const displayPrice = property.type === 'rent' ? property.rent : property.price;
  const imageSrc = property.images && property.images.length > 0 
    ? property.images[0] 
    : 'https://via.placeholder.com/400x300?text=TranoGasy';

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-zinc-50 shadow-sm border border-zinc-200 transition-transform hover:-translate-y-1 hover:shadow-lg dark:bg-zinc-800 dark:border-zinc-700 relative">
      <div className="relative h-56 w-full overflow-hidden bg-zinc-200 dark:bg-zinc-700">
        <Image src={imageSrc} alt={property.title} fill className="object-cover" />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 rounded bg-brand-green px-2 py-1 text-xs font-bold text-white uppercase tracking-wide shadow-sm">
          {property.type === 'rent' ? 'Location' : 'Vente'}
        </div>
        <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
          Nouveau
        </div>

        {/* Favorite Button */}
        <button className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-50 text-zinc-400 shadow-md transition hover:text-brand-red dark:bg-zinc-700">
          <Heart className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col flex-1 p-4">
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          {property.houseType ? property.houseType.charAt(0).toUpperCase() + property.houseType.slice(1) : 'Propriété'} {property.type === 'rent' ? 'en location' : 'en vente'}
        </p>
        
        <h3 className="mt-1 text-lg font-bold text-zinc-900 dark:text-white line-clamp-2">
          {property.title}
        </h3>

        <div className="mt-2 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
          <MapPin className="h-4 w-4 text-brand-red" />
          <span className="truncate">
            {property.city?.fokontany}, {property.city?.commune}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-700">
          <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
            <span className="flex items-center gap-1 text-sm" title="Pièces">
              <BedDouble className="h-4 w-4" />
              {property.rooms || 0}
            </span>
            <span className="flex items-center gap-1 text-sm" title="Salles de bain">
              <Bath className="h-4 w-4" />
              {property.bathrooms || 0}
            </span>
            <span className="flex items-center gap-1 text-sm" title="Surface">
              <Maximize className="h-4 w-4" />
              {property.area ? `${property.area}m²` : '-'}
            </span>
          </div>
          
          <div className="text-right">
            <p className="text-lg font-bold text-brand-green">
              {displayPrice ? `${displayPrice.toLocaleString()} Ar` : 'Sur demande'}
              {property.type === 'rent' && <span className="text-xs font-normal text-zinc-500">/mois</span>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
