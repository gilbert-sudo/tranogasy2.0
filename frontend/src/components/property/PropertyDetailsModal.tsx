'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { usePropertyDetailModalStore } from '@/store/propertyDetailModalStore';
import PropertyDetailsClient from '@/app/properties/[id]/PropertyDetailsClient';

export default function PropertyDetailsModal() {
  const { isOpen, propertyId, initialProperty, closePropertyDetail } = usePropertyDetailModalStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeProp, setActiveProp] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [dragY, setDragY] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const previousUrlRef = useRef<string>('');
  const isClosingRef = useRef<boolean>(false);
  const originalOverflowRef = useRef<string>('');

  // Synchronize active property state during render when store triggers open
  if (isOpen && propertyId && activeId !== propertyId) {
    setActiveId(propertyId);
    setActiveProp(initialProperty || null);
  }

  // Smooth close with slide-down animation
  const animateAndClose = useCallback((shouldPopHistory = true) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    // Immediately restore body scroll so the user can scroll without any delay
    if (typeof document !== 'undefined') {
      document.body.style.overflow = originalOverflowRef.current || '';
    }

    // Start exit transition
    setIsVisible(false);
    setDragY(0);

    // Restore URL cleanly without triggering Next.js App Router RSC re-fetch / popstate freeze
    if (shouldPopHistory && typeof window !== 'undefined') {
      if (previousUrlRef.current) {
        window.history.replaceState(null, '', previousUrlRef.current);
      }
    }

    // Wait for exit transition to complete before resetting state
    setTimeout(() => {
      setActiveId(null);
      setActiveProp(null);
      closePropertyDetail();
      isClosingRef.current = false;
    }, 320);
  }, [closePropertyDetail]);

  // Handle open state lifecycle (URL sync, scroll lock, animate in)
  useEffect(() => {
    if (!activeId) return;

    isClosingRef.current = false;

    // Record origin URL and sync browser address to /properties/${id}
    const currentUrl = window.location.pathname + window.location.search;
    previousUrlRef.current = currentUrl;

    // Lock body scroll so origin feed retains exact position
    originalOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Push history state so back button and URL sharing reflect the property
    if (window.location.pathname !== `/properties/${activeId}`) {
      window.history.pushState(
        { modalPropertyId: activeId, returnUrl: currentUrl },
        '',
        `/properties/${activeId}`
      );
    }

    // Trigger slide-up asynchronously on next frame
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 20);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflowRef.current || '';
    };
  }, [activeId]);

  // Handle browser Back / Forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      if (activeId && !isClosingRef.current) {
        // Browser back button was clicked, don't call history.back() again
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
        // Check if there is an active lightbox in the DOM
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
    if (!scrollContainerRef.current) return;
    // Only allow downward drag if the user is already at the very top of the scroll view
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
      // Apply downward translation with subtle resistance
      setDragY(diff);
    } else {
      setDragY(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    // If dragged down past threshold, close the modal smoothly
    if (dragY > 80) {
      animateAndClose(true);
    } else {
      // Snap back up
      setDragY(0);
    }
  };

  if (!activeId) {
    return null;
  }

  return (
    <div 
      className={`fixed inset-0 z-[70] overflow-hidden ${
        (!isVisible || isClosingRef.current) ? 'pointer-events-none' : ''
      }`} 
      role="dialog" 
      aria-modal="true"
      aria-label="Détails de la propriété"
    >
      {/* ── Backdrop Overlay with Smooth Fade ── */}
      <div 
        onClick={() => animateAndClose(true)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ease-out ${
          isVisible && dragY === 0 && !isClosingRef.current
            ? 'opacity-100 cursor-pointer pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* ── Slide-up Sheet Container ── */}
      <div className="fixed inset-0 flex flex-col justify-end pointer-events-none">
        <div 
          className={`w-full h-full bg-white dark:bg-zinc-950 flex flex-col overflow-hidden shadow-2xl transition-transform ${
            (!isVisible || isClosingRef.current) 
              ? 'pointer-events-none' 
              : 'pointer-events-auto'
          } ${
            dragY > 0 
              ? 'transition-none' 
              : 'duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]'
          } ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}
          style={{
            transform: dragY > 0 ? `translate3d(0, ${dragY}px, 0)` : undefined,
            willChange: 'transform',
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
    </div>
  );
}
