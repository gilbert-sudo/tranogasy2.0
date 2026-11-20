'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Handles native Capacitor lifecycle polish:
 * 1. Smoothly fades out the branded native splash screen only after React paints (zero white flash).
 * 2. Displays a clean non-blocking offline banner with instant auto-recovery when internet returns.
 */
export default function NativeAppBootstrap() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // 1. Hide native splash screen smoothly after the first visual frame paints
    let raf1 = 0;
    let raf2 = 0;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const hideSplash = () => {
      try {
        if (Capacitor.isNativePlatform()) {
          SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
        }
      } catch {
        // Ignore on web
      }
    };

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        hideSplash();
      });
    });
    // Safety fallback in case rAF is throttled
    fallbackTimer = setTimeout(hideSplash, 1500);

    // 2. Track real-time connectivity status
    const syncOnlineStatus = () => {
      setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
    };
    syncOnlineStatus();

    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => {
      setIsOffline(false);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      if (raf1) window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ top: 'calc(0.5rem + var(--ios-safe-top, 0px))' }}
      className="fixed left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-950/95 dark:bg-zinc-900/95 text-white border border-white/15 shadow-2xl backdrop-blur-xl text-xs font-bold whitespace-nowrap animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Mode hors ligne</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-extrabold text-white transition-colors active:scale-95 cursor-pointer"
      >
        <RefreshCw className="w-3 h-3" />
        <span>Réessayer</span>
      </button>
    </div>
  );
}
