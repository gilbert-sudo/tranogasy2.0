'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  usePropertyDetailModalStore,
  claimOverlayDismissEvent,
} from '@/store/propertyDetailModalStore';
import { useProfileStore } from '@/store/profileStore';
import PropertyDetailsClient from '@/app/properties/[id]/PropertyDetailsClient';

interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
}

export default function PropertyDetailsModal() {
  const pathname = usePathname();
  const isOpen = usePropertyDetailModalStore((s) => s.isOpen);
  const propertyId = usePropertyDetailModalStore((s) => s.propertyId);
  const initialProperty = usePropertyDetailModalStore((s) => s.initialProperty);
  const transitionOrigin = usePropertyDetailModalStore((s) => s.transitionOrigin);
  const stackOrder = usePropertyDetailModalStore((s) => s.stackOrder);
  const restoredScrollTop = usePropertyDetailModalStore((s) => s.restoredScrollTop);
  const popOrClosePropertyDetail = usePropertyDetailModalStore(
    (s) => s.popOrClosePropertyDetail
  );
  const closePropertyDetail = usePropertyDetailModalStore((s) => s.closePropertyDetail);
  const setIsTransitioning = usePropertyDetailModalStore((s) => s.setIsTransitioning);
  const setActiveScrollTop = usePropertyDetailModalStore((s) => s.setActiveScrollTop);
  const clearRestoredScrollTop = usePropertyDetailModalStore(
    (s) => s.clearRestoredScrollTop
  );

  const profileIsOpen = useProfileStore((s) => s.isModalOpen);
  const profileStackOrder = useProfileStore((s) => s.modalStackOrder);

  const isTopmostOverlay =
    isOpen && (!profileIsOpen || stackOrder > profileStackOrder);

  const modalZIndex =
    stackOrder <= 1 ? 70 : Math.min(128, 120 + stackOrder * 2);
  const overlayImageZIndex = modalZIndex + 1;

  const [activeId, setActiveId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeProp, setActiveProp] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Transition overlay state
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const [overlaySrc, setOverlaySrc] = useState<string | null>(null);
  const [isAnimatingOverlay, setIsAnimatingOverlay] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const springResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousUrlRef = useRef<string>('');
  const isClosingRef = useRef<boolean>(false);
  const originalOverflowRef = useRef<string>('');
  const savedOriginRectRef = useRef<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const savedOriginRadiusRef = useRef<string>('1.5rem 1.5rem 0 0');
  const openTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastOpenedKeyRef = useRef<string | null>(null);
  const wasOnOverlayRouteRef = useRef<boolean>(false);

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
      document.body.style.overflow = originalOverflowRef.current || '';
    } else {
      document.body.style.overflow = 'hidden';
    }
  }, []);

  // Synchronize active property state when store triggers open or updates initialProperty
  if (isOpen && propertyId && activeId !== propertyId) {
    setActiveId(propertyId);
    setActiveProp(initialProperty || null);
  } else if (
    isOpen &&
    propertyId &&
    activeId === propertyId &&
    initialProperty &&
    initialProperty !== activeProp
  ) {
    if (
      !(
        activeProp?.contactLocked === false &&
        initialProperty?.contactLocked === true
      )
    ) {
      setActiveProp(initialProperty);
    }
  }

  // Guaranteed cleanup of open transition
  const finishOpenTransition = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setOverlayRect(null);
    setIsAnimatingOverlay(false);
    setIsTransitioning(false);
  }, [setIsTransitioning]);

  // Guaranteed cleanup of close transition
  const finishCloseTransition = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    clearDragVisualStyles();
    setActiveId(null);
    setActiveProp(null);
    setOverlayRect(null);
    setIsAnimatingOverlay(false);
    setIsTransitioning(false);
    closePropertyDetail();
    isClosingRef.current = false;
    lastOpenedKeyRef.current = null;
    restoreBodyScrollIfAllClosed();
  }, [
    clearDragVisualStyles,
    closePropertyDetail,
    restoreBodyScrollIfAllClosed,
    setIsTransitioning,
  ]);

  // If store `isOpen` is set to false externally (e.g. route exit), clean up immediately
  useEffect(() => {
    if (!isOpen && activeId && !isClosingRef.current) {
      setIsModalVisible(false);
      finishCloseTransition();
    }
  }, [isOpen, activeId, finishCloseTransition]);

  // Restore scroll position when popping back to an earlier property in historyStack, or reset to top for a new property
  useEffect(() => {
    if (!activeId) return;
    const scroller = scrollContainerRef.current;
    if (!scroller) return;

    if (restoredScrollTop !== null) {
      const targetTop = restoredScrollTop;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = targetTop;
        }
        clearRestoredScrollTop();
      });
    } else {
      scroller.scrollTop = 0;
    }
  }, [activeId, stackOrder, restoredScrollTop, clearRestoredScrollTop]);

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

  // Smooth close (or pop to previous property in historyStack if stacked above UserProfileModal)
  const animateAndClose = useCallback(
    (shouldPopHistory = true) => {
      if (isClosingRef.current) return;

      const storeState = usePropertyDetailModalStore.getState();

      // If there is an earlier property in historyStack (e.g. Property A -> Profile X -> Property B),
      // pop Property B and restore Property A underneath Profile X immediately.
      if (storeState.historyStack.length > 0) {
        finishOpenTransition();
        clearDragVisualStyles();
        const { restoredEntry, returnUrlToRestore } = popOrClosePropertyDetail();
        if (restoredEntry) {
          setActiveId(restoredEntry.propertyId);
          setActiveProp(restoredEntry.initialProperty || null);
        }
        if (shouldPopHistory && returnUrlToRestore) {
          replaceBrowserUrlCleanly(returnUrlToRestore);
        }
        restoreBodyScrollIfAllClosed();
        return;
      }

      isClosingRef.current = true;

      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }

      // Immediately restore body scroll only if no other overlay modal (like UserProfileModal) remains open
      if (
        typeof document !== 'undefined' &&
        !useProfileStore.getState().isModalOpen
      ) {
        document.body.style.overflow = originalOverflowRef.current || '';
      }

      // Clear any unlock return context since user explicitly closed the property modal
      storeState.clearUnlockReturnContext();

      // Restore URL cleanly using native replaceState to prevent Next.js RSC re-fetch
      const targetReturnUrl =
        storeState.currentReturnUrl ||
        storeState.originUrl ||
        previousUrlRef.current;
      if (shouldPopHistory && targetReturnUrl) {
        replaceBrowserUrlCleanly(targetReturnUrl);
      }

      // Find destination hero image current location
      const heroElements = document.querySelectorAll(
        `[data-detail-hero-image="${activeId}"]`
      );
      let currentHeroEl: HTMLElement | null = null;
      for (let i = 0; i < heroElements.length; i++) {
        const el = heroElements[i] as HTMLElement;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          currentHeroEl = el;
          break;
        }
      }

      // Find original card image in the listing
      const cardImgEl = document.querySelector(
        `[data-property-card-image="${activeId}"]`
      ) as HTMLElement | null;
      let targetCardRect: {
        top: number;
        left: number;
        width: number;
        height: number;
      } | null = null;
      let targetCardRadius =
        savedOriginRadiusRef.current || '1.5rem 1.5rem 0 0';

      if (cardImgEl) {
        const r = cardImgEl.getBoundingClientRect();
        targetCardRect = {
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
        };
        targetCardRadius =
          window.getComputedStyle(cardImgEl).borderRadius || targetCardRadius;
      } else if (savedOriginRectRef.current) {
        targetCardRect = savedOriginRectRef.current;
      }

      const currentHeroRect = currentHeroEl?.getBoundingClientRect();
      const isHeroVisible =
        currentHeroRect &&
        currentHeroRect.bottom > 50 &&
        currentHeroRect.top < window.innerHeight;
      const canReverseZoom = isHeroVisible && targetCardRect;

      if (canReverseZoom && currentHeroRect && currentHeroEl) {
        // Step 1: Hide live hero in details page
        setIsTransitioning(true);

        // Step 2: Show overlay at current hero rect without animation
        setIsAnimatingOverlay(false);
        setOverlayRect({
          top: currentHeroRect.top,
          left: currentHeroRect.left,
          width: currentHeroRect.width,
          height: currentHeroRect.height,
          borderRadius:
            window.getComputedStyle(currentHeroEl).borderRadius || '0px',
        });

        // Step 3: Fade out modal background & content
        setIsModalVisible(false);

        // Step 4: Next frame, animate overlay smoothly back to card
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsAnimatingOverlay(true);
            setOverlayRect({
              top: targetCardRect!.top,
              left: targetCardRect!.left,
              width: targetCardRect!.width,
              height: targetCardRect!.height,
              borderRadius: targetCardRadius,
            });
          });
        });

        // Step 5: Complete close
        closeTimerRef.current = setTimeout(finishCloseTransition, 220);
      } else {
        // Fallback clean fade out if hero was scrolled off screen
        setIsModalVisible(false);
        closeTimerRef.current = setTimeout(finishCloseTransition, 180);
      }
    },
    [
      activeId,
      clearDragVisualStyles,
      finishCloseTransition,
      finishOpenTransition,
      popOrClosePropertyDetail,
      replaceBrowserUrlCleanly,
      restoreBodyScrollIfAllClosed,
      setIsTransitioning,
    ]
  );

  // Handle open state lifecycle (native URL sync, scroll lock, image zoom in)
  useEffect(() => {
    if (!activeId || !isOpen) {
      lastOpenedKeyRef.current = null;
      return;
    }

    const openKey = `${activeId}::${stackOrder}`;
    // Only run open animation once per property stack open
    if (lastOpenedKeyRef.current === openKey) return;
    lastOpenedKeyRef.current = openKey;
    isClosingRef.current = false;

    const storeState = usePropertyDetailModalStore.getState();
    const resolvedReturnUrl =
      storeState.currentReturnUrl || storeState.originUrl || '/';
    previousUrlRef.current = resolvedReturnUrl;

    // Lock body scroll so origin feed retains exact position
    if (document.body.style.overflow !== 'hidden') {
      originalOverflowRef.current = document.body.style.overflow;
    }
    document.body.style.overflow = 'hidden';

    // Push native history state without triggering Next.js App Router background RSC fetches
    if (
      window.location.pathname !== `/properties/${activeId}` &&
      !window.location.pathname.startsWith('/pricing')
    ) {
      try {
        History.prototype.pushState.call(
          window.history,
          {
            ...(window.history.state || {}),
            modalPropertyId: activeId,
            modalPropertyOrder: stackOrder,
            returnUrl: resolvedReturnUrl,
          },
          '',
          `/properties/${activeId}`
        );
      } catch {
        window.history.pushState(
          {
            ...(window.history.state || {}),
            modalPropertyId: activeId,
            modalPropertyOrder: stackOrder,
            returnUrl: resolvedReturnUrl,
          },
          '',
          `/properties/${activeId}`
        );
      }
    }

    if (transitionOrigin && transitionOrigin.rect) {
      savedOriginRectRef.current = transitionOrigin.rect;
      savedOriginRadiusRef.current =
        transitionOrigin.borderRadius || '1.5rem 1.5rem 0 0';
      setOverlaySrc(transitionOrigin.src);

      // Frame 0: Put overlay at origin rect without transition
      setIsAnimatingOverlay(false);
      setOverlayRect({
        top: transitionOrigin.rect.top,
        left: transitionOrigin.rect.left,
        width: transitionOrigin.rect.width,
        height: transitionOrigin.rect.height,
        borderRadius: transitionOrigin.borderRadius || '1.5rem 1.5rem 0 0',
      });
      setIsTransitioning(true);

      // Frame 1: Measure destination hero element and animate overlay to destination
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (isClosingRef.current) return;

          // Find the visible hero image element in the DOM
          const heroElements = document.querySelectorAll(
            `[data-detail-hero-image="${activeId}"]`
          );
          let destEl: HTMLElement | null = null;
          for (let i = 0; i < heroElements.length; i++) {
            const el = heroElements[i] as HTMLElement;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              destEl = el;
              break;
            }
          }

          let targetRect: OverlayRect;
          if (destEl) {
            const r = destEl.getBoundingClientRect();
            targetRect = {
              top: r.top,
              left: r.left,
              width: r.width,
              height: r.height,
              borderRadius:
                window.getComputedStyle(destEl).borderRadius || '0px',
            };
          } else {
            const isMobile = window.innerWidth < 1024;
            targetRect = {
              top: 0,
              left: 0,
              width: window.innerWidth,
              height: isMobile ? 450 : 460,
              borderRadius: isMobile ? '0px' : '1.5rem',
            };
          }

          setIsAnimatingOverlay(true);
          setOverlayRect(targetRect);
          setIsModalVisible(true);

          // Safety fallback timeout to ensure overlay ALWAYS unmounts even if onTransitionEnd is delayed
          openTimerRef.current = setTimeout(finishOpenTransition, 240);
        });
      });
    } else {
      // Direct open without origin transition (simple fade)
      setIsModalVisible(true);
      finishOpenTransition();
    }
  }, [
    activeId,
    isOpen,
    stackOrder,
    transitionOrigin,
    finishOpenTransition,
    setIsTransitioning,
  ]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Track overlay routes (e.g. /pricing) so returning from /pricing keeps PropertyDetailsModal open and re-syncs URL
  useEffect(() => {
    if (!activeId || isClosingRef.current) return;

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
      if (
        isTopmostOverlay &&
        typeof window !== 'undefined' &&
        window.location.pathname !== `/properties/${activeId}`
      ) {
        try {
          History.prototype.pushState.call(
            window.history,
            {
              ...(window.history.state || {}),
              modalPropertyId: activeId,
              returnUrl: previousUrlRef.current || '/',
            },
            '',
            `/properties/${activeId}`
          );
        } catch {
          window.history.pushState(
            {
              ...(window.history.state || {}),
              modalPropertyId: activeId,
              returnUrl: previousUrlRef.current || '/',
            },
            '',
            `/properties/${activeId}`
          );
        }
      }
      const timer = setTimeout(() => {
        wasOnOverlayRouteRef.current = false;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [pathname, activeId, isTopmostOverlay]);

  // Handle browser Back / Forward (popstate) ONLY when PropertyDetailsModal is the topmost overlay
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (!activeId || isClosingRef.current) return;

      const propState = usePropertyDetailModalStore.getState();
      const profState = useProfileStore.getState();
      const currentlyTopmost =
        propState.isOpen &&
        (!profState.isModalOpen || propState.stackOrder > profState.modalStackOrder);

      if (!currentlyTopmost) return;

      const currentPath = window.location.pathname;
      if (
        wasOnOverlayRouteRef.current ||
        currentPath.startsWith('/pricing')
      ) {
        const returnCtx = propState.getUnlockReturnContext();
        if (returnCtx && String(returnCtx.propertyId) === String(activeId)) {
          if (returnCtx.openContactModal) {
            propState.setAutoOpenContactForPropertyId(activeId);
          }
          propState.clearUnlockReturnContext();
        }
        return;
      }

      if (!claimOverlayDismissEvent(e)) return;

      const returnUrl =
        propState.currentReturnUrl || propState.originUrl || previousUrlRef.current;
      animateAndClose(false);
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
  }, [activeId, animateAndClose, replaceBrowserUrlCleanly]);

  // Handle Escape key ONLY when PropertyDetailsModal is the topmost overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeId && !isClosingRef.current) {
        const propState = usePropertyDetailModalStore.getState();
        const profState = useProfileStore.getState();
        const currentlyTopmost =
          propState.isOpen &&
          (!profState.isModalOpen || propState.stackOrder > profState.modalStackOrder);

        if (!currentlyTopmost) return;

        if (
          typeof window !== 'undefined' &&
          window.location.pathname.startsWith('/pricing')
        ) {
          return;
        }
        if (typeof document !== 'undefined' && document.fullscreenElement) {
          return;
        }
        const isHigherOverlayOpen =
          sheetRef.current?.querySelector('[data-modal-overlay-active="true"]') ||
          document.querySelector(
            '[class*="z-[130]"], [class*="z-[140]"], [class*="z-[150]"]'
          );
        if (!isHigherOverlayOpen) {
          if (!claimOverlayDismissEvent(e)) return;
          animateAndClose(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeId, animateAndClose]);

  // Precision native non-passive swipe-down-to-dismiss controller for mobile:
  useEffect(() => {
    if (!activeId) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    type PullPhase =
      | 'idle'
      | 'undecided'
      | 'dismiss'
      | 'scroll'
      | 'horizontal'
      | 'ignored';

    let phase: PullPhase = 'idle';
    let startX = 0;
    let startY = 0;
    let dragAnchorY = 0;
    let currentDragY = 0;
    let lastY = 0;
    let lastTime = 0;
    let prevY = 0;
    let prevTime = 0;
    let startedInCarousel = false;

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
      finishOpenTransition();

      const propState = usePropertyDetailModalStore.getState();
      const profState = useProfileStore.getState();
      const currentlyTopmost =
        propState.isOpen &&
        (!profState.isModalOpen || propState.stackOrder > profState.modalStackOrder);

      if (!currentlyTopmost || isClosingRef.current || e.touches.length !== 1) {
        phase = 'ignored';
        return;
      }

      if (typeof document !== 'undefined' && document.fullscreenElement) {
        phase = 'ignored';
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target?.closest('[data-swipe-dismiss-ignore="true"]') ||
        target?.closest('.gm-style') ||
        target?.closest('input, textarea, select, [role="slider"]')
      ) {
        phase = 'ignored';
        return;
      }

      if (sheet.querySelector('[data-modal-overlay-active="true"]')) {
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
      startedInCarousel = Boolean(
        target?.closest('[data-horizontal-carousel="true"]')
      );
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
        if (e.defaultPrevented) {
          phase = 'horizontal';
          return;
        }

        if (scroller.scrollTop > 1) {
          phase = 'scroll';
          return;
        }

        const slop = startedInCarousel ? 12 : 10;
        if (Math.hypot(dx, dy) < slop) {
          return;
        }

        if (dy <= 0) {
          phase = 'scroll';
          return;
        }

        const requiredVerticalRatio = startedInCarousel ? 2.0 : 1.5;
        if (dy > absX * requiredVerticalRatio && e.cancelable) {
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
      currentDragY =
        rawDelta <= 160 ? rawDelta : 160 + (rawDelta - 160) * 0.55;

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

      if (!wasDismissing || isClosingRef.current) {
        return;
      }

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
    sheet.addEventListener('touchend', handleTouchEndOrCancel, {
      passive: true,
    });
    sheet.addEventListener('touchcancel', handleTouchEndOrCancel, {
      passive: true,
    });

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
  }, [activeId, animateAndClose, clearDragVisualStyles, finishOpenTransition]);

  if (!activeId) {
    return null;
  }

  return (
    <div
      style={{ zIndex: modalZIndex }}
      className={`fixed inset-0 overflow-hidden ${
        !isModalVisible || isClosingRef.current ? 'pointer-events-none' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Détails de la propriété"
    >
      {/* ── Backdrop Overlay with Smooth Fade ── */}
      <div
        ref={backdropRef}
        onClick={() => animateAndClose(true)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-220 ease-out ${
          isModalVisible && !isClosingRef.current
            ? 'opacity-100 cursor-pointer pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* ── Details Sheet Container with Subtle Fade ── */}
      <div
        className="fixed inset-0 pointer-events-none"
        onPointerDown={finishOpenTransition}
      >
        <div
          ref={sheetRef}
          className={`w-full h-full bg-white dark:bg-zinc-950 flex flex-col overflow-hidden transition-opacity ${
            !isModalVisible || isClosingRef.current
              ? 'pointer-events-none opacity-0'
              : 'pointer-events-auto opacity-100'
          } ${
            isClosingRef.current
              ? 'duration-180 ease-in'
              : 'duration-220 ease-out'
          }`}
        >
          {/* Subtle Mobile Drag Pill Handle */}
          <div className="lg:hidden absolute top-[calc(0.5rem+var(--ios-safe-top))] left-1/2 -translate-x-1/2 z-60 pointer-events-none">
            <div className="w-10 h-1.5 rounded-full bg-white/45 dark:bg-white/30 backdrop-blur-md shadow-xs" />
          </div>

          {/* Full Page Oriented Scroll Container */}
          <div
            ref={scrollContainerRef}
            className="w-full h-full overflow-y-auto overscroll-contain"
            style={{
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch',
            }}
            onScroll={(e) => {
              finishOpenTransition();
              setActiveScrollTop(e.currentTarget.scrollTop);
            }}
          >
            <PropertyDetailsClient
              propertyId={activeId}
              initialProperty={activeProp}
              onClose={() => animateAndClose(true)}
              isModal={true}
            />
          </div>
        </div>
      </div>

      {/* ── Shared Element Zoom Transition Overlay Image ── */}
      {overlayRect && overlaySrc && (
        <img
          src={overlaySrc}
          alt=""
          className="fixed pointer-events-none object-cover shadow-2xl select-none"
          style={{
            zIndex: overlayImageZIndex,
            top: `${overlayRect.top}px`,
            left: `${overlayRect.left}px`,
            width: `${overlayRect.width}px`,
            height: `${overlayRect.height}px`,
            borderRadius: overlayRect.borderRadius,
            willChange: 'top, left, width, height, border-radius',
            transform: 'translateZ(0)',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            transition: isAnimatingOverlay
              ? 'top 220ms cubic-bezier(0.16, 1, 0.3, 1), left 220ms cubic-bezier(0.16, 1, 0.3, 1), width 220ms cubic-bezier(0.16, 1, 0.3, 1), height 220ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 220ms cubic-bezier(0.16, 1, 0.3, 1)'
              : 'none',
          }}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget) {
              finishOpenTransition();
            }
          }}
        />
      )}
    </div>
  );
}
