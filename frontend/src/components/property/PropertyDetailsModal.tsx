'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import PropertyDetailsClient from '@/app/properties/[id]/PropertyDetailsClient';

interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
}

export default function PropertyDetailsModal() {
  const isOpen = usePropertyDetailModalStore(s => s.isOpen);
  const propertyId = usePropertyDetailModalStore(s => s.propertyId);
  const initialProperty = usePropertyDetailModalStore(s => s.initialProperty);
  const transitionOrigin = usePropertyDetailModalStore(s => s.transitionOrigin);
  const closePropertyDetail = usePropertyDetailModalStore(s => s.closePropertyDetail);
  const setIsTransitioning = usePropertyDetailModalStore(s => s.setIsTransitioning);

  const [activeId, setActiveId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeProp, setActiveProp] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [dragY, setDragY] = useState(0);

  // Transition overlay state
  const [overlayRect, setOverlayRect] = useState<OverlayRect | null>(null);
  const [overlaySrc, setOverlaySrc] = useState<string | null>(null);
  const [isAnimatingOverlay, setIsAnimatingOverlay] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const previousUrlRef = useRef<string>('');
  const isClosingRef = useRef<boolean>(false);
  const originalOverflowRef = useRef<string>('');
  const savedOriginRectRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null);
  const savedOriginRadiusRef = useRef<string>('1.5rem 1.5rem 0 0');
  const openTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastOpenedIdRef = useRef<string | null>(null);

  // Synchronize active property state when store triggers open
  if (isOpen && propertyId && activeId !== propertyId) {
    setActiveId(propertyId);
    setActiveProp(initialProperty || null);
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
    setActiveId(null);
    setActiveProp(null);
    setOverlayRect(null);
    setIsAnimatingOverlay(false);
    setIsTransitioning(false);
    setDragY(0);
    closePropertyDetail();
    isClosingRef.current = false;
  }, [closePropertyDetail, setIsTransitioning]);

  // Smooth close with shared element reverse zoom
  const animateAndClose = useCallback((shouldPopHistory = true) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    // Immediately restore body scroll
    if (typeof document !== 'undefined') {
      document.body.style.overflow = originalOverflowRef.current || '';
    }

    // Restore URL cleanly using native replaceState to prevent Next.js RSC re-fetch
    if (shouldPopHistory && typeof window !== 'undefined' && previousUrlRef.current) {
      try {
        History.prototype.replaceState.call(window.history, null, '', previousUrlRef.current);
      } catch {
        window.history.replaceState(null, '', previousUrlRef.current);
      }
    }

    // Find destination hero image current location
    const heroElements = document.querySelectorAll(`[data-detail-hero-image="${activeId}"]`);
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
    const cardImgEl = document.querySelector(`[data-property-card-image="${activeId}"]`) as HTMLElement | null;
    let targetCardRect: { top: number; left: number; width: number; height: number } | null = null;
    let targetCardRadius = savedOriginRadiusRef.current || '1.5rem 1.5rem 0 0';

    if (cardImgEl) {
      const r = cardImgEl.getBoundingClientRect();
      targetCardRect = {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      };
      targetCardRadius = window.getComputedStyle(cardImgEl).borderRadius || targetCardRadius;
    } else if (savedOriginRectRef.current) {
      targetCardRect = savedOriginRectRef.current;
    }

    const currentHeroRect = currentHeroEl?.getBoundingClientRect();
    const isHeroVisible = currentHeroRect && currentHeroRect.bottom > 50 && currentHeroRect.top < window.innerHeight;
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
        borderRadius: window.getComputedStyle(currentHeroEl).borderRadius || '0px',
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
  }, [activeId, finishCloseTransition, setIsTransitioning]);

  // Handle open state lifecycle (native URL sync, scroll lock, image zoom in)
  useEffect(() => {
    if (!activeId) {
      lastOpenedIdRef.current = null;
      return;
    }

    // Only run open animation once per property
    if (lastOpenedIdRef.current === activeId) return;
    lastOpenedIdRef.current = activeId;
    isClosingRef.current = false;

    // Record origin URL
    const currentUrl = window.location.pathname + window.location.search;
    previousUrlRef.current = currentUrl;

    // Lock body scroll so origin feed retains exact position
    originalOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Push native history state without triggering Next.js App Router background RSC fetches
    if (window.location.pathname !== `/properties/${activeId}`) {
      try {
        History.prototype.pushState.call(
          window.history,
          { modalPropertyId: activeId, returnUrl: currentUrl },
          '',
          `/properties/${activeId}`
        );
      } catch {
        window.history.pushState(
          { modalPropertyId: activeId, returnUrl: currentUrl },
          '',
          `/properties/${activeId}`
        );
      }
    }

    if (transitionOrigin && transitionOrigin.rect) {
      savedOriginRectRef.current = transitionOrigin.rect;
      savedOriginRadiusRef.current = transitionOrigin.borderRadius || '1.5rem 1.5rem 0 0';
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
          const heroElements = document.querySelectorAll(`[data-detail-hero-image="${activeId}"]`);
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
              borderRadius: window.getComputedStyle(destEl).borderRadius || '0px',
            };
          } else {
            const isMobile = window.innerWidth < 1024;
            targetRect = {
              top: 0,
              left: 0,
              width: window.innerWidth,
              height: isMobile ? 350 : 420,
              borderRadius: isMobile ? '0 0 2rem 2rem' : '1.5rem',
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

    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      document.body.style.overflow = originalOverflowRef.current || '';
    };
  }, [activeId, transitionOrigin, finishOpenTransition, setIsTransitioning]);

  // Handle browser Back / Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      if (activeId && !isClosingRef.current) {
        animateAndClose(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeId, animateAndClose]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeId && !isClosingRef.current) {
        const isLightboxOpen = document.querySelector('[class*="z-[100]"]');
        if (!isLightboxOpen) {
          animateAndClose(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeId, animateAndClose]);

  // Touch swipe-down to dismiss handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // If the overlay is somehow still showing when user touches screen, dismiss it immediately!
    finishOpenTransition();

    if (!scrollContainerRef.current) return;
    if (scrollContainerRef.current.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isDragging.current = true;
    } else {
      isDragging.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging.current || !scrollContainerRef.current) return;

    if (scrollContainerRef.current.scrollTop > 0) {
      isDragging.current = false;
      setDragY(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;

    if (diff > 0) {
      setDragY(diff);
    } else {
      setDragY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (dragY > 80) {
      animateAndClose(true);
    } else {
      setDragY(0);
    }
  };

  if (!activeId) {
    return null;
  }

  return (
    <div 
      className={`fixed inset-0 z-[70] overflow-hidden ${
        (!isModalVisible || isClosingRef.current) ? 'pointer-events-none' : ''
      }`} 
      role="dialog" 
      aria-modal="true"
      aria-label="Détails de la propriété"
    >
      {/* ── Backdrop Overlay with Smooth Fade ── */}
      <div 
        onClick={() => animateAndClose(true)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-220 ease-out ${
          isModalVisible && dragY === 0 && !isClosingRef.current
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
          className={`w-full h-full bg-white dark:bg-zinc-950 flex flex-col overflow-hidden transition-opacity ${
            (!isModalVisible || isClosingRef.current) 
              ? 'pointer-events-none opacity-0' 
              : 'pointer-events-auto opacity-100'
          } ${
            isClosingRef.current 
              ? 'duration-180 ease-in' 
              : 'duration-220 ease-out'
          }`}
          style={{
            transform: dragY > 0 ? `translate3d(0, ${dragY}px, 0)` : undefined,
            willChange: dragY > 0 ? 'transform' : 'opacity',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Subtle Mobile Drag Pill Handle */}
          <div className="lg:hidden absolute top-2 left-1/2 -translate-x-1/2 z-60 pointer-events-none">
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
            onScroll={finishOpenTransition}
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
            zIndex: 85,
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
