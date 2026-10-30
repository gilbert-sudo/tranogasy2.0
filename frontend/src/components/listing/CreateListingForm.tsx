'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Key,
  DollarSign,
  Home,
  Building2,
  ChevronDown,
  Plus,
  Minus,
  Phone,
  Layers,
  MapPin,
  Image as ImageIcon,
  Check,
  Loader2,
  Eye,
  X,
  Share2,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';
import { usePropertyStore } from '@/store/propertyStore';
import { propertyService } from '@/services/property.service';
import { useImageUpload } from '@/hooks/useImageUpload';
import { CityLocation } from '@/services/city.service';
import ListingImageUploader from './ListingImageUploader';
import ListingLocationPicker from './ListingLocationPicker';
import ListingAmenitiesSelector from './ListingAmenitiesSelector';
import ListingLivePreviewCard from './ListingLivePreviewCard';

export default function CreateListingForm() {
  const router = useRouter();
  const { user, initialize } = useUserStore();
  const openModal = useModalStore((state) => state.openModal);
  const addPropertyToStore = usePropertyStore((state) => state.addProperty);

  const imageUploadState = useImageUpload([]);
  const { images, isUploading: isImageUploading } = imageUploadState;

  // Form Fields
  const [type, setType] = useState<'rent' | 'sale'>('rent');
  const [houseType, setHouseType] = useState<'maison' | 'appartement'>('maison');
  const [floor, setFloor] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Pricing (in Ariary MGA)
  const [rent, setRent] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);

  // Location
  const [selectedCity, setSelectedCity] = useState<CityLocation | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Specifications
  const [rooms, setRooms] = useState<number>(1);
  const [bathrooms, setBathrooms] = useState<number>(1);
  const [toilet, setToilet] = useState<number>(1);
  const [kitchen, setKitchen] = useState<number>(1);
  const [livingRoom, setLivingRoom] = useState<number>(1);
  const [area, setArea] = useState<number>(50);

  // Placement (Inside / Outside)
  const [insideToilet, setInsideToilet] = useState<boolean>(true);
  const [insideBathroom, setInsideBathroom] = useState<boolean>(true);

  // Contact Phones
  const [phone1, setPhone1] = useState<string>('');
  const [phone2, setPhone2] = useState<string>('');
  const [phone3, setPhone3] = useState<string>('');
  const [showPhone3, setShowPhone3] = useState<boolean>(false);

  // Admin source fields
  const [sourcesUsername, setSourcesUsername] = useState('');
  const [sourcesAvatar, setSourcesAvatar] = useState('');
  const [sourcesLink, setSourcesLink] = useState('');

  // 34 Amenities / Features flags
  const [features, setFeatures] = useState<Record<string, boolean>>({
    electricityJirama: true,
    waterPumpSupplyJirama: true,
    waterWellSupply: false,
    electricityPower: false,
    waterPumpSupply: false,
    solarPanels: false,
    motoAccess: true,
    carAccess: true,
    surroundedByWalls: false,
    courtyard: false,
    parkingSpaceAvailable: false,
    garage: false,
    garden: false,
    independentHouse: false,
    guardianHouse: false,
    bassin: false,
    kitchenFacilities: false,
    placardKitchen: false,
    openKitchen: false,
    hotWaterAvailable: false,
    furnishedProperty: false,
    airConditionerAvailable: false,
    bathtub: false,
    fireplace: false,
    elevator: false,
    balcony: false,
    roofTop: false,
    swimmingPool: false,
    wifiAvailability: false,
    fiberOpticReady: false,
    securitySystem: false,
    seaView: false,
    mountainView: false,
    panoramicView: false,
  });

  // UI / Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdProperty, setCreatedProperty] = useState<any | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // Initialize user & prefill phone
  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (user?.phone && !phone1) {
      setPhone1(user.phone);
    }
  }, [user, phone1]);

  const toggleFeature = useCallback((key: string) => {
    setFeatures((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      // Linked auto-toggles from old version
      if (key === 'carAccess' && updated.carAccess) {
        updated.motoAccess = true;
      }
      return updated;
    });
  }, []);

  const handlePriceChange = (valStr: string) => {
    const cleanNum = parseInt(valStr.replace(/\D/g, ''), 10) || null;
    if (type === 'rent') {
      setRent(cleanNum);
    } else {
      setPrice(cleanNum);
    }
  };

  const currentPriceValue = type === 'rent' ? rent : price;

  // Validation
  const validateForm = () => {
    if (!title.trim()) {
      setFormError("Veuillez renseigner un titre pour votre annonce.");
      return false;
    }
    if (!selectedCity) {
      setFormError("Veuillez sélectionner la ville / le quartier de votre propriété.");
      return false;
    }
    if (!currentPriceValue || currentPriceValue <= 0) {
      setFormError(
        type === 'rent'
          ? "Veuillez indiquer le montant du loyer mensuel en Ariary."
          : "Veuillez indiquer le prix de vente en Ariary."
      );
      return false;
    }
    if (houseType === 'appartement' && !floor) {
      setFormError("Veuillez préciser l'étage pour un appartement.");
      return false;
    }
    if (images.length === 0) {
      setFormError("Votre annonce doit comporter au moins une photo.");
      return false;
    }
    if (isImageUploading) {
      setFormError("Veuillez patienter pendant la fin du téléversement de vos photos...");
      return false;
    }
    const uploadedGcs = images.filter((img) => (img.status === 'done' && img.src) || img.src);
    if (uploadedGcs.length === 0) {
      setFormError("Au moins une photo doit être téléversée avec succès sur Google Cloud.");
      return false;
    }
    if (!phone1.trim()) {
      setFormError("Veuillez fournir au moins un numéro de téléphone joignable.");
      return false;
    }

    setFormError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      openModal('login');
      return;
    }

    if (!validateForm()) {
      window.scrollTo({ top: 100, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        type,
        houseType,
        floor: houseType === 'appartement' ? floor : null,
        price: type === 'sale' ? price : null,
        rent: type === 'rent' ? rent : null,
        city: selectedCity?._id,
        coords: coords || selectedCity?.coords || null,
        rooms: Number(rooms) || 0,
        bathrooms: Number(bathrooms) || 0,
        toilet: Number(toilet) || 0,
        kitchen: Number(kitchen) || 0,
        livingRoom: Number(livingRoom) || 0,
        area: Number(area) || 0,
        insideToilet,
        insideBathroom,
        images: images.filter((img) => (img.status === 'done' && img.src) || img.src).map((img) => img.src),
        owner: user._id || user.id,
        phone1: phone1.trim(),
        phone2: phone2.trim() || null,
        phone3: phone3.trim() || null,
        sources: (sourcesUsername || sourcesLink) ? {
          username: sourcesUsername || null,
          avatar: sourcesAvatar || null,
          link: sourcesLink || null,
        } : null,
        features: {
          ...features,
          insideToilet,
          insideBathroom,
        },
      };

      const result = await propertyService.createProperty(payload);
      addPropertyToStore(result);
      setCreatedProperty(result);
    } catch (err: any) {
      console.error('Submission failed:', err);
      setFormError(err.message || "Erreur lors de la création de l'annonce. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // SUCCESS CELEBRATION MODAL
  if (createdProperty) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-950 animate-in fade-in zoom-in-95 duration-300">
        <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-10 text-center space-y-6 shadow-2xl border border-zinc-100 dark:border-zinc-800">
          <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-brand-green/15 text-brand-green flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12" />
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-green px-3 py-1 rounded-full bg-brand-green/10">
              Succès
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white">
              Votre annonce a été publiée !
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
              Félicitations, votre bien est maintenant enregistré avec le numéro de référence{' '}
              <strong className="text-zinc-900 dark:text-white font-mono">
                {createdProperty.propertyNumber || 'TNY-001'}
              </strong>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push(`/properties/${createdProperty._id}`)}
              className="flex-1 py-3.5 px-5 rounded-2xl bg-brand-green hover:bg-[#6fa81a] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
            >
              Voir mon annonce
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard?tab=listings')}
              className="flex-1 py-3.5 px-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-sm transition-all cursor-pointer"
            >
              Mon tableau de bord
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-transparent text-zinc-900 dark:text-white">
      {/* ── BORDERLESS TOP BAR ── */}
      <header className="sticky top-0 z-30 w-full backdrop-blur-xl bg-white/80 dark:bg-zinc-950/80 px-4 sm:px-8 py-3.5 flex items-center justify-between border-b border-zinc-200/40 dark:border-zinc-800/40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all text-zinc-700 dark:text-zinc-200 cursor-pointer"
            aria-label="Retour"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div>
            <h1 className="text-base sm:text-xl font-extrabold tracking-tight flex items-center gap-2">
              <span>Créer une annonce</span>
              <span className="hidden sm:inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-brand-green/10 text-brand-green">
                TranoGasy
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 hidden xs:block">
              Complétez les informations pour publier votre bien
            </p>
          </div>
        </div>

        {/* Action Pills */}
        <div className="flex items-center gap-2">
          {/* Mobile Preview Toggle */}
          <button
            type="button"
            onClick={() => setShowMobilePreview(!showMobilePreview)}
            className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-all cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5 text-brand-green" />
            <span>{showMobilePreview ? 'Formulaire' : 'Aperçu'}</span>
          </button>

          <Link
            href="/dashboard"
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Tableau de bord
          </Link>
        </div>
      </header>

      {/* ── MAIN FULL-PAGE VIEWPORT CANVAS ── */}
      <main className="w-full px-4 sm:px-8 lg:px-12 py-6 sm:py-8">
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* ────────────── LEFT COLUMN: BORDERLESS FORM ────────────── */}
          <div className={`lg:col-span-7 xl:col-span-8 space-y-8 ${showMobilePreview ? 'hidden lg:block' : 'block'}`}>
            
            {/* Global Error Notice */}
            {formError && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs sm:text-sm animate-in fade-in">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold">Informations requises</div>
                  <div>{formError}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-10">
              
              {/* SECTION 1: TYPE D'OFFRE & BIEN */}
              <section className="space-y-5">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-green">
                    Étape 1
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    Type d'offre & Nature du bien
                  </h2>
                </div>

                {/* Vente vs Location Switches */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setType('rent')}
                    className={`flex items-center justify-center gap-3 p-4 rounded-2xl font-bold text-sm sm:text-base transition-all duration-200 cursor-pointer select-none ${
                      type === 'rent'
                        ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md scale-[1.01]'
                        : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <Key className="w-5 h-5 text-brand-green" />
                    <span>Location</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType('sale')}
                    className={`flex items-center justify-center gap-3 p-4 rounded-2xl font-bold text-sm sm:text-base transition-all duration-200 cursor-pointer select-none ${
                      type === 'sale'
                        ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-md scale-[1.01]'
                        : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <DollarSign className="w-5 h-5 text-brand-green" />
                    <span>Vente</span>
                  </button>
                </div>

                {/* Maison vs Appartement */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Catégorie du bien *
                  </label>
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button
                      type="button"
                      onClick={() => setHouseType('maison')}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl font-bold text-sm transition-all duration-200 cursor-pointer ${
                        houseType === 'maison'
                          ? 'bg-brand-green/10 text-brand-green ring-2 ring-brand-green shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <Home className="w-6 h-6" />
                      <span>Maison / Villa</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setHouseType('appartement')}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl font-bold text-sm transition-all duration-200 cursor-pointer ${
                        houseType === 'appartement'
                          ? 'bg-brand-green/10 text-brand-green ring-2 ring-brand-green shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <Building2 className="w-6 h-6" />
                      <span>Appartement</span>
                    </button>
                  </div>
                </div>

                {/* Étage (si appartement) */}
                {houseType === 'appartement' && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Étage de l'appartement *
                    </label>
                    <div className="relative">
                      <select
                        value={floor}
                        onChange={(e) => setFloor(e.target.value)}
                        className="w-full appearance-none px-4 py-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white text-sm focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 cursor-pointer"
                      >
                        <option value="">Sélectionnez l'étage</option>
                        <option value="Rez-de-chaussée">Rez-de-chaussée</option>
                        <option value="1er étage">1er étage</option>
                        <option value="2ème étage">2ème étage</option>
                        <option value="3ème étage">3ème étage</option>
                        <option value="4ème étage">4ème étage</option>
                        <option value="5ème étage ou plus">5ème étage ou plus</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Price / Rent Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      {type === 'rent' ? 'Loyer mensuel (Ariary) *' : 'Prix total de vente (Ariary) *'}
                    </label>
                    {currentPriceValue && (
                      <span className="text-xs font-bold font-mono text-brand-green">
                        {currentPriceValue.toLocaleString('fr-FR')} MGA
                      </span>
                    )}
                  </div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={currentPriceValue ? currentPriceValue.toLocaleString('fr-FR') : ''}
                      onChange={(e) => handlePriceChange(e.target.value)}
                      placeholder={type === 'rent' ? 'Ex: 1 500 000' : 'Ex: 450 000 000'}
                      className="w-full pl-4 pr-16 py-3.5 text-base sm:text-lg font-bold rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20 text-zinc-900 dark:text-white transition-all shadow-xs"
                    />
                    <span className="absolute right-4 text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider pointer-events-none">
                      {type === 'rent' ? 'Ar / mois' : 'Ar'}
                    </span>
                  </div>
                </div>
              </section>

              {/* SECTION 2: TITRE & DESCRIPTION */}
              <section className="space-y-4">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-green">
                    Étape 2
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    Présentation & Description
                  </h2>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Titre de l'annonce *
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      {title.length} / 120
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: Villa contemporaine 5 pièces avec piscine à Ivandry"
                    className="w-full px-4 py-3.5 text-sm sm:text-base rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20 text-zinc-900 dark:text-white transition-all shadow-xs"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Description détaillée
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      {description.length} / 1000
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    maxLength={1000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez l'environnement, la luminosité, les accès, la sécurité et les atouts uniques du bien..."
                    className="w-full p-4 text-sm rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20 text-zinc-900 dark:text-white transition-all resize-y shadow-xs"
                  />
                </div>
              </section>

              {/* SECTION 3: LOCALISATION */}
              <section className="space-y-4">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-green">
                    Étape 3
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    Emplacement & Coordonnées
                  </h2>
                </div>

                <ListingLocationPicker
                  selectedCity={selectedCity}
                  onSelectCity={setSelectedCity}
                  coords={coords}
                  onCoordsChange={setCoords}
                />
              </section>

              {/* SECTION 4: SPÉCIFICATIONS & PIÈCES */}
              <section className="space-y-5">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-green">
                    Étape 4
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    Caractéristiques & Pièces
                  </h2>
                </div>

                {/* Steppers Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  {/* Chambres */}
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      Chambre(s)
                    </span>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setRooms(Math.max(0, rooms - 1))}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-lg font-bold font-mono">{rooms}</span>
                      <button
                        type="button"
                        onClick={() => setRooms(rooms + 1)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Salles de bain */}
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      Salle(s) de bain / Douche
                    </span>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setBathrooms(Math.max(0, bathrooms - 1))}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-lg font-bold font-mono">{bathrooms}</span>
                      <button
                        type="button"
                        onClick={() => setBathrooms(bathrooms + 1)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* WC */}
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      Toilettes / W.C.
                    </span>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setToilet(Math.max(0, toilet - 1))}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-lg font-bold font-mono">{toilet}</span>
                      <button
                        type="button"
                        onClick={() => setToilet(toilet + 1)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Salon / Living */}
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      Living / Salon
                    </span>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setLivingRoom(Math.max(0, livingRoom - 1))}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-lg font-bold font-mono">{livingRoom}</span>
                      <button
                        type="button"
                        onClick={() => setLivingRoom(livingRoom + 1)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Cuisine */}
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      Cuisine(s)
                    </span>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setKitchen(Math.max(0, kitchen - 1))}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-lg font-bold font-mono">{kitchen}</span>
                      <button
                        type="button"
                        onClick={() => setKitchen(kitchen + 1)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Surface m² */}
                  <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                      Surface habitable
                    </span>
                    <div className="flex items-center justify-between">
                      <input
                        type="number"
                        min="0"
                        value={area || ''}
                        onChange={(e) => setArea(parseInt(e.target.value, 10) || 0)}
                        className="w-full text-center text-lg font-bold font-mono bg-transparent focus:outline-none"
                      />
                      <span className="text-xs text-zinc-400 font-bold shrink-0">m²</span>
                    </div>
                  </div>
                </div>

                {/* Emplacement WC & Douche (Intérieur / Extérieur) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                      Emplacement des W.C.
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setInsideToilet(true)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          insideToilet
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        Intérieur
                      </button>
                      <button
                        type="button"
                        onClick={() => setInsideToilet(false)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          !insideToilet
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        Extérieur
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                      Emplacement de la Douche
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setInsideBathroom(true)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          insideBathroom
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        Intérieur
                      </button>
                      <button
                        type="button"
                        onClick={() => setInsideBathroom(false)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          !insideBathroom
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 shadow-xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        Extérieur
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 5: ÉQUIPEMENTS & PRESTATIONS (34 FEATURES) */}
              <section className="space-y-4">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-green">
                    Étape 5
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    Prestations & Commodités
                  </h2>
                </div>

                <ListingAmenitiesSelector
                  features={features}
                  onToggleFeature={toggleFeature}
                />
              </section>

              {/* SECTION 6: PHOTOS GOOGLE CLOUD STORAGE */}
              <section className="space-y-4">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-green">
                    Étape 6
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    Photos de l'annonce
                  </h2>
                </div>

                <ListingImageUploader uploadState={imageUploadState} />
              </section>

              {/* SECTION 7: COORDONNÉES DE CONTACT */}
              <section className="space-y-4">
                <div className="border-b border-zinc-200/50 dark:border-zinc-800/50 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-green">
                    Étape 7
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                    Contacts & Coordonnées
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Téléphone principal *
                    </label>
                    <div className="relative flex items-center">
                      <Phone className="w-4 h-4 absolute left-3.5 text-zinc-400" />
                      <input
                        type="tel"
                        value={phone1}
                        onChange={(e) => setPhone1(e.target.value)}
                        placeholder="Ex: 034 00 000 00"
                        className="w-full pl-10 pr-4 py-3 text-sm rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Téléphone secondaire (Facultatif)
                    </label>
                    <div className="relative flex items-center">
                      <Phone className="w-4 h-4 absolute left-3.5 text-zinc-400" />
                      <input
                        type="tel"
                        value={phone2}
                        onChange={(e) => setPhone2(e.target.value)}
                        placeholder="Ex: 032 00 000 00"
                        className="w-full pl-10 pr-4 py-3 text-sm rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20"
                      />
                    </div>
                  </div>

                  {showPhone3 && (
                    <div className="space-y-1.5 sm:col-span-2 animate-in fade-in">
                      <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Téléphone 3 (Facultatif)
                      </label>
                      <div className="relative flex items-center">
                        <Phone className="w-4 h-4 absolute left-3.5 text-zinc-400" />
                        <input
                          type="tel"
                          value={phone3}
                          onChange={(e) => setPhone3(e.target.value)}
                          placeholder="Ex: 033 00 000 00"
                          className="w-full pl-10 pr-4 py-3 text-sm rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/20"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {!showPhone3 && (
                  <button
                    type="button"
                    onClick={() => setShowPhone3(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:underline cursor-pointer pt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter un 3ème numéro de contact</span>
                  </button>
                )}
              </section>

              {/* ADMIN SOURCES (IF ADMIN) */}
              {user?.role === 'admin' && (
                <section className="space-y-4 p-5 rounded-3xl bg-zinc-100/70 dark:bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Options Administrateur
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold">
                      Admin Only
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Nom de la source"
                      value={sourcesUsername}
                      onChange={(e) => setSourcesUsername(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-800 text-xs border border-zinc-200 dark:border-zinc-700 focus:outline-none"
                    />
                    <input
                      type="url"
                      placeholder="Lien source original"
                      value={sourcesLink}
                      onChange={(e) => setSourcesLink(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-800 text-xs border border-zinc-200 dark:border-zinc-700 focus:outline-none"
                    />
                    <input
                      type="url"
                      placeholder="URL Avatar source"
                      value={sourcesAvatar}
                      onChange={(e) => setSourcesAvatar(e.target.value)}
                      className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-zinc-800 text-xs border border-zinc-200 dark:border-zinc-700 focus:outline-none"
                    />
                  </div>
                </section>
              )}

              {/* ── BORDERLESS BOTTOM SUBMIT FLOATING BAR ── */}
              <div className="pt-6 pb-20 sm:pb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-sm transition-all cursor-pointer"
                >
                  Annuler & Retour
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || isImageUploading}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-brand-green hover:bg-[#6fa81a] disabled:opacity-50 text-white font-extrabold text-sm sm:text-base shadow-lg shadow-brand-green/30 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Création de votre annonce en cours...</span>
                    </>
                  ) : isImageUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>En attente des photos...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Publier mon annonce maintenant</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>

          {/* ────────────── RIGHT COLUMN: DESKTOP LIVE PREVIEW ────────────── */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 sticky top-22 space-y-6">
            <div className="space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
                Aperçu de publication
              </h3>
              <p className="text-xs text-zinc-500">
                Visualisez votre annonce telle qu'elle apparaîtra sur TranoGasy.
              </p>
            </div>

            <ListingLivePreviewCard
              title={title}
              description={description}
              type={type}
              houseType={houseType}
              floor={floor}
              price={price}
              rent={rent}
              area={area}
              rooms={rooms}
              bathrooms={bathrooms}
              toilet={toilet}
              images={images}
              cityLabel={
                selectedCity
                  ? `${selectedCity.fokontany}, ${selectedCity.commune}`
                  : undefined
              }
              features={features}
            />

            {/* Quick Tips */}
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
              <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-green" />
                <span>Conseils pour maximiser vos contacts</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 leading-relaxed">
                <li>Ajoutez au moins 3 à 5 photos bien éclairées.</li>
                <li>Précisez la situation exacte de la propriété sur la carte.</li>
                <li>Cochez tous les équipements pour apparaître dans les filtres.</li>
              </ul>
            </div>
          </div>

          {/* ────────────── MOBILE PREVIEW MODAL ────────────── */}
          {showMobilePreview && (
            <div className="lg:hidden col-span-1 fixed inset-0 z-50 bg-black/60 backdrop-blur-md p-4 overflow-y-auto flex items-center justify-center">
              <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-4 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-bold">Aperçu mobile</h3>
                  <button
                    type="button"
                    onClick={() => setShowMobilePreview(false)}
                    className="p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ListingLivePreviewCard
                  title={title}
                  description={description}
                  type={type}
                  houseType={houseType}
                  floor={floor}
                  price={price}
                  rent={rent}
                  area={area}
                  rooms={rooms}
                  bathrooms={bathrooms}
                  toilet={toilet}
                  images={images}
                  cityLabel={
                    selectedCity
                      ? `${selectedCity.fokontany}, ${selectedCity.commune}`
                      : undefined
                  }
                  features={features}
                />
                <button
                  type="button"
                  onClick={() => setShowMobilePreview(false)}
                  className="w-full py-3 rounded-xl bg-brand-green text-white font-bold text-xs"
                >
                  Revenir au formulaire
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

