'use client';

import { useState, ComponentProps } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Phone, 
  MapPin, 
  Heart, 
  Building2, 
  Settings, 
  LogOut, 
  Share2, 
  Edit3,
  ChevronLeft
} from 'lucide-react';
import Header from '@/components/Header';
import PropertyCard from '@/components/PropertyCard';

// Dummy properties matching the PropertyCard interface
const dummyProperties: ComponentProps<typeof PropertyCard>['property'][] = [
  {
    _id: "1",
    title: 'Villa Moderne avec Piscine',
    price: 450000000,
    type: 'sale',
    houseType: 'villa',
    rooms: 4,
    bathrooms: 3,
    area: 350,
    city: {
      district: 'Antananarivo',
      commune: 'Alarobia',
      fokontany: 'Ivandry'
    },
    images: ['/hero-bg.jpg'],
    features: {
      swimmingPool: true,
      parkingSpaceAvailable: true,
    },
    created_at: new Date().toISOString()
  },
  {
    _id: "2",
    title: 'Appartement Haut Standing',
    rent: 1500000,
    type: 'rent',
    houseType: 'appartement',
    rooms: 2,
    bathrooms: 2,
    area: 120,
    city: {
      district: 'Antananarivo',
      commune: 'Ambatobe',
      fokontany: 'Ambatobe'
    },
    images: ['/hero-bg.jpg'],
    features: {
      balcony: true,
      securitySystem: true,
    },
    created_at: new Date(Date.now() - 86400000).toISOString()
  },
];

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<'annonces' | 'favoris'>('annonces');

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <Header />
      
      <main className="flex-1 pb-20 md:pb-0">
        {/* Cover Photo */}
        <div className="h-48 md:h-64 w-full relative">
          <Image 
            src="/hero-bg.jpg" 
            alt="Cover" 
            fill 
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
          
          <Link href="/" className="absolute top-4 left-4 md:top-8 md:left-8 bg-white/20 hover:bg-white/30 backdrop-blur-md p-2 rounded-full text-white transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 md:-mt-24 relative z-10">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-zinc-200/50 dark:border-zinc-800/50 overflow-hidden">
            
            {/* Profile Header */}
            <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left relative">
              
              {/* Avatar */}
              <div className="relative">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white dark:border-zinc-900 overflow-hidden bg-zinc-200 dark:bg-zinc-800 shadow-lg">
                  <Image 
                    src="/hero-keys.png" 
                    alt="User Avatar" 
                    fill 
                    className="object-cover"
                  />
                </div>
                <button className="absolute bottom-2 right-2 bg-brand-green text-white p-2 rounded-full shadow-lg hover:bg-brand-green/90 transition-transform active:scale-95">
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 pt-2 md:pt-14">
                <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white mb-1">
                  Jean Dupont
                </h1>
                <p className="text-zinc-500 dark:text-zinc-400 mb-4 max-w-lg">
                  Agent immobilier passionné. Je vous aide à trouver la maison de vos rêves à Madagascar. Contactez-moi pour plus d'infos !
                </p>
                
                <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full">
                    <Phone className="w-4 h-4 text-brand-green" />
                    +261 34 00 000 00
                  </div>
                  <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-full">
                    <MapPin className="w-4 h-4 text-brand-red" />
                    Antananarivo, MG
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 md:pt-14 w-full md:w-auto mt-4 md:mt-0">
                <button className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-brand-green text-white px-6 py-2.5 rounded-full font-semibold shadow-md shadow-brand-green/20 hover:bg-brand-green/90 transition-all active:scale-95">
                  Contacter
                </button>
                <button className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 px-6 py-2.5 rounded-full font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95 border border-zinc-200 dark:border-zinc-700">
                  <Share2 className="w-4 h-4" />
                  <span className="md:hidden">Partager</span>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 border-y border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="p-4 text-center border-r border-zinc-200 dark:border-zinc-800">
                <div className="text-2xl font-black text-zinc-900 dark:text-white">2</div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Maisons</div>
              </div>
              <div className="p-4 text-center border-r border-zinc-200 dark:border-zinc-800">
                <div className="text-2xl font-black text-zinc-900 dark:text-white">0</div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Terrains</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-2xl font-black text-brand-red">1.2k</div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">J'aime</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex p-2 gap-2 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto hide-scrollbar">
              <button 
                onClick={() => setActiveTab('annonces')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all min-w-[120px] ${
                  activeTab === 'annonces' 
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' 
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Building2 className="w-5 h-5" />
                Annonces
              </button>
              <button 
                onClick={() => setActiveTab('favoris')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold transition-all min-w-[120px] ${
                  activeTab === 'favoris' 
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm' 
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Heart className="w-5 h-5" />
                Favoris
              </button>
            </div>

            {/* Content */}
            <div className="p-6 md:p-8 bg-zinc-50/30 dark:bg-zinc-950/30 min-h-[400px]">
              {activeTab === 'annonces' && (
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-6">Toutes les annonces (2)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {dummyProperties.map((prop) => (
                      <PropertyCard key={prop._id} property={prop} />
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'favoris' && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="w-16 h-16 bg-brand-red/10 rounded-full flex items-center justify-center mb-4 text-brand-red">
                    <Heart className="w-8 h-8 fill-current" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Aucun favori pour le moment</h3>
                  <p className="text-zinc-500 max-w-sm">
                    Explorez les annonces et ajoutez celles que vous aimez à vos favoris pour les retrouver ici.
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Logout / Settings */}
          <div className="mt-8 mb-12 flex flex-col sm:flex-row gap-4 justify-center">
            <button className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm">
              <Settings className="w-5 h-5" />
              Paramètres du compte
            </button>
            <Link href="/login" className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shadow-sm">
              <LogOut className="w-5 h-5" />
              Se déconnecter
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}
