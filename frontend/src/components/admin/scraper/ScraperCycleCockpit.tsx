'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Download,
  History,
  Layers,
  Loader2,
  MapPin,
  Moon,
  Pause,
  Play,
  Power,
  Radio,
  RefreshCw,
  Settings2,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import type {
  FbActivityLogEntry,
  FbGroupTarget,
  FbIngestionConfig,
  FbRunHistoryEntry,
  FbRunTrigger,
  FbSchedulerStatus,
} from '@/services/fbIngestion.service';
import { formatDurationFr } from './OperationProgressCard';

interface ScraperCycleCockpitProps {
  config: FbIngestionConfig;
  groups: FbGroupTarget[];
  runActive: boolean;
  launchingMode: 'scrape' | 'snapshot';
  isRefreshing: boolean;
  autoSyncIntervalSec: number;
  onToggleLive: () => void;
  onRunNow: () => void;
  onOpenGroupsTab?: () => void;
  onSelectSnapshotId?: (snapshotId: string) => void;
  onRefreshNow: () => void;
}

const STORAGE_PANEL_OPEN_KEY = 'tg_scraper_cockpit_logs_open';

function formatCountdownClock(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

function formatRingShort(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  if (safe >= 3600) {
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    return `${h}h${String(m).padStart(2, '0')}`;
  }
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTanaClock(dateInput: string | number | Date | null | undefined, withSeconds = true): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Indian/Antananarivo',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  }).format(d);
}

function formatTanaDateTime(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Indian/Antananarivo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

function formatRelativeAgeFr(dateInput: string | number | null | undefined, nowMs: number): string {
  if (!dateInput) return '—';
  const ts = typeof dateInput === 'number' ? dateInput : new Date(dateInput).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (diffSec < 5) return "à l'instant";
  if (diffSec < 60) return `il y a ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `il y a ${diffHr}h ${diffMin % 60}m`;
  const diffDays = Math.floor(diffHr / 24);
  return `il y a ${diffDays}j`;
}

function getTanaTimeInfo(nowMs: number, activeHourStart: number, activeHourEnd: number) {
  const tanaOffsetMs = 3 * 3600_000;
  const tanaDate = new Date(nowMs + tanaOffsetMs);
  const tanaHour = tanaDate.getUTCHours();
  const tanaMinute = tanaDate.getUTCMinutes();
  const tanaSecond = tanaDate.getUTCSeconds();
  const dayOffset = tanaHour >= activeHourEnd ? 1 : 0;
  const wakeupUtcMs =
    Date.UTC(
      tanaDate.getUTCFullYear(),
      tanaDate.getUTCMonth(),
      tanaDate.getUTCDate() + dayOffset,
      activeHourStart,
      0,
      0,
      0,
    ) - tanaOffsetMs;

  return {
    tanaHour,
    tanaMinute,
    tanaSecond,
    tanaClockLabel: `${String(tanaHour).padStart(2, '0')}:${String(tanaMinute).padStart(2, '0')}:${String(tanaSecond).padStart(2, '0')}`,
    wakeupUtcMs,
  };
}

function getTriggerLabel(trigger?: FbRunTrigger | 'system' | null): {
  label: string;
  className: string;
} {
  switch (trigger) {
    case 'scheduled':
      return {
        label: 'Auto (cycle)',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
      };
    case 'manual':
      return {
        label: 'Manuel',
        className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300',
      };
    case 'snapshot':
      return {
        label: 'Snapshot',
        className: 'bg-violet-100 text-violet-800 dark:bg-violet-950/70 dark:text-violet-300',
      };
    default:
      return {
        label: 'Système',
        className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
      };
  }
}

const STATE_PALETTE: Record<
  FbSchedulerStatus,
  {
    container: string;
    badge: string;
    badgeLabel: string;
    dot: string;
    ringStroke: string;
    ringTrack: string;
    accentText: string;
  }
> = {
  waiting_next_cycle: {
    container:
      'border-emerald-200/90 dark:border-emerald-900/70 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 dark:from-emerald-950/25 dark:via-zinc-900 dark:to-teal-950/15',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200',
    badgeLabel: 'EN ATTENTE DU PROCHAIN CYCLE',
    dot: 'bg-emerald-500 animate-pulse',
    ringStroke: 'stroke-brand-green',
    ringTrack: 'stroke-emerald-200/80 dark:stroke-emerald-900/60',
    accentText: 'text-emerald-700 dark:text-emerald-300',
  },
  due_now: {
    container:
      'border-brand-green/60 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/70 dark:from-emerald-950/40 dark:via-zinc-900 dark:to-emerald-950/20',
    badge: 'bg-brand-green text-white',
    badgeLabel: 'DÉCLENCHEMENT IMMINENT',
    dot: 'bg-white animate-ping',
    ringStroke: 'stroke-brand-green',
    ringTrack: 'stroke-emerald-200 dark:stroke-emerald-900',
    accentText: 'text-brand-green',
  },
  running: {
    container:
      'border-brand-green/70 bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 dark:from-emerald-950/35 dark:via-zinc-900 dark:to-emerald-950/20',
    badge: 'bg-brand-green text-white',
    badgeLabel: 'COLLECTE EN COURS',
    dot: 'bg-white animate-pulse',
    ringStroke: 'stroke-brand-green',
    ringTrack: 'stroke-emerald-200 dark:stroke-emerald-900',
    accentText: 'text-brand-green',
  },
  importing_snapshot: {
    container:
      'border-violet-300/80 dark:border-violet-800 bg-gradient-to-br from-violet-50/70 via-white to-indigo-50/40 dark:from-violet-950/25 dark:via-zinc-900 dark:to-indigo-950/15',
    badge: 'bg-violet-600 text-white',
    badgeLabel: 'IMPORT SNAPSHOT EN COURS',
    dot: 'bg-white animate-pulse',
    ringStroke: 'stroke-violet-600',
    ringTrack: 'stroke-violet-200 dark:stroke-violet-900',
    accentText: 'text-violet-700 dark:text-violet-300',
  },
  sleeping_night: {
    container:
      'border-indigo-200/90 dark:border-indigo-900/70 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 dark:from-indigo-950/25 dark:via-zinc-900 dark:to-slate-950/30',
    badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-200',
    badgeLabel: 'EN REPOS NOCTURNE (VEILLE)',
    dot: 'bg-indigo-500',
    ringStroke: 'stroke-indigo-500',
    ringTrack: 'stroke-indigo-200/80 dark:stroke-indigo-900/60',
    accentText: 'text-indigo-700 dark:text-indigo-300',
  },
  no_active_groups: {
    container:
      'border-amber-300 dark:border-amber-800 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 dark:from-amber-950/30 dark:via-zinc-900 dark:to-orange-950/15',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-200',
    badgeLabel: 'BLOQUÉ : 0 GROUPE ACTIF',
    dot: 'bg-amber-500 animate-pulse',
    ringStroke: 'stroke-amber-500',
    ringTrack: 'stroke-amber-200 dark:stroke-amber-900/60',
    accentText: 'text-amber-700 dark:text-amber-300',
  },
  paused: {
    container:
      'border-zinc-200/90 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50',
    badge: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    badgeLabel: 'EN PAUSE (ARRÊTÉ)',
    dot: 'bg-zinc-400',
    ringStroke: 'stroke-zinc-400',
    ringTrack: 'stroke-zinc-200 dark:stroke-zinc-800',
    accentText: 'text-zinc-600 dark:text-zinc-300',
  },
};

export default function ScraperCycleCockpit({
  config,
  groups,
  runActive,
  launchingMode,
  isRefreshing,
  autoSyncIntervalSec,
  onToggleLive,
  onRunNow,
  onOpenGroupsTab,
  onSelectSnapshotId,
  onRefreshNow,
}: ScraperCycleCockpitProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const serverOffsetRef = useRef<number>(0);

  const [showActivityDrawer, setShowActivityDrawer] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(STORAGE_PANEL_OPEN_KEY);
    return saved === null ? true : saved === 'true';
  });
  const [logFilter, setLogFilter] = useState<'all' | 'runs' | 'scheduler'>('all');

  useEffect(() => {
    if (config.schedulerDiagnostics?.serverTimeIso) {
      const srvMs = new Date(config.schedulerDiagnostics.serverTimeIso).getTime();
      if (Number.isFinite(srvMs)) {
        serverOffsetRef.current = srvMs - Date.now();
      }
    }
  }, [config.schedulerDiagnostics?.serverTimeIso]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNowMs(Date.now() + serverOffsetRef.current);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const toggleDrawer = () => {
    setShowActivityDrawer((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_PANEL_OPEN_KEY, String(next));
      }
      return next;
    });
  };

  const activeGroups = useMemo(() => groups.filter((g) => g.isActive), [groups]);
  const activeGroupsCount = activeGroups.length > 0 || groups.length > 0
    ? activeGroups.length
    : (config.schedulerDiagnostics?.activeGroupsCount ?? 0);
  const totalGroupsCount = groups.length > 0
    ? groups.length
    : (config.schedulerDiagnostics?.totalGroupsCount ?? 0);

  const scaleFactor = Math.max(0.25, (config.pollIntervalMinutes || 30) / 30);
  const estimatedPostsPerCycle = useMemo(
    () =>
      activeGroups.reduce(
        (sum, g) =>
          sum + Math.max(2, Math.min(200, Math.round((g.scrapeLimitPer30Min || 10) * scaleFactor))),
        0,
      ),
    [activeGroups, scaleFactor],
  );

  // Derive live reactive state combining instant optimistic config + backend diagnostics
  const liveSnapshot = useMemo(() => {
    const diag = config.schedulerDiagnostics;
    const intervalMinutes = Math.max(5, Number(config.pollIntervalMinutes || 30));
    const intervalMs = intervalMinutes * 60_000;
    const cycleDurationSec = Math.round(intervalMs / 1000);
    const activeStart = typeof config.activeHourStart === 'number' ? config.activeHourStart : 6;
    const activeEnd = typeof config.activeHourEnd === 'number' ? config.activeHourEnd : 22;

    const tana = getTanaTimeInfo(nowMs, activeStart, activeEnd);
    const isWithinActiveHours =
      !config.onlyActiveHours ||
      (activeStart < activeEnd
        ? tana.tanaHour >= activeStart && tana.tanaHour < activeEnd
        : true);

    const lastRunMs = config.lastPollStartedAt ? new Date(config.lastPollStartedAt).getTime() : 0;
    const validLastRunMs = Number.isFinite(lastRunMs) && lastRunMs > 0 ? lastRunMs : 0;
    const elapsedSec =
      validLastRunMs > 0
        ? Math.max(0, Math.min(cycleDurationSec, Math.floor((nowMs - validLastRunMs) / 1000)))
        : 0;

    let state: FbSchedulerStatus;
    let targetRunMs: number | null = null;
    let remainingSec: number | null = null;

    if (runActive) {
      state =
        config.lastPollStatus === 'importing_snapshot' || launchingMode === 'snapshot'
          ? 'importing_snapshot'
          : 'running';
    } else if (!config.isLive) {
      state = 'paused';
    } else if (activeGroupsCount === 0) {
      state = 'no_active_groups';
    } else if (config.onlyActiveHours && !isWithinActiveHours) {
      state = 'sleeping_night';
      targetRunMs = Math.max(
        tana.wakeupUtcMs,
        validLastRunMs > 0 ? validLastRunMs + intervalMs : 0,
      );
      remainingSec = Math.max(0, Math.ceil((targetRunMs - nowMs) / 1000));
    } else {
      targetRunMs = validLastRunMs > 0 ? validLastRunMs + intervalMs : nowMs;
      const remMs = targetRunMs - nowMs;
      if (remMs <= 0) {
        state = 'due_now';
        remainingSec = 0;
      } else {
        state = 'waiting_next_cycle';
        remainingSec = Math.ceil(remMs / 1000);
      }
    }

    const cyclePercent =
      state === 'running' || state === 'importing_snapshot'
        ? Math.max(0, Math.min(100, Math.round(config.lastRunProgress?.percent ?? 8)))
        : state === 'waiting_next_cycle'
        ? Math.max(2, Math.min(99, Math.round((elapsedSec / Math.max(1, cycleDurationSec)) * 100)))
        : state === 'due_now'
        ? 100
        : state === 'sleeping_night'
        ? 100
        : 0;

    const tickTimestampMs = diag?.lastSchedulerTickAt
      ? new Date(diag.lastSchedulerTickAt).getTime()
      : config.lastSchedulerTickAt
      ? new Date(config.lastSchedulerTickAt).getTime()
      : NaN;
    const heartbeatAgeSec = Number.isFinite(tickTimestampMs)
      ? Math.max(0, Math.round((nowMs - tickTimestampMs) / 1000))
      : diag?.schedulerHeartbeatAgeSeconds ?? null;
    const loopAlive =
      diag?.schedulerLoopAlive ?? (heartbeatAgeSec !== null ? heartbeatAgeSec <= 90 : false);

    return {
      state,
      tana,
      isWithinActiveHours,
      intervalMinutes,
      cycleDurationSec,
      elapsedSec,
      targetRunMs,
      remainingSec,
      cyclePercent,
      validLastRunMs,
      heartbeatAgeSec,
      loopAlive,
      tickIntervalSec: diag?.schedulerTickIntervalSeconds ?? 15,
    };
  }, [config, runActive, launchingMode, activeGroupsCount, nowMs]);

  const palette = STATE_PALETTE[liveSnapshot.state];

  // SVG ring geometry
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset =
    circumference - (Math.max(0, Math.min(100, liveSnapshot.cyclePercent)) / 100) * circumference;

  // 4-step continuous loop indicator
  const loopStageIndex = (() => {
    if (liveSnapshot.state === 'paused') return -1;
    if (
      liveSnapshot.state === 'waiting_next_cycle' ||
      liveSnapshot.state === 'due_now' ||
      liveSnapshot.state === 'sleeping_night' ||
      liveSnapshot.state === 'no_active_groups'
    ) {
      return 0;
    }
    const phase = config.lastPollPhase;
    if (phase === 'filtering_ai_gcs') return 2;
    if (phase === 'completed') return 3;
    return 1; // triggering_brightdata, waiting_brightdata, downloading_snapshot
  })();

  const loopSteps = [
    {
      label: `Repos / Cycle (${liveSnapshot.intervalMinutes}m)`,
      sub:
        liveSnapshot.state === 'waiting_next_cycle' && liveSnapshot.remainingSec !== null
          ? formatRingShort(liveSnapshot.remainingSec)
          : liveSnapshot.state === 'sleeping_night'
          ? 'Nuit'
          : 'Attente',
    },
    { label: 'Collecte Bright Data', sub: 'Posts FB' },
    { label: 'IA Gemini & GCS', sub: 'Filtrage' },
    { label: 'Publication / File', sub: 'Zero-Touch' },
  ];

  const activityLog: FbActivityLogEntry[] = useMemo(() => {
    const raw = config.activityLog || [];
    if (logFilter === 'runs') {
      return raw.filter((e) => e.kind.startsWith('run_'));
    }
    if (logFilter === 'scheduler') {
      return raw.filter((e) => !e.kind.startsWith('run_'));
    }
    return raw;
  }, [config.activityLog, logFilter]);

  const runHistory: FbRunHistoryEntry[] = config.runHistory || [];
  const latestEvent = (config.activityLog && config.activityLog[0]) || null;

  const renderPrimaryExplanation = () => {
    const s = liveSnapshot.state;
    if (s === 'waiting_next_cycle') {
      return (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white tabular-nums">
              Prochaine collecte dans{' '}
              <span className="text-brand-green">
                {formatCountdownClock(liveSnapshot.remainingSec ?? 0)}
              </span>
            </h2>
            {liveSnapshot.targetRunMs && (
              <span className="px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-200">
                à {formatTanaClock(liveSnapshot.targetRunMs)} (Tana)
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            <strong>En ce moment :</strong> le scraper se repose entre deux boucles de{' '}
            <strong>{liveSnapshot.intervalMinutes} min</strong>. À l&apos;issue du compte à rebours, il
            collectera automatiquement <strong>{activeGroupsCount} groupe(s) actif(s)</strong> (
            ~{estimatedPostsPerCycle} posts prévus), puis filtrera via Gemini et publiera les annonces
            éligibles.
            {config.lastError && (
              <span className="text-amber-700 dark:text-amber-300 font-semibold">
                {' '}
                (Le dernier run a échoué — nouvelle tentative automatique à la fin du cycle.)
              </span>
            )}
          </p>
        </>
      );
    }

    if (s === 'due_now') {
      return (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-brand-green" />
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white">
              Cycle atteint — Lancement automatique imminent...
            </h2>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            <strong>En ce moment :</strong> les {liveSnapshot.intervalMinutes} minutes sont écoulées. Le
            scheduler serveur (check toutes les {liveSnapshot.tickIntervalSec}s) va démarrer la
            collecte sur {activeGroupsCount} groupe(s) dans quelques secondes.
          </p>
        </>
      );
    }

    if (s === 'running' || s === 'importing_snapshot') {
      return (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white">
              {s === 'importing_snapshot'
                ? 'Import & analyse du snapshot en cours'
                : 'Collecte Facebook & filtrage IA en cours'}
            </h2>
            {config.lastRunTrigger && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  getTriggerLabel(config.lastRunTrigger).className
                }`}
              >
                {getTriggerLabel(config.lastRunTrigger).label}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            <strong>En ce moment :</strong> {config.lastPollMessage || 'Traitement en cours sur le serveur...'}
            {config.isLive && (
              <span className="text-zinc-500 dark:text-zinc-400">
                {' '}
                (La prochaine boucle de {liveSnapshot.intervalMinutes} min comptera à partir du début de ce cycle.)
              </span>
            )}
          </p>
        </>
      );
    }

    if (s === 'sleeping_night') {
      return (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white tabular-nums">
              En repos nocturne — reprise dans{' '}
              <span className="text-indigo-600 dark:text-indigo-300">
                {formatCountdownClock(liveSnapshot.remainingSec ?? 0)}
              </span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-white/90 dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
              à {String(config.activeHourStart).padStart(2, '0')}h00 (Tana)
            </span>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            <strong>En ce moment :</strong> il est {liveSnapshot.tana.tanaClockLabel} à Antananarivo
            (hors fenêtre {config.activeHourStart}h–{config.activeHourEnd}h). Le scraper se repose pour
            économiser ~33% de crédits Bright Data et reprendra automatiquement au matin.
          </p>
        </>
      );
    }

    if (s === 'no_active_groups') {
      return (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-amber-900 dark:text-amber-100">
              Aucune collecte possible — 0 groupe actif
            </h2>
            {onOpenGroupsTab && (
              <button
                type="button"
                onClick={onOpenGroupsTab}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 transition cursor-pointer"
              >
                <Layers className="w-3 h-3" /> Activer des groupes
              </button>
            )}
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            <strong>En ce moment :</strong> le mode LIVE est activé mais tous les groupes cibles (
            {totalGroupsCount}) sont en pause. Activez au moins un groupe pour lancer la boucle.
          </p>
        </>
      );
    }

    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white">
            Scraper arrêté — aucune collecte automatique
          </h2>
          <button
            type="button"
            onClick={onToggleLive}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand-green text-white text-[11px] font-bold hover:opacity-95 transition cursor-pointer"
          >
            <Power className="w-3 h-3" /> Activer en LIVE
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
          <strong>En ce moment :</strong> le scraper est en pause (0 crédit Bright Data ou Gemini
          consommé). Activez le mode LIVE pour lancer automatiquement le cycle toutes les{' '}
          {liveSnapshot.intervalMinutes} min, ou utilisez « Lancer collecte maintenant ».
        </p>
      </>
    );
  };

  return (
    <div className="space-y-3">
      {/* Main Live Cycle & State Hero */}
      <div className={`rounded-2xl border p-4 sm:p-5 transition-colors ${palette.container}`}>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-center">
          {/* Left: Ring Gauge + Current Action & Countdown */}
          <div className="xl:col-span-7 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* SVG Progress Ring */}
            <div className="relative w-[88px] h-[88px] shrink-0 flex items-center justify-center">
              <svg className="w-[88px] h-[88px] -rotate-90" viewBox="0 0 88 88">
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  strokeWidth="7"
                  className={palette.ringTrack}
                />
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  className={`${palette.ringStroke} transition-all duration-500`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {liveSnapshot.state === 'waiting_next_cycle' && liveSnapshot.remainingSec !== null ? (
                  <>
                    <span className="text-sm font-mono font-extrabold text-zinc-900 dark:text-white leading-none tabular-nums">
                      {formatRingShort(liveSnapshot.remainingSec)}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mt-1">
                      restant
                    </span>
                  </>
                ) : liveSnapshot.state === 'due_now' ? (
                  <>
                    <Zap className="w-4 h-4 text-brand-green animate-bounce" />
                    <span className="text-[9px] font-bold uppercase text-brand-green mt-0.5">
                      Prêt
                    </span>
                  </>
                ) : liveSnapshot.state === 'running' || liveSnapshot.state === 'importing_snapshot' ? (
                  <>
                    <span className="text-sm font-mono font-extrabold text-brand-green leading-none">
                      {liveSnapshot.cyclePercent}%
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mt-1">
                      actif
                    </span>
                  </>
                ) : liveSnapshot.state === 'sleeping_night' ? (
                  <>
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span className="text-[9px] font-bold uppercase text-indigo-600 dark:text-indigo-300 mt-0.5">
                      Nuit
                    </span>
                  </>
                ) : liveSnapshot.state === 'no_active_groups' ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-[9px] font-bold uppercase text-amber-700 mt-0.5">
                      0 grp
                    </span>
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 text-zinc-400" />
                    <span className="text-[9px] font-bold uppercase text-zinc-500 mt-0.5">
                      Pause
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* State Pills + Headline + Plain-French Detail */}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide ${palette.badge}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${palette.dot}`} />
                  {palette.badgeLabel}
                </span>

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-700 text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">
                  <Timer className="w-3 h-3 text-brand-green" />
                  Boucle {liveSnapshot.intervalMinutes} min
                </span>

                <button
                  type="button"
                  onClick={onOpenGroupsTab}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-700 text-[10px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-brand-green/60 transition cursor-pointer"
                  title="Voir les groupes cibles"
                >
                  <Layers className="w-3 h-3 text-brand-green" />
                  {activeGroupsCount}/{totalGroupsCount} groupes (~{estimatedPostsPerCycle} posts/cycle)
                </button>
              </div>

              <div className="space-y-1">{renderPrimaryExplanation()}</div>
            </div>
          </div>

          {/* Right: Cycle Timeline Bar + 4-Step Loop + Backend Heartbeat */}
          <div className="xl:col-span-5 space-y-3 bg-white/75 dark:bg-zinc-950/55 rounded-2xl p-3.5 border border-zinc-200/70 dark:border-zinc-800/80">
            {/* Cycle Progress Bar */}
            {(liveSnapshot.state === 'waiting_next_cycle' ||
              liveSnapshot.state === 'due_now' ||
              liveSnapshot.state === 'sleeping_night') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-zinc-500">
                    {liveSnapshot.state === 'sleeping_night'
                      ? 'Veille nocturne'
                      : `Cycle écoulé : ${formatDurationFr(liveSnapshot.elapsedSec)} / ${liveSnapshot.intervalMinutes}m`}
                  </span>
                  <span className={`font-mono font-bold ${palette.accentText}`}>
                    {liveSnapshot.cyclePercent}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      liveSnapshot.state === 'sleeping_night' ? 'bg-indigo-500' : 'bg-brand-green'
                    }`}
                    style={{ width: `${liveSnapshot.cyclePercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                  <span>
                    Dernier départ :{' '}
                    {liveSnapshot.validLastRunMs > 0
                      ? formatTanaClock(liveSnapshot.validLastRunMs)
                      : 'Jamais'}
                  </span>
                  <span>
                    Prochain :{' '}
                    {liveSnapshot.targetRunMs
                      ? formatTanaClock(liveSnapshot.targetRunMs)
                      : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* 4-Stage Continuous Loop Visualizer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                <span>Boucle du pipeline</span>
                {!runActive && config.isLive && (
                  <button
                    type="button"
                    onClick={onRunNow}
                    className="inline-flex items-center gap-1 text-[10px] font-bold normal-case tracking-normal text-brand-green hover:underline cursor-pointer"
                  >
                    <Play className="w-2.5 h-2.5" /> Forcer maintenant
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {loopSteps.map((step, idx) => {
                  const isActive = loopStageIndex === idx;
                  const isDone = loopStageIndex > idx && runActive;
                  return (
                    <div
                      key={step.label}
                      className={`px-2 py-1.5 rounded-xl border text-[10px] transition ${
                        isActive
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 border-brand-green text-emerald-950 dark:text-emerald-100 font-bold shadow-2xs'
                          : isDone
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300/60 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-zinc-50/80 dark:bg-zinc-900/50 border-zinc-200/70 dark:border-zinc-800 text-zinc-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{idx + 1}. {step.label.split(' ')[0]}</span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse shrink-0" />
                        )}
                        {isDone && (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[9px] opacity-80 truncate mt-0.5 font-mono">{step.sub}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Real Backend Scheduler Heartbeat & Tana Clock */}
            <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
              <span
                className="inline-flex items-center gap-1.5"
                title="Preuve de vie du processus scheduler côté serveur backend"
              >
                <Radio
                  className={`w-3 h-3 ${
                    liveSnapshot.loopAlive
                      ? 'text-emerald-500 animate-pulse'
                      : 'text-amber-500'
                  }`}
                />
                <span>
                  Backend{' '}
                  <strong className={liveSnapshot.loopAlive ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                    {liveSnapshot.loopAlive ? 'actif' : 'en attente'}
                  </strong>
                  {liveSnapshot.heartbeatAgeSec !== null
                    ? ` (vérifié il y a ${liveSnapshot.heartbeatAgeSec}s)`
                    : ''}
                </span>
              </span>

              <div className="flex items-center gap-2">
                <span className="font-mono text-zinc-600 dark:text-zinc-300">
                  Tana {liveSnapshot.tana.tanaClockLabel}
                </span>
                <button
                  type="button"
                  onClick={onRefreshNow}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-semibold transition cursor-pointer disabled:opacity-50"
                  title={`Rafraîchissement automatique de la page toutes les ${autoSyncIntervalSec}s`}
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Sync {autoSyncIntervalSec}s
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry KPI Pills */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80">
          <Activity className="w-3.5 h-3.5 text-brand-green" />
          Statut serveur : <strong className="font-mono">{config.lastPollStatus}</strong>
        </span>

        {config.lastRunTrigger && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${
              getTriggerLabel(config.lastRunTrigger).className
            }`}
          >
            Dernier mode : {getTriggerLabel(config.lastRunTrigger).label}
          </span>
        )}

        <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80 tabular-nums">
          Runs : <strong>{config.totalRuns}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80 tabular-nums">
          Posts récupérés : <strong>{config.totalBrightDataRecords}</strong>
        </span>
        <span className="px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80 tabular-nums">
          Appels Gemini : <strong>{config.totalGeminiCalls}</strong>
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums">
          <Zap className="w-3 h-3" /> Auto-publiés : {config.totalAutoApproved ?? 0}
        </span>

        {typeof config.placesApiConfigured === 'boolean' && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold ${
              config.placesApiConfigured
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            }`}
            title={
              config.placesApiConfigured
                ? 'Résolution Google Places active avec index spatial Fokontany + cache persistant 90j'
                : 'Ajoutez GOOGLE_MAPS_API_KEY dans backend/.env pour activer la géolocalisation Google Places'
            }
          >
            <MapPin className="w-3 h-3" />
            {config.placesApiConfigured
              ? `Places Geo actif (${config.placesCacheEntries ?? 0} cache)`
              : `Fallback texte (${config.placesCacheEntries ?? 0} cache)`}
          </span>
        )}

        {config.lastSnapshotId && (
          <button
            type="button"
            onClick={() => onSelectSnapshotId?.(config.lastSnapshotId!)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80 font-mono text-[10px] hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
            title="Cliquer pour charger ce snapshot dans l'importateur"
          >
            Snapshot : {config.lastSnapshotId}
          </button>
        )}

        {config.lastPollStartedAt && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80">
            <Clock className="w-3 h-3 text-zinc-400" />
            Dernier départ : {formatTanaDateTime(config.lastPollStartedAt)}
          </span>
        )}

        {config.lastPollFinishedAt && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/80">
            Dernière fin : {formatTanaDateTime(config.lastPollFinishedAt)}
          </span>
        )}
      </div>

      {/* Expandable "Faits & Gestes" Activity Feed + Run History */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 overflow-hidden">
        <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-white/70 dark:bg-zinc-900/60 border-b border-zinc-200/60 dark:border-zinc-800/70">
          <button
            type="button"
            onClick={toggleDrawer}
            className="inline-flex items-center gap-2 text-xs font-bold text-zinc-800 dark:text-zinc-100 hover:text-brand-green transition cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-brand-green" />
            <span>Faits &amp; gestes du scraper</span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-600 dark:text-zinc-300">
              {config.activityLog?.length ?? 0} événements • {runHistory.length} cycles
            </span>
            {showActivityDrawer ? (
              <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </button>

          {!showActivityDrawer && latestEvent && (
            <span className="text-[11px] text-zinc-500 truncate max-w-md">
              Dernier fait : <strong className="text-zinc-700 dark:text-zinc-200">{latestEvent.title}</strong> ({formatRelativeAgeFr(latestEvent.at, nowMs)})
            </span>
          )}

          {showActivityDrawer && (
            <div className="flex items-center gap-1 text-[10px]">
              {(
                [
                  { id: 'all', label: 'Tout' },
                  { id: 'runs', label: 'Collectes' },
                  { id: 'scheduler', label: 'Scheduler & Config' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLogFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-full font-bold transition cursor-pointer ${
                    logFilter === tab.id
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 hover:bg-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {showActivityDrawer && (
          <div className="p-3.5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Real-time chronological activity feed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500 px-1">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-green" />
                  Journal chronologique en direct
                </span>
                <span className="text-[10px] font-normal text-zinc-400">Heure Tana (UTC+3)</span>
              </div>

              {activityLog.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-center text-[11px] text-zinc-400">
                  Aucun événement enregistré pour l&apos;instant. Activez le mode LIVE ou lancez une collecte pour suivre chaque étape ici.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {activityLog.map((entry) => {
                    const trig = getTriggerLabel(entry.trigger);
                    const icon = (() => {
                      switch (entry.kind) {
                        case 'scheduler_started':
                          return <Power className="w-3.5 h-3.5 text-emerald-600" />;
                        case 'scheduler_paused':
                          return <Pause className="w-3.5 h-3.5 text-amber-600" />;
                        case 'scheduler_sleep':
                          return <Moon className="w-3.5 h-3.5 text-indigo-500" />;
                        case 'run_started':
                          return <Play className="w-3.5 h-3.5 text-brand-green" />;
                        case 'run_completed':
                          return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
                        case 'run_cancelled':
                          return <Ban className="w-3.5 h-3.5 text-amber-600" />;
                        case 'run_error':
                        case 'groups_warning':
                          return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
                        default:
                          return <Settings2 className="w-3.5 h-3.5 text-zinc-500" />;
                      }
                    })();

                    return (
                      <div
                        key={entry.id}
                        className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 px-3 py-2 text-[11px] space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100">
                            {icon}
                            <span>{entry.title}</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${trig.className}`}>
                              {trig.label}
                            </span>
                            <span
                              className="font-mono text-[10px] text-zinc-400"
                              title={formatTanaDateTime(entry.at)}
                            >
                              {formatTanaClock(entry.at)} • {formatRelativeAgeFr(entry.at, nowMs)}
                            </span>
                          </div>
                        </div>
                        {entry.detail && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug break-words">
                            {entry.detail}
                          </p>
                        )}
                        {(entry.durationSec || entry.stats) && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] font-mono text-zinc-500">
                            {typeof entry.durationSec === 'number' && (
                              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                                {formatDurationFr(entry.durationSec)}
                              </span>
                            )}
                            {entry.stats && typeof entry.stats.candidatesCreated === 'number' && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold">
                                +{entry.stats.candidatesCreated} créés
                              </span>
                            )}
                            {entry.stats && (entry.stats.autoApprovedCount ?? 0) > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-brand-green/15 text-brand-green font-bold">
                                {entry.stats.autoApprovedCount} auto-publiés
                              </span>
                            )}
                            {entry.stats && typeof entry.stats.geminiCalls === 'number' && (
                              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">
                                {entry.stats.geminiCalls} Gemini
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Recent Run Cycles History */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500 px-1">
                <span className="inline-flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-brand-green" />
                  Historique des derniers cycles ({runHistory.length})
                </span>
                <span className="text-[10px] font-normal text-zinc-400">
                  Cliquez un ID pour le réimporter
                </span>
              </div>

              {runHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-4 text-center text-[11px] text-zinc-400">
                  L&apos;historique détaillé des prochains cycles (automatiques, manuels et snapshots) apparaîtra ici dès leur exécution.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {runHistory.map((run) => {
                    const trig = getTriggerLabel(run.trigger);
                    return (
                      <div
                        key={run.id}
                        className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 px-3 py-2 text-[11px] space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                run.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : run.status === 'cancelled'
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                              }`}
                            />
                            <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                              {formatTanaClock(run.startedAt, false)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-zinc-400" />
                            <span className="font-mono text-zinc-600 dark:text-zinc-300">
                              {formatTanaClock(run.finishedAt, false)}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              ({formatDurationFr(run.durationSec)})
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${trig.className}`}>
                              {trig.label}
                            </span>
                            {run.snapshotId && (
                              <button
                                type="button"
                                onClick={() => onSelectSnapshotId?.(run.snapshotId!)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-[10px] font-mono text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                                title="Charger ce snapshot dans le champ d'import gratuit"
                              >
                                <Download className="w-2.5 h-2.5" />
                                {run.snapshotId}
                              </button>
                            )}
                          </div>
                        </div>

                        {run.status === 'completed' ? (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200 font-bold">
                              +{run.candidatesCreated} créés
                            </span>
                            {run.autoApprovedCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-brand-green/15 text-brand-green font-bold">
                                {run.autoApprovedCount} auto-publiés
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                              {run.totalRawRecords} bruts
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                              {run.duplicateSkipped} doublons
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                              {run.geminiCalls} Gemini
                            </span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-red-600 dark:text-red-300 truncate">
                            {run.errorMessage || (run.status === 'cancelled' ? 'Annulé' : 'Erreur')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
