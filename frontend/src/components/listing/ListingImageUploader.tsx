'use client';

import React, { useRef, useState, DragEvent } from 'react';
import {
  ImagePlus,
  X,
  Star,
  AlertCircle,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Zap,
  Cloud,
  Maximize2,
} from 'lucide-react';
import { ImageUploadState } from '@/hooks/useImageUpload';

interface ListingImageUploaderProps {
  uploadState: ImageUploadState;
}

export default function ListingImageUploader({ uploadState }: ListingImageUploaderProps) {
  const {
    images,
    uploadError,
    handleFiles,
    retryUpload,
    removeImage,
    setCoverImage,
    reorderImages,
    clearAllImages,
  } = uploadState;

  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const remainingSlots = Math.max(0, 8 - images.length);

  return (
    <div className="w-full space-y-3 select-none">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/jpg"
        onChange={onInputChange}
        className="hidden"
      />

      {/* ── CASE 1: ZERO PHOTOS (MINIMALIST, SLEEK & DEEPLY ROUNDED) ── */}
      {images.length === 0 ? (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`group relative w-full cursor-pointer rounded-3xl sm:rounded-[32px] border-2 border-dashed transition-all duration-300 py-8 sm:py-10 px-6 flex flex-col items-center justify-center text-center ${
            isDragOver
              ? 'border-brand-green bg-brand-green/10 ring-4 ring-brand-green/20 scale-[1.01]'
              : 'border-zinc-300/80 dark:border-zinc-700/80 hover:border-brand-green bg-zinc-50/50 dark:bg-zinc-900/30 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20'
          }`}
        >
          {/* Central Sleek Icon Container */}
          <div className="relative mb-3.5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/80 dark:border-zinc-700/80 flex items-center justify-center text-zinc-600 dark:text-zinc-300 group-hover:border-brand-green group-hover:text-brand-green group-hover:scale-105 group-hover:shadow-md transition-all duration-300">
              <ImagePlus className="w-7 h-7 sm:w-8 sm:h-8 stroke-[1.8]" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-green text-white flex items-center justify-center shadow-xs">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </div>

          {/* Minimalist, Clean Text */}
          <div className="space-y-1">
            <p className="text-sm sm:text-base font-bold text-zinc-800 dark:text-zinc-100 group-hover:text-brand-green transition-colors">
              Cliquez ou glissez vos photos ici
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
              PNG, JPG, WEBP jusqu’à 8 photos
            </p>
          </div>
        </div>
      ) : (
        /* ── CASE 2: PHOTO GALLERY (MINIMALIST HEADER & DEEPLY ROUNDED GRID) ── */
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className="space-y-3"
        >
          {/* Minimalist Top Bar: Counter & Quick Clear */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                {images.length} / 8 photos
              </span>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium hidden sm:inline">
                · La 1ère photo est la couverture
              </span>
            </div>

            {images.length > 1 && (
              <button
                type="button"
                onClick={clearAllImages}
                className="text-xs font-semibold text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
              >
                Tout effacer
              </button>
            )}
          </div>

          {/* Photo Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-3.5">
            {images.map((img, idx) => {
              const isCover = idx === 0;
              const isDone = img.status === 'done';
              const isProcessing =
                img.status === 'pending' ||
                img.status === 'compressing' ||
                img.status === 'uploading';
              const isError = img.status === 'error';

              return (
                <div
                  key={img.id}
                  className={`group relative aspect-4/3 rounded-2xl sm:rounded-3xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 transition-all duration-200 shadow-xs hover:shadow-md ${
                    isCover
                      ? 'ring-2.5 ring-brand-green shadow-brand-green/20'
                      : 'border border-zinc-200/80 dark:border-zinc-800'
                  }`}
                >
                  {/* Photo Thumbnail */}
                  <div
                    onClick={() => setLightboxIndex(idx)}
                    className="w-full h-full cursor-pointer relative"
                  >
                    <img
                      src={img.previewUrl || img.src}
                      alt={img.name || `Photo ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>

                  {/* ── PREVIEW LOADER OVERLAY ── */}
                  {isProcessing && (
                    <div className="absolute inset-0 z-20 backdrop-blur-xs bg-black/60 flex flex-col items-center justify-center p-2 text-white animate-in fade-in duration-200 rounded-2xl sm:rounded-3xl">
                      <div className="relative w-10 h-10 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-white/20"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="text-brand-green transition-all duration-300 stroke-current"
                            strokeWidth="3.5"
                            strokeDasharray={`${img.progress}, 100`}
                            strokeLinecap="round"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <span className="absolute text-[10px] font-mono font-bold text-white">
                          {img.progress}%
                        </span>
                      </div>

                      <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-white/95">
                        {img.status === 'compressing' ? (
                          <>
                            <Zap className="w-2.5 h-2.5 text-amber-400 animate-bounce" />
                            <span>Compression</span>
                          </>
                        ) : (
                          <>
                            <Cloud className="w-2.5 h-2.5 text-sky-400 animate-pulse" />
                            <span>Google Cloud</span>
                          </>
                        )}
                      </span>
                    </div>
                  )}

                  {/* ── ERROR OVERLAY ── */}
                  {isError && (
                    <div className="absolute inset-0 z-20 bg-red-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-center text-white space-y-1.5 animate-in fade-in rounded-2xl sm:rounded-3xl">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <span className="text-[10px] font-bold text-red-200">
                        Échec d'envoi
                      </span>
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryUpload(img.id);
                          }}
                          className="px-2 py-1 rounded-full bg-white text-zinc-900 text-[10px] font-bold flex items-center gap-1 cursor-pointer active:scale-95"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Réessayer</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(img.id);
                          }}
                          className="p-1 rounded-full bg-red-600 hover:bg-red-700 text-white cursor-pointer active:scale-95"
                          title="Supprimer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── COVER BADGE (TOP-LEFT) ── */}
                  {isCover ? (
                    <div className="absolute top-2 left-2 z-15 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-green text-white shadow-sm backdrop-blur-md">
                      <Star className="w-2.5 h-2.5 fill-white" />
                      <span>Couverture</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCoverImage(idx);
                      }}
                      className="absolute top-2 left-2 z-15 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 hover:bg-black/85 text-white/90 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-xs active:scale-90"
                      title="Définir comme photo de couverture"
                    >
                      <Star className="w-2.5 h-2.5 text-amber-400" />
                      <span className="hidden sm:inline">Couverture</span>
                    </button>
                  )}

                  {/* ── PERMANENT TOUCH-FRIENDLY DELETE BUTTON (TOP-RIGHT) ── */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(img.id);
                    }}
                    className="absolute top-2 right-2 z-15 w-7 h-7 rounded-full bg-black/65 hover:bg-red-600 active:bg-red-700 text-white flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer active:scale-90"
                    title="Supprimer cette photo"
                    aria-label="Supprimer cette photo"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>

                  {/* ── BOTTOM TOOLBAR (REORDER & PREVIEW) ── */}
                  {isDone && (
                    <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-1.5 sm:p-2 flex items-center justify-between">
                      {/* Left: Reorder chevrons */}
                      <div className="flex items-center gap-1">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderImages(idx, idx - 1);
                            }}
                            className="w-5.5 h-5.5 rounded-full bg-white/80 hover:bg-white text-zinc-950 flex items-center justify-center backdrop-blur-md cursor-pointer active:scale-90 transition-transform"
                            title="Déplacer vers la gauche"
                          >
                            <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        )}
                        {idx < images.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderImages(idx, idx + 1);
                            }}
                            className="w-5.5 h-5.5 rounded-full bg-white/80 hover:bg-white text-zinc-950 flex items-center justify-center backdrop-blur-md cursor-pointer active:scale-90 transition-transform"
                            title="Déplacer vers la droite"
                          >
                            <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        )}
                      </div>

                      {/* Right: Fullscreen Lightbox Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxIndex(idx);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold backdrop-blur-md cursor-pointer active:scale-90 transition-all"
                        title="Agrandir la photo"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span className="hidden sm:inline">Aperçu</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── MINIMALIST IN-GRID ADD SLOT ── */}
            {remainingSlots > 0 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative aspect-4/3 rounded-2xl sm:rounded-3xl border-2 border-dashed border-zinc-300/80 dark:border-zinc-700/80 hover:border-brand-green bg-zinc-50/50 dark:bg-zinc-900/30 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 flex flex-col items-center justify-center p-2 text-center cursor-pointer group transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 group-hover:bg-brand-green group-hover:text-white flex items-center justify-center transition-all shadow-2xs">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </div>
                <span className="mt-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 group-hover:text-brand-green transition-colors">
                  Ajouter
                </span>
                <span className="text-[10px] text-zinc-400 font-medium">
                  {remainingSlots} restante{remainingSlots > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Global Error Banner */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* ── FULLSCREEN LIGHTBOX MODAL (DEEPLY ROUNDED) ── */}
      {lightboxIndex !== null && images[lightboxIndex] && (
        <div
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
        >
          {/* Top Bar with Close & Info */}
          <div className="absolute top-4 inset-x-4 sm:inset-x-8 z-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white text-xs font-bold bg-black/40 px-3.5 py-1.5 rounded-full backdrop-blur-md">
              <span>Photo {lightboxIndex + 1} / {images.length}</span>
              {lightboxIndex === 0 && (
                <span className="px-2 py-0.5 rounded-full bg-brand-green text-white font-extrabold text-[10px]">
                  Couverture
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-colors cursor-pointer active:scale-90"
              aria-label="Fermer"
            >
              <X className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>

          {/* Navigation Arrows */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev! - 1 + images.length) % images.length);
                }}
                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/40 text-white backdrop-blur-md transition-all cursor-pointer active:scale-90 z-40"
                aria-label="Photo précédente"
              >
                <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) => (prev! + 1) % images.length);
                }}
                className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/40 text-white backdrop-blur-md transition-all cursor-pointer active:scale-90 z-40"
                aria-label="Photo suivante"
              >
                <ChevronRight className="w-6 h-6 stroke-[2.5]" />
              </button>
            </>
          )}

          {/* Full Image */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[82vh] w-full h-full flex flex-col items-center justify-center p-2"
          >
            <img
              src={images[lightboxIndex].previewUrl || images[lightboxIndex].src}
              alt={images[lightboxIndex].name || 'Aperçu photo'}
              className="max-h-[75vh] max-w-full rounded-3xl object-contain shadow-2xl"
            />

            {/* Quick action bar inside Lightbox */}
            <div className="mt-3 flex items-center gap-2">
              {lightboxIndex !== 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCoverImage(lightboxIndex);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-bold backdrop-blur-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span>Définir comme couverture</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const targetId = images[lightboxIndex].id;
                  removeImage(targetId);
                  setLightboxIndex(null);
                }}
                className="px-3.5 py-1.5 rounded-full bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold backdrop-blur-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer cette photo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
