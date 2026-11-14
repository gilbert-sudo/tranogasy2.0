'use client';

import React from 'react';
import { AlertTriangle, Ban, CheckCircle2, Eye, Loader2, X } from 'lucide-react';
import type { BackfillJobState } from '@/services/fbIngestion.service';
import { formatDurationFr } from './OperationProgressCard';

export interface HudToast {
  kind: 'ok' | 'err' | 'warn';
  title: string;
  text: string;
}

interface FloatingOperationHudProps {
  activeRun?: {
    title: string;
    message: string;
    percent: number;
    elapsedSec: number;
    etaSeconds?: number | null;
    countLabel?: string | null;
    isCancelling?: boolean;
    onCancel?: () => void;
    onScrollToTop?: () => void;
  } | null;
  activeBackfill?: BackfillJobState | null;
  backfillElapsedSec?: number;
  isCancellingBackfill?: boolean;
  onCancelBackfill?: () => void;
  onFocusOriginsTab?: () => void;
  toast: HudToast | null;
  onDismissToast: () => void;
}

export default function FloatingOperationHud({
  activeRun,
  activeBackfill,
  backfillElapsedSec = 0,
  isCancellingBackfill = false,
  onCancelBackfill,
  onFocusOriginsTab,
  toast,
  onDismissToast,
}: FloatingOperationHudProps) {
  const showBackfill = activeBackfill?.status === 'running';
  if (!activeRun && !showBackfill && !toast) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(25rem,calc(100vw-2rem))] space-y-2.5 pointer-events-none">
      {toast && (
        <div
          role="alert"
          className={`pointer-events-auto rounded-2xl p-3.5 shadow-xl border backdrop-blur-md flex items-start gap-2.5 text-xs ${
            toast.kind === 'ok'
              ? 'bg-emerald-50/95 dark:bg-emerald-950/95 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
              : toast.kind === 'warn'
              ? 'bg-amber-50/95 dark:bg-amber-950/95 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
              : 'bg-red-50/95 dark:bg-red-950/95 border-red-300 dark:border-red-800 text-red-900 dark:text-red-100'
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {toast.kind === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle
                className={`w-4 h-4 ${
                  toast.kind === 'warn' ? 'text-amber-600' : 'text-red-600 dark:text-red-400'
                }`}
              />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="font-bold">{toast.title}</p>
            <p className="text-[11px] opacity-90 break-words">{toast.text}</p>
          </div>
          <button
            type="button"
            onClick={onDismissToast}
            aria-label="Fermer la notification"
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeRun && (
        <div className="pointer-events-auto rounded-2xl p-3.5 bg-white/95 dark:bg-zinc-900/95 border border-emerald-300/80 dark:border-emerald-800 shadow-xl backdrop-blur-md space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-green shrink-0" />
              <span className="truncate">{activeRun.title}</span>
            </span>
            <span className="font-mono font-bold text-brand-green shrink-0">
              {Math.max(0, Math.min(100, Math.round(activeRun.percent)))}%
            </span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-brand-green transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(activeRun.percent)))}%` }}
            />
          </div>

          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 line-clamp-2">
            {activeRun.message}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="font-mono">
              {formatDurationFr(activeRun.elapsedSec)}
              {activeRun.etaSeconds ? ` • ~${formatDurationFr(activeRun.etaSeconds)} rest.` : ''}
              {activeRun.countLabel ? ` • ${activeRun.countLabel}` : ''}
            </span>
            <div className="flex items-center gap-1.5">
              {activeRun.onScrollToTop && (
                <button
                  type="button"
                  onClick={activeRun.onScrollToTop}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  <Eye className="w-3 h-3" /> Détails
                </button>
              )}
              {activeRun.onCancel && (
                <button
                  type="button"
                  disabled={activeRun.isCancelling}
                  onClick={activeRun.onCancel}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-300 font-bold hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                >
                  <Ban className="w-3 h-3" /> Annuler
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showBackfill && activeBackfill && (
        <div className="pointer-events-auto rounded-2xl p-3.5 bg-white/95 dark:bg-zinc-900/95 border border-emerald-300/80 dark:border-emerald-800 shadow-xl backdrop-blur-md space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white truncate">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-green shrink-0" />
              <span className="truncate">Migration Shadow Users</span>
            </span>
            <span className="font-mono font-bold text-brand-green shrink-0">
              {activeBackfill.percent}% ({activeBackfill.current}/{activeBackfill.total || '?'})
            </span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-brand-green transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, activeBackfill.percent))}%` }}
            />
          </div>

          <p className="text-[11px] text-zinc-600 dark:text-zinc-300 line-clamp-2">
            {activeBackfill.message || 'Migration des propriétés en cours...'}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span className="font-mono">
              {formatDurationFr(backfillElapsedSec)}
              {activeBackfill.etaSeconds !== null && activeBackfill.etaSeconds !== undefined
                ? ` • ~${formatDurationFr(activeBackfill.etaSeconds)} rest.`
                : ''}
            </span>
            <div className="flex items-center gap-1.5">
              {onFocusOriginsTab && (
                <button
                  type="button"
                  onClick={onFocusOriginsTab}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold hover:bg-zinc-200 cursor-pointer"
                >
                  <Eye className="w-3 h-3" /> Onglet
                </button>
              )}
              {onCancelBackfill && (
                <button
                  type="button"
                  disabled={isCancellingBackfill}
                  onClick={onCancelBackfill}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-300 font-bold hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                >
                  <Ban className="w-3 h-3" /> Annuler
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
