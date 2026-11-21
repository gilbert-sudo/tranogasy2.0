'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

export interface UseHorizontalSwipeCarouselOptions {
  /** Total number of slides in the carousel */
  itemCount: number;
  /** Currently active slide index (0-based) */
  currentIndex: number;
  /** Called when a swipe commits a slide index change */
  onIndexChange: (nextIndex: number) => void;
  /**
   * Axis lock tolerance: horizontal wins whenever `absX >= absY * horizontalBias`.
   * Default `0.82` (~50.6 deg cone around horizontal) cleanly absorbs natural
   * curved thumb arcs while keeping intentional vertical scrolls responsive.
   */
  horizontalBias?: number;
  /** Movement slop in px before committing horizontal vs vertical axis (default 6px) */
  decisionSlopPx?: number;
  /** Ignore touches starting near left/right screen edges so OS swipe-back still works */
  respectEdgeBack?: boolean;
  /** Disable swipe interception entirely */
  disabled?: boolean;
  /** Optional callback fired when a touch begins inside the carousel */
  onTouchInteractionStart?: () => void;
  /** Optional callback fired when the touch finishes/cancels */
  onTouchInteractionEnd?: () => void;
}

export interface UseHorizontalSwipeCarouselResult {
  bindViewport: (node: HTMLDivElement | null) => void;
  bindTrack: (node: HTMLDivElement | null) => void;
  /** Returns true briefly after a horizontal drag so click handlers can ignore accidental taps */
  shouldSuppressClick: () => boolean;
}

type AxisLock = 'idle' | 'undecided' | 'horizontal' | 'vertical';

const TRANSITION_STYLE = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
const EDGE_BACK_MARGIN_PX = 18;
const CLICK_SUPPRESS_MS = 320;
const EDGE_RESISTANCE = 0.26;

/**
 * High-precision horizontal swipe carousel hook designed for nested photo sliders
 * inside vertical scroll feeds (Explore TikTok feed, Property Details, Cards).
 *
 * Uses a native non-passive `touchmove` listener so horizontal & slightly-diagonal
 * thumb swipes lock onto the carousel BEFORE the browser commits a vertical scroll
 * or parent pull-to-dismiss gesture, while rendering 60/120fps direct DOM transforms
 * with zero React re-renders during drag.
 */
export function useHorizontalSwipeCarousel({
  itemCount,
  currentIndex,
  onIndexChange,
  horizontalBias = 0.82,
  decisionSlopPx = 6,
  respectEdgeBack = false,
  disabled = false,
  onTouchInteractionStart,
  onTouchInteractionEnd,
}: UseHorizontalSwipeCarouselOptions): UseHorizontalSwipeCarouselResult {
  const [viewportNode, setViewportNode] = useState<HTMLDivElement | null>(null);
  const trackNodeRef = useRef<HTMLDivElement | null>(null);

  // Store latest options in a ref updated inside an effect (React 19 strict-ref compliant)
  const optionsRef = useRef({
    itemCount,
    currentIndex,
    onIndexChange,
    horizontalBias,
    decisionSlopPx,
    respectEdgeBack,
    disabled,
    onTouchInteractionStart,
    onTouchInteractionEnd,
  });

  useEffect(() => {
    optionsRef.current = {
      itemCount,
      currentIndex,
      onIndexChange,
      horizontalBias,
      decisionSlopPx,
      respectEdgeBack,
      disabled,
      onTouchInteractionStart,
      onTouchInteractionEnd,
    };
  }, [
    itemCount,
    currentIndex,
    onIndexChange,
    horizontalBias,
    decisionSlopPx,
    respectEdgeBack,
    disabled,
    onTouchInteractionStart,
    onTouchInteractionEnd,
  ]);

  const lastSwipeTimestampRef = useRef(0);
  const isDraggingHorizontalRef = useRef(false);

  const bindViewport = useCallback((node: HTMLDivElement | null) => {
    setViewportNode((prev) => (prev === node ? prev : node));
  }, []);

  const bindTrack = useCallback((node: HTMLDivElement | null) => {
    trackNodeRef.current = node;
  }, []);

  // Keep track visually synced when index changes programmatically (dots, arrows, auto-advance)
  useEffect(() => {
    const track = trackNodeRef.current;
    if (!track || isDraggingHorizontalRef.current) return;
    track.style.transition = TRANSITION_STYLE;
    track.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;
  }, [currentIndex]);

  useEffect(() => {
    const viewport = viewportNode;
    if (!viewport) return;

    let axis: AxisLock = 'idle';
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastTime = 0;
    let prevX = 0;
    let prevTime = 0;
    let appliedDx = 0;
    let didMoveHorizontally = false;

    const settleTrack = (targetIndex: number, animate = true) => {
      const track = trackNodeRef.current;
      if (!track) return;
      track.style.transition = animate ? TRANSITION_STYLE : 'none';
      track.style.transform = `translate3d(-${targetIndex * 100}%, 0, 0)`;
    };

    const resetState = (shouldNotifyEnd = false) => {
      const wasActive = axis !== 'idle';
      axis = 'idle';
      appliedDx = 0;
      didMoveHorizontally = false;
      isDraggingHorizontalRef.current = false;
      if (shouldNotifyEnd && wasActive) {
        optionsRef.current.onTouchInteractionEnd?.();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const opts = optionsRef.current;
      if (opts.disabled || opts.itemCount <= 1) {
        resetState(false);
        return;
      }

      if (e.touches.length !== 1) {
        if (isDraggingHorizontalRef.current) {
          settleTrack(opts.currentIndex, true);
        }
        resetState(true);
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-carousel-gesture-ignore="true"]')) {
        resetState(false);
        return;
      }

      const touch = e.touches[0];
      if (
        opts.respectEdgeBack &&
        typeof window !== 'undefined' &&
        (touch.clientX < EDGE_BACK_MARGIN_PX ||
          touch.clientX > window.innerWidth - EDGE_BACK_MARGIN_PX)
      ) {
        resetState(false);
        return;
      }

      const now = performance.now();
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = startX;
      lastTime = now;
      prevX = startX;
      prevTime = now;
      appliedDx = 0;
      didMoveHorizontally = false;
      axis = 'undecided';
      isDraggingHorizontalRef.current = false;

      opts.onTouchInteractionStart?.();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (axis === 'idle' || axis === 'vertical') return;

      const opts = optionsRef.current;
      if (e.touches.length !== 1) {
        if (isDraggingHorizontalRef.current) {
          settleTrack(opts.currentIndex, true);
        }
        resetState(true);
        return;
      }

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (axis === 'undecided') {
        if (Math.max(absX, absY) < opts.decisionSlopPx) {
          return;
        }

        // If the browser already locked native vertical scroll before we intervened, yield cleanly
        if (!e.cancelable) {
          axis = 'vertical';
          return;
        }

        // Generous horizontal cone absorbs natural curved thumb arcs;
        // pure/steep vertical gestures immediately yield to native scroll.
        if (absX >= absY * opts.horizontalBias) {
          axis = 'horizontal';
          isDraggingHorizontalRef.current = true;
          didMoveHorizontally = true;
          const track = trackNodeRef.current;
          if (track) {
            track.style.transition = 'none';
          }
        } else {
          axis = 'vertical';
          return;
        }
      }

      // axis === 'horizontal'
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();

      const now = performance.now();
      if (now - lastTime > 12) {
        prevX = lastX;
        prevTime = lastTime;
        lastX = touch.clientX;
        lastTime = now;
      }

      const idx = opts.currentIndex;
      const count = opts.itemCount;
      const isPullingPastStart = idx === 0 && dx > 0;
      const isPullingPastEnd = idx >= count - 1 && dx < 0;

      appliedDx = isPullingPastStart || isPullingPastEnd ? dx * EDGE_RESISTANCE : dx;

      const track = trackNodeRef.current;
      if (track) {
        track.style.transform = `translate3d(calc(${-idx * 100}% + ${appliedDx}px), 0, 0)`;
      }
    };

    const handleTouchEndOrCancel = (e: TouchEvent) => {
      if (axis === 'idle') return;

      const opts = optionsRef.current;
      const wasHorizontal = axis === 'horizontal';
      const idx = opts.currentIndex;
      const count = opts.itemCount;

      if (!wasHorizontal) {
        resetState(true);
        return;
      }

      if (didMoveHorizontally) {
        lastSwipeTimestampRef.current = performance.now();
      }

      const isCancel = e.type === 'touchcancel';
      const changedTouch = e.changedTouches[0];
      const finalX = changedTouch ? changedTouch.clientX : lastX;
      const totalDx = finalX - startX;
      const now = performance.now();
      const dt = Math.max(1, now - prevTime);
      const velocityX = (finalX - prevX) / dt; // px/ms

      let nextIndex = idx;
      if (!isCancel) {
        const width = viewport.clientWidth || 320;
        const distanceThreshold = Math.min(width * 0.2, 85);
        const passedDistance = Math.abs(totalDx) > distanceThreshold;
        const passedFlick =
          Math.abs(totalDx) > 18 &&
          Math.abs(velocityX) > 0.28 &&
          Math.sign(velocityX) === Math.sign(totalDx);

        if (passedDistance || passedFlick) {
          if (totalDx < 0 && idx < count - 1) {
            nextIndex = idx + 1;
          } else if (totalDx > 0 && idx > 0) {
            nextIndex = idx - 1;
          }
        }
      }

      isDraggingHorizontalRef.current = false;
      settleTrack(nextIndex, true);

      if (nextIndex !== idx) {
        opts.onIndexChange(nextIndex);
      }

      resetState(true);
    };

    viewport.addEventListener('touchstart', handleTouchStart, { passive: true });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEndOrCancel, { passive: true });
    viewport.addEventListener('touchcancel', handleTouchEndOrCancel, { passive: true });

    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEndOrCancel);
      viewport.removeEventListener('touchcancel', handleTouchEndOrCancel);
    };
  }, [viewportNode]);

  const shouldSuppressClick = useCallback(() => {
    return performance.now() - lastSwipeTimestampRef.current < CLICK_SUPPRESS_MS;
  }, []);

  return {
    bindViewport,
    bindTrack,
    shouldSuppressClick,
  };
}
