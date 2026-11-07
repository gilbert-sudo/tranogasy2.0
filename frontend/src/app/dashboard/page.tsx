'use client';

import {
  useState,
  useEffect,
  Suspense,
  ChangeEvent,
  useMemo,
  useCallback,
  useRef,
} from 'react';
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
  CheckCircle2,
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
  ChevronDown,
  AlertCircle,
  Pencil,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import { usePropertyStore } from '@/store/propertyStore';
import { userService } from '@/services/user.service';
import { propertyService } from '@/services/property.service';
import Header from '@/components/Header';
import DashboardPropertyCard, {
  DashboardProperty,
} from '@/components/dashboard/DashboardPropertyCard';
import EditPropertyModal from '@/components/dashboard/EditPropertyModal';
import DeleteConfirmModal from '@/components/dashboard/DeleteConfirmModal';
import PropertyStatsModal from '@/components/dashboard/PropertyStatsModal';

const isMockProperty = (p: any) => {
  const id = p?.id || p?._id;
  return (
    id === 'prop-1' ||
    id === 'prop-2' ||
    id === 'prop-3' ||
    p?.title === 'Villa Contemporaine avec Piscine & Grand Jardin' ||
    p?.title === 'Appartement T3 Meublé Vue Panoramique' ||
    p?.title === 'Local Commercial / Bureaux Open-Space'
  );
};

const INITIAL_PROPERTIES: DashboardProperty[] = [];

// Progressive chunking size for high-performance rendering of 1000+ items
const BATCH_SIZE = 15;

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const openModal = useModalStore((state) => state.openModal);
  const openPropertyDetail = usePropertyDetailModalStore(
    (state) => state.openPropertyDetail
  );
  const { user, initialize } = useUserStore();
  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;

  const initialTab =
    (searchParams.get('tab') as 'overview' | 'listings' | 'create') ||
    'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'listings' | 'create'>(
    initialTab
  );

  // Synchronize state if URL search query changes
  useEffect(() => {
    const tabParam = searchParams.get('tab') as
      | 'overview'
      | 'listings'
      | 'create';
    if (tabParam && ['overview', 'listings', 'create'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tab: 'overview' | 'listings' | 'create') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const activeTabIndex =
    activeTab === 'overview' ? 0 : activeTab === 'listings' ? 1 : 2;

  useEffect(() => {
    initialize();
  }, [initialize]);

  const currentUserId = currentUser?._id;
  const isCachedInStore = Boolean(
    currentUserId &&
    usePropertyStore.getState().isUserPropertiesLoaded &&
    usePropertyStore.getState().userPropertiesUserId === currentUserId
  );
  const cachedUserProps = isCachedInStore
    ? usePropertyStore.getState().userProperties
    : [];

  // Listings state with lightweight cache and API sync
  const [properties, setProperties] = useState<DashboardProperty[]>(() => {
    if (isCachedInStore) {
      return cachedUserProps;
    }
    return [];
  });
  const [isLoaded, setIsLoaded] = useState<boolean>(() => isCachedInStore);
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'active' | 'pending' | 'draft'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Progressive rendering: slice the visible count to prevent DOM freeze with 1000+ cards
  const [displayLimit, setDisplayLimit] = useState(BATCH_SIZE);
  const observerRef = useRef<HTMLDivElement | null>(null);

  // Modals state for Edit, Delete, and Stats
  const [editingProperty, setEditingProperty] =
    useState<DashboardProperty | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [deletingProperty, setDeletingProperty] =
    useState<DashboardProperty | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [statsProperty, setStatsProperty] =
    useState<DashboardProperty | null>(null);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

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

  // Load from API (if logged in) or lightweight localStorage preview
  useEffect(() => {
    let isCancelled = false;

    async function loadProperties() {
      // 0. If user is logged in and already loaded in Zustand store, take from Zustand and DO NOT FETCH!
      const storeState = usePropertyStore.getState();
      if (
        currentUserId &&
        storeState.isUserPropertiesLoaded &&
        storeState.userPropertiesUserId === currentUserId
      ) {
        setProperties(storeState.userProperties);
        setIsLoaded(true);
        return;
      }

      // Clean up any stale mock properties in localStorage
      try {
        const stored = localStorage.getItem('tranogasy_user_properties');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const cleaned = parsed.filter((p: any) => !isMockProperty(p));
            if (cleaned.length !== parsed.length) {
              localStorage.setItem('tranogasy_user_properties', JSON.stringify(cleaned));
            }
          }
        }
      } catch {}

      // 1. If user is logged in, fetch full user properties directly from backend API
      if (currentUserId) {
        try {
          const profile = await userService.getPublicProfile(currentUserId);
          if (
            !isCancelled &&
            profile?.properties &&
            profile.properties.length > 0
          ) {
            const formatted: DashboardProperty[] = profile.properties
              .filter((p: any) => !isMockProperty(p))
              .map((p: any) => ({
                ...p,
                id: p._id,
                _id: p._id,
                title: p.title,
                description: p.description,
                type: p.type || (p.rent ? 'rent' : 'sale'),
                houseType:
                  p.houseType
                    ? p.houseType.charAt(0).toUpperCase() + p.houseType.slice(1)
                    : 'Villa',
                price: p.price || p.rent || 0,
                rent: p.rent || p.price || 0,
                city: p.city,
                neighborhood: p.city?.fokontany || '',
                area: p.area || 0,
                rooms: p.rooms || 1,
                bathrooms: p.bathrooms || 1,
                toilet:
                  p.toilet !== undefined && p.toilet !== null
                    ? p.toilet
                    : p.features?.insideToilet
                    ? 1
                    : 0,
                kitchen: p.kitchen || 0,
                livingRoom: p.livingRoom || 0,
                features: p.features || {},
                owner: p.owner,
                sources: p.sources,
                propertyNumber: p.propertyNumber,
                coords: p.coords,
                phone1: p.phone1,
                phone2: p.phone2,
                phone3: p.phone3,
                images: p.images || [],
                status:
                  p.status === 'available'
                    ? 'active'
                    : p.status === 'pending'
                    ? 'pending'
                    : 'draft',
                views: p.views || Math.floor(Math.random() * 400 + 40),
                favorites: p.favorites || Math.floor(Math.random() * 25 + 2),
                leads: p.leads || Math.floor(Math.random() * 12 + 1),
                created_at: p.created_at || new Date().toISOString(),
              }));

            // Merge any genuine offline created drafts (excluding mock items)
            const stored = localStorage.getItem('tranogasy_user_properties');
            let localDrafts: DashboardProperty[] = [];
            if (stored) {
              try {
                const parsed = JSON.parse(stored);
                localDrafts = parsed.filter(
                  (lp: any) =>
                    !isMockProperty(lp) &&
                    typeof lp.id === 'string' &&
                    lp.id.startsWith('prop-') &&
                    lp.id !== 'prop-1' &&
                    lp.id !== 'prop-2' &&
                    lp.id !== 'prop-3'
                );
              } catch {}
            }

            const merged = [...localDrafts, ...formatted];
            setProperties(merged);
            usePropertyStore.getState().setUserProperties(merged, currentUserId);
            usePropertyStore.getState().addProperties(formatted);

            // Only cache a small preview in localStorage to protect main-thread from heavy JSON lock
            try {
              const previewToCache = merged.slice(0, 20);
              localStorage.setItem(
                'tranogasy_user_properties',
                JSON.stringify(previewToCache)
              );
            } catch (e) {
              console.warn('LocalStorage preview save skipped:', e);
            }

            setIsLoaded(true);
            return;
          } else if (!isCancelled && profile && Array.isArray(profile.properties)) {
            // User has no properties on backend
            setProperties([]);
            usePropertyStore.getState().setUserProperties([], currentUserId);
            setIsLoaded(true);
            return;
          }
        } catch (err) {
          console.warn('Backend load profile error, fallback to local storage:', err);
        }
      }

      // 2. Fallback to localStorage or empty for guest mode
      try {
        const stored = localStorage.getItem('tranogasy_user_properties');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = parsed.filter((p: any) => !isMockProperty(p));
            setProperties(cleaned);
            usePropertyStore.getState().setUserProperties(cleaned, currentUserId || undefined);
          } else {
            setProperties([]);
          }
        } else {
          setProperties([]);
        }
      } catch {
        setProperties([]);
      }
      setIsLoaded(true);
    }

    loadProperties();

    return () => {
      isCancelled = true;
    };
  }, [currentUserId]);

  // Save properties without freezing main thread on massive arrays
  const saveProperties = useCallback(
    (newProps: DashboardProperty[]) => {
      setProperties(newProps);
      usePropertyStore.getState().setUserProperties(newProps, currentUserId);
      try {
        // Store small preview only to prevent localStorage quota exhaustion and CPU lock
        const toCache = newProps.slice(0, 20);
        localStorage.setItem(
          'tranogasy_user_properties',
          JSON.stringify(toCache)
        );
      } catch (e) {
        console.warn('LocalStorage save skipped (dataset size):', e);
      }
    },
    [currentUserId]
  );

  // Reset display limit when filter or search changes
  useEffect(() => {
    setDisplayLimit(BATCH_SIZE);
  }, [filterStatus, searchQuery]);

  // Toggle property status (active vs draft)
  const handleToggleStatus = useCallback(
    async (prop: DashboardProperty) => {
      const propId = prop._id || prop.id;
      const isCurrentlyActive =
        prop.status === 'active' || prop.status === 'available';
      const nextStatus = isCurrentlyActive ? 'draft' : 'active';

      setProperties((prev) => {
        const updated = prev.map((p) => {
          if ((p._id || p.id) === propId) {
            return { ...p, status: nextStatus };
          }
          return p;
        });
        saveProperties(updated);
        return updated;
      });

      if (
        currentUser?._id &&
        prop._id &&
        !prop._id.startsWith('prop-')
      ) {
        try {
          await propertyService.updateProperty(prop._id, {
            status: nextStatus === 'active' ? 'available' : 'unavailable',
          });
        } catch (e) {
          console.warn('API updateProperty status error:', e);
        }
      }

      setSuccessToast(
        nextStatus === 'active'
          ? 'Annonce mise en ligne avec succès.'
          : 'Annonce mise en pause (brouillon).'
      );
      setTimeout(() => setSuccessToast(null), 3000);
    },
    [currentUser?._id, saveProperties]
  );

  // Open Edit Modal
  const handleOpenEdit = useCallback((prop: DashboardProperty) => {
    setEditingProperty(prop);
    setIsEditModalOpen(true);
  }, []);

  // Open Stats Modal
  const handleOpenStats = useCallback((prop: DashboardProperty) => {
    setStatsProperty(prop);
    setIsStatsModalOpen(true);
  }, []);

  // Save changes from Edit Modal
  const handleSaveEdit = useCallback(
    async (updatedProp: DashboardProperty) => {
      const propId = updatedProp._id || updatedProp.id;
      setProperties((prev) => {
        const updated = prev.map((p) => {
          if ((p._id || p.id) === propId) {
            return updatedProp;
          }
          return p;
        });
        saveProperties(updated);
        return updated;
      });
      setIsEditModalOpen(false);
      setEditingProperty(null);

      if (
        currentUser?._id &&
        updatedProp._id &&
        !updatedProp._id.startsWith('prop-')
      ) {
        try {
          await propertyService.updateProperty(updatedProp._id, {
            title: updatedProp.title,
            description: updatedProp.description,
            price: updatedProp.price,
            rent: updatedProp.rent,
            type: updatedProp.type,
            houseType: updatedProp.houseType?.toLowerCase(),
            area: updatedProp.area,
            rooms: updatedProp.rooms,
            bathrooms: updatedProp.bathrooms,
            status:
              updatedProp.status === 'active'
                ? 'available'
                : updatedProp.status === 'pending'
                ? 'pending'
                : 'unavailable',
          });
        } catch (e) {
          console.warn('API updateProperty save error:', e);
        }
      }

      setSuccessToast('Annonce modifiée avec succès.');
      setTimeout(() => setSuccessToast(null), 3000);
    },
    [currentUser?._id, saveProperties]
  );

  // Open Delete confirmation modal
  const handleOpenDelete = useCallback((prop: DashboardProperty) => {
    setDeletingProperty(prop);
    setIsDeleteModalOpen(true);
  }, []);

  // Confirm delete
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingProperty) return;
    const propId = deletingProperty._id || deletingProperty.id;
    setProperties((prev) => {
      const updated = prev.filter((p) => (p._id || p.id) !== propId);
      saveProperties(updated);
      return updated;
    });
    if (propId) {
      usePropertyStore.getState().removeProperty(propId);
    }
    setIsDeleteModalOpen(false);

    if (
      currentUser?._id &&
      deletingProperty._id &&
      !deletingProperty._id.startsWith('prop-')
    ) {
      try {
        await propertyService.deleteProperty(deletingProperty._id);
      } catch (e) {
        console.warn('API deleteProperty error:', e);
      }
    }

    setDeletingProperty(null);
    setSuccessToast('Annonce supprimée avec succès.');
    setTimeout(() => setSuccessToast(null), 3000);
  }, [deletingProperty, currentUser?._id, saveProperties]);

  // Create new listing
  const handleCreateListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.price) {
      alert('Veuillez remplir le titre et le prix.');
      return;
    }

    const numPrice = Number(formData.price) || 0;
    const isRent = formData.type === 'rent';

    const newProp: DashboardProperty = {
      id: `prop-${Date.now()}`,
      _id: `prop-${Date.now()}`,
      title: formData.title,
      description:
        formData.description || 'Belle propriété disponible immédiatement.',
      type: formData.type,
      houseType: formData.houseType,
      price: !isRent ? numPrice : 0,
      rent: isRent ? numPrice : 0,
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

    // If logged in, optionally register property with backend API
    if (currentUser?._id) {
      try {
        const created = await propertyService.createProperty({
          title: newProp.title,
          description: newProp.description,
          type: newProp.type,
          houseType: newProp.houseType?.toLowerCase(),
          price: newProp.price,
          rent: newProp.rent,
          city: '64f75284ef8f606073e98288', // Default sample city
          area: newProp.area,
          rooms: newProp.rooms,
          bathrooms: newProp.bathrooms,
          toilet: 1,
          livingRoom: 1,
          phone1: formData.phone,
          images: newProp.images,
          owner: currentUser._id,
        });
        if (created && created._id) {
          newProp.id = created._id;
          newProp._id = created._id;
        }
      } catch (err) {
        console.warn('API createProperty error, fallback to local storage:', err);
      }
    }

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

    setSuccessToast(
      'Votre annonce a été publiée avec succès ! Elle est désormais visible en ligne.'
    );
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

  // Metrics calculations (memoized to prevent recalculating on scroll / chunk loads)
  const totalViews = useMemo(
    () => properties.reduce((acc, p) => acc + (p.views || 0), 0),
    [properties]
  );
  const totalFavorites = useMemo(
    () => properties.reduce((acc, p) => acc + (p.favorites || 0), 0),
    [properties]
  );
  const totalLeads = useMemo(
    () => properties.reduce((acc, p) => acc + (p.leads || 0), 0),
    [properties]
  );
  const activeCount = useMemo(
    () =>
      properties.filter(
        (p) => p.status === 'active' || p.status === 'available'
      ).length,
    [properties]
  );
  const pendingCount = useMemo(
    () => properties.filter((p) => p.status === 'pending').length,
    [properties]
  );
  const draftCount = useMemo(
    () =>
      properties.filter(
        (p) => p.status === 'draft' || p.status === 'unavailable'
      ).length,
    [properties]
  );

  // Filtered properties based on current status and query
  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      const isAct = p.status === 'active' || p.status === 'available';
      const isPend = p.status === 'pending';
      const isDrf = p.status === 'draft' || p.status === 'unavailable';

      if (filterStatus === 'active' && !isAct) return false;
      if (filterStatus === 'pending' && !isPend) return false;
      if (filterStatus === 'draft' && !isDrf) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (p.title || '').toLowerCase().includes(q);
        const cityMatch =
          typeof p.city === 'object' && p.city !== null
            ? `${p.city.fokontany || ''} ${p.city.commune || ''} ${
                p.city.district || ''
              }`
                .toLowerCase()
                .includes(q)
            : (p.city || '').toLowerCase().includes(q);
        const neighMatch = (p.neighborhood || '').toLowerCase().includes(q);
        const typeMatch = (p.houseType || '').toLowerCase().includes(q);
        return titleMatch || cityMatch || neighMatch || typeMatch;
      }
      return true;
    });
  }, [properties, filterStatus, searchQuery]);

  // Sliced batch of properties to render in the DOM (prevents lag with 1000+ items)
  const displayedProperties = useMemo(() => {
    return filteredProperties.slice(0, displayLimit);
  }, [filteredProperties, displayLimit]);

  const hasMoreToDisplay = displayLimit < filteredProperties.length;

  const loadMoreChunk = useCallback(() => {
    setDisplayLimit((prev) =>
      Math.min(prev + BATCH_SIZE, filteredProperties.length)
    );
  }, [filteredProperties.length]);

  // IntersectionObserver to auto-load the next chunk when user scrolls near the bottom
  useEffect(() => {
    const sentinel = observerRef.current;
    if (!sentinel || !hasMoreToDisplay) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreChunk();
        }
      },
      {
        root: null,
        rootMargin: '400px', // Trigger 400px before reaching sentinel
        threshold: 0.05,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreToDisplay, loadMoreChunk]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-zinc-950 pb-28 md:pb-20 font-sans selection:bg-brand-green/20">
      <Header />

      {/* Top Banner / Breadcrumb */}
      <div className="sticky top-[64px] z-30 w-full bg-[#F8F9FA]/90 dark:bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-[2000px] items-center justify-between px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft
                className="w-5 h-5 text-zinc-800 dark:text-zinc-200"
                strokeWidth={2.5}
              />
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
            onClick={() => handleTabChange('create')}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-brand-green hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm shadow-md shadow-brand-green/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Créer une annonce</span>
            <span className="sm:hidden">Publier</span>
          </button>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-[2000px] mx-auto px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 pt-4 sm:pt-6">
        {/* Success Toast */}
        {successToast && (
          <div className="mb-4 p-4 rounded-2xl bg-emerald-500 text-white shadow-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-sm font-semibold">{successToast}</span>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="p-1 hover:bg-emerald-600 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Not Logged In Demo Notice Banner */}
        {!isLoggedIn && (
          <div className="mb-6 p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Mode démonstration invité
                </p>
                <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400">
                  Connectez-vous pour synchroniser vos annonces directement avec
                  notre base de données.
                </p>
              </div>
            </div>
            <button
              onClick={() => openModal('login')}
              className="px-5 py-2 rounded-full bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 text-xs font-bold hover:scale-105 active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              Se connecter
            </button>
          </div>
        )}

        {/* Folder Menu Tabs Navigation - Sliding Animated Transition */}
        <div className="w-full max-w-xl sm:max-w-2xl mb-6 mx-auto sm:mx-0">
          <div className="overflow-x-auto scrollbar-hide pt-2 pb-0 -mx-1 px-1">
            <div
              role="tablist"
              aria-label="Navigation dossier du tableau de bord"
              className="relative flex items-end min-w-[340px] select-none pr-6 sm:pr-8"
            >
              <div className="relative w-full h-11 sm:h-12 flex items-end">
                {/* ── Base Inactive Folder Tabs Layer ── */}
                <div className="absolute inset-0 flex items-end pointer-events-none z-0">
                  {/* Slot 0 base */}
                  <div className="relative flex-1 h-full z-[3] rounded-tl-xl sm:rounded-tl-2xl bg-zinc-200/80 dark:bg-zinc-800/80 border-t border-l border-zinc-300/60 dark:border-zinc-700/60">
                    <div className="absolute left-full -ml-[1.5px] top-0 bottom-0 w-4 sm:w-5">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 20 44"
                        preserveAspectRatio="none"
                        fill="none"
                      >
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44 L 0 44 Z"
                          className="fill-zinc-200/80 dark:fill-zinc-800/80"
                        />
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-zinc-300/60 dark:text-zinc-700/60"
                        />
                      </svg>
                    </div>
                  </div>
                  {/* Slot 1 base */}
                  <div className="relative flex-1 h-full z-[2] rounded-tl-xl sm:rounded-tl-2xl bg-zinc-200/80 dark:bg-zinc-800/80 border-t border-l border-zinc-300/60 dark:border-zinc-700/60">
                    <div className="absolute left-full -ml-[1.5px] top-0 bottom-0 w-4 sm:w-5">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 20 44"
                        preserveAspectRatio="none"
                        fill="none"
                      >
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44 L 0 44 Z"
                          className="fill-zinc-200/80 dark:fill-zinc-800/80"
                        />
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-zinc-300/60 dark:text-zinc-700/60"
                        />
                      </svg>
                    </div>
                  </div>
                  {/* Slot 2 base */}
                  <div className="relative flex-1 h-full z-[1] rounded-tl-xl sm:rounded-tl-2xl bg-emerald-500/15 dark:bg-emerald-950/40 border-t border-l border-emerald-500/30 dark:border-emerald-800/30">
                    <div className="absolute left-full -ml-[1.5px] top-0 bottom-0 w-4 sm:w-5">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 20 44"
                        preserveAspectRatio="none"
                        fill="none"
                      >
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44 L 0 44 Z"
                          className="fill-emerald-500/15 dark:fill-emerald-950/40"
                        />
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-emerald-500/30 dark:text-emerald-800/30"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* ── Sliding Active Folder Tab Indicator ── */}
                <div
                  className="absolute top-0 bottom-0 pointer-events-none z-20 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{
                    width: '33.333333%',
                    transform: `translateX(${activeTabIndex * 100}%)`,
                  }}
                >
                  <div
                    className={`relative w-full h-full rounded-tl-xl sm:rounded-tl-2xl border-t border-l transition-all duration-300 ${
                      activeTab === 'create'
                        ? 'bg-brand-green border-brand-green shadow-[0_-3px_14px_rgba(124,189,30,0.35)]'
                        : 'bg-zinc-950 border-zinc-950 dark:bg-white dark:border-white shadow-[0_-3px_12px_rgba(0,0,0,0.14)]'
                    }`}
                  >
                    <div className="absolute left-full -ml-[1.5px] top-0 bottom-0 w-4 sm:w-5 pointer-events-none">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 20 44"
                        preserveAspectRatio="none"
                        fill="none"
                      >
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44 L 0 44 Z"
                          fill={activeTab === 'create' ? '#7cbd1e' : undefined}
                          className={
                            activeTab === 'create'
                              ? ''
                              : 'fill-zinc-950 dark:fill-white transition-colors duration-300'
                          }
                        />
                        <path
                          d="M 0 0 C 10 0, 10 44, 20 44"
                          fill="none"
                          stroke={
                            activeTab === 'create' ? '#7cbd1e' : 'currentColor'
                          }
                          strokeWidth={1.5}
                          className={
                            activeTab === 'create'
                              ? ''
                              : 'text-zinc-950 dark:text-white transition-colors duration-300'
                          }
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* ── Interactive Tab Buttons ── */}
                <div className="relative flex items-end w-full h-full">
                  {/* Tab 1: Overview */}
                  <button
                    type="button"
                    role="tab"
                    id="dashboard-tab-overview"
                    aria-selected={activeTab === 'overview'}
                    aria-controls="dashboard-panel-overview"
                    onClick={() => handleTabChange('overview')}
                    className={`group relative flex-1 min-w-0 h-full pl-3.5 sm:pl-4.5 pr-5 sm:pr-6 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap cursor-pointer select-none bg-transparent outline-none focus:outline-none ring-0 active:outline-none [-webkit-tap-highlight-color:transparent] ${
                      activeTab === 'overview' ? 'z-30' : 'z-[13]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
                        activeTab === 'overview'
                          ? 'bg-white/15 dark:bg-zinc-900/15 text-white dark:text-zinc-950'
                          : 'bg-zinc-300/80 dark:bg-zinc-700/80 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white'
                      }`}
                    >
                      <LayoutDashboard className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    <span
                      className={`hidden sm:inline font-bold transition-colors duration-200 ${
                        activeTab === 'overview'
                          ? 'text-white dark:text-zinc-950'
                          : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white'
                      }`}
                    >
                      Tableau de bord
                    </span>
                    <span
                      className={`sm:hidden font-bold transition-colors duration-200 ${
                        activeTab === 'overview'
                          ? 'text-white dark:text-zinc-950'
                          : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white'
                      }`}
                    >
                      Aperçu
                    </span>
                  </button>

                  {/* Tab 2: Listings with full count */}
                  <button
                    type="button"
                    role="tab"
                    id="dashboard-tab-listings"
                    aria-selected={activeTab === 'listings'}
                    aria-controls="dashboard-panel-listings"
                    onClick={() => handleTabChange('listings')}
                    className={`group relative flex-1 min-w-0 h-full pl-4 sm:pl-5 pr-5 sm:pr-6 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap cursor-pointer select-none bg-transparent outline-none focus:outline-none ring-0 active:outline-none [-webkit-tap-highlight-color:transparent] ${
                      activeTab === 'listings' ? 'z-30' : 'z-[12]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
                        activeTab === 'listings'
                          ? 'bg-white/15 dark:bg-zinc-900/15 text-white dark:text-zinc-950'
                          : 'bg-zinc-300/80 dark:bg-zinc-700/80 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white'
                      }`}
                    >
                      <Building2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </div>
                    <span
                      className={`hidden sm:inline font-bold transition-colors duration-200 ${
                        activeTab === 'listings'
                          ? 'text-white dark:text-zinc-950'
                          : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white'
                      }`}
                    >
                      Mes annonces
                    </span>
                    <span
                      className={`sm:hidden font-bold transition-colors duration-200 ${
                        activeTab === 'listings'
                          ? 'text-white dark:text-zinc-950'
                          : 'text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white'
                      }`}
                    >
                      Annonces
                    </span>
                    <span
                      className={`inline-flex items-center justify-center px-1.5 py-0.5 min-w-[18px] sm:min-w-[20px] h-4 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full transition-colors duration-200 leading-none ${
                        activeTab === 'listings'
                          ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-950'
                          : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {properties.length}
                    </span>
                  </button>

                  {/* Tab 3: Create Button */}
                  <button
                    type="button"
                    role="tab"
                    id="dashboard-tab-create"
                    aria-selected={activeTab === 'create'}
                    aria-controls="dashboard-panel-create"
                    onClick={() => handleTabChange('create')}
                    className={`group relative flex-1 min-w-0 h-full pl-5 sm:pl-6 pr-3 sm:pr-4 flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm whitespace-nowrap cursor-pointer select-none bg-transparent outline-none focus:outline-none ring-0 active:outline-none [-webkit-tap-highlight-color:transparent] ${
                      activeTab === 'create' ? 'z-30' : 'z-[11]'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
                        activeTab === 'create'
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-500/20 text-brand-green dark:text-emerald-300'
                      }`}
                    >
                      <Plus
                        className="w-3 h-3 sm:w-3.5 sm:h-3.5"
                        strokeWidth={2.5}
                      />
                    </div>
                    <span
                      className={`font-bold transition-colors duration-200 ${
                        activeTab === 'create'
                          ? 'text-white'
                          : 'text-brand-green dark:text-emerald-400'
                      }`}
                    >
                      Créer
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Folder Shelf Baseline */}
          <div className="h-[2px] w-full bg-zinc-300/80 dark:bg-zinc-700/80 -mt-[1px] relative z-0"></div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            TAB 1: TABLEAU DE BORD (DASHBOARD OVERVIEW)
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div
            id="dashboard-panel-overview"
            role="tabpanel"
            aria-labelledby="dashboard-tab-overview"
            className="space-y-6 animate-tab-content"
          >
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {/* Card 1: Annonces Actives */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Annonces en ligne
                  </span>
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
                    <span>
                      {pendingCount > 0
                        ? `${pendingCount} en validation`
                        : `${properties.length} au total`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Vues Totales */}
              <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-5 border border-zinc-100 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Vues totales
                  </span>
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
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Demandes reçues
                  </span>
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
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Favoris enregistrés
                  </span>
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

            {/* Performance Overview & Activity Chart */}
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
                  ].map((bar) => (
                    <div
                      key={bar.day}
                      className="flex flex-col items-center gap-2 h-full justify-end group cursor-pointer"
                    >
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
                      {
                        name: 'Mamy Rakoto',
                        phone: '+261 34 12 345 67',
                        prop: properties[0]?.title || 'Propriété',
                        time: 'Il y a 2h',
                      },
                      {
                        name: 'Sophie Randria',
                        phone: '+261 32 98 765 43',
                        prop: properties[1]?.title || 'Appartement / Maison',
                        time: 'Il y a 5h',
                      },
                      {
                        name: 'Dr. Herizo',
                        phone: '+261 33 45 678 90',
                        prop: properties[2]?.title || 'Local / Bureau',
                        time: 'Hier',
                      },
                    ].map((lead, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                            {lead.name}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                            Pour: {lead.prop}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-zinc-400 block">
                            {lead.time}
                          </span>
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
                  onClick={() => handleTabChange('listings')}
                  className="mt-4 w-full py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
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
                    Les annonces avec au moins 5 photos de haute qualité en lumière
                    naturelle et un prix clair en Ariary reçoivent 3,2 fois plus de
                    messages d'acheteurs qualifiés à Madagascar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange('create')}
                className="px-5 py-2.5 rounded-full bg-brand-green text-white font-bold text-xs hover:bg-emerald-600 transition-all shrink-0 shadow-md cursor-pointer"
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
          <div
            id="dashboard-panel-listings"
            role="tabpanel"
            aria-labelledby="dashboard-tab-listings"
            className="space-y-6 animate-tab-content"
          >
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
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {(['all', 'active', 'pending', 'draft'] as const).map((st) => {
                  const counts = {
                    all: properties.length,
                    active: activeCount,
                    pending: pendingCount,
                    draft: draftCount,
                  };
                  const labels = {
                    all: `Toutes (${counts.all.toLocaleString('fr-FR')})`,
                    active: `En ligne (${counts.active.toLocaleString('fr-FR')})`,
                    pending: `En attente (${counts.pending.toLocaleString('fr-FR')})`,
                    draft: `Brouillons (${counts.draft.toLocaleString('fr-FR')})`,
                  };
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFilterStatus(st)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer active:scale-95 ${
                        filterStatus === st
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-sm'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
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
                  onClick={() => handleTabChange('create')}
                  className="px-5 py-2.5 rounded-full bg-brand-green text-white font-bold text-xs sm:text-sm hover:scale-105 active:scale-95 transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Créer ma première annonce
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Responsive Grid with chunked render */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
                  {displayedProperties.map((prop) => (
                    <DashboardPropertyCard
                      key={prop._id || prop.id}
                      property={prop}
                      onToggleStatus={handleToggleStatus}
                      onEdit={handleOpenEdit}
                      onDelete={handleOpenDelete}
                      onViewStats={handleOpenStats}
                    />
                  ))}
                </div>

                {/* Progressive loading status footer & infinite scroll sentinel */}
                <div className="pt-4 pb-6 flex flex-col items-center justify-center gap-3">
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    Affichage de <strong className="text-zinc-900 dark:text-white">{displayedProperties.length}</strong> sur{' '}
                    <strong className="text-zinc-900 dark:text-white">{filteredProperties.length.toLocaleString('fr-FR')}</strong> annonces
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-52 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-brand-green rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (displayedProperties.length /
                              (filteredProperties.length || 1)) *
                              100
                          )
                        )}%`,
                      }}
                    />
                  </div>

                  {/* Sentinel trigger for IntersectionObserver & Manual fallback button */}
                  <div
                    ref={observerRef}
                    className="h-8 w-full flex items-center justify-center"
                  >
                    {hasMoreToDisplay && (
                      <button
                        type="button"
                        onClick={loadMoreChunk}
                        className="px-5 py-2 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
                      >
                        <ChevronDown className="w-4 h-4 text-brand-green" />
                        <span>
                          Charger les {Math.min(BATCH_SIZE, filteredProperties.length - displayedProperties.length)} suivantes...
                        </span>
                      </button>
                    )}
                  </div>

                  {!hasMoreToDisplay && filteredProperties.length > BATCH_SIZE && (
                    <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-green" />
                      <span>
                        Toutes vos annonces ({filteredProperties.length.toLocaleString('fr-FR')}) sont chargées
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 3: CRÉER UNE ANNONCE (CREATE LISTING FORM)
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'create' && (
          <div
            id="dashboard-panel-create"
            role="tabpanel"
            aria-labelledby="dashboard-tab-create"
            className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-8 border border-zinc-100 dark:border-zinc-800 shadow-sm animate-tab-content"
          >
            <div className="mb-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-bold text-brand-green uppercase tracking-wider">
                Publication directe
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight mt-1">
                Déposer une nouvelle annonce
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Remplissez les informations de votre bien pour le rendre visible
                auprès de milliers de clients à Madagascar.
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
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, type: 'sale' }))
                    }
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
                    onClick={() =>
                      setFormData((prev) => ({ ...prev, type: 'rent' }))
                    }
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
                  {['Villa', 'Appartement', 'Maison', 'Bureau', 'Terrain'].map(
                    (ht) => (
                      <button
                        key={ht}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({ ...prev, houseType: ht }))
                        }
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          formData.houseType === ht
                            ? 'bg-brand-green text-white border-brand-green shadow-sm'
                            : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                        }`}
                      >
                        {ht}
                      </button>
                    )
                  )}
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
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, neighborhood: e.target.value })
                    }
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
                      onChange={(e) =>
                        setFormData({ ...formData, price: e.target.value })
                      }
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
                    onChange={(e) =>
                      setFormData({ ...formData, area: e.target.value })
                    }
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
                    onChange={(e) =>
                      setFormData({ ...formData, rooms: e.target.value })
                    }
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
                  <label className="flex flex-col items-center justify-center w-28 h-28 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-center p-2">
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
                    <div
                      key={idx}
                      className="relative w-28 h-28 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm"
                    >
                      <Image
                        src={img}
                        alt="Aperçu"
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      {formData.images.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              images: prev.images.filter((_, i) => i !== idx),
                            }))
                          }
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black transition-colors cursor-pointer"
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
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
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

      {/* Edit Property Modal */}
      <EditPropertyModal
        isOpen={isEditModalOpen}
        property={editingProperty}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingProperty(null);
        }}
        onSave={handleSaveEdit}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        propertyTitle={deletingProperty?.title}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setDeletingProperty(null);
        }}
        onConfirm={handleConfirmDelete}
      />

      {/* Property Statistics Modal */}
      <PropertyStatsModal
        isOpen={isStatsModalOpen}
        property={statsProperty}
        onClose={() => {
          setIsStatsModalOpen(false);
          setStatsProperty(null);
        }}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-brand-green border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              Chargement de votre espace...
            </span>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
