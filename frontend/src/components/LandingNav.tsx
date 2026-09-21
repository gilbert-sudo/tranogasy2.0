'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, MapPin, SlidersHorizontal, Bell } from 'lucide-react';
import DarkModeToggle from './DarkModeToggle';

const SCROLL_THRESHOLD = 200;

const FILTERS = ['Tous', 'Location', 'Vente', 'Appartement', 'Villa', 'Bureau'];

export default function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeFilter, setActiveFilter] = useState('Tous');
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
      {/* ── Fixed wrapper ── */}
      <header className="fixed inset-x-0 top-0 z-50 overflow-hidden" style={{
        height: isScrolled ? '68px' : '260px',
        transition: 'height 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>

        {/* ── Gradient background (hero mode) ── fades out on scroll */}
        <div
          className="absolute inset-0"
          style={{ opacity: 1 - scrollProgress, transition: 'opacity 0.3s' }}
        >
          {/* Background image */}
          <Image
            src="/hero-bg.jpg"
            alt="Madagascar"
            fill
            priority
            className="object-cover object-center scale-105"
            sizes="100vw"
          />
          {/* Strong bottom gradient so content below blends naturally */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-zinc-50 dark:to-black" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-50/80 dark:to-black/80" />
        </div>

        {/* ── Solid nav background (scrolled mode) ── fades in */}
        <div
          className="absolute inset-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800"
          style={{ opacity: scrollProgress, transition: 'opacity 0.3s' }}
        />

        {/* ─────────────────────────────────────────────
            TOP ROW: logo + notification + dark toggle
        ───────────────────────────────────────────── */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-3 pb-0 max-w-lg mx-auto">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-1.5">
            <div className="relative" style={{
              width: isScrolled ? '26px' : '32px',
              height: isScrolled ? '26px' : '32px',
              transition: 'width 0.45s, height 0.45s',
            }}>
              <Image src="/logo.png" alt="TranoGasy" fill className="object-contain" />
            </div>
            <span
              className="font-extrabold tracking-tight"
              style={{
                fontSize: isScrolled ? '1.1rem' : '1.35rem',
                transition: 'font-size 0.45s',
                color: isScrolled ? undefined : 'white',
              }}
            >
              <span style={{ color: '#7cbd1e' }}>Trano</span>
              <span className={isScrolled ? 'text-zinc-900 dark:text-white' : 'text-white'}>Gasy.</span>
            </span>
          </Link>

          {/* Right actions */}
          <div className="flex items-center gap-1.5">
            <DarkModeToggle />
            <button
              id="notif-btn"
              aria-label="Notifications"
              className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              style={{
                background: isScrolled
                  ? 'transparent'
                  : 'rgba(255,255,255,0.15)',
                color: isScrolled ? undefined : 'white',
              }}
            >
              <Bell className="h-5 w-5" />
              {/* Unread dot */}
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-red ring-2 ring-white dark:ring-zinc-900" />
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────
            HERO TEXT — visible only in expanded mode
        ───────────────────────────────────────────── */}
        <div
          className="relative z-10 px-4 max-w-lg mx-auto"
          style={{
            opacity: 1 - scrollProgress * 3,
            transform: `translateY(${scrollProgress * -12}px)`,
            pointerEvents: isScrolled ? 'none' : 'auto',
            transition: 'opacity 0.2s, transform 0.2s',
            height: isScrolled ? 0 : 'auto',
            overflow: 'hidden',
          }}
        >
          <div className="mt-3 mb-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <MapPin className="h-3.5 w-3.5 text-brand-green" />
              <span className="text-xs font-medium text-white/80 tracking-wide">
                Antananarivo, Madagascar
              </span>
            </div>
            <h1 className="text-[1.6rem] font-black leading-tight text-white">
              Trouvez votre{' '}
              <span style={{
                background: 'linear-gradient(90deg, #7cbd1e, #a8e63d)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                maison idéale
              </span>
            </h1>
          </div>
        </div>

        {/* ─────────────────────────────────────────────
            SEARCH BAR — always visible, changes style
        ───────────────────────────────────────────── */}
        <div
          className="relative z-10 px-4 max-w-lg mx-auto"
          style={{
            marginTop: isScrolled ? '10px' : '0px',
            transition: 'margin-top 0.45s',
          }}
        >
          <div
            className={`flex items-center gap-2 rounded-2xl px-4 py-3 ${
              isScrolled
                ? `bg-zinc-100 dark:bg-zinc-800 ${searchFocused ? 'ring-2 ring-brand-green' : ''}`
                : 'bg-white shadow-[0_8px_32px_rgba(0,0,0,0.18)]'
            }`}
          >
            <Search className="h-4 w-4 flex-shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              id="main-search"
              type="text"
              placeholder="Quartier, ville, type de bien…"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="flex-1 bg-transparent text-sm text-zinc-700 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
            />
            <button
              id="filter-btn"
              aria-label="Filtres"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-brand-green text-white transition-transform active:scale-90"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────
            FILTER CHIPS — visible only in expanded mode
        ───────────────────────────────────────────── */}
        <div
          className="relative z-10"
          style={{
            opacity: 1 - scrollProgress * 3,
            pointerEvents: isScrolled ? 'none' : 'auto',
            transition: 'opacity 0.15s',
            height: isScrolled ? 0 : 'auto',
            overflow: 'hidden',
          }}
        >
          <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 max-w-lg mx-auto scrollbar-hide">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className="flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all active:scale-95"
                style={{
                  background: activeFilter === f
                    ? '#7cbd1e'
                    : 'rgba(255,255,255,0.85)',
                  color: activeFilter === f ? 'white' : '#3f3f46',
                  boxShadow: activeFilter === f
                    ? '0 2px 8px rgba(124,189,30,0.4)'
                    : 'none',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

      </header>

      {/* Spacer: matches the expanded hero height (260px) */}
      <div style={{ height: '260px' }} aria-hidden="true" />
    </>
  );
}
