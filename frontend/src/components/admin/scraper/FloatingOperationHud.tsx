'use client';

import React from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  Eye,
  Loader2,
  X,
} from 'lucide-react';
import type { BackfillJobState } from '@/services/fbIngestion.service';
import { formatDurationFr, useLiveElapsedSeconds } from './OperationProgressCard';

export interface HudToast {
  id: string;
  kind: 'pending' | 'ok' | 'err' | 'warn';
  title: string;
  text?: string;
  actionLabel?: string;
  actionHref?: string;
}

interface FloatingOperationHudProps {
  activeRun?: {
    title: string;
    message: string;
    percent: number;
    startedAt?: string | null;
    elapsedSec?: number;
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
  toasts: HudToast[];
  onDismissToast: (id: string) => void;
}

export default function FloatingOperationHud({
  activeRun,
  activeBackfill,
  backfillElapsedSec,
  isCancellingBackfill = false,
  onCancelBackfill,
  onFocusOriginsTab,
  toasts,
  onDismissToast,
}: FloatingOperationHudProps) {
  const showBackfill = activeBackfill?.status === 'running';
  const liveRunElapsed = useLiveElapsedSeconds(
    activeRun?.startedAt,
    Boolean(activeRun && activeRun.elapsedSec === undefined),
  );
  const liveBackfillElapsed = useLiveElapsedSeconds(
    activeBackfill?.startedAt,
    Boolean(showBackfill && backfillElapsedSec === undefined),
  );

  const resolvedRunElapsed =
    activeRun?.elapsedSec !== undefined ? activeRun.elapsedSec : liveRunElapsed;
  const resolvedBackfillElapsed =
    backfillElapsedSec !== undefined ? backfillElapsedSec : liveBackfillElapsed;

  if (!activeRun && !showBackfill && toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(25rem,calc(100vw-2rem))] space-y-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`pointer-events-auto rounded-2xl p-3.5 shadow-xl border backdrop-blur-md flex items-start gap-2.5 text-xs transition-all duration-200 ${
            toast.kind === 'pending'
              ? 'bg-white/95 dark:bg-zinc-900/95 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
              : toast.kind === 'ok'
              ? 'bg-emerald-50/95 dark:bg-emerald-950/95 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
              : toast.kind === 'warn'
              ? 'bg-amber-50/95 dark:bg-amber-950/95 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
              : 'bg-red-50/95 dark:bg-red-950/95 border-red-300 dark:border-red-800 text-red-900 dark:text-red-100'
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {toast.kind === 'pending' ? (
              <Loader2 className="w-4 h-4 animate-spin text-brand-green" />
            ) : toast.kind === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle
                className={`w-4 h-4 ${
                  toast.kind === 'warn' ? 'text-amber-600' : 'text-red-600 dark:text-red-400'
                }`}
              />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-bold leading-snug">{toast.title}</p>
            {toast.text && (
              <p className="text-[11px] opacity-90 break-words leading-snug">{toast.text}</p>
            )}
            {toast.actionLabel && toast.actionHref && (
              <a
                href={toast.actionHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-green hover:underline pt-0.5"
              >
                {toast.actionLabel}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismissToast(toast.id)}
            aria-label="Fermer la notification"
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

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
              {formatDurationFr(resolvedRunElapsed)}
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
              {formatDurationFr(resolvedBackfillElapsed)}
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
