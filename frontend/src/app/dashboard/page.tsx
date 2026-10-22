'use client';

import { useState, useEffect, Suspense, ChangeEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Building2,
  LayoutDashboard,
  TrendingUp,
  Eye,
  MessageSquare,
  Heart,
  Filter,
  CheckCircle2,
  Clock,
  Trash2,
  ExternalLink,
  MapPin,
  Sparkles,
  Phone,
  Search,
  UploadCloud,
  X,
  Check,
  Tag,
  Home,
  Layers,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import Header from '@/components/Header';

interface UserProperty {
  id: string;
  title: string;
  description: string;
  type: 'sale' | 'rent';
  houseType: string;
  price: number;
  city: string;
  neighborhood: string;
  area: number;
  rooms: number;
  bathrooms: number;
  images: string[];
  status: 'active' | 'pending' | 'draft';
  views: number;
  favorites: number;
  leads: number;
  created_at: string;
}

const INITIAL_PROPERTIES: UserProperty[] = [
  {
    id: 'prop-1',
    title: 'Villa Contemporaine avec Piscine & Grand Jardin',
    description: 'Superbe villa moderne de plain-pied située dans un quartier résidentiel calme et sécurisé à Ivandry. Finitions haut de gamme, piscine à débordement et groupe électrogène.',
    type: 'sale',
    houseType: 'Villa',
    price: 480000000,
    city: 'Antananarivo',
    neighborhood: 'Ivandry',
    area: 320,
    rooms: 5,
    bathrooms: 3,
    images: ['/hero-bg.jpg'],
    status: 'active',
    views: 890,
    favorites: 42,
    leads: 16,
    created_at: '2026-10-18T10:00:00.000Z',
  },
  {
    id: 'prop-2',
    title: 'Appartement T3 Meublé Vue Panoramique',
    description: 'Magnifique appartement au 4ème étage avec ascenseur, cuisine équipée, balcon spacieux offrant une vue dégagée sur la ville.',
    type: 'rent',
    houseType: 'Appartement',
    price: 1800000,
    city: 'Antananarivo',
    neighborhood: 'Ambatobe',
    area: 95,
    rooms: 3,
    bathrooms: 2,
    images: ['/hero-keys.png'],
    status: 'active',
    views: 530,
    favorites: 26,
    leads: 12,
    created_at: '2026-10-14T08:30:00.000Z',
  },
  {
    id: 'prop-3',
    title: 'Local Commercial / Bureaux Open-Space',
    description: 'Espace professionnel idéal pour agence ou cabinet, situé en plein centre-ville avec places de parking dédiées.',
    type: 'rent',
    houseType: 'Bureau',
    price: 3200000,
    city: 'Toamasina',
    neighborhood: 'Bazar Be',
    area: 160,
    rooms: 4,
    bathrooms: 2,
    images: ['/hero-bg.jpg'],
    status: 'pending',
    views: 120,
    favorites: 5,
    leads: 3,
    created_at: '2026-10-21T14:15:00.000Z',
  },
];

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const openModal = useModalStore((state) => state.openModal);
  const { user, initialize } = useUserStore();
  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;

  const initialTab = searchParams.get('tab') as 'overview' | 'listings' | 'create' || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'listings' | 'create'>(initialTab);

  // Synchronize state if URL search query changes
  useEffect(() => {
    const tabParam = searchParams.get('tab') as 'overview' | 'listings' | 'create';
    if (tabParam && ['overview', 'listings', 'create'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Listings state with localStorage persistence
  const [properties, setProperties] = useState<UserProperty[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form State for "Create Listing"
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'sale' as 'sale' | 'rent',
    houseType: 'Villa',
    price: '',
    city: 'Antananarivo',
    neighborhood: '',
    area: '',
    rooms: '4',
    bathrooms: '2',
    phone: currentUser?.phone || '+261 34 00 000 00',
    features: {
      pool: false,
      parking: true,
      security: true,
      garden: false,
      furnished: false,
      generator: true,
      waterTank: true,
    },
    images: ['/hero-bg.jpg'],
  });

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tranogasy_user_properties');
      if (stored) {
        setProperties(JSON.parse(stored));
      } else {
        setProperties(INITIAL_PROPERTIES);
        localStorage.setItem('tranogasy_user_properties', JSON.stringify(INITIAL_PROPERTIES));
      }
    } catch {
      setProperties(INITIAL_PROPERTIES);
    }
    setIsLoaded(true);
  }, []);

  const saveProperties = (newProps: UserProperty[]) => {
    setProperties(newProps);
    try {
      localStorage.setItem('tranogasy_user_properties', JSON.stringify(newProps));
    } catch (e) {
      console.error('Error saving properties:', e);
    }
  };

  const handleDeleteProperty = (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette annonce ?')) {
      const updated = properties.filter((p) => p.id !== id);
      saveProperties(updated);
      setSuccessToast('Annonce supprimée avec succès.');
      setTimeout(() => setSuccessToast(null), 3000);
    }
  };

  const handleToggleStatus = (id: string) => {
    const updated = properties.map((p) => {
      if (p.id === id) {
        const nextStatus = p.status === 'active' ? 'draft' : 'active';
        return { ...p, status: nextStatus };
      }
      return p;
    });
    saveProperties(updated as UserProperty[]);
    setSuccessToast('Statut de l\'annonce mis à jour.');
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleCreateListingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.price) {
      alert('Veuillez remplir le titre et le prix.');
      return;
    }

    const newProp: UserProperty = {
      id: `prop-${Date.now()}`,
      title: formData.title,
      description: formData.description || 'Belle propriété disponible immédiatement.',
      type: formData.type,
      houseType: formData.houseType,
      price: Number(formData.price) || 0,
      city: formData.city,
      neighborhood: formData.neighborhood || 'Centre',
      area: Number(formData.area) || 120,
      rooms: Number(formData.rooms) || 3,
      bathrooms: Number(formData.bathrooms) || 2,
      images: formData.images.length > 0 ? formData.images : ['/hero-bg.jpg'],
      status: 'active',
      views: 1,
      favorites: 0,
      leads: 0,
      created_at: new Date().toISOString(),
    };

    const updated = [newProp, ...properties];
    saveProperties(updated);

    // Reset form
    setFormData({
      title: '',
      description: '',
      type: 'sale',
      houseType: 'Villa',
      price: '',
      city: 'Antananarivo',
      neighborhood: '',
      area: '',
      rooms: '4',
      bathrooms: '2',
      phone: currentUser?.phone || '+261 34 00 000 00',
      features: {
        pool: false,
        parking: true,
        security: true,
        garden: false,
        furnished: false,
        generator: true,
        waterTank: true,
      },
      images: ['/hero-bg.jpg'],
    });

    setSuccessToast('Votre annonce a été publiée avec succès ! Elle est désormais visible en ligne.');
    setTimeout(() => setSuccessToast(null), 4000);

    // Switch to listings tab
    setActiveTab('listings');
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setFormData((prev) => ({
            ...prev,
            images: [event.target?.result as string, ...prev.images],
          }));
        }
      };
      reader.readAsDataURL(files[0]);
    }
  };

  // Metrics calculations
  const totalViews = properties.reduce((acc, p) => acc + (p.views || 0), 0);
  const totalFavorites = properties.reduce((acc, p) => acc + (p.favorites || 0), 0);
  const totalLeads = properties.reduce((acc, p) => acc + (p.leads || 0), 0);
  const activeCount = properties.filter((p) => p.status === 'active').length;
  const pendingCount = properties.filter((p) => p.status === 'pending').length;

  const filteredProperties = properties.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.neighborhood.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-zinc-950 pb-28 md:pb-20 font-sans selection:bg-brand-green/20">
      <Header />

      {/* Top Banner / Breadcrumb */}
      <div className="sticky top-[64px] z-30 w-full bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 md:px-8 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-800 dark:text-zinc-200" strokeWidth={2.5} />
            </Link>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-zinc-900 dark:text-white tracking-tight leading-tight">
                Espace Propriétaire
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                Tableau de bord & Gestion de vos annonces immobilières
              </p>
            </div>
          </div>

          {/* Quick Create Action */}
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-tr from-brand-green to-emerald-600 text-white font-semibold text-xs sm:text-sm shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Créer une annonce</span>
            <span className="sm:hidden">Publier</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-4 sm:pt-6">

        {/* Success Toast */}
        {successToast && (
          <div className="mb-4 p-4 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="p-1 hover:bg-emerald-600 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Not Logged In Notice Banner */}
        {!isLoggedIn && (
          <div className="mb-6 p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Mode démonstration invité
                </p>
                <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  Connectez-vous pour sauvegarder définitivement vos annonces et recevoir les contacts acheteurs.
                </p>
              </div>
            </div>
            <button
              onClick={() => openModal('login')}
              className="px-4 py-2 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold hover:scale-105 active:scale-95 transition-transform"
            >
              Se connecter
            </button>
          </div>
        )}

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center gap-2 p-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm w-full max-w-lg mb-6 mx-auto sm:mx-0">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Tableau de bord</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('listings')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'listings'
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Mes annonces ({properties.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'bg-gradient-to-tr from-brand-green to-emerald-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span>Créer</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════
            TAB 1: TABLEAU DE BORD (DASHBOARD OVERVIEW)
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {/* Card 1: Annonces Actives */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Annonces en ligne</span>
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
                    {activeCount}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{pendingCount > 0 ? `${pendingCount} en validation` : 'Toutes publiées'}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Vues Totales */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Vues totales</span>
                  <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                    <Eye className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
                    {totalViews.toLocaleString('fr-FR')}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 mt-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>+24% ce mois</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Contacts & Demandes */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Demandes reçues</span>
                  <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
                    {totalLeads}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-1">
                    <Phone className="w-3 h-3" />
                    <span>WhatsApp & Appels</span>
                  </div>
                </div>
              </div>

              {/* Card 4: Favoris */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Favoris enregistrés</span>
                  <div className="w-8 h-8 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <Heart className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white">
                    {totalFavorites}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 mt-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Clients intéressés</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Performance Overview & Weekly Activity Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left 2 Cols: Activity chart */}
              <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                      Évolution des consultations
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Activité des 7 derniers jours sur vos biens
                    </p>
                  </div>
                  <span className="text-xs font-bold text-brand-green px-3 py-1 rounded-full bg-brand-green/10">
                    +18% cette semaine
                  </span>
                </div>

                {/* Simulated Visual Bar Chart */}
                <div className="flex items-end justify-between h-44 sm:h-52 pt-4 px-2 sm:px-4 border-b border-zinc-100 dark:border-zinc-800">
                  {[
                    { day: 'Lun', views: 95, height: '45%' },
                    { day: 'Mar', views: 130, height: '62%' },
                    { day: 'Mer', views: 110, height: '52%' },
                    { day: 'Jeu', views: 175, height: '83%' },
                    { day: 'Ven', views: 160, height: '76%' },
                    { day: 'Sam', views: 210, height: '100%' },
                    { day: 'Dim', views: 190, height: '90%' },
                  ].map((bar, i) => (
                    <div key={bar.day} className="flex flex-col items-center gap-2 h-full justify-end group">
                      <span className="text-[10px] font-semibold text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        {bar.views}
                      </span>
                      <div
                        className="w-7 sm:w-10 rounded-t-xl bg-gradient-to-t from-brand-green to-emerald-400 transition-all duration-300 group-hover:brightness-110"
                        style={{ height: bar.height }}
                      />
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {bar.day}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Col: Recent Leads / Inquiries */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white mb-1">
                    Derniers contacts reçus
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                    Acheteurs et locataires ayant demandé des infos
                  </p>

                  <div className="space-y-3">
                    {[
                      { name: 'Mamy Rakoto', phone: '+261 34 12 345 67', prop: 'Villa Contemporaine', time: 'Il y a 2h' },
                      { name: 'Sophie Randria', phone: '+261 32 98 765 43', prop: 'Appartement T3', time: 'Il y a 5h' },
                      { name: 'Dr. Herizo', phone: '+261 33 45 678 90', prop: 'Local Commercial', time: 'Hier' },
                    ].map((lead, idx) => (
                      <div key={idx} className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {lead.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            Pour: {lead.prop}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-zinc-400 block">{lead.time}</span>
                          <a
                            href={`tel:${lead.phone}`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-green hover:underline mt-0.5"
                          >
                            <Phone className="w-3 h-3" />
                            Appeler
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('listings')}
                  className="mt-4 w-full py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Voir toutes mes annonces
                </button>
              </div>

            </div>

            {/* Seller Tips & Guidance Banner */}
            <div className="bg-gradient-to-r from-emerald-500/10 via-brand-green/10 to-teal-500/10 border border-brand-green/20 rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-green text-white flex items-center justify-center shrink-0 shadow-md">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
                    Astuce TranoGasy pour maximiser vos contacts
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl">
                    Les annonces avec au moins 5 photos de haute qualité en lumière naturelle et un prix clair en Ariary reçoivent 3,2 fois plus de messages d'acheteurs qualifiés à Madagascar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="px-5 py-2.5 rounded-full bg-brand-green text-white font-bold text-xs hover:bg-emerald-600 transition-all shrink-0 shadow-md"
              >
                Ajouter une annonce
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 2: MES ANNONCES (MY OWN LISTINGS)
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'listings' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3 sm:p-4 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher parmi mes annonces..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-full text-xs sm:text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-brand-green/30"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(['all', 'active', 'pending', 'draft'] as const).map((st) => {
                  const labels = {
                    all: `Toutes (${properties.length})`,
                    active: `En ligne (${activeCount})`,
                    pending: `En attente (${pendingCount})`,
                    draft: `Brouillons`,
                  };
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFilterStatus(st)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        filterStatus === st
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {labels[st]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Listings Grid */}
            {filteredProperties.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 sm:p-12 text-center border border-zinc-100 dark:border-zinc-800 shadow-sm">
                <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white mb-1">
                  Aucune annonce trouvée
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mb-6">
                  {searchQuery
                    ? 'Aucun bien ne correspond à votre recherche.'
                    : 'Vous n\'avez pas encore créé d\'annonce pour le moment.'}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="px-5 py-2.5 rounded-full bg-brand-green text-white font-bold text-xs sm:text-sm hover:scale-105 active:scale-95 transition-all shadow-md inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Créer ma première annonce
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProperties.map((prop) => (
                  <div
                    key={prop.id}
                    className="bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-100 dark:border-zinc-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Image Thumbnail & Badges */}
                      <div className="relative h-48 w-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <Image
                          src={prop.images[0] || '/hero-bg.jpg'}
                          alt={prop.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                        {/* Top Status Badge */}
                        <div className="absolute top-3 left-3 flex items-center gap-2">
                          {prop.status === 'active' && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/90 text-white backdrop-blur-md shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              En ligne
                            </span>
                          )}
                          {prop.status === 'pending' && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/90 text-white backdrop-blur-md shadow-sm">
                              <Clock className="w-3 h-3" />
                              En validation
                            </span>
                          )}
                          {prop.status === 'draft' && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-700/90 text-white backdrop-blur-md shadow-sm">
                              Brouillon
                            </span>
                          )}
                        </div>

                        {/* Type Badge */}
                        <div className="absolute top-3 right-3">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/90 dark:bg-zinc-900/90 text-zinc-900 dark:text-white backdrop-blur-md">
                            {prop.type === 'rent' ? 'Location' : 'Vente'}
                          </span>
                        </div>

                        {/* Price Overlay */}
                        <div className="absolute bottom-3 left-3 text-white">
                          <p className="text-lg font-extrabold tracking-tight">
                            {prop.price.toLocaleString('fr-FR')} Ar
                            {prop.type === 'rent' && <span className="text-xs font-normal"> /mois</span>}
                          </p>
                        </div>
                      </div>

                      {/* Content Info */}
                      <div className="p-4 sm:p-5">
                        <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          <MapPin className="w-3.5 h-3.5 text-brand-red shrink-0" />
                          <span className="truncate">{prop.neighborhood}, {prop.city}</span>
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white line-clamp-1 mb-2">
                          {prop.title}
                        </h4>

                        <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                          <span>{prop.area} m²</span>
                          <span>•</span>
                          <span>{prop.rooms} pièces</span>
                          <span>•</span>
                          <span>{prop.houseType}</span>
                        </div>

                        {/* Performance Counters */}
                        <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 text-center">
                          <div>
                            <span className="text-[10px] text-zinc-400 block">Vues</span>
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                              {prop.views}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 block">Favoris</span>
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                              {prop.favorites}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 block">Contacts</span>
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                              {prop.leads}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="p-4 pt-0 flex items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(prop.id)}
                        className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      >
                        {prop.status === 'active' ? 'Mettre en pause' : 'Mettre en ligne'}
                      </button>

                      <div className="flex items-center gap-1">
                        <Link
                          href={`/properties/${prop.id}`}
                          aria-label="Voir l'annonce"
                          className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Voir l'annonce"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteProperty(prop.id)}
                          aria-label="Supprimer"
                          className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                          title="Supprimer l'annonce"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 3: CRÉER UNE ANNONCE (CREATE LISTING FORM)
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'create' && (
          <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-8 border border-zinc-100 dark:border-zinc-800 shadow-sm animate-in fade-in duration-200">
            <div className="mb-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-bold text-brand-green uppercase tracking-wider">
                Publication directe
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight mt-1">
                Déposer une nouvelle annonce
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Remplissez les informations de votre bien pour le rendre visible auprès de milliers de clients à Madagascar.
              </p>
            </div>

            <form onSubmit={handleCreateListingSubmit} className="space-y-6">
              {/* Type d'opération (Vente vs Location) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-2">
                  Type d'offre *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, type: 'sale' }))}
                    className={`py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      formData.type === 'sale'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-sm'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    <Tag className="w-4 h-4" />
                    À Vendre
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, type: 'rent' }))}
                    className={`py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      formData.type === 'rent'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-sm'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    <Home className="w-4 h-4" />
                    À Louer
                  </button>
                </div>
              </div>

              {/* Type de bien */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-2">
                  Catégorie du bien *
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {['Villa', 'Appartement', 'Maison', 'Bureau', 'Terrain'].map((ht) => (
                    <button
                      key={ht}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, houseType: ht }))}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        formData.houseType === ht
                          ? 'bg-brand-green text-white border-brand-green shadow-sm'
                          : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                      }`}
                    >
                      {ht}
                    </button>
                  ))}
                </div>
              </div>

              {/* Titre & Description */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Titre de l'annonce *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Belle villa avec piscine à Ivandry"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Description détaillée
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Détaillez les atouts, l'environnement, l'accès, le calme..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green resize-none"
                  />
                </div>
              </div>

              {/* Localisation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Ville *
                  </label>
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                  >
                    <option value="Antananarivo">Antananarivo</option>
                    <option value="Toamasina">Toamasina</option>
                    <option value="Antsirabe">Antsirabe</option>
                    <option value="Mahajanga">Mahajanga</option>
                    <option value="Fianarantsoa">Fianarantsoa</option>
                    <option value="Nosy Be">Nosy Be</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Quartier / Fokontany
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Ivandry, Ambatobe, Analakely..."
                    value={formData.neighborhood}
                    onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>

              {/* Prix & Caractéristiques */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Prix (en Ariary) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      placeholder="Ex: 350000000"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full pl-4 pr-12 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
                      Ar
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Surface (m²)
                  </label>
                  <input
                    type="number"
                    placeholder="Ex: 180"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                    Pièces
                  </label>
                  <input
                    type="number"
                    value={formData.rooms}
                    onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>

              {/* Photos Upload & Preview */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-2">
                  Photos du bien
                </label>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Upload Drop Zone */}
                  <label className="flex flex-col items-center justify-center w-28 h-28 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 transition-colors cursor-pointer text-center p-2">
                    <UploadCloud className="w-6 h-6 text-brand-green mb-1" />
                    <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                      Ajouter photo
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>

                  {/* Thumbnail Previews */}
                  {formData.images.map((img, idx) => (
                    <div key={idx} className="relative w-28 h-28 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <Image src={img} alt="Aperçu" fill className="object-cover" />
                      {formData.images.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              images: prev.images.filter((_, i) => i !== idx),
                            }))
                          }
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Téléphone de contact */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Téléphone / WhatsApp pour les contacts *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="+261 34 00 000 00"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full pl-11 pr-4 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full py-4 rounded-full bg-gradient-to-tr from-brand-green via-[#7cbd1e] to-emerald-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-brand-green/30 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-5 h-5" strokeWidth={2.5} />
                  <span>Publier mon annonce maintenant</span>
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-green border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Chargement de votre espace...</span>
        </div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
