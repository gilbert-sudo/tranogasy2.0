'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, MapPin, SlidersHorizontal, Bell, Building2, TreePine, Landmark, Waves, Globe } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';

// Different thresholds per breakpoint handled in JS via the hero height CSS var
const SCROLL_THRESHOLD = 220;

// Popular Madagascar places with icons and listing counts
const PLACES = [
  { name: 'Tous', icon: Globe,      count: 248 },
  { name: 'Antananarivo', icon: Landmark,   count: 142 },
  { name: 'Toamasina',   icon: Waves,       count:  38 },
  { name: 'Antsirabe',   icon: TreePine,    count:  27 },
  { name: 'Mahajanga',   icon: Waves,       count:  21 },
  { name: 'Fianarantsoa',icon: TreePine,    count:  12 },
  { name: 'Toliara',     icon: Waves,       count:   8 },
  { name: 'Antsiranana', icon: Building2,   count:   5 },
];

export default function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activePlace, setActivePlace] = useState('Tous');
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      {/* ── Fixed wrapper
          Mobile:  260px expanded → 68px collapsed
          md+:     340px expanded → 72px collapsed
      ── */}
      <header
        className="fixed inset-x-0 top-0 z-50 overflow-hidden"
        style={{
          height: isScrolled
            ? 'var(--nav-h, 68px)'
            : 'var(--hero-h, 260px)',
          transition: 'height 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
        } as React.CSSProperties}
      >
        {/* Inject responsive CSS vars */}
        <style>{`
          :root {
            --hero-h: 260px;
            --nav-h: 68px;
          }
          @media (min-width: 768px) {
            :root {
              --hero-h: 340px;
              --nav-h: 72px;
            }
          }
          @media (min-width: 1024px) {
            :root {
              --hero-h: 380px;
              --nav-h: 72px;
            }
          }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

          /* Place chip hover glow */
          .place-chip:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 14px rgba(124,189,30,0.35) !important;
          }
          .place-chip.active {
            box-shadow: 0 4px 14px rgba(124,189,30,0.5) !important;
          }
        `}</style>

        {/* ── Background image — fades out on scroll ── */}
        <div
          className="absolute inset-0"
          style={{ opacity: 1 - scrollProgress, transition: 'opacity 0.3s' }}
        >
          <Image
            src="/hero-bg.jpg"
            alt="Madagascar paysage immobilier"
            fill
            priority
            className="object-cover object-center"
            sizes="100vw"
          />
          {/* Gradient: darkens image, fades to page background at bottom */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-zinc-50 dark:to-zinc-950" />
        </div>

        {/* ── Frosted glass nav — fades in on scroll ── */}
        <div
          className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200/70 dark:border-zinc-800"
          style={{ opacity: scrollProgress, transition: 'opacity 0.3s' }}
        />

        {/* ══════════════════════════════════════════════════════
            INNER CONTENT — centered, constrained, responsive
        ══════════════════════════════════════════════════════ */}
        <div className="relative z-10 h-full flex flex-col max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12">

          {/* ── TOP ROW: logo | [scrolled: search] | actions ── */}
          <div
            className="flex items-center"
            style={{
              paddingTop: isScrolled ? '0' : '14px',
              height: isScrolled ? '100%' : 'auto',
              justifyContent: isScrolled ? 'flex-start' : 'space-between',
              gap: isScrolled ? '12px' : '0',
              transition: 'padding-top 0.45s',
            }}
          >
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <div
                className="relative"
                style={{
                  width: isScrolled ? '28px' : '36px',
                  height: isScrolled ? '28px' : '36px',
                  transition: 'width 0.45s, height 0.45s',
                }}
              >
                <Image src="/logo.png" alt="TranoGasy" fill className="object-contain" />
              </div>
              <span
                className="font-extrabold tracking-tight"
                style={{
                  fontSize: isScrolled ? '1.15rem' : '1.4rem',
                  transition: 'font-size 0.45s',
                }}
              >
                <span style={{ color: '#7cbd1e' }}>Trano</span>
                <span className={isScrolled ? 'text-zinc-900 dark:text-white' : 'text-white'}>
                  Gasy.
                </span>
              </span>
            </Link>

            {/* ── CENTER: collapsed search bar (scrolled only) ── */}
            <div
              className="flex justify-center min-w-0"
              style={{
                flex: isScrolled ? '1 1 0%' : '0 0 0px',
                width: isScrolled ? undefined : 0,
                overflow: 'hidden',
                opacity: isScrolled ? 1 : 0,
                transition: 'flex 0.4s, opacity 0.3s, width 0.4s',
                pointerEvents: isScrolled ? 'auto' : 'none',
              }}
            >
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 w-full
                  bg-zinc-100 dark:bg-zinc-800
                  max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg
                  shadow-sm min-w-0
                  ${searchFocused ? 'ring-2 ring-brand-green' : 'ring-1 ring-zinc-200/70 dark:ring-zinc-700'}`}
              >
                <Search className="h-4 w-4 flex-shrink-0 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Rechercher une ville, quartier…"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  className="flex-1 bg-transparent text-sm text-zinc-700 dark:text-zinc-100 placeholder:text-zinc-400 outline-none min-w-0"
                />
                <button
                  aria-label="Filtres"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-green text-white transition-transform active:scale-90 hover:brightness-110"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <DarkModeToggle />
              <button
                id="notif-btn"
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                style={{
                  background: isScrolled ? 'transparent' : 'rgba(255,255,255,0.12)',
                  color: isScrolled ? undefined : 'white',
                }}
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-red ring-2 ring-white dark:ring-zinc-900" />
              </button>
            </div>
          </div>

          {/* ── HERO TEXT + SEARCH + PLACE CHIPS
              All collapse to 0 height + opacity 0 when scrolled
          ── */}
          <div
            className="flex flex-col flex-1 justify-end pb-3"
            style={{
              opacity: 1 - scrollProgress * 2.5,
              transform: `translateY(${scrollProgress * -16}px)`,
              pointerEvents: isScrolled ? 'none' : 'auto',
              transition: 'opacity 0.2s, transform 0.25s',
              overflow: 'hidden',
              maxHeight: isScrolled ? 0 : '9999px',
            }}
          >
            {/* Location pill */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <MapPin className="h-3.5 w-3.5 text-brand-green flex-shrink-0" />
              <span className="text-xs font-medium text-white/75 tracking-wide">
                Antananarivo, Madagascar
              </span>
            </div>

            {/* Headline — scales up on larger screens */}
            <h1 className="font-black leading-tight text-white mb-3
              text-[1.55rem]
              sm:text-[1.9rem]
              md:text-[2.4rem]
              lg:text-[2.9rem]">
              Trouvez votre{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #7cbd1e 0%, #a8e63d 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                maison idéale
              </span>
            </h1>

            {/* Search bar */}
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-3 mb-3
                bg-white shadow-[0_8px_32px_rgba(0,0,0,0.18)]
                ${searchFocused ? 'ring-2 ring-brand-green' : ''}
                md:py-3.5`}
            >
              <Search className="h-4 w-4 flex-shrink-0 text-zinc-400 md:h-5 md:w-5" />
              <input
                ref={inputRef}
                id="main-search"
                type="text"
                placeholder="Quartier, ville, type de bien…"
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="flex-1 bg-transparent text-sm text-zinc-700 placeholder:text-zinc-400 outline-none md:text-base"
              />
              <button
                id="filter-btn"
                aria-label="Filtres"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-brand-green text-white transition-transform active:scale-90 md:h-9 md:w-9 md:rounded-xl"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>

            {/* ── Place chips ── */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {PLACES.map(({ name, icon: Icon, count }) => {
                const isActive = activePlace === name;
                return (
                  <button
                    key={name}
                    id={`place-chip-${name.toLowerCase()}`}
                    onClick={() => setActivePlace(name)}
                    className={`place-chip${isActive ? ' active' : ''} flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 md:px-4 md:py-2 md:text-sm`}
                    style={{
                      background: isActive
                        ? '#7cbd1e'
                        : 'rgba(255,255,255,0.82)',
                      color: isActive ? 'white' : '#3f3f46',
                      boxShadow: isActive
                        ? '0 2px 8px rgba(124,189,30,0.4)'
                        : 'none',
                    }}
                  >
                    {/* place icon */}
                    <Icon className="h-3 w-3 flex-shrink-0" />
                    {/* place name */}
                    <span>{name}</span>
                    {/* listing count badge */}
                    <span
                      className="inline-flex items-center justify-center rounded-full px-1.5 py-0 text-[10px] font-bold leading-4 min-w-[18px]"
                      style={{
                        background: isActive ? 'rgba(255,255,255,0.28)' : 'rgba(124,189,30,0.15)',
                        color: isActive ? 'white' : '#5a9a10',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* collapsed search moved into top row — nothing needed here */}


        </div>
      </header>

      {/* ── Spacer matching the hero height — responsive via CSS var ── */}
      <div
        style={{ height: 'var(--hero-h, 260px)' }}
        aria-hidden="true"
      />
    </>
  );
}
