'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface PropertyPhotoLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: (finalIndex: number) => void;
}

type LightboxGestureAxis = 'idle' | 'undecided' | 'horizontal' | 'vertical';

const SLIDE_TRANSITION = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
const DISMISS_SPRING = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease';

/**
 * Portaled, gesture-isolated full-screen photo lightbox.
 *
 * - Mounted directly on `document.body` (z-[140]) so touch gestures NEVER bubble
 *   into `PropertyDetailsModal` and cannot accidentally close the property details page.
 * - Horizontal swipes (even slightly diagonal) smoothly browse photos 1:1.
 * - Vertical downward swipes smoothly drag and close ONLY this lightbox.
 */
export default function PropertyPhotoLightbox({
  images,
  initialIndex,
  onClose,
}: PropertyPhotoLightboxProps) {
  const clampedInitial = Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1)));
  const [activeIndex, setActiveIndex] = useState(clampedInitial);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dismissLayerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const activeIndexRef = useRef(activeIndex);
  const imagesLenRef = useRef(images.length);
  const onCloseRef = useRef(onClose);
  const isClosingRef = useRef(false);
  const lastSwipeTsRef = useRef(0);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    imagesLenRef.current = images.length;
    onCloseRef.current = onClose;
  }, [activeIndex, images.length, onClose]);

  const closeWithAnimation = useCallback((direction: 'down' | 'fade' = 'fade') => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const dismissLayer = dismissLayerRef.current;
    const backdrop = backdropRef.current;

    if (direction === 'down' && dismissLayer && backdrop) {
      dismissLayer.style.transition = 'transform 200ms cubic-bezier(0.4, 0, 1, 1), opacity 180ms ease';
      dismissLayer.style.transform = `translate3d(0, ${Math.max(window.innerHeight * 0.45, 320)}px, 0) scale(0.88)`;
      dismissLayer.style.opacity = '0';
      backdrop.style.transition = 'opacity 180ms ease';
      backdrop.style.opacity = '0';
      setTimeout(() => {
        onCloseRef.current(activeIndexRef.current);
      }, 190);
    } else {
      onCloseRef.current(activeIndexRef.current);
    }
  }, []);

  const goToIndex = useCallback((nextIdx: number) => {
    const clamped = Math.max(0, Math.min(nextIdx, imagesLenRef.current - 1));
    setActiveIndex(clamped);
    if (trackRef.current) {
      trackRef.current.style.transition = SLIDE_TRANSITION;
      trackRef.current.style.transform = `translate3d(-${clamped * 100}%, 0, 0)`;
    }
  }, []);

  // Lock body scroll safely (preserving whatever overflow value was active underneath, e.g. PropertyDetailsModal)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Keyboard navigation — capture phase so Escape closes ONLY the lightbox, never underlying PropertyDetailsModal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeWithAnimation('fade');
      } else if (e.key === 'ArrowLeft' && activeIndexRef.current > 0) {
        e.preventDefault();
        goToIndex(activeIndexRef.current - 1);
      } else if (e.key === 'ArrowRight' && activeIndexRef.current < imagesLenRef.current - 1) {
        e.preventDefault();
        goToIndex(activeIndexRef.current + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [closeWithAnimation, goToIndex]);

  // Dual-axis native touch gesture controller (Horizontal = browse photos, Vertical down = dismiss ONLY lightbox)
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    let axis: LightboxGestureAxis = 'idle';
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let prevX = 0;
    let prevY = 0;
    let prevTime = 0;
    let dragY = 0;
    let didDrag = false;

    const resetDismissVisual = () => {
      const dismissLayer = dismissLayerRef.current;
      const backdrop = backdropRef.current;
      if (dismissLayer) {
        dismissLayer.style.transition = DISMISS_SPRING;
        dismissLayer.style.transform = 'translate3d(0, 0, 0) scale(1)';
        dismissLayer.style.opacity = '1';
      }
      if (backdrop) {
        backdrop.style.transition = 'opacity 220ms ease';
        backdrop.style.opacity = '1';
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Never leak touches out of the lightbox
      e.stopPropagation();

      if (isClosingRef.current) return;
      if (e.touches.length !== 1) {
        axis = 'idle';
        resetDismissVisual();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) {
        axis = 'idle';
        return;
      }

      const touch = e.touches[0];
      const now = performance.now();
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = startX;
      lastY = startY;
      lastTime = now;
      prevX = startX;
      prevY = startY;
      prevTime = now;
      dragY = 0;
      didDrag = false;
      axis = 'undecided';
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.stopPropagation();

      if (axis === 'idle' || isClosingRef.current) return;
      if (e.touches.length !== 1) {
        axis = 'idle';
        resetDismissVisual();
        if (trackRef.current) {
          trackRef.current.style.transition = SLIDE_TRANSITION;
          trackRef.current.style.transform = `translate3d(-${activeIndexRef.current * 100}%, 0, 0)`;
        }
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (axis === 'undecided') {
        if (Math.max(absX, absY) < 7) return;

        // Horizontal browsing wins generously for curved thumb arcs when >1 photo
        if (imagesLenRef.current > 1 && absX >= absY * 0.85) {
          axis = 'horizontal';
          didDrag = true;
          if (trackRef.current) {
            trackRef.current.style.transition = 'none';
          }
        } else if (dy > 0 && absY > absX * 1.35) {
          // Strict downward vertical gesture dismisses ONLY the lightbox
          axis = 'vertical';
          didDrag = true;
          if (dismissLayerRef.current) {
            dismissLayerRef.current.style.transition = 'none';
          }
          if (backdropRef.current) {
            backdropRef.current.style.transition = 'none';
          }
        } else if (imagesLenRef.current > 1 && absX > 0) {
          // Mildly diagonal swipe in multi-photo gallery still defaults to photo browsing
          axis = 'horizontal';
          didDrag = true;
          if (trackRef.current) {
            trackRef.current.style.transition = 'none';
          }
        } else {
          return;
        }
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      const now = performance.now();
      if (now - lastTime > 12) {
        prevX = lastX;
        prevY = lastY;
        prevTime = lastTime;
        lastX = touch.clientX;
        lastY = touch.clientY;
        lastTime = now;
      }

      if (axis === 'horizontal') {
        const idx = activeIndexRef.current;
        const count = imagesLenRef.current;
        const atEdge = (idx === 0 && dx > 0) || (idx >= count - 1 && dx < 0);
        const appliedDx = atEdge ? dx * 0.28 : dx;
        if (trackRef.current) {
          trackRef.current.style.transform = `translate3d(calc(${-idx * 100}% + ${appliedDx}px), 0, 0)`;
        }
      } else if (axis === 'vertical') {
        dragY = Math.max(0, dy);
        const progress = Math.min(1, dragY / 300);
        const scale = 1 - progress * 0.1;
        const backdropOpacity = Math.max(0.15, 1 - progress * 0.85);

        if (dismissLayerRef.current) {
          dismissLayerRef.current.style.transform = `translate3d(0, ${dragY}px, 0) scale(${scale})`;
        }
        if (backdropRef.current) {
          backdropRef.current.style.opacity = String(backdropOpacity);
        }
      }
    };

    const handleTouchEndOrCancel = (e: TouchEvent) => {
      e.stopPropagation();

      if (axis === 'idle' || isClosingRef.current) return;

      const currentAxis = axis;
      axis = 'idle';

      if (didDrag) {
        lastSwipeTsRef.current = performance.now();
      }

      const isCancel = e.type === 'touchcancel';
      const touch = e.changedTouches[0];
      const now = performance.now();
      const dt = Math.max(1, now - prevTime);

      if (currentAxis === 'horizontal') {
        const idx = activeIndexRef.current;
        const count = imagesLenRef.current;
        const finalX = touch ? touch.clientX : lastX;
        const totalDx = finalX - startX;
        const vx = (finalX - prevX) / dt;

        let nextIdx = idx;
        if (!isCancel) {
          const width = overlay.clientWidth || 360;
          const passedDistance = Math.abs(totalDx) > Math.min(width * 0.2, 85);
          const passedFlick =
            Math.abs(totalDx) > 18 &&
            Math.abs(vx) > 0.28 &&
            Math.sign(vx) === Math.sign(totalDx);

          if (passedDistance || passedFlick) {
            if (totalDx < 0 && idx < count - 1) nextIdx = idx + 1;
            else if (totalDx > 0 && idx > 0) nextIdx = idx - 1;
          }
        }

        if (trackRef.current) {
          trackRef.current.style.transition = SLIDE_TRANSITION;
          trackRef.current.style.transform = `translate3d(-${nextIdx * 100}%, 0, 0)`;
        }
        if (nextIdx !== idx) {
          setActiveIndex(nextIdx);
        }
      } else if (currentAxis === 'vertical') {
        const finalY = touch ? touch.clientY : lastY;
        const vy = (finalY - prevY) / dt;
        const shouldClose = !isCancel && (dragY > 95 || (dragY > 45 && vy > 0.5));

        if (shouldClose) {
          closeWithAnimation('down');
        } else {
          resetDismissVisual();
        }
      }
    };

    overlay.addEventListener('touchstart', handleTouchStart, { passive: true });
    overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
    overlay.addEventListener('touchend', handleTouchEndOrCancel, { passive: true });
    overlay.addEventListener('touchcancel', handleTouchEndOrCancel, { passive: true });

    return () => {
      overlay.removeEventListener('touchstart', handleTouchStart);
      overlay.removeEventListener('touchmove', handleTouchMove);
      overlay.removeEventListener('touchend', handleTouchEndOrCancel);
      overlay.removeEventListener('touchcancel', handleTouchEndOrCancel);
    };
  }, [closeWithAnimation]);

  if (typeof document === 'undefined' || images.length === 0) {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      data-swipe-dismiss-ignore="true"
      data-modal-overlay-active="true"
      role="dialog"
      aria-modal="true"
      aria-label="Galerie photo en plein écran"
      className="fixed inset-0 z-[140] flex items-center justify-center select-none overflow-hidden"
      style={{ touchAction: 'none' }}
      onClick={() => {
        if (performance.now() - lastSwipeTsRef.current < 320) return;
        closeWithAnimation('fade');
      }}
    >
      {/* Dimmed Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/95 backdrop-blur-xl"
        aria-hidden="true"
      />

      {/* Top Subtle Drag Pill Indicator (mobile) */}
      <div className="lg:hidden absolute top-[calc(0.65rem+var(--ios-safe-top))] left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="w-10 h-1.5 rounded-full bg-white/35" />
      </div>

      {/* Close Button */}
      <button
        type="button"
        aria-label="Fermer la galerie plein écran"
        className="absolute top-[calc(1rem+var(--ios-safe-top))] right-4 sm:top-6 sm:right-6 z-30 h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-white/15 hover:bg-white/25 active:scale-90 flex items-center justify-center text-white transition-all border border-white/25 backdrop-blur-md cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          closeWithAnimation('fade');
        }}
      >
        <X className="h-6 w-6" />
      </button>

      {/* Prev Arrow (Desktop / Tablet) */}
      {activeIndex > 0 && (
        <button
          type="button"
          aria-label="Photo précédente"
          className="hidden md:flex absolute left-6 lg:left-8 z-30 h-13 w-13 rounded-full bg-white/15 items-center justify-center text-white hover:bg-white/25 hover:scale-105 active:scale-95 transition-all border border-white/20 backdrop-blur-md cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            goToIndex(activeIndex - 1);
          }}
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      {/* Next Arrow (Desktop / Tablet) */}
      {activeIndex < images.length - 1 && (
        <button
          type="button"
          aria-label="Photo suivante"
          className="hidden md:flex absolute right-6 lg:right-8 z-30 h-13 w-13 rounded-full bg-white/15 items-center justify-center text-white hover:bg-white/25 hover:scale-105 active:scale-95 transition-all border border-white/20 backdrop-blur-md cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            goToIndex(activeIndex + 1);
          }}
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      {/* Dismissible Swipe Layer + Horizontal Slide Track */}
      <div
        ref={dismissLayerRef}
        className="relative z-10 w-full h-full overflow-hidden will-change-transform"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={trackRef}
          className="flex w-full h-full will-change-transform"
          style={{
            transform: `translate3d(-${activeIndex * 100}%, 0, 0)`,
          }}
        >
          {images.map((src, idx) => {
            const shouldMount = Math.abs(idx - activeIndex) <= 1;
            return (
              <div
                key={idx}
                className="w-full h-full shrink-0 flex items-center justify-center px-3 sm:px-6 md:px-24"
              >
                <div className="relative w-full max-w-6xl h-[82dvh] sm:h-[85vh]">
                  {shouldMount && (
                    <Image
                      src={src}
                      alt={`Photo ${idx + 1}`}
                      fill
                      sizes="100vw"
                      draggable={false}
                      className="object-contain select-none pointer-events-none"
                      priority={idx === activeIndex}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Counter Pill */}
      <div className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-white px-5 py-2 rounded-full bg-white/12 border border-white/20 text-sm font-bold tracking-widest backdrop-blur-md z-30 tabular-nums pointer-events-none">
        {activeIndex + 1} / {images.length}
      </div>
    </div>,
    document.body
  );
}
