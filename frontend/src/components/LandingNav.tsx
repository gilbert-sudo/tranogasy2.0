'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Search,
  MapPin,
  Bell,
  Building2,
  Home,
  Building,
  Landmark,
  Globe,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  User,
  Check,
} from 'lucide-react';
import { useModalStore } from '@/store/modalStore';
import { useUserStore } from '@/store/userStore';

const SCROLL_THRESHOLD = 180;

// Categories matching Image 2
const CATEGORIES = [
  { id: 'apartment', name: 'Appartement', icon: Building2 },
  { id: 'home',      name: 'Maison',      icon: Home },
  { id: 'office',    name: 'Bureau',      icon: Building },
  { id: 'villa',     name: 'Villa',       icon: Landmark },
  { id: 'tous',      name: 'Tous',        icon: Globe },
];

// Available locations
const CITIES = [
  'Antananarivo, Madagascar',
  'Toamasina, Madagascar',
  'Antsirabe, Madagascar',
  'Mahajanga, Madagascar',
  'Fianarantsoa, Madagascar',
  'Toliara, Madagascar',
  'Antsiranana, Madagascar',
  'Nosy Be, Madagascar',
];

export default function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeCategory, setActiveCategory] = useState('Appartement');
  const [selectedLocation, setSelectedLocation] = useState('Antananarivo, Madagascar');
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  const desktopLocationDropdownRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const openModal = useModalStore((state) => state.openModal);
  const { user, initialize } = useUserStore();
  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;
  const userName = currentUser?.username || currentUser?.firstName || '';

  const checkScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 2);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    initialize();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideMobile = locationDropdownRef.current?.contains(target);
      const clickedInsideDesktop = desktopLocationDropdownRef.current?.contains(target);

      if (!clickedInsideMobile && !clickedInsideDesktop) {
        setIsLocationOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('resize', checkScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [checkScroll, initialize]);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 260;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const handleScroll = useCallback(() => {
    const y = window.scrollY;
    setScrollProgress(Math.min(y / SCROLL_THRESHOLD, 1));
    setIsScrolled(y > SCROLL_THRESHOLD);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <>
      {/* ── Fixed Liquid Glass Header ── */}
      <header
        className="fixed inset-x-0 top-0 z-50 overflow-hidden"
        style={{
          height: isScrolled ? 'var(--nav-h, 64px)' : 'var(--hero-h, 305px)',
          transition: 'height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)',
        } as React.CSSProperties}
      >
        {/* Responsive CSS vars */}
        <style>{`
          :root {
            --hero-h: 305px;
            --nav-h: 64px;
          }
          @media (min-width: 768px) {
            :root {
              --hero-h: 335px;
              --nav-h: 64px;
            }
          }
          @media (min-width: 1024px) {
            :root {
              --hero-h: 360px;
              --nav-h: 64px;
            }
          }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>

        {/* ── Liquid Glass Mesh Canvas (Fades smoothly on scroll) ── */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none transition-opacity duration-300"
          style={{ opacity: 1 - scrollProgress }}
        >
          {/* Soft base liquid gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#edf2f8] via-[#f2f5f9] to-zinc-50 dark:from-[#090d16] dark:via-[#0c1322] dark:to-zinc-950" />

          {/* Ambient glass glow orbs */}
          <div className="absolute -top-16 -left-16 w-80 h-80 rounded-full bg-sky-200/50 dark:bg-sky-900/20 blur-3xl" />
          <div className="absolute top-10 right-4 w-72 h-72 rounded-full bg-emerald-200/40 dark:bg-emerald-900/15 blur-3xl" />
          <div className="absolute top-36 left-1/3 w-96 h-96 rounded-full bg-indigo-100/40 dark:bg-indigo-950/20 blur-3xl" />
        </div>

        {/* ── Frosted glass nav bar (Fades in on scroll) ── */}
        <div
          className="absolute inset-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60 shadow-sm"
          style={{ opacity: scrollProgress, transition: 'opacity 0.3s' }}
        />

        {/* ── Container ── */}
        <div className={`relative z-10 h-full flex flex-col ${isScrolled ? 'justify-center' : ''} w-full max-w-[2000px] mx-auto px-4 sm:px-6 md:px-8 lg:px-28 xl:px-32 2xl:px-36`}>
          
          {/* ══════════════════════════════════════════════════════════
              TOP ROW: Greeting / Location & Liquid Glass Bell + Actions
          ══════════════════════════════════════════════════════════ */}
          <div
            className={`flex items-center w-full ${isScrolled ? 'gap-2 sm:gap-3.5 justify-start' : 'justify-between'}`}
            style={{
              paddingTop: isScrolled ? '0' : '16px',
              height: isScrolled ? '100%' : 'auto',
              transition: 'padding-top 0.4s',
            }}
          >
            {/* Scrolled Logo or Desktop Branded Logo */}
            <div className={`items-center gap-2 flex-shrink-0 -ml-1 sm:ml-0 ${isScrolled ? 'flex' : 'hidden md:flex'}`}>
              <Link href="/" className="flex items-center gap-2.5 group">
                <div
                  className="relative flex h-11 w-11 items-center justify-center rounded-full
                    bg-white dark:bg-white backdrop-blur-xl
                    border border-zinc-200/80 dark:border-white/20
                    shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]
                    hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                >
                  <div className="relative w-[34px] h-[34px] rounded-full overflow-hidden">
                    <Image src="/assets/icon-512.png" alt="TranoGasy" fill className="object-contain rounded-full" priority />
                  </div>
                </div>
                <span className="font-extrabold tracking-tight text-lg sm:text-xl leading-none">
                  <span className="text-brand-green">Trano</span>
                  <span className="text-zinc-900 dark:text-white">Gasy.</span>
                </span>
              </Link>
            </div>

            {/* Expanded: Top Greeting + Location selector with App Logo (Mobile only) */}
            <div
              className={`items-center gap-2.5 sm:gap-3 min-w-0 md:hidden -ml-1 sm:ml-0 ${isScrolled ? 'hidden' : 'flex'}`}
              style={{
                opacity: 1 - scrollProgress * 3,
                transition: 'opacity 0.2s',
              }}
            >
              {/* App Logo (Mobile only) */}
              <Link
                href="/"
                className="relative flex h-11 w-11 items-center justify-center rounded-full
                  bg-white dark:bg-white backdrop-blur-xl
                  border border-zinc-200/80 dark:border-white/20
                  shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]
                  hover:scale-105 active:scale-95 transition-all flex-shrink-0"
              >
                <div className="relative w-[34px] h-[34px] rounded-full overflow-hidden">
                  <Image src="/assets/icon-512.png" alt="TranoGasy" fill className="object-contain rounded-full" priority />
                </div>
              </Link>

              {/* User greeting & Location */}
              <div className="flex flex-col min-w-0">
                {/* User greeting */}
                {isLoggedIn && userName ? (
                  <h2 className="text-[16px] sm:text-[17px] font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight leading-snug truncate">
                    Bonjour, {userName}
                  </h2>
                ) : (
                  <button
                    type="button"
                    onClick={() => openModal('login')}
                    className="text-[16px] sm:text-[17px] font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight leading-snug truncate hover:text-brand-green transition-colors text-left cursor-pointer"
                  >
                    Bienvenue !
                  </button>
                )}

                {/* Location Selector */}
                <div className="relative" ref={locationDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsLocationOpen(!isLocationOpen)}
                    className="flex items-center gap-1 text-[12.5px] sm:text-[13px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors mt-0.5 cursor-pointer group"
                  >
                    <MapPin className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 transition-colors flex-shrink-0" />
                    <span className="truncate max-w-[130px] sm:max-w-[180px]">{selectedLocation}</span>
                    <ChevronDown
                      className={`h-3 w-3 text-zinc-400 transition-transform duration-200 ${
                        isLocationOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                {/* Liquid Glass Location Dropdown */}
                {isLocationOpen && (
                  <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.12)] z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Sélectionner une ville
                    </div>
                    <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto scrollbar-hide">
                      {CITIES.map((city) => (
                        <button
                          key={city}
                          type="button"
                          onClick={() => {
                            setSelectedLocation(city);
                            setIsLocationOpen(false);
                          }}
                          className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl text-left transition-colors cursor-pointer ${
                            selectedLocation === city
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold'
                              : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <span className="truncate">{city}</span>
                          {selectedLocation === city && (
                            <Check className="h-3.5 w-3.5 text-zinc-900 dark:text-white flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

            {/* ── CENTER: Collapsed search bar (scrolled only - DESKTOP / TABLET) ── */}
            <div
              className={`hidden md:flex justify-center items-center min-w-0 transition-all duration-300 ease-out ${
                isScrolled
                  ? 'opacity-100 scale-100 pointer-events-auto flex-1'
                  : 'opacity-0 scale-90 pointer-events-none flex-0 w-0'
              }`}
            >
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 w-full
                  bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md
                  max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl
                  shadow-sm min-w-0
                  ${searchFocused ? 'ring-2 ring-zinc-400 dark:ring-zinc-600' : 'ring-1 ring-zinc-200/80 dark:ring-zinc-700/80'}`}
              >
                <Search className="h-4 w-4 flex-shrink-0 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Rechercher une ville, quartier…"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="flex-1 bg-transparent text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400 outline-none min-w-0"
                />
                <button
                  aria-label="Filtres"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 transition-transform active:scale-90 cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="21" y1="6" x2="13" y2="6" /><line x1="9" y1="6" x2="3" y2="6" /><circle cx="11" cy="6" r="2" />
                    <line x1="21" y1="12" x2="17" y2="12" /><line x1="13" y1="12" x2="3" y2="12" /><circle cx="15" cy="12" r="2" />
                    <line x1="21" y1="18" x2="9" y2="18" /><line x1="5" y1="18" x2="3" y2="18" /><circle cx="7" cy="18" r="2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── RIGHT: Actions & Mobile Search Button ── */}
            <div className={`flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0 ${isScrolled ? 'ml-auto' : ''}`}>
              {/* Liquid Glass Circular Notification Button matching Image 2 */}
              <button
                id="notif-btn"
                aria-label="Notifications"
                className="relative flex h-11 w-11 items-center justify-center rounded-full
                  bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
                  border border-white/80 dark:border-white/10
                  shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
                  text-zinc-800 dark:text-zinc-200
                  hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-brand-red ring-2 ring-white dark:ring-zinc-800" />
              </button>

              {/* Mobile-only Shiny Dark Search Button positioned between notification and avatar */}
              <div
                className={`flex md:hidden items-center transition-all duration-300 ease-out ${
                  isScrolled
                    ? 'opacity-100 scale-100 pointer-events-auto'
                    : 'opacity-0 scale-90 pointer-events-none w-0 overflow-hidden'
                }`}
              >
                <button
                  type="button"
                  id="mobile-top-nav-search-btn"
                  aria-label="Rechercher"
                  onClick={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    setTimeout(() => inputRef.current?.focus(), 400);
                  }}
                  className="relative h-11 px-3.5 rounded-full flex items-center gap-2 flex-shrink-0 transition-all duration-200 active:scale-95 cursor-pointer
                    bg-gradient-to-b from-zinc-800 via-zinc-900 to-black text-white
                    border border-white/20 dark:border-white/25
                    shadow-[0_4px_20px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)]
                    hover:from-zinc-700 hover:to-zinc-950 hover:border-white/30
                    group"
                >
                  <Search className="h-4 w-4 text-white/90 group-hover:text-brand-green group-hover:scale-110 transition-all duration-200 flex-shrink-0" />
                  <span className="text-xs font-semibold tracking-tight text-white">
                    Rechercher
                  </span>
                </button>
              </div>

              {/* Mobile (always) or Scrolled Desktop: Standalone Circular User Profile Avatar / Login */}
              <div className={`-mr-1 sm:mr-0 ${isScrolled ? 'flex' : 'flex md:hidden'}`}>
                {isLoggedIn ? (
                  <Link
                    href="/account"
                    aria-label="Mon compte"
                    className="flex h-11 w-11 items-center justify-center rounded-full
                      bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
                      border-2 border-white dark:border-zinc-700
                      ring-1 ring-zinc-200/80 dark:ring-white/15
                      shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]
                      overflow-hidden hover:scale-105 active:scale-95 transition-all relative"
                  >
                    {currentUser?.avatar ? (
                      <Image src={currentUser.avatar} alt="Profile" fill className="object-cover rounded-full" />
                    ) : (
                      <span className="text-sm font-bold uppercase text-zinc-800 dark:text-zinc-200">
                        {currentUser?.username?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                      </span>
                    )}
                  </Link>
                ) : (
                  <button
                    onClick={() => openModal('login')}
                    aria-label="Connexion"
                    className="flex h-11 w-11 items-center justify-center rounded-full
                      bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
                      border border-white/80 dark:border-white/10
                      shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
                      hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <User className="h-5 w-5 text-zinc-700 dark:text-zinc-200" />
                  </button>
                )}
              </div>

              {/* Desktop Expanded: Combined Greeting UI + User Profile Avatar Pill */}
              <div
                className={`hidden ${isScrolled ? 'md:hidden' : 'md:flex'} items-center gap-3 pl-3.5 pr-1.5 py-1 rounded-full
                  bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
                  border border-white/80 dark:border-white/10
                  shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
                  h-11 transition-all`}
                style={{
                  opacity: 1 - scrollProgress * 3,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Greeting & Location Selector */}
                <div className="flex flex-col items-end text-right min-w-0">
                  {isLoggedIn && userName ? (
                    <Link
                      href="/account"
                      className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight hover:text-brand-green transition-colors truncate max-w-[150px] lg:max-w-[200px]"
                    >
                      Bonjour, {userName}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openModal('login')}
                      className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight hover:text-brand-green transition-colors truncate max-w-[150px] lg:max-w-[200px] cursor-pointer"
                    >
                      Bienvenue !
                    </button>
                  )}

                  <div className="relative" ref={desktopLocationDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsLocationOpen(!isLocationOpen)}
                      className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer group mt-0.5"
                    >
                      <MapPin className="h-3 w-3 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors flex-shrink-0" />
                      <span className="truncate max-w-[130px] lg:max-w-[180px]">{selectedLocation}</span>
                      <ChevronDown
                        className={`h-2.5 w-2.5 text-zinc-400 transition-transform duration-200 ${
                          isLocationOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {/* Liquid Glass Location Dropdown */}
                    {isLocationOpen && (
                      <div className="absolute right-0 top-full mt-2.5 w-64 rounded-2xl p-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-white/80 dark:border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.15)] z-50 animate-in fade-in zoom-in-95 duration-150 text-left">
                        <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          Sélectionner une ville
                        </div>
                        <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto scrollbar-hide">
                          {CITIES.map((city) => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => {
                                setSelectedLocation(city);
                                setIsLocationOpen(false);
                              }}
                              className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl text-left transition-colors cursor-pointer ${
                                selectedLocation === city
                                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold'
                                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <span className="truncate">{city}</span>
                              {selectedLocation === city && (
                                <Check className="h-3.5 w-3.5 text-zinc-900 dark:text-white flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* User Avatar Circle inside pill */}
                {isLoggedIn ? (
                  <Link
                    href="/account"
                    aria-label="Mon compte"
                    className="flex h-8 w-8 items-center justify-center rounded-full
                      bg-zinc-100 dark:bg-zinc-700/80
                      border-2 border-white dark:border-zinc-700
                      ring-1 ring-zinc-200/80 dark:ring-white/15
                      shadow-xs overflow-hidden hover:scale-105 active:scale-95 transition-all relative flex-shrink-0"
                  >
                    {currentUser?.avatar ? (
                      <Image src={currentUser.avatar} alt="Profile" fill className="object-cover rounded-full" />
                    ) : (
                      <span className="text-xs font-bold uppercase text-zinc-800 dark:text-zinc-200">
                        {currentUser?.username?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
                      </span>
                    )}
                  </Link>
                ) : (
                  <button
                    onClick={() => openModal('login')}
                    aria-label="Connexion"
                    className="flex h-8 w-8 items-center justify-center rounded-full
                      bg-zinc-100 dark:bg-zinc-700/80
                      border border-zinc-200/80 dark:border-white/10
                      hover:scale-105 active:scale-95 transition-all cursor-pointer flex-shrink-0"
                  >
                    <User className="h-4 w-4 text-zinc-700 dark:text-zinc-200" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
              HERO BODY: Headline + Liquid Glass Search & Category Pills
          ══════════════════════════════════════════════════════════ */}
          <div
            className={`flex flex-col flex-1 justify-end w-full ${isScrolled ? 'hidden' : 'pb-3'}`}
            style={{
              opacity: 1 - scrollProgress * 2.5,
              transform: `translateY(${scrollProgress * -16}px)`,
              pointerEvents: isScrolled ? 'none' : 'auto',
              transition: 'opacity 0.2s, transform 0.25s',
              overflow: 'hidden',
              maxHeight: isScrolled ? 0 : '9999px',
            }}
          >
            {/* Headline matching Image 2 typography and font weights */}
            <h1 className="text-[26px] sm:text-[32px] md:text-[38px] lg:text-[42px] leading-[1.2] tracking-tight text-zinc-900 dark:text-white mt-4 sm:mt-5 mb-4 sm:mb-5">
              <span className="font-light text-zinc-900 dark:text-white">Explorez </span>
              <span className="font-bold text-zinc-900 dark:text-white">des logements</span>
              <br />
              <span className="font-bold text-zinc-900 dark:text-white">près de chez vous</span>
            </h1>

            {/* ── Search Bar Row: Pill Input + Separate Circular Filter Button ── */}
            <div className="flex items-center gap-3 w-full max-w-xl mb-4 sm:mb-5">
              {/* Search input pill */}
              <div
                className={`flex-1 min-w-0 flex items-center h-12 md:h-13 rounded-full px-4
                  bg-white/75 dark:bg-zinc-800/60 backdrop-blur-xl
                  border border-white/85 dark:border-white/10
                  shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)]
                  transition-all ${
                    searchFocused
                      ? 'ring-2 ring-zinc-400 dark:ring-zinc-500 bg-white dark:bg-zinc-800'
                      : ''
                  }`}
              >
                <Search className="h-5 w-5 text-zinc-400 dark:text-zinc-500 mr-2.5 flex-shrink-0" />
                <input
                  ref={inputRef}
                  id="main-search"
                  type="text"
                  placeholder="Rechercher"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="w-full bg-transparent text-[15px] md:text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-normal outline-none"
                />
              </div>

              {/* Separate circular filter button matching Image 2 */}
              <button
                id="filter-btn"
                aria-label="Filtres"
                className="flex h-12 w-12 md:h-13 md:w-13 flex-shrink-0 items-center justify-center rounded-full
                  bg-white/75 dark:bg-zinc-800/60 backdrop-blur-xl
                  border border-white/85 dark:border-white/10
                  shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)]
                  text-zinc-700 dark:text-zinc-200 hover:scale-105 active:scale-95 transition-transform cursor-pointer"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="21" y1="6" x2="13" y2="6" />
                  <line x1="9" y1="6" x2="3" y2="6" />
                  <circle cx="11" cy="6" r="2" />
                  <line x1="21" y1="12" x2="17" y2="12" />
                  <line x1="13" y1="12" x2="3" y2="12" />
                  <circle cx="15" cy="12" r="2" />
                  <line x1="21" y1="18" x2="9" y2="18" />
                  <line x1="5" y1="18" x2="3" y2="18" />
                  <circle cx="7" cy="18" r="2" />
                </svg>
              </button>
            </div>

            {/* ── Category Pills Row matching Image 2 ── */}
            <div className="relative group flex items-center">
              {/* Scroll Left Button for desktop */}
              <div
                className={`hidden md:flex absolute -left-3 z-10 transition-opacity duration-300 ${
                  canScrollLeft
                    ? 'opacity-0 group-hover:opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  onClick={() => scrollCategories('left')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md text-zinc-700 dark:text-zinc-200 shadow-md transition-transform hover:scale-105"
                  aria-label="Défiler vers la gauche"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>

              {/* Category Pills list */}
              <div
                ref={scrollContainerRef}
                onScroll={checkScroll}
                className="flex items-center gap-2.5 overflow-x-auto scrollbar-hide py-1 -mx-1 px-1 w-full"
              >
                {CATEGORIES.map((cat) => {
                  const isActive = activeCategory === cat.name;
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      id={`category-pill-${cat.id}`}
                      type="button"
                      onClick={() => setActiveCategory(cat.name)}
                      className={`h-11 px-2.5 pr-4.5 rounded-full flex items-center gap-2.5 flex-shrink-0 transition-all active:scale-95 cursor-pointer ${
                        isActive
                          ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 shadow-[0_4px_16px_rgba(0,0,0,0.18)]'
                          : 'bg-white/75 dark:bg-zinc-800/60 backdrop-blur-xl border border-white/85 dark:border-white/10 text-zinc-700 dark:text-zinc-300 shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:bg-white/90 dark:hover:bg-zinc-800/80'
                      }`}
                    >
                      {/* Circular icon badge inside pill */}
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                          isActive
                            ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white'
                            : 'bg-zinc-100 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Pill text */}
                      <span className={`text-sm tracking-tight ${isActive ? 'font-bold' : 'font-medium'}`}>
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Scroll Right Button for desktop */}
              <div
                className={`hidden md:flex absolute -right-3 z-10 transition-opacity duration-300 ${
                  canScrollRight
                    ? 'opacity-0 group-hover:opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none'
                }`}
              >
                <button
                  type="button"
                  onClick={() => scrollCategories('right')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md text-zinc-700 dark:text-zinc-200 shadow-md transition-transform hover:scale-105"
                  aria-label="Défiler vers la droite"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Spacer matching the hero height ── */}
      <div
        style={{ height: 'var(--hero-h, 305px)' }}
        aria-hidden="true"
      />
    </>
  );
}
