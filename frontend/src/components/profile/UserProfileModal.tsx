'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useProfileStore } from '@/store/profileStore';
import {
  usePropertyDetailModalStore,
  claimOverlayDismissEvent,
} from '@/store/propertyDetailModalStore';
import { resolveProfileHref } from '@/services/user.service';
import UserProfileView from '@/components/profile/UserProfileView';

export default function UserProfileModal() {
  const pathname = usePathname();
  const isModalOpen = useProfileStore((s) => s.isModalOpen);
  const modalIdentifier = useProfileStore((s) => s.modalIdentifier);
  const modalSourceName = useProfileStore((s) => s.modalSourceName);
  const modalInitialUser = useProfileStore((s) => s.modalInitialUser);
  const modalStackOrder = useProfileStore((s) => s.modalStackOrder);
  const modalRestoredScrollTop = useProfileStore((s) => s.modalRestoredScrollTop);
  const popOrCloseProfileModal = useProfileStore((s) => s.popOrCloseProfileModal);
  const setModalActiveScrollTop = useProfileStore((s) => s.setModalActiveScrollTop);
  const clearModalRestoredScrollTop = useProfileStore((s) => s.clearModalRestoredScrollTop);

  const propertyIsOpen = usePropertyDetailModalStore((s) => s.isOpen);
  const propertyStackOrder = usePropertyDetailModalStore((s) => s.stackOrder);

  const isTopmostOverlay =
    isModalOpen && (!propertyIsOpen || modalStackOrder > propertyStackOrder);

  // Compute dynamic zIndex above PropertyDetailsModal (70) and feed drawers (120), below /pricing (130), Lightbox (140), AuthModals (150)
  const modalZIndex = Math.min(128, 120 + Math.max(1, modalStackOrder) * 2);

  const [isVisible, setIsVisible] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const springResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isClosingRef = useRef<boolean>(false);
  const lastPushedKeyRef = useRef<string | null>(null);
  const wasOnOverlayRouteRef = useRef<boolean>(false);

  const activeProfileKey = isModalOpen
    ? `${modalIdentifier || 'self'}::${modalSourceName || ''}::${modalStackOrder}`
    : null;

  const clearDragVisualStyles = useCallback(() => {
    if (springResetTimerRef.current) {
      clearTimeout(springResetTimerRef.current);
      springResetTimerRef.current = null;
    }
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transform = '';
      sheet.style.transition = '';
      sheet.style.borderRadius = '';
      sheet.style.willChange = '';
    }
    const backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.style.opacity = '';
      backdrop.style.transition = '';
    }
  }, []);

  const restoreBodyScrollIfAllClosed = useCallback(() => {
    if (typeof document === 'undefined') return;
    const anyOpen =
      usePropertyDetailModalStore.getState().isOpen ||
      useProfileStore.getState().isModalOpen;
    if (!anyOpen) {
      document.body.style.overflow = '';
    } else {
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const replaceBrowserUrlCleanly = useCallback((targetUrl: string | null) => {
    if (!targetUrl || typeof window === 'undefined') return;
    try {
      History.prototype.replaceState.call(
        window.history,
        window.history.state,
        '',
        targetUrl
      );
    } catch {
      window.history.replaceState(window.history.state, '', targetUrl);
    }
  }, []);

  const animateAndClose = useCallback(
    (shouldReplaceUrl = true) => {
      if (isClosingRef.current) return;

      const storeState = useProfileStore.getState();
      const hasHistory = storeState.modalHistoryStack.length > 0;

      // If there's a previous profile in the stack, pop back to it immediately
      if (hasHistory) {
        const { returnUrlToRestore } = popOrCloseProfileModal();
        if (shouldReplaceUrl && returnUrlToRestore) {
          replaceBrowserUrlCleanly(returnUrlToRestore);
        }
        clearDragVisualStyles();
        restoreBodyScrollIfAllClosed();
        return;
      }

      isClosingRef.current = true;
      setIsVisible(false);

      const returnUrlToRestore =
        storeState.modalReturnUrl || storeState.modalOriginUrl;
      if (shouldReplaceUrl && returnUrlToRestore) {
        replaceBrowserUrlCleanly(returnUrlToRestore);
      }

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
      closeTimerRef.current = setTimeout(() => {
        clearDragVisualStyles();
        popOrCloseProfileModal();
        isClosingRef.current = false;
        lastPushedKeyRef.current = null;
        restoreBodyScrollIfAllClosed();
      }, 180);
    },
    [
      clearDragVisualStyles,
      popOrCloseProfileModal,
      replaceBrowserUrlCleanly,
      restoreBodyScrollIfAllClosed,
    ]
  );

  // Restore scroll position when popping back to a previous profile entry, or reset to 0 for a newly opened profile
  useEffect(() => {
    if (!isModalOpen) return;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    if (modalRestoredScrollTop !== null) {
      const targetTop = modalRestoredScrollTop;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = targetTop;
        }
        clearModalRestoredScrollTop();
      });
    } else {
      scroller.scrollTop = 0;
    }
  }, [
    activeProfileKey,
    isModalOpen,
    modalRestoredScrollTop,
    clearModalRestoredScrollTop,
  ]);

  // Open lifecycle: lock body scroll, push native browser history URL, fade in
  useEffect(() => {
    if (!isModalOpen || !activeProfileKey) {
      setIsVisible(false);
      lastPushedKeyRef.current = null;
      restoreBodyScrollIfAllClosed();
      return;
    }

    isClosingRef.current = false;
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }

    // Trigger smooth enter transition
    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Only push history entry once per newly opened profile stack entry
    if (lastPushedKeyRef.current !== activeProfileKey && typeof window !== 'undefined') {
      lastPushedKeyRef.current = activeProfileKey;

      const targetProfileUrl = modalIdentifier
        ? resolveProfileHref(
            modalIdentifier,
            modalSourceName ? { username: modalSourceName } : null
          )
        : '/profile';

      const currentFullUrl = window.location.pathname + window.location.search;
      if (
        currentFullUrl !== targetProfileUrl &&
        !window.location.pathname.startsWith('/pricing')
      ) {
        try {
          History.prototype.pushState.call(
            window.history,
            {
              ...(window.history.state || {}),
              modalProfileKey: activeProfileKey,
              returnUrl: useProfileStore.getState().modalReturnUrl || '/',
            },
            '',
            targetProfileUrl
          );
        } catch {
          window.history.pushState(
            {
              ...(window.history.state || {}),
              modalProfileKey: activeProfileKey,
              returnUrl: useProfileStore.getState().modalReturnUrl || '/',
            },
            '',
            targetProfileUrl
          );
        }
      }
    }

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [
    isModalOpen,
    activeProfileKey,
    modalIdentifier,
    modalSourceName,
    restoreBodyScrollIfAllClosed,
  ]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (springResetTimerRef.current) clearTimeout(springResetTimerRef.current);
    };
  }, []);

  // Track overlay routes (/pricing, /login, /signup)
  useEffect(() => {
    if (!isModalOpen || isClosingRef.current) return;

    const isOnPricingOrAuth =
      pathname?.startsWith('/pricing') ||
      pathname?.startsWith('/login') ||
      pathname?.startsWith('/signup');

    if (isOnPricingOrAuth) {
      wasOnOverlayRouteRef.current = true;
      return;
    }

    if (wasOnOverlayRouteRef.current) {
      document.body.style.overflow = 'hidden';
      const timer = setTimeout(() => {
        wasOnOverlayRouteRef.current = false;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [pathname, isModalOpen]);

  // Handle browser Back / Forward (popstate) ONLY when UserProfileModal is the topmost overlay
  useEffect(() => {
    if (!isModalOpen) return;

    const handlePopState = (e: PopStateEvent) => {
      if (isClosingRef.current) return;

      const profileState = useProfileStore.getState();
      const propState = usePropertyDetailModalStore.getState();
      const currentlyTopmost =
        profileState.isModalOpen &&
        (!propState.isOpen || profileState.modalStackOrder > propState.stackOrder);

      if (!currentlyTopmost) return;

      const currentPath = window.location.pathname;
      if (
        wasOnOverlayRouteRef.current ||
        currentPath.startsWith('/pricing')
      ) {
        return;
      }

      if (!claimOverlayDismissEvent(e)) return;

      const returnUrl =
        profileState.modalReturnUrl || profileState.modalOriginUrl;
      animateAndClose(false);
      // Ensure URL matches the expected underlying returnUrl (e.g. /properties/[id] or /search)
      if (
        returnUrl &&
        typeof window !== 'undefined' &&
        window.location.pathname + window.location.search !== returnUrl
      ) {
        replaceBrowserUrlCleanly(returnUrl);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isModalOpen, animateAndClose, replaceBrowserUrlCleanly]);

  // Handle Escape key ONLY when UserProfileModal is the topmost overlay
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isClosingRef.current) return;

      const profileState = useProfileStore.getState();
      const propState = usePropertyDetailModalStore.getState();
      const currentlyTopmost =
        profileState.isModalOpen &&
        (!propState.isOpen || profileState.modalStackOrder > propState.stackOrder);

      if (!currentlyTopmost) return;
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/pricing')) {
        return;
      }
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        return;
      }

      // If an internal modal (edit profile, contact modal, lightbox, auth modal) is open, don't close the profile sheet
      const hasInnerModal =
        sheetRef.current?.querySelector('[data-modal-overlay-active="true"]') ||
        document.querySelector('[class*="z-[130]"], [class*="z-[140]"], [class*="z-[150]"]');
      if (hasInnerModal) return;

      if (!claimOverlayDismissEvent(e)) return;
      animateAndClose(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, animateAndClose]);

  // Native swipe-down-to-dismiss on mobile when scrolled to top
  useEffect(() => {
    if (!isModalOpen) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    type PullPhase = 'idle' | 'undecided' | 'dismiss' | 'scroll' | 'horizontal' | 'ignored';

    let phase: PullPhase = 'idle';
    let startX = 0;
    let startY = 0;
    let dragAnchorY = 0;
    let currentDragY = 0;
    let lastY = 0;
    let lastTime = 0;
    let prevY = 0;
    let prevTime = 0;

    const springBack = () => {
      const sheetEl = sheetRef.current;
      const backdropEl = backdropRef.current;
      if (sheetEl) {
        sheetEl.style.transition =
          'transform 250ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 240ms ease';
        sheetEl.style.transform = 'translate3d(0, 0, 0)';
        sheetEl.style.borderRadius = '0px';
      }
      if (backdropEl) {
        backdropEl.style.transition = 'opacity 220ms ease';
        backdropEl.style.opacity = '';
      }
      if (springResetTimerRef.current) {
        clearTimeout(springResetTimerRef.current);
      }
      springResetTimerRef.current = setTimeout(() => {
        clearDragVisualStyles();
      }, 260);
    };

    const handleTouchStart = (e: TouchEvent) => {
      const profileState = useProfileStore.getState();
      const propState = usePropertyDetailModalStore.getState();
      const currentlyTopmost =
        profileState.isModalOpen &&
        (!propState.isOpen || profileState.modalStackOrder > propState.stackOrder);

      if (!currentlyTopmost || isClosingRef.current || e.touches.length !== 1) {
        phase = 'ignored';
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-swipe-dismiss-ignore="true"]') ||
        target?.closest('[data-horizontal-carousel="true"]') ||
        target?.closest('input, textarea, select, [role="slider"]') ||
        sheet.querySelector('[data-modal-overlay-active="true"]')
      ) {
        phase = 'ignored';
        return;
      }

      const scroller = scrollContainerRef.current;
      if (!scroller || scroller.scrollTop > 1) {
        phase = 'scroll';
        return;
      }

      const touch = e.touches[0];
      const now = performance.now();
      startX = touch.clientX;
      startY = touch.clientY;
      dragAnchorY = startY;
      currentDragY = 0;
      lastY = startY;
      lastTime = now;
      prevY = startY;
      prevTime = now;
      phase = 'undecided';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (
        phase === 'idle' ||
        phase === 'ignored' ||
        phase === 'scroll' ||
        phase === 'horizontal' ||
        isClosingRef.current
      ) {
        return;
      }

      if (e.touches.length !== 1) {
        const wasDismissing = phase === 'dismiss';
        phase = 'ignored';
        if (wasDismissing) springBack();
        return;
      }

      const scroller = scrollContainerRef.current;
      if (!scroller) {
        phase = 'ignored';
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const absX = Math.abs(dx);

      if (phase === 'undecided') {
        if (e.defaultPrevented || scroller.scrollTop > 1) {
          phase = 'scroll';
          return;
        }
        if (Math.hypot(dx, dy) < 10) return;
        if (dy <= 0) {
          phase = 'scroll';
          return;
        }
        if (dy > absX * 1.5 && e.cancelable) {
          phase = 'dismiss';
          dragAnchorY = touch.clientY;
          currentDragY = 0;
          if (springResetTimerRef.current) {
            clearTimeout(springResetTimerRef.current);
            springResetTimerRef.current = null;
          }
          const sheetEl = sheetRef.current;
          const backdropEl = backdropRef.current;
          if (sheetEl) {
            sheetEl.style.transition = 'none';
            sheetEl.style.willChange = 'transform';
          }
          if (backdropEl) {
            backdropEl.style.transition = 'none';
          }
        } else {
          phase = 'horizontal';
          return;
        }
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      const now = performance.now();
      if (now - lastTime > 12) {
        prevY = lastY;
        prevTime = lastTime;
        lastY = touch.clientY;
        lastTime = now;
      }

      const rawDelta = Math.max(0, touch.clientY - dragAnchorY);
      currentDragY = rawDelta <= 160 ? rawDelta : 160 + (rawDelta - 160) * 0.55;

      const sheetEl = sheetRef.current;
      const backdropEl = backdropRef.current;
      if (sheetEl) {
        sheetEl.style.transform = `translate3d(0, ${currentDragY}px, 0)`;
        sheetEl.style.borderRadius = `${Math.min(28, currentDragY * 0.22)}px`;
      }
      if (backdropEl) {
        const nextOpacity = Math.max(0, 1 - currentDragY / 320);
        backdropEl.style.opacity = String(nextOpacity);
      }
    };

    const handleTouchEndOrCancel = (e: TouchEvent) => {
      const wasDismissing = phase === 'dismiss';
      phase = 'idle';

      if (!wasDismissing || isClosingRef.current) return;

      if (e.type === 'touchcancel') {
        springBack();
        return;
      }

      const touch = e.changedTouches[0];
      const finalY = touch ? touch.clientY : lastY;
      const vy = (finalY - prevY) / Math.max(1, performance.now() - prevTime);

      if (currentDragY > 110 || (currentDragY > 55 && vy > 0.55)) {
        animateAndClose(true);
      } else {
        springBack();
      }
    };

    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEndOrCancel, { passive: true });
    sheet.addEventListener('touchcancel', handleTouchEndOrCancel, { passive: true });

    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart);
      sheet.removeEventListener('touchmove', handleTouchMove);
      sheet.removeEventListener('touchend', handleTouchEndOrCancel);
      sheet.removeEventListener('touchcancel', handleTouchEndOrCancel);
      if (springResetTimerRef.current) {
        clearTimeout(springResetTimerRef.current);
        springResetTimerRef.current = null;
      }
    };
  }, [isModalOpen, animateAndClose, clearDragVisualStyles]);

  if (!isModalOpen) {
    return null;
  }

  return (
    <div
      style={{ zIndex: modalZIndex }}
      className={`fixed inset-0 overflow-hidden ${
        !isVisible || isClosingRef.current || !isTopmostOverlay
          ? !isVisible || isClosingRef.current
            ? 'pointer-events-none'
            : ''
          : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Profil de l'annonceur"
    >
      {/* ── Backdrop Overlay ── */}
      <div
        ref={backdropRef}
        onClick={() => animateAndClose(true)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-220 ease-out ${
          isVisible && !isClosingRef.current
            ? 'opacity-100 cursor-pointer pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* ── Profile Sheet Container ── */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          ref={sheetRef}
          className={`w-full h-full bg-[#F7F8FA] dark:bg-zinc-950 flex flex-col overflow-hidden transition-opacity ${
            !isVisible || isClosingRef.current
              ? 'pointer-events-none opacity-0'
              : 'pointer-events-auto opacity-100'
          } ${
            isClosingRef.current
              ? 'duration-180 ease-in'
              : 'duration-220 ease-out'
          }`}
        >
          {/* Subtle Mobile Drag Pill Handle */}
          <div className="lg:hidden absolute top-[calc(0.5rem+var(--ios-safe-top))] left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="w-10 h-1.5 rounded-full bg-white/45 dark:bg-white/30 backdrop-blur-md shadow-xs" />
          </div>

          {/* Full Page Scroll Container */}
          <div
            ref={scrollContainerRef}
            className="w-full h-full overflow-y-auto overscroll-contain"
            style={{
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch',
            }}
            onScroll={(e) => {
              setModalActiveScrollTop(e.currentTarget.scrollTop);
            }}
          >
            <UserProfileView
              identifier={modalIdentifier || undefined}
              sourceName={modalSourceName}
              initialUser={modalInitialUser}
              onBack={() => animateAndClose(true)}
              isModal={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
