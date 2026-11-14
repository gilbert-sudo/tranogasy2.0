'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Star,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface AdminPhotoGalleryModalProps {
  isOpen: boolean;
  images: string[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
  onRemoveImage?: (index: number) => void;
  onSetCoverImage?: (index: number) => void;
}

const ZOOM_STEPS = [1, 1.5, 2.25, 3];

export function AdminPhotoGalleryModal({
  isOpen,
  images,
  initialIndex = 0,
  title,
  onClose,
  onRemoveImage,
  onSetCoverImage,
}: AdminPhotoGalleryModalProps) {
  if (!isOpen || images.length === 0) return null;

  const initialClamped = Math.max(
    0,
    Math.min(initialIndex, Math.max(0, images.length - 1)),
  );

  return (
    <AdminPhotoGalleryContent
      key={initialClamped}
      images={images}
      initialIndex={initialClamped}
      title={title}
      onClose={onClose}
      onRemoveImage={onRemoveImage}
      onSetCoverImage={onSetCoverImage}
    />
  );
}

interface AdminPhotoGalleryContentProps {
  images: string[];
  initialIndex: number;
  title?: string;
  onClose: () => void;
  onRemoveImage?: (index: number) => void;
  onSetCoverImage?: (index: number) => void;
}

function AdminPhotoGalleryContent({
  images,
  initialIndex,
  title,
  onClose,
  onRemoveImage,
  onSetCoverImage,
}: AdminPhotoGalleryContentProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(0, images.length - 1)));
  const currentUrl = images[safeIndex];
  const imageError = failedUrl === currentUrl;

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }, [safeIndex]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight' && images.length > 1) {
        e.preventDefault();
        setZoom(1);
        setCurrentIndex((prev) => (prev + 1) % images.length);
      } else if (e.key === 'ArrowLeft' && images.length > 1) {
        e.preventDefault();
        setZoom(1);
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => ZOOM_STEPS.find((s) => s > z) ?? 3);
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? 1);
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [images.length, onClose]);

  const goPrev = () => {
    setZoom(1);
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goNext = () => {
    setZoom(1);
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || !viewportRef.current) return;
    dragStateRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: viewportRef.current.scrollLeft,
      scrollTop: viewportRef.current.scrollTop,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state.dragging || !viewportRef.current) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      state.moved = true;
    }
    viewportRef.current.scrollLeft = state.scrollLeft - dx;
    viewportRef.current.scrollTop = state.scrollTop - dy;
  };

  const handlePointerUp = () => {
    dragStateRef.current.dragging = false;
  };

  const handleImageClick = () => {
    if (dragStateRef.current.moved) {
      dragStateRef.current.moved = false;
      return;
    }
    setZoom((z) => (z === 1 ? 1.75 : 1));
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col bg-black/95 text-white select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu et inspection des photos"
    >
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">
            {safeIndex + 1} / {images.length}
          </span>
          {safeIndex === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#7cbd1e]/25 px-2.5 py-1 text-[11px] font-semibold text-[#a6eb42]">
              <Star className="h-3 w-3 fill-current" />
              Photo principale (#1)
            </span>
          )}
          {title && (
            <span className="hidden truncate text-sm font-medium text-white/80 sm:inline max-w-[340px]">
              {title}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-white/15 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(2))))}
              disabled={zoom <= 1}
              title="Dézoomer (-)"
              className="rounded-md p-1.5 text-white/85 transition hover:bg-white/10 disabled:opacity-40"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => (z === 1 ? 1.75 : 1))}
              title="Réinitialiser / basculer zoom (0)"
              className="min-w-[54px] px-2 text-xs font-semibold text-white/90 hover:text-white"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.5).toFixed(2))))}
              disabled={zoom >= 3}
              title="Zoomer (+)"
              className="rounded-md p-1.5 text-white/85 transition hover:bg-white/10 disabled:opacity-40"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                onClick={() => setZoom(1)}
                title="Réinitialiser zoom"
                className="rounded-md p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {onSetCoverImage && safeIndex > 0 && (
            <button
              type="button"
              onClick={() => {
                onSetCoverImage(safeIndex);
                setCurrentIndex(0);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#7cbd1e]/50 bg-[#7cbd1e]/20 px-2.5 py-1.5 text-xs font-semibold text-[#b8f35a] transition hover:bg-[#7cbd1e]/35"
            >
              <Star className="h-3.5 w-3.5" />
              Mettre en #1
            </button>
          )}

          {onRemoveImage && (
            <button
              type="button"
              onClick={() => {
                const nextLength = images.length - 1;
                onRemoveImage(safeIndex);
                setZoom(1);
                if (nextLength <= 0) {
                  onClose();
                } else if (safeIndex >= nextLength) {
                  setCurrentIndex(nextLength - 1);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/35"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Retirer
            </button>
          )}

          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/20"
            title="Ouvrir l'image source dans un nouvel onglet"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Original</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la galerie (Échap)"
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="relative flex flex-1 min-h-0 items-center justify-center">
        {images.length > 1 && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Photo précédente"
            className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/80"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
          className={`flex h-full w-full items-center justify-center overflow-auto p-4 sm:p-8 ${
            zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          {imageError ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-6 py-8 text-center">
              <p className="text-sm font-semibold text-red-300">
                Impossible de charger cet aperçu image.
              </p>
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ouvrir le lien GCS directement
              </a>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentUrl}
              alt={`${title || 'Propriété'} — photo ${safeIndex + 1}`}
              onClick={handleImageClick}
              onError={() => setFailedUrl(currentUrl)}
              draggable={false}
              style={{
                width: zoom > 1 ? `${zoom * 82}%` : undefined,
                maxWidth: zoom > 1 ? 'none' : '100%',
                maxHeight: zoom > 1 ? 'none' : '100%',
              }}
              className={`rounded-lg object-contain shadow-2xl transition-all duration-150 ${
                zoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'
              }`}
            />
          )}
        </div>

        {images.length > 1 && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Photo suivante"
            className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/80"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip */}
      {images.length > 1 && (
        <div className="border-t border-white/10 bg-black/80 px-4 py-3 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-start gap-2 overflow-x-auto pb-0.5 sm:justify-center">
            {images.map((url, idx) => {
              const active = idx === safeIndex;
              return (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setCurrentIndex(idx);
                  }}
                  className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    active
                      ? 'border-[#7cbd1e] ring-2 ring-[#7cbd1e]/40 opacity-100 scale-105'
                      : 'border-white/15 opacity-55 hover:opacity-90'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Miniature ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-1 top-1 rounded bg-black/75 px-1 text-[10px] font-bold text-white">
                    #{idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-white/45">
            Astuce : cliquez sur l&apos;image pour zoomer (glisser pour déplacer) · ← / → pour naviguer · Échap pour fermer
          </p>
        </div>
      )}
    </div>
  );
}
