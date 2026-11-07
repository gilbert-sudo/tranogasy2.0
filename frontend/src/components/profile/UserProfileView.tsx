'use client';

import React, { useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Camera,
  MapPin,
  Phone,
  Share2,
  Check,
  Sparkles,
  Building2,
  Calendar,
  Search,
  X,
  Copy,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Loader2,
  ExternalLink,
  Settings,
} from 'lucide-react';
import Header from '@/components/Header';
import PropertyCard from '@/components/PropertyCard';
import { useUserProfile, COVER_PRESETS } from '@/hooks/useUserProfile';
import { ProfileListingTab } from '@/store/profileStore';

interface UserProfileViewProps {
  identifier?: string;
  sourceName?: string | null;
}

function formatMemberSince(dateStr?: string): string {
  if (!dateStr) return 'Membre vérifié';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Membre vérifié';
  return date.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatLastActive(dateStr?: string): string {
  if (!dateStr) return 'Actif sur TranoGasy';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Actif sur TranoGasy';
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Actif aujourd'hui";
  if (diffDays === 1) return 'Actif hier';
  if (diffDays < 30) return `Actif il y a ${diffDays} j`;
  return 'Membre actif';
}

export default function UserProfileView({
  identifier,
  sourceName,
}: UserProfileViewProps) {
  const router = useRouter();
  const {
    profileUser,
    isOwnProfile,
    stats,
    properties,
    filteredProperties,
    activeTab,
    searchQuery,
    isEditModalOpen,
    isLoading,
    error,
    isSavingProfile,
    isUploadingCover,
    isUploadingAvatar,
    uploadProgress,
    setActiveTab,
    setSearchQuery,
    setIsEditModalOpen,
    saveProfileChanges,
    uploadAndSaveCover,
    uploadAndSaveAvatar,
  } = useUserProfile(identifier, sourceName);

  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // Edit form local state
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState<string | null>(null);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Open Edit Modal and seed current values
  const handleOpenEditModal = () => {
    if (!profileUser) return;
    setEditUsername(profileUser.username || '');
    setEditBio(profileUser.bio || '');
    setEditLocation(
      profileUser.location ||
        (stats.activeCommunes.length > 0
          ? `${stats.activeCommunes[0]}, Madagascar`
          : 'Antananarivo, Madagascar')
    );
    setEditCoverUrl(profileUser.coverImage || null);
    setIsEditModalOpen(true);
  };

  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfileChanges({
      username: editUsername,
      bio: editBio,
      location: editLocation,
      coverImage: editCoverUrl,
    });
    setIsEditModalOpen(false);
  };

  const handleDirectCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const uploadedUrl = await uploadAndSaveCover(file);
    if (uploadedUrl) {
      setEditCoverUrl(uploadedUrl);
    }
    e.target.value = '';
  };

  const handleDirectAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAndSaveAvatar(file);
    e.target.value = '';
  };

  // Resolve cover image: user's custom coverImage -> fallbackCoverImage from their property -> default cover
  const activeCoverUrl =
    profileUser?.coverImage ||
    profileUser?.fallbackCoverImage ||
    COVER_PRESETS[0].url;

  // Resolve avatar image
  const activeAvatarUrl =
    profileUser?.avatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      profileUser?.username || 'U'
    )}&background=18181b&color=ffffff&size=256&bold=true`;

  // Collect all unique phone numbers for this user / advertiser
  const availablePhones = useMemo(() => {
    const list: string[] = [];
    if (profileUser?.phone) list.push(String(profileUser.phone).trim());
    properties.forEach((p) => {
      if (p.phone1) list.push(String(p.phone1).trim());
      if (p.phone2) list.push(String(p.phone2).trim());
      if (p.phone3) list.push(String(p.phone3).trim());
    });
    return Array.from(new Set(list.filter(Boolean))).slice(0, 4);
  }, [profileUser?.phone, properties]);

  const displayLocation =
    profileUser?.location ||
    (stats.activeCommunes.length > 0
      ? `${stats.activeCommunes.slice(0, 2).join(' • ')}, Madagascar`
      : 'Antananarivo, Madagascar');

  const handleShareProfile = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${profileUser?.username || 'Profil'} — TranoGasy`,
          text: `Découvrez le profil et les annonces de ${profileUser?.username || 'cet annonceur'} sur TranoGasy.`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2500);
      }
    } catch {
      // User cancelled share sheet
    }
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone.replace(/\s+/g, ''));
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  if (isLoading && !profileUser) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-outfit">
        <Header />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 animate-pulse">
          <div className="h-64 sm:h-80 md:h-96 w-full rounded-[2.5rem] bg-zinc-200 dark:bg-zinc-800/80" />
          <div className="max-w-4xl mx-auto -mt-20 px-4">
            <div className="rounded-[2.5rem] bg-white dark:bg-zinc-900 p-8 border border-zinc-200/60 dark:border-white/10 shadow-xl">
              <div className="w-32 h-32 rounded-full bg-zinc-200 dark:bg-zinc-800 -mt-20 mb-4 border-4 border-white dark:border-zinc-900" />
              <div className="h-8 w-56 rounded-full bg-zinc-200 dark:bg-zinc-800 mb-3" />
              <div className="h-4 w-80 rounded-full bg-zinc-100 dark:bg-zinc-800/60 mb-6" />
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50" />
                <div className="h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50" />
                <div className="h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !profileUser) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-outfit flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-[2.5rem] p-8 sm:p-10 text-center bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 shadow-xl">
            <div className="w-16 h-16 rounded-full bg-brand-green/15 text-brand-green flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-7 h-7 stroke-[1.6]" />
            </div>
            <h2 className="text-xl font-medium text-zinc-900 dark:text-white mb-2">
              Profil introuvable
            </h2>
            <p className="text-sm font-light text-zinc-500 dark:text-zinc-400 mb-7">
              {error}
            </p>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-8 py-4 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-light text-sm tracking-wide hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-zinc-950 pb-28 font-outfit selection:bg-brand-green/20">
      <Header />

      {/* Hidden File Inputs for Direct Cover & Avatar Uploads */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleDirectCoverFileChange}
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleDirectAvatarFileChange}
      />

      {/* ══════════════════════════════════════════════════════════════════
          1. CINEMATIC BACKGROUND COVER PICTURE BANNER
      ══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1680px] mx-auto sm:px-6 md:px-8 lg:px-16 pt-0 sm:pt-5">
        <div className="relative h-64 sm:h-80 md:h-96 w-full sm:rounded-[2.75rem] overflow-hidden bg-zinc-900 shadow-[0_20px_60px_rgba(0,0,0,0.12)] group">
          {/* Background Cover Image */}
          <img
            src={activeCoverUrl}
            alt={`Couverture de ${profileUser?.username || 'profil'}`}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          />

          {/* Multi-layer Ambient Gradient Vignette */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/65 pointer-events-none" />

          {/* Upload Progress Overlay when uploading a new cover */}
          {isUploadingCover && (
            <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center gap-3 text-white">
              <Loader2 className="w-8 h-8 animate-spin text-brand-green" />
              <span className="text-sm font-light tracking-wider">
                Mise à jour de la photo de couverture ({uploadProgress}%)…
              </span>
            </div>
          )}

          {/* Top Floating Action Bar inside Cover */}
          <div className="absolute top-4 sm:top-6 inset-x-4 sm:inset-x-7 z-20 flex items-center justify-between gap-3">
            {/* Back Button (Big Padding, Thin Font, Ultra-Rounded) */}
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-2.5 px-5 sm:px-6 py-3 sm:py-3.5 rounded-full
                bg-black/45 hover:bg-black/65 backdrop-blur-2xl
                border border-white/25 text-white
                font-light text-xs sm:text-sm tracking-wider
                shadow-[0_8px_28px_rgba(0,0,0,0.28)]
                hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 stroke-[1.8]" />
              <span>Retour</span>
            </button>

            {/* Right Cover Controls */}
            <div className="flex items-center gap-2.5">
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={isUploadingCover}
                  className="flex items-center gap-2.5 px-5 sm:px-6 py-3 sm:py-3.5 rounded-full
                    bg-white/90 hover:bg-white text-zinc-950 backdrop-blur-2xl
                    border border-white
                    font-light text-xs sm:text-sm tracking-wide
                    shadow-[0_8px_28px_rgba(0,0,0,0.25)]
                    hover:scale-105 active:scale-95 transition-all cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-brand-green stroke-[1.8]" />
                  <span className="hidden sm:inline">Changer la couverture</span>
                  <span className="sm:hidden">Couverture</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleShareProfile}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-full
                  bg-black/45 hover:bg-black/65 backdrop-blur-2xl
                  border border-white/25 text-white
                  font-light text-xs sm:text-sm tracking-wider
                  shadow-[0_8px_28px_rgba(0,0,0,0.28)]
                  hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                {copiedShare ? (
                  <>
                    <Check className="w-4 h-4 text-brand-green" />
                    <span>Copié</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 stroke-[1.8]" />
                    <span className="hidden sm:inline">Partager</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          2. MINIMALIST LIQUID-GLASS IDENTITY CARD
      ══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 sm:-mt-24 relative z-20">
        <div
          className="rounded-[2.5rem] sm:rounded-[2.75rem] p-6 sm:p-8 md:p-10
            bg-white/92 dark:bg-zinc-900/92 backdrop-blur-3xl
            border border-white/90 dark:border-white/10
            shadow-[0_24px_70px_rgba(0,0,0,0.08)] dark:shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
        >
          {/* Top Row: Avatar + Core Identity + Primary CTA Buttons */}
          <div className="flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
            {/* Avatar & Name Column */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-7 text-center sm:text-left w-full md:w-auto">
              {/* Circular Avatar with Cover Overlap */}
              <div className="relative -mt-20 sm:-mt-24 shrink-0 group/avatar">
                <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-full p-1 bg-white dark:bg-zinc-900 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
                  <div className="relative w-full h-full rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                    <img
                      src={activeAvatarUrl}
                      alt={profileUser?.username || 'Utilisateur'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          profileUser?.username || 'U'
                        )}&background=18181b&color=ffffff&size=256&bold=true`;
                      }}
                    />

                    {isUploadingAvatar && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-brand-green" />
                      </div>
                    )}
                  </div>

                  {/* Active Pulse Dot */}
                  <span
                    title={formatLastActive(profileUser?.lastConnectedAt)}
                    className="absolute bottom-2.5 right-2.5 w-4 h-4 rounded-full bg-brand-green ring-4 ring-white dark:ring-zinc-900"
                  />

                  {/* Edit Avatar Trigger for Own Profile */}
                  {isOwnProfile && (
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      title="Changer la photo de profil"
                      className="absolute bottom-1 right-1 w-10 h-10 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 flex items-center justify-center shadow-lg border-2 border-white dark:border-zinc-900 hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Name, Handle & Verified Badge */}
              <div className="min-w-0 pt-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-medium text-zinc-900 dark:text-white tracking-tight truncate max-w-full">
                    {profileUser?.username || 'Utilisateur'}
                  </h1>

                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-brand-green/12 text-brand-green border border-brand-green/25 text-xs font-light tracking-wide">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>
                      {profileUser?.role === 'admin'
                        ? 'Officiel TranoGasy'
                        : stats.totalListings > 0
                        ? 'Annonceur Vérifié'
                        : 'Membre Vérifié'}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs sm:text-sm font-light text-zinc-500 dark:text-zinc-400 mt-1.5">
                  <span>
                    @{(profileUser?.username || 'membre').toLowerCase().replace(/\s+/g, '')}
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    {formatMemberSince(profileUser?.created_at)}
                  </span>
                  <span>•</span>
                  <span className="text-brand-green font-normal">
                    {formatLastActive(profileUser?.lastConnectedAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Action Pills (Big Padding, Thin Font, Ultra-Rounded) */}
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 w-full md:w-auto">
              {isOwnProfile ? (
                <>
                  <button
                    type="button"
                    onClick={handleOpenEditModal}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2.5
                      px-7 py-4 rounded-full
                      bg-zinc-950 dark:bg-white text-white dark:text-zinc-950
                      font-light text-xs sm:text-sm tracking-wider
                      shadow-[0_12px_30px_rgba(0,0,0,0.16)]
                      hover:scale-103 active:scale-95 transition-all cursor-pointer"
                  >
                    <SlidersHorizontal className="w-4 h-4 text-brand-green stroke-[1.8]" />
                    <span>Personnaliser le profil</span>
                  </button>

                  <Link
                    href="/account"
                    className="flex items-center justify-center gap-2
                      px-6 py-4 rounded-full
                      bg-zinc-100 dark:bg-zinc-800/90 text-zinc-800 dark:text-zinc-200
                      border border-zinc-200/80 dark:border-white/10
                      font-light text-xs sm:text-sm tracking-wider
                      hover:bg-zinc-200/70 dark:hover:bg-zinc-800 active:scale-95 transition-all"
                  >
                    <Settings className="w-4 h-4 stroke-[1.75]" />
                    <span>Mon compte</span>
                  </Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsContactModalOpen(true)}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2.5
                      px-8 py-4 rounded-full
                      bg-zinc-950 dark:bg-white text-white dark:text-zinc-950
                      font-light text-xs sm:text-sm tracking-wider
                      shadow-[0_12px_30px_rgba(0,0,0,0.18)]
                      hover:scale-103 active:scale-95 transition-all cursor-pointer"
                  >
                    <Phone className="w-4 h-4 text-brand-green stroke-[1.8]" />
                    <span>Contacter</span>
                  </button>

                  {availablePhones[0] && (
                    <a
                      href={`sms:${availablePhones[0].replace(/\s+/g, '')}`}
                      className="flex items-center justify-center gap-2
                        px-7 py-4 rounded-full
                        bg-zinc-100 dark:bg-zinc-800/90 text-zinc-800 dark:text-zinc-200
                        border border-zinc-200/80 dark:border-white/10
                        font-light text-xs sm:text-sm tracking-wider
                        hover:border-brand-green/50 active:scale-95 transition-all"
                    >
                      <MessageSquare className="w-4 h-4 text-brand-green stroke-[1.75]" />
                      <span>Message</span>
                    </a>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Bio & Core Info Pills */}
          <div className="mt-6 pt-6 border-t border-zinc-200/60 dark:border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <p className="text-sm sm:text-base font-light text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {profileUser?.bio ||
                  `Bienvenue sur le profil TranoGasy de ${
                    profileUser?.username || 'cet utilisateur'
                  }. Découvrez ses biens immobiliers disponibles à la location et à la vente à Madagascar.`}
              </p>

              {/* Core Metadata Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100/90 dark:bg-zinc-800/80 text-xs font-light text-zinc-700 dark:text-zinc-300">
                  <MapPin className="w-3.5 h-3.5 text-brand-green shrink-0" />
                  <span className="capitalize">{displayLocation}</span>
                </div>

                {availablePhones[0] && (
                  <button
                    type="button"
                    onClick={() => handleCopyPhone(availablePhones[0])}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-brand-green/15 hover:text-brand-green text-xs font-light text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5 text-brand-green shrink-0" />
                    <span>{availablePhones[0]}</span>
                    {copiedPhone === availablePhones[0] ? (
                      <Check className="w-3 h-3 text-brand-green" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-60" />
                    )}
                  </button>
                )}

                {profileUser?.sourceLink && (
                  <a
                    href={profileUser.sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-100/90 dark:bg-zinc-800/80 hover:text-brand-green text-xs font-light text-zinc-600 dark:text-zinc-300 transition-colors"
                  >
                    <span>Source externe</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Minimalist 3-Column Metrics Capsule */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 p-2.5 sm:p-3 rounded-[2rem] bg-zinc-100/80 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-white/5 shrink-0">
              <div className="px-4 sm:px-6 py-2.5 text-center rounded-[1.5rem] bg-white dark:bg-zinc-900 shadow-2xs">
                <div className="text-xl sm:text-2xl font-normal text-zinc-900 dark:text-white">
                  {stats.totalListings}
                </div>
                <div className="text-[11px] font-light text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mt-0.5">
                  Annonces
                </div>
              </div>

              <div className="px-4 sm:px-6 py-2.5 text-center rounded-[1.5rem] bg-white dark:bg-zinc-900 shadow-2xs">
                <div className="text-xl sm:text-2xl font-normal text-brand-green">
                  {stats.rentCount}
                </div>
                <div className="text-[11px] font-light text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mt-0.5">
                  Locations
                </div>
              </div>

              <div className="px-4 sm:px-6 py-2.5 text-center rounded-[1.5rem] bg-white dark:bg-zinc-900 shadow-2xs">
                <div className="text-xl sm:text-2xl font-normal text-zinc-900 dark:text-white">
                  {stats.saleCount}
                </div>
                <div className="text-[11px] font-light text-zinc-500 dark:text-zinc-400 tracking-wider uppercase mt-0.5">
                  Ventes
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          3. USER'S PUBLISHED PROPERTIES PORTFOLIO
      ══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[2000px] mx-auto px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36 mt-8 sm:mt-10">
        {/* Filter Tabs + Search within user's listings */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          {/* Ultra-Rounded Filter Tabs */}
          <div className="inline-flex items-center p-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 shadow-xs self-start">
            {(
              [
                { id: 'all', label: `Tous (${stats.totalListings})` },
                { id: 'rent', label: `Locations (${stats.rentCount})` },
                { id: 'sale', label: `Ventes (${stats.saleCount})` },
              ] as { id: ProfileListingTab; label: string }[]
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 sm:px-6 py-2.5 rounded-full text-xs sm:text-sm tracking-wide transition-all cursor-pointer ${
                    active
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-normal shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 font-light hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Minimalist Search Input for User's Portfolio */}
          {properties.length > 2 && (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer ses annonces…"
                className="w-full h-11 pl-10 pr-9 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/10 text-xs sm:text-sm font-light text-zinc-900 dark:text-white placeholder:text-zinc-400 outline-none focus:border-brand-green transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Listings Grid or Minimalist Empty State */}
        {filteredProperties.length === 0 ? (
          <div className="rounded-[2.5rem] p-10 sm:p-14 text-center bg-white/80 dark:bg-zinc-900/70 border border-zinc-200/70 dark:border-white/10">
            <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-6 h-6 stroke-[1.5]" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-1">
              {properties.length === 0
                ? 'Aucune annonce publiée pour le moment'
                : 'Aucune annonce dans cette catégorie'}
            </h3>
            <p className="text-sm font-light text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              {properties.length === 0
                ? `${
                    profileUser?.username || 'Cet utilisateur'
                  } n'a pas encore publié de propriété publique.`
                : 'Essayez de changer de filtre pour voir ses autres biens immobiliers.'}
            </p>
            {isOwnProfile && properties.length === 0 && (
              <Link
                href="/create-listing"
                className="inline-flex items-center gap-2 mt-6 px-7 py-3.5 rounded-full bg-brand-green text-white font-light text-sm tracking-wide shadow-[0_8px_24px_rgba(114,193,70,0.3)] hover:scale-105 active:scale-95 transition-all"
              >
                <span>Publier ma première annonce</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6">
            {filteredProperties.map((property) => (
              <PropertyCard key={property._id} property={property} />
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          4. PROFILE & BACKGROUND COVER STUDIO MODAL (For Own Profile)
      ══════════════════════════════════════════════════════════════════ */}
      {isEditModalOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsEditModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xl max-h-[90dvh] overflow-y-auto no-scrollbar
              rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 sm:p-8
              bg-white dark:bg-zinc-900
              border border-zinc-200/80 dark:border-white/15
              shadow-[0_24px_80px_rgba(0,0,0,0.4)]"
          >
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-lg sm:text-xl font-medium text-zinc-900 dark:text-white">
                  Personnaliser mon profil public
                </h3>
                <p className="text-xs font-light text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Modifiez votre photo de couverture, votre biographie et vos informations visibles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditModal} className="space-y-6">
              {/* Cover Image Preview & Presets */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Photo de couverture
                  </label>
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={isUploadingCover}
                    className="inline-flex items-center gap-1.5 text-xs font-normal text-brand-green hover:underline cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Importer une image</span>
                  </button>
                </div>

                {/* Live Cover Preview inside Modal */}
                <div className="relative h-36 w-full rounded-[1.75rem] overflow-hidden bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                  <img
                    src={editCoverUrl || activeCoverUrl}
                    alt="Aperçu couverture"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="absolute bottom-3 right-3 px-4 py-2 rounded-full bg-black/65 hover:bg-black/80 text-white backdrop-blur-md text-xs font-light flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-brand-green" />
                    <span>Téléverser ma photo</span>
                  </button>
                </div>

                {/* Curated Cover Gallery Presets */}
                <div>
                  <span className="text-[11px] font-light text-zinc-400 block mb-2">
                    Ou choisissez une couverture architecturale :
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {COVER_PRESETS.map((preset) => {
                      const isSelected = editCoverUrl === preset.url;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setEditCoverUrl(preset.url)}
                          className={`relative h-14 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-brand-green scale-105 shadow-md'
                              : 'border-transparent opacity-75 hover:opacity-100'
                          }`}
                          title={preset.label}
                        >
                          <img
                            src={preset.url}
                            alt={preset.label}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Nom d&apos;affichage
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Votre nom ou agence"
                  className="w-full h-12 px-5 rounded-full bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-white/10 text-sm font-light text-zinc-900 dark:text-white outline-none focus:border-brand-green"
                />
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Ville / Localisation
                </label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Ex: Antananarivo, Madagascar"
                  className="w-full h-12 px-5 rounded-full bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-white/10 text-sm font-light text-zinc-900 dark:text-white outline-none focus:border-brand-green"
                />
              </div>

              {/* Bio */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Biographie
                </label>
                <textarea
                  rows={3}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Présentez-vous en quelques mots (ex: Agent immobilier spécialisé à Antananarivo…)"
                  className="w-full p-4 rounded-[1.5rem] bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-white/10 text-sm font-light text-zinc-900 dark:text-white outline-none focus:border-brand-green resize-none"
                />
              </div>

              {/* Submit Actions (Big Padding, Thin Font, Ultra-Rounded) */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-6 py-3.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-light text-xs sm:text-sm tracking-wide cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-8 py-3.5 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-light text-xs sm:text-sm tracking-wider shadow-lg hover:scale-103 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-brand-green" />
                      <span>Enregistrement…</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 text-brand-green" />
                      <span>Enregistrer</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          5. DIRECT CONTACT MODAL (When clicking "Contacter")
      ══════════════════════════════════════════════════════════════════ */}
      {isContactModalOpen && (
        <div
          className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsContactModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-white/15 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <img
                  src={activeAvatarUrl}
                  alt={profileUser?.username || 'Annonceur'}
                  className="w-12 h-12 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                />
                <div>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-brand-green block">
                    Contact Direct
                  </span>
                  <h4 className="text-lg font-medium text-zinc-900 dark:text-white">
                    {profileUser?.username}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsContactModalOpen(false)}
                className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {availablePhones.length > 0 ? (
              <div className="space-y-2.5">
                {availablePhones.map((phone, idx) => {
                  const cleanTel = phone.replace(/\s+/g, '');
                  const isCopied = copiedPhone === phone;
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-3 rounded-full bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/70 dark:border-white/10"
                    >
                      <a
                        href={`tel:${cleanTel}`}
                        className="flex items-center gap-3 pl-2 text-sm sm:text-base font-medium text-zinc-900 dark:text-white hover:text-brand-green transition-colors"
                      >
                        <Phone className="w-4 h-4 text-brand-green" />
                        <span>{phone}</span>
                      </a>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyPhone(phone)}
                          className="w-9 h-9 rounded-full bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-200 hover:text-brand-green cursor-pointer"
                          title="Copier"
                        >
                          {isCopied ? (
                            <Check className="w-4 h-4 text-brand-green" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <a
                          href={`tel:${cleanTel}`}
                          className="px-5 py-2 rounded-full bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 font-light text-xs tracking-wider"
                        >
                          Appeler
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-5 rounded-3xl bg-zinc-100 dark:bg-zinc-800/70 text-center text-sm font-light text-zinc-500 dark:text-zinc-400">
                Aucun numéro de téléphone public n&apos;est affiché sur ce profil.
              </div>
            )}

            <div className="flex items-center gap-2.5 p-3.5 rounded-3xl bg-brand-green/10 border border-brand-green/20 text-xs font-light text-brand-green">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                Précisez que vous contactez via <strong>TranoGasy</strong> pour une réponse rapide.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

