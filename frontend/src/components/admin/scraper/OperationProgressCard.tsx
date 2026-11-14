'use client';

import React from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';

export interface PipelineStep {
  id: string;
  label: string;
  state: 'done' | 'active' | 'pending' | 'error';
}

export interface ProgressStatItem {
  label: string;
  value: number | string;
  tone?: 'default' | 'green' | 'amber' | 'red';
}

export interface OperationProgressCardProps {
  title: string;
  status: 'running' | 'completed' | 'cancelled' | 'error';
  message: string;
  detail?: string | null;
  percent: number;
  countLabel?: string | null;
  elapsedSec?: number;
  etaSeconds?: number | null;
  etaFallbackLabel?: string | null;
  steps?: PipelineStep[];
  stats?: ProgressStatItem[];
  pollWarning?: string | null;
  isCancelling?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onRefreshNow?: () => void;
  onDismiss?: () => void;
}

export function formatDurationFr(totalSec?: number | null): string {
  if (totalSec === null || totalSec === undefined || !Number.isFinite(totalSec)) {
    return '—';
  }
  const safe = Math.max(0, Math.round(totalSec));
  if (safe < 60) return `${safe}s`;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

const TONE_MAP = {
  running: {
    container:
      'bg-emerald-50/85 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900',
    badge:
      'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    badgeLabel: 'En cours',
    barTrack: 'bg-emerald-200/70 dark:bg-emerald-900/60',
    barFill: 'bg-brand-green',
    titleText: 'text-emerald-950 dark:text-emerald-100',
    subText: 'text-emerald-800/90 dark:text-emerald-300/90',
  },
  completed: {
    container:
      'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900',
    badge:
      'bg-emerald-600 text-white',
    badgeLabel: 'Terminé',
    barTrack: 'bg-emerald-200/70 dark:bg-emerald-900/60',
    barFill: 'bg-emerald-600',
    titleText: 'text-emerald-950 dark:text-emerald-100',
    subText: 'text-emerald-800 dark:text-emerald-200',
  },
  cancelled: {
    container:
      'bg-amber-50/85 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900',
    badge:
      'bg-amber-500/20 text-amber-800 dark:text-amber-200',
    badgeLabel: 'Annulé',
    barTrack: 'bg-amber-200/70 dark:bg-amber-900/60',
    barFill: 'bg-amber-500',
    titleText: 'text-amber-950 dark:text-amber-100',
    subText: 'text-amber-800 dark:text-amber-200',
  },
  error: {
    container:
      'bg-red-50/90 dark:bg-red-950/35 border-red-200 dark:border-red-900',
    badge:
      'bg-red-500/15 text-red-700 dark:text-red-300',
    badgeLabel: 'Erreur',
    barTrack: 'bg-red-200/70 dark:bg-red-900/60',
    barFill: 'bg-red-500',
    titleText: 'text-red-950 dark:text-red-100',
    subText: 'text-red-700 dark:text-red-300',
  },
} as const;

export default function OperationProgressCard({
  title,
  status,
  message,
  detail,
  percent,
  countLabel,
  elapsedSec,
  etaSeconds,
  etaFallbackLabel,
  steps,
  stats,
  pollWarning,
  isCancelling = false,
  onCancel,
  onRetry,
  onRefreshNow,
  onDismiss,
}: OperationProgressCardProps) {
  const palette = TONE_MAP[status];
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-4 sm:p-5 rounded-2xl border space-y-3 transition-colors ${palette.container}`}
    >
      {/* Top Row: Status icon + title + timers + controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div className="mt-0.5 shrink-0">
            {status === 'running' ? (
              <Loader2 className="w-4 h-4 animate-spin text-brand-green" />
            ) : status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : status === 'cancelled' ? (
              <Ban className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs sm:text-sm font-bold ${palette.titleText}`}>
                {title}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${palette.badge}`}
              >
                {palette.badgeLabel}
              </span>
              {countLabel && (
                <span className="px-2 py-0.5 rounded-full bg-white/80 dark:bg-zinc-900/70 text-[11px] font-mono font-semibold text-zinc-700 dark:text-zinc-200">
                  {countLabel}
                </span>
              )}
            </div>
            <p className={`text-xs font-medium mt-1 break-words ${palette.subText}`}>
              {message}
            </p>
            {detail && (
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 truncate">
                {detail}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {elapsedSec !== undefined && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/75 dark:bg-zinc-900/60 text-[11px] font-mono text-zinc-700 dark:text-zinc-200">
              <Clock className="w-3 h-3" />
              {formatDurationFr(elapsedSec)} écoulées
            </span>
          )}

          {status === 'running' && (etaSeconds !== null && etaSeconds !== undefined ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-green/15 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200">
              ETA : ~{formatDurationFr(etaSeconds)} restantes
            </span>
          ) : etaFallbackLabel ? (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/70 dark:bg-zinc-900/60 text-[11px] text-zinc-600 dark:text-zinc-300">
              {etaFallbackLabel}
            </span>
          ) : null)}

          {status === 'running' && onCancel && (
            <button
              type="button"
              disabled={isCancelling}
              onClick={onCancel}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 text-[11px] font-bold hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50 cursor-pointer"
            >
              {isCancelling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Ban className="w-3 h-3" />
              )}
              {isCancelling ? 'Annulation...' : 'Annuler'}
            </button>
          )}

          {(status === 'error' || status === 'cancelled') && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[11px] font-bold hover:opacity-90 transition cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Réessayer
            </button>
          )}

          {status !== 'running' && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Fermer ce statut"
              className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Multi-step pipeline pills */}
      {steps && steps.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                step.state === 'done'
                  ? 'bg-emerald-600/10 border-emerald-400/40 text-emerald-800 dark:text-emerald-200'
                  : step.state === 'active'
                  ? 'bg-white dark:bg-zinc-900 border-brand-green text-zinc-900 dark:text-white shadow-2xs'
                  : step.state === 'error'
                  ? 'bg-red-500/15 border-red-400/40 text-red-700 dark:text-red-300'
                  : 'bg-white/50 dark:bg-zinc-900/40 border-zinc-200/70 dark:border-zinc-800 text-zinc-400'
              }`}
            >
              {step.state === 'done' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              ) : step.state === 'active' ? (
                <Loader2 className="w-3 h-3 animate-spin text-brand-green" />
              ) : step.state === 'error' ? (
                <AlertTriangle className="w-3 h-3 text-red-500" />
              ) : (
                <Circle className="w-2.5 h-2.5" />
              )}
              <span>
                {index + 1}. {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-1">
        <div className={`w-full h-2.5 rounded-full overflow-hidden ${palette.barTrack}`}>
          <div
            className={`h-full transition-all duration-300 ${palette.barFill} ${
              status === 'running' && clampedPercent < 100 ? 'relative' : ''
            }`}
            style={{ width: `${clampedPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
          <span>
            {status === 'running'
              ? 'Suivi en temps réel — vous pouvez rester sur cette page ou actualiser sans perdre la progression.'
              : status === 'completed'
              ? 'Opération terminée avec succès.'
              : status === 'cancelled'
              ? 'Opération interrompue à votre demande.'
              : 'L’opération ne s’est pas terminée correctement.'}
          </span>
          <span className="font-mono font-bold shrink-0 ml-2">{clampedPercent}%</span>
        </div>
      </div>

      {/* Live Counters Grid */}
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-0.5">
          {stats.map((item) => {
            const valueClass =
              item.tone === 'green'
                ? 'text-brand-green'
                : item.tone === 'amber'
                ? 'text-amber-600 dark:text-amber-400'
                : item.tone === 'red'
                ? 'text-red-600 dark:text-red-400'
                : 'text-zinc-900 dark:text-white';
            return (
              <div
                key={item.label}
                className="px-3 py-2 rounded-xl bg-white/80 dark:bg-zinc-900/70 border border-black/5 dark:border-white/5 text-xs"
              >
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block truncate">
                  {item.label}
                </span>
                <strong className={`text-sm font-extrabold ${valueClass}`}>
                  {item.value}
                </strong>
              </div>
            );
          })}
        </div>
      )}

      {/* Transient polling error feedback instead of silently hanging */}
      {pollWarning && (
        <div className="px-3 py-2 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900 dark:text-amber-200">
          <span className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {pollWarning}
          </span>
          {onRefreshNow && (
            <button
              type="button"
              onClick={onRefreshNow}
              className="px-2.5 py-0.5 rounded-full bg-amber-900 text-white font-bold hover:opacity-90 cursor-pointer"
            >
              Vérifier maintenant
            </button>
          )}
        </div>
      )}
    </div>
  );
}
