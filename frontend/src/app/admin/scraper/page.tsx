'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckSquare,
  Download,
  GitCompare,
  Layers,
  Loader2,
  Lock,
  Pause,
  Play,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import Header from '@/components/Header';
import { useUserStore } from '@/store/userStore';
import {
  type BackfillJobState,
  BrightDataSnapshotMeta,
  FbGroupTarget,
  FbIngestionConfig,
  FbOverlapMatrixRow,
  fbIngestionService,
  RunSummary,
} from '@/services/fbIngestion.service';
import ValidationQueueTab from '@/components/admin/scraper/ValidationQueueTab';
import GroupsManagerTab from '@/components/admin/scraper/GroupsManagerTab';
import OverlapMatrixTab from '@/components/admin/scraper/OverlapMatrixTab';
import PublishedOriginsTab from '@/components/admin/scraper/PublishedOriginsTab';
import OperationProgressCard, {
  type PipelineStep,
} from '@/components/admin/scraper/OperationProgressCard';
import FloatingOperationHud, {
  type HudToast,
} from '@/components/admin/scraper/FloatingOperationHud';
import AsyncToggleSwitch from '@/components/admin/scraper/AsyncToggleSwitch';
import ScraperCycleCockpit from '@/components/admin/scraper/ScraperCycleCockpit';

type AdminTab = 'queue' | 'groups' | 'matrix' | 'origins';

function buildScraperPipelineSteps(
  phase: string | null | undefined,
  isSnapshotImport: boolean,
): PipelineStep[] {
  const specs = isSnapshotImport
    ? [
        { id: 'downloading_snapshot', label: 'Téléchargement Snapshot' },
        { id: 'filtering_ai_gcs', label: 'Filtrage IA & Upload GCS' },
      ]
    : [
        { id: 'triggering_brightdata', label: 'Déclenchement Bright Data' },
        { id: 'waiting_brightdata', label: 'Collecte Facebook' },
        { id: 'downloading_snapshot', label: 'Téléchargement Snapshot' },
        { id: 'filtering_ai_gcs', label: 'Filtrage IA & Upload GCS' },
      ];

  const currentIdx = specs.findIndex((s) => s.id === phase);
  const resolvedIdx = currentIdx >= 0 ? currentIdx : 0;

  return specs.map((spec, idx) => ({
    id: spec.id,
    label: spec.label,
    state: idx < resolvedIdx ? 'done' : idx === resolvedIdx ? 'active' : 'pending',
  }));
}

function getScraperEtaFallback(phase: string | null | undefined): string | null {
  switch (phase) {
    case 'triggering_brightdata':
      return 'Initialisation (quelques secondes)...';
    case 'waiting_brightdata':
      return 'Bright Data prend souvent 1–3 min (max 10 min)';
    case 'downloading_snapshot':
      return 'Récupération des posts...';
    case 'filtering_ai_gcs':
      return 'Calcul du temps restant...';
    default:
      return null;
  }
}

const GEMINI_MODELS = [
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Recommandé — Rapide & Quotas élevés)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (Rapide / Secours)' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Standard)' },
  { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Précis)' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (Quota limité)' },
];

export default function AdminScraperPage() {
  const userSession = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const initializeUser = useUserStore((s) => s.initialize);
  const currentUser = userSession?.user ?? userSession;
  const userId = String(currentUser?._id || '');
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [visitedTabs, setVisitedTabs] = useState<Set<AdminTab>>(() => new Set(['queue']));

  const [config, setConfig] = useState<FbIngestionConfig | null>(null);
  const [groups, setGroups] = useState<FbGroupTarget[]>([]);
  const [matrix, setMatrix] = useState<FbOverlapMatrixRow[]>([]);
  const [snapshots, setSnapshots] = useState<BrightDataSnapshotMeta[]>([]);
  const [snapshotInput, setSnapshotInput] = useState('sd_mwewhh3hvi9vt8yqk');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [launchingMode, setLaunchingMode] = useState<'scrape' | 'snapshot'>('scrape');
  const [isCancellingRun, setIsCancellingRun] = useState(false);
  const [recoveringSnapshotId, setRecoveringSnapshotId] = useState<string | null>(null);
  const [runPollWarning, setRunPollWarning] = useState<string | null>(null);
  const [runOutcomeCard, setRunOutcomeCard] = useState<{
    status: 'completed' | 'cancelled' | 'error';
    message: string;
    elapsedSec?: number;
  } | null>(null);

  const [backfillJob, setBackfillJob] = useState<BackfillJobState | null>(null);
  const [isCancellingBackfill, setIsCancellingBackfill] = useState(false);
  const [backfillPollWarning, setBackfillPollWarning] = useState<string | null>(null);
  const [showBackfillCard, setShowBackfillCard] = useState(false);

  const [originsRefreshNonce, setOriginsRefreshNonce] = useState(0);
  const [queueRefreshNonce, setQueueRefreshNonce] = useState(0);

  const [toasts, setToasts] = useState<HudToast[]>([]);
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const [syncingGroupIds, setSyncingGroupIds] = useState<Set<string>>(() => new Set());
  const [syncingConfig, setSyncingConfig] = useState(false);

  const isPollingCompletionRef = useRef(false);
  const wasRunActiveRef = useRef(false);
  const hasLoadedConfigRef = useRef(false);
  const lastKnownFinishedAtRef = useRef<string | null>(null);
  const isBackfillCompletionRef = useRef(false);
  const runPollFailuresRef = useRef(0);
  const backfillPollFailuresRef = useRef(0);
  const controlBarRef = useRef<HTMLElement | null>(null);

  // Toast management (non-blocking stack, supports updating pending -> ok/err)
  const toastIdCounterRef = useRef(0);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const scheduleToastAutoDismiss = useCallback((id: string, ms: number) => {
    const existingTimer = toastTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      toastTimersRef.current.delete(id);
    }
    if (ms > 0) {
      const timer = setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ms);
      toastTimersRef.current.set(id, timer);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (
      nextToast: Omit<HudToast, 'id'> & { id?: string },
      autoHideMs = 4500,
    ): string => {
      const id = nextToast.id || `toast_${++toastIdCounterRef.current}`;
      const fullToast: HudToast = { ...nextToast, id };
      setToasts((prev) => {
        const withoutSameId = prev.filter((t) => t.id !== id);
        return [...withoutSameId.slice(-3), fullToast];
      });
      if (fullToast.kind === 'ok' && autoHideMs > 0) {
        scheduleToastAutoDismiss(id, autoHideMs);
      } else {
        const existingTimer = toastTimersRef.current.get(id);
        if (existingTimer) {
          clearTimeout(existingTimer);
          toastTimersRef.current.delete(id);
        }
      }
      return id;
    },
    [scheduleToastAutoDismiss],
  );

  const updateToast = useCallback(
    (id: string, patch: Partial<Omit<HudToast, 'id'>>, autoHideMs = 5000) => {
      let resolvedKind: HudToast['kind'] | undefined = patch.kind;
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const merged = { ...t, ...patch };
          resolvedKind = merged.kind;
          return merged;
        }),
      );
      if (resolvedKind === 'ok' && autoHideMs > 0) {
        scheduleToastAutoDismiss(id, autoHideMs);
      }
    },
    [scheduleToastAutoDismiss],
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // Optimistic sequence tracking for Config & Groups so rapid clicks never revert or race
  const serverConfigRef = useRef<FbIngestionConfig | null>(null);
  const configSeqRef = useRef(0);
  const configFieldSeqRef = useRef<Partial<Record<keyof FbIngestionConfig, number>>>({});
  const configInFlightCountRef = useRef(0);

  const serverGroupsRef = useRef<Map<string, FbGroupTarget>>(new Map());
  const groupSeqRef = useRef(0);
  const groupFieldSeqRef = useRef<Map<string, number>>(new Map());
  const groupInFlightCountRef = useRef<Map<string, number>>(new Map());

  const runActive =
    config?.lastPollStatus === 'running' ||
    config?.lastPollStatus === 'importing_snapshot';

  const autoSyncIntervalSec = runActive
    ? 2
    : config?.isLive
    ? config.schedulerDiagnostics?.secondsUntilNextRun !== null &&
      config.schedulerDiagnostics?.secondsUntilNextRun !== undefined &&
      config.schedulerDiagnostics.secondsUntilNextRun <= 25
      ? 3
      : 10
    : 30;

  const backfillActive = backfillJob?.status === 'running';
  const displayedSummary = lastSummary || config?.lastRunSummary || null;

  useEffect(() => {
    initializeUser();
  }, [initializeUser]);

  const syncServerGroupsSnapshot = useCallback((grp: FbGroupTarget[]) => {
    const nextMap = new Map<string, FbGroupTarget>();
    for (const g of grp) {
      nextMap.set(g.groupId, g);
    }
    serverGroupsRef.current = nextMap;
  }, []);

  const loadAll = useCallback(
    async (opts?: { refreshSubTabs?: boolean }) => {
      if (!userId || !isAdmin) {
        setLoading(false);
        return;
      }
      setIsRefreshing(true);
      setLoadError(null);
      try {
        const [cfg, grp, mat] = await Promise.all([
          fbIngestionService.getConfig(userId),
          fbIngestionService.listGroups(userId),
          fbIngestionService.getOverlapMatrix(userId),
        ]);
        serverConfigRef.current = cfg;
        hasLoadedConfigRef.current = true;
        wasRunActiveRef.current =
          cfg.lastPollStatus === 'running' || cfg.lastPollStatus === 'importing_snapshot';
        lastKnownFinishedAtRef.current = cfg.lastPollFinishedAt || null;
        setConfig(cfg);
        if (cfg.lastPollStatus === 'importing_snapshot') {
          setLaunchingMode('snapshot');
        } else if (cfg.lastPollStatus === 'running') {
          setLaunchingMode('scrape');
        }
        if (cfg.lastRunSummary) {
          setLastSummary(cfg.lastRunSummary);
        }
        if (cfg.backfillJob) {
          setBackfillJob(cfg.backfillJob);
          if (
            cfg.backfillJob.status === 'running' ||
            cfg.backfillJob.phase === 'interrupted'
          ) {
            setShowBackfillCard(true);
          }
        }
        syncServerGroupsSnapshot(grp);
        setGroups(grp);
        setMatrix(mat.groups);

        if (opts?.refreshSubTabs) {
          setQueueRefreshNonce((n) => n + 1);
          setOriginsRefreshNonce((n) => n + 1);
        }

        fbIngestionService
          .listRemoteSnapshots(userId)
          .then(setSnapshots)
          .catch(() => {});
      } catch (err) {
        const msg = (err as Error).message;
        setLoadError(msg);
        pushToast({ kind: 'err', title: 'Erreur de chargement', text: msg });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [userId, isAdmin, pushToast, syncServerGroupsSnapshot],
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!userId || !isAdmin) {
        if (active) setLoading(false);
        return;
      }
      try {
        const [cfg, grp, mat] = await Promise.all([
          fbIngestionService.getConfig(userId),
          fbIngestionService.listGroups(userId),
          fbIngestionService.getOverlapMatrix(userId),
        ]);
        if (!active) return;
        serverConfigRef.current = cfg;
        hasLoadedConfigRef.current = true;
        wasRunActiveRef.current =
          cfg.lastPollStatus === 'running' || cfg.lastPollStatus === 'importing_snapshot';
        lastKnownFinishedAtRef.current = cfg.lastPollFinishedAt || null;
        setConfig(cfg);
        if (cfg.lastPollStatus === 'importing_snapshot') {
          setLaunchingMode('snapshot');
        } else if (cfg.lastPollStatus === 'running') {
          setLaunchingMode('scrape');
        }
        if (cfg.lastRunSummary) {
          setLastSummary(cfg.lastRunSummary);
        }
        if (cfg.backfillJob) {
          setBackfillJob(cfg.backfillJob);
          if (
            cfg.backfillJob.status === 'running' ||
            cfg.backfillJob.phase === 'interrupted'
          ) {
            setShowBackfillCard(true);
          }
        }
        syncServerGroupsSnapshot(grp);
        setGroups(grp);
        setMatrix(mat.groups);

        fbIngestionService
          .listRemoteSnapshots(userId)
          .then((snaps) => {
            if (active) setSnapshots(snaps);
          })
          .catch(() => {});
      } catch (err) {
        if (active) {
          const msg = (err as Error).message;
          setLoadError(msg);
          pushToast({ kind: 'err', title: 'Erreur de chargement', text: msg });
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, [userId, isAdmin, pushToast, syncServerGroupsSnapshot]);

  const pollRunStatusNow = useCallback(async () => {
    if (!userId || !isAdmin) return;
    try {
      const cfg = await fbIngestionService.getConfig(userId);
      runPollFailuresRef.current = 0;
      setRunPollWarning(null);
      serverConfigRef.current = cfg;
      if (cfg.lastPollStatus === 'importing_snapshot') {
        setLaunchingMode('snapshot');
      } else if (cfg.lastPollStatus === 'running') {
        setLaunchingMode('scrape');
      }
      setConfig((prev) => {
        if (!prev) return cfg;
        // Preserve any optimistic config toggle made concurrently
        const merged = { ...cfg };
        (Object.keys(configFieldSeqRef.current) as Array<keyof FbIngestionConfig>).forEach(
          (k) => {
            if ((configFieldSeqRef.current[k] || 0) > 0 && configInFlightCountRef.current > 0) {
              (merged as Record<string, unknown>)[k] = prev[k];
            }
          },
        );
        return merged;
      });

      const wasActive = wasRunActiveRef.current;
      const stillRunning =
        cfg.lastPollStatus === 'running' || cfg.lastPollStatus === 'importing_snapshot';
      wasRunActiveRef.current = stillRunning;

      if (!wasActive && stillRunning) {
        setRunOutcomeCard(null);
        const title =
          cfg.lastPollStatus === 'importing_snapshot'
            ? 'Import snapshot démarré'
            : cfg.lastRunTrigger === 'scheduled'
            ? 'Collecte automatique démarrée'
            : 'Collecte démarrée';
        pushToast(
          {
            kind: 'ok',
            title,
            text: cfg.lastPollMessage || 'Suivi en temps réel actif...',
          },
          4500,
        );
        return;
      }

      const newRemoteFinishDetected =
        !wasActive &&
        !stillRunning &&
        hasLoadedConfigRef.current &&
        Boolean(cfg.lastPollFinishedAt) &&
        cfg.lastPollFinishedAt !== lastKnownFinishedAtRef.current;

      if ((wasActive || newRemoteFinishDetected) && !stillRunning && !isPollingCompletionRef.current) {
        isPollingCompletionRef.current = true;
        lastKnownFinishedAtRef.current = cfg.lastPollFinishedAt || null;
        setIsCancellingRun(false);
        if (cfg.lastRunSummary) {
          setLastSummary(cfg.lastRunSummary);
        }

        const runDurationSec =
          cfg.lastPollStartedAt && cfg.lastPollFinishedAt
            ? Math.max(
                1,
                Math.round(
                  (new Date(cfg.lastPollFinishedAt).getTime() -
                    new Date(cfg.lastPollStartedAt).getTime()) /
                    1000,
                ),
              )
            : undefined;

        if (cfg.lastPollPhase === 'cancelled') {
          const msg = cfg.lastPollMessage || 'Collecte annulée.';
          setRunOutcomeCard({ status: 'cancelled', message: msg, elapsedSec: runDurationSec });
          pushToast({ kind: 'warn', title: 'Opération annulée', text: msg });
        } else if (cfg.lastPollStatus === 'error') {
          const msg = cfg.lastError || cfg.lastPollMessage || 'Erreur lors de la collecte Facebook.';
          setRunOutcomeCard({ status: 'error', message: msg, elapsedSec: runDurationSec });
          pushToast({ kind: 'err', title: 'Échec de la collecte', text: msg });
        } else if (cfg.lastRunSummary) {
          const errSuffix =
            cfg.lastRunSummary.errors?.length > 0
              ? ` (${cfg.lastRunSummary.errors.length} erreur(s) partielle(s) — voir détail ci-dessous)`
              : '';
          const msg = `Collecte terminée (${cfg.lastRunSummary.snapshotId}) : +${cfg.lastRunSummary.candidatesCreated} annonce(s) ajoutée(s) à la file de validation.${errSuffix}`;
          setRunOutcomeCard({
            status: cfg.lastRunSummary.errors?.length > 0 ? 'error' : 'completed',
            message: msg,
            elapsedSec: runDurationSec,
          });
          pushToast({
            kind: cfg.lastRunSummary.errors?.length > 0 ? 'warn' : 'ok',
            title: 'Collecte terminée',
            text: msg,
          });
        } else {
          const msg = cfg.lastPollMessage || 'Collecte terminée. Groupes et file mis à jour.';
          setRunOutcomeCard({ status: 'completed', message: msg, elapsedSec: runDurationSec });
          pushToast({ kind: 'ok', title: 'Collecte terminée', text: msg });
        }

        await loadAll({ refreshSubTabs: true });
        isPollingCompletionRef.current = false;
      } else if (!stillRunning && cfg.lastPollFinishedAt) {
        lastKnownFinishedAtRef.current = cfg.lastPollFinishedAt;
      }
    } catch (err) {
      runPollFailuresRef.current += 1;
      if (runPollFailuresRef.current >= 2) {
        setRunPollWarning(
          `Suivi temporairement interrompu (${(err as Error).message}). Nouvelle tentative automatique...`,
        );
      }
    }
  }, [userId, isAdmin, loadAll, pushToast]);

  // Continuous adaptive polling: 2s while running, 3s near cycle boundary, 10s while LIVE idle, 30s while paused
  const hasConfig = Boolean(config);
  useEffect(() => {
    if (!userId || !isAdmin || !hasConfig) return;
    runPollFailuresRef.current = 0;

    const intervalId = setInterval(() => {
      void pollRunStatusNow();
    }, autoSyncIntervalSec * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pollRunStatusNow();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, isAdmin, hasConfig, autoSyncIntervalSec, pollRunStatusNow]);

  const pollBackfillStatusNow = useCallback(async () => {
    if (!userId || !isAdmin) return;
    try {
      const job = await fbIngestionService.getBackfillStatus(userId);
      backfillPollFailuresRef.current = 0;
      setBackfillPollWarning(null);
      setBackfillJob(job);

      if (job.status !== 'running' && !isBackfillCompletionRef.current) {
        isBackfillCompletionRef.current = true;
        setIsCancellingBackfill(false);

        if (job.status === 'completed') {
          const msg =
            job.message ||
            `Migration terminée (${job.scanned} analysées) : ${job.migratedScraped} annonces FB migrées.`;
          pushToast({ kind: 'ok', title: 'Migration terminée', text: msg });
        } else if (job.status === 'cancelled') {
          const msg = job.message || 'Migration annulée.';
          pushToast({ kind: 'warn', title: 'Migration annulée', text: msg });
        } else if (job.status === 'error') {
          const msg = job.lastError || job.message || 'Erreur durant la migration.';
          pushToast({ kind: 'err', title: 'Erreur de migration', text: msg });
        }

        setOriginsRefreshNonce((n) => n + 1);
        isBackfillCompletionRef.current = false;
      }
    } catch (err) {
      backfillPollFailuresRef.current += 1;
      if (backfillPollFailuresRef.current >= 2) {
        setBackfillPollWarning(
          `Suivi temporairement interrompu (${(err as Error).message}). Nouvelle tentative automatique...`,
        );
      }
    }
  }, [userId, isAdmin, pushToast]);

  // Live poll every 1.5 seconds whenever a Shadow User migration is running
  useEffect(() => {
    if (!userId || !isAdmin || !backfillActive) return;
    backfillPollFailuresRef.current = 0;
    isBackfillCompletionRef.current = false;

    const intervalId = setInterval(() => {
      void pollBackfillStatusNow();
    }, 1500);

    return () => clearInterval(intervalId);
  }, [userId, isAdmin, backfillActive, pollBackfillStatusNow]);

  // Optimistic, race-safe config update (toggles, selects, error dismiss)
  const updateConfigPatch = useCallback(
    async (patch: Parameters<typeof fbIngestionService.updateConfig>[1]) => {
      if (!userId) return;

      const seq = ++configSeqRef.current;
      const patchKeys = Object.keys(patch) as Array<keyof FbIngestionConfig>;
      patchKeys.forEach((k) => {
        configFieldSeqRef.current[k] = seq;
      });

      // Immediate UI update
      setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
      configInFlightCountRef.current += 1;
      setSyncingConfig(true);

      const toastTitle =
        typeof patch.isLive === 'boolean'
          ? patch.isLive
            ? 'Mode LIVE activé'
            : 'Scraper en PAUSE'
          : typeof patch.onlyActiveHours === 'boolean'
          ? patch.onlyActiveHours
            ? 'Heures actives activées'
            : 'Mode 24h/24 activé'
          : typeof patch.autoApproveEnabled === 'boolean'
          ? patch.autoApproveEnabled
            ? 'Auto-publication IA activée'
            : 'Auto-publication IA désactivée'
          : 'Configuration enregistrée';

      try {
        const updated = await fbIngestionService.updateConfig(userId, patch);
        serverConfigRef.current = updated;

        setConfig((prev) => {
          if (!prev) return updated;
          const merged = { ...updated };
          (Object.keys(configFieldSeqRef.current) as Array<keyof FbIngestionConfig>).forEach(
            (k) => {
              if ((configFieldSeqRef.current[k] || 0) > seq) {
                (merged as Record<string, unknown>)[k] = prev[k];
              }
            },
          );
          return merged;
        });

        if (patch.lastError === null) return;
        const msg =
          typeof patch.isLive === 'boolean'
            ? patch.isLive
              ? 'Surveillance automatique démarrée.'
              : '0 crédit consommé en pause.'
            : typeof patch.onlyActiveHours === 'boolean'
            ? patch.onlyActiveHours
              ? `Actif de ${updated.activeHourStart}h à ${updated.activeHourEnd}h (UTC+3).`
              : 'Collecte autorisée 24h/24.'
            : 'Préférence appliquée.';

        pushToast({ id: 'config-sync', kind: 'ok', title: toastTitle, text: msg }, 3000);
      } catch (err) {
        const msg = (err as Error).message;
        const fallback = serverConfigRef.current;
        if (fallback) {
          setConfig((prev) => {
            if (!prev) return prev;
            const reverted = { ...prev };
            patchKeys.forEach((k) => {
              if (configFieldSeqRef.current[k] === seq) {
                (reverted as Record<string, unknown>)[k] = fallback[k];
              }
            });
            return reverted;
          });
        }
        pushToast({
          id: 'config-sync',
          kind: 'err',
          title: 'Erreur configuration (annulée)',
          text: msg,
        });
      } finally {
        configInFlightCountRef.current = Math.max(0, configInFlightCountRef.current - 1);
        if (configInFlightCountRef.current === 0) {
          setSyncingConfig(false);
        }
      }
    },
    [userId, pushToast],
  );

  // Optimistic, race-safe group update shared between Groups tab & Matrix tab
  const handleUpdateGroupOptimistic = useCallback(
    async (
      groupId: string,
      patch: {
        name?: string;
        isActive?: boolean;
        scrapeLimitPer30Min?: number;
        fbActivityNote?: string;
      },
    ) => {
      if (!userId) return;
      const seq = ++groupSeqRef.current;
      const patchKeys = Object.keys(patch) as Array<keyof typeof patch>;
      patchKeys.forEach((k) => {
        groupFieldSeqRef.current.set(`${groupId}:${String(k)}`, seq);
      });

      const currentCount = groupInFlightCountRef.current.get(groupId) || 0;
      groupInFlightCountRef.current.set(groupId, currentCount + 1);
      setSyncingGroupIds((prev) => {
        const next = new Set(prev);
        next.add(groupId);
        return next;
      });

      // Immediate UI update on both groups and matrix
      setGroups((prev) =>
        prev.map((g) => (g.groupId === groupId ? { ...g, ...patch } : g)),
      );
      if (typeof patch.isActive === 'boolean' || typeof patch.name === 'string') {
        setMatrix((prev) =>
          prev.map((m) =>
            m.groupId === groupId
              ? {
                  ...m,
                  ...(typeof patch.isActive === 'boolean'
                    ? { isActive: patch.isActive }
                    : {}),
                  ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
                }
              : m,
          ),
        );
      }

      try {
        const updated = await fbIngestionService.updateGroup(userId, groupId, patch);
        serverGroupsRef.current.set(groupId, updated);

        setGroups((prev) =>
          prev.map((g) => {
            if (g.groupId !== groupId) return g;
            const merged = { ...updated };
            (['name', 'isActive', 'scrapeLimitPer30Min', 'fbActivityNote'] as const).forEach(
              (k) => {
                if ((groupFieldSeqRef.current.get(`${groupId}:${k}`) || 0) > seq) {
                  (merged as Record<string, unknown>)[k] = g[k];
                }
              },
            );
            return merged;
          }),
        );

        setMatrix((prev) =>
          prev.map((m) => {
            if (m.groupId !== groupId) return m;
            const activeSeq = groupFieldSeqRef.current.get(`${groupId}:isActive`) || 0;
            const nameSeq = groupFieldSeqRef.current.get(`${groupId}:name`) || 0;
            return {
              ...m,
              isActive: activeSeq > seq ? m.isActive : updated.isActive,
              name: nameSeq > seq ? m.name : updated.name,
            };
          }),
        );
      } catch (err) {
        const msg = (err as Error).message;
        const fallback = serverGroupsRef.current.get(groupId);
        if (fallback) {
          setGroups((prev) =>
            prev.map((g) => {
              if (g.groupId !== groupId) return g;
              const reverted = { ...g };
              patchKeys.forEach((k) => {
                if (groupFieldSeqRef.current.get(`${groupId}:${String(k)}`) === seq) {
                  (reverted as Record<string, unknown>)[k] = fallback[k];
                }
              });
              return reverted;
            }),
          );
          setMatrix((prev) =>
            prev.map((m) => {
              if (m.groupId !== groupId) return m;
              const reverted = { ...m };
              if (
                typeof patch.isActive === 'boolean' &&
                groupFieldSeqRef.current.get(`${groupId}:isActive`) === seq
              ) {
                reverted.isActive = fallback.isActive;
              }
              if (
                typeof patch.name === 'string' &&
                groupFieldSeqRef.current.get(`${groupId}:name`) === seq
              ) {
                reverted.name = fallback.name;
              }
              return reverted;
            }),
          );
        }
        pushToast({
          kind: 'err',
          title: 'Erreur mise à jour groupe (annulée)',
          text: msg,
        });
      } finally {
        const nextCount = Math.max(0, (groupInFlightCountRef.current.get(groupId) || 1) - 1);
        if (nextCount === 0) {
          groupInFlightCountRef.current.delete(groupId);
          setSyncingGroupIds((prev) => {
            const next = new Set(prev);
            next.delete(groupId);
            return next;
          });
        } else {
          groupInFlightCountRef.current.set(groupId, nextCount);
        }
      }
    },
    [userId, pushToast],
  );

  const handleDeleteGroupOptimistic = useCallback(
    async (group: FbGroupTarget) => {
      if (!userId) return;
      const groupIdx = groups.findIndex((g) => g.groupId === group.groupId);
      const matrixIdx = matrix.findIndex((m) => m.groupId === group.groupId);
      const matrixSnapshot = matrixIdx >= 0 ? matrix[matrixIdx] : null;

      setGroups((prev) => prev.filter((g) => g.groupId !== group.groupId));
      setMatrix((prev) => prev.filter((m) => m.groupId !== group.groupId));

      const toastId = pushToast({
        kind: 'pending',
        title: `Suppression de « ${group.name} »...`,
      });

      try {
        await fbIngestionService.deleteGroup(userId, group.groupId);
        serverGroupsRef.current.delete(group.groupId);
        updateToast(
          toastId,
          { kind: 'ok', title: 'Groupe supprimé', text: group.name },
          3500,
        );
      } catch (err) {
        setGroups((prev) => {
          if (prev.some((g) => g.groupId === group.groupId)) return prev;
          const copy = [...prev];
          copy.splice(
            groupIdx >= 0 ? Math.min(groupIdx, copy.length) : copy.length,
            0,
            group,
          );
          return copy;
        });
        if (matrixSnapshot) {
          setMatrix((prev) => {
            if (prev.some((m) => m.groupId === group.groupId)) return prev;
            const copy = [...prev];
            copy.splice(
              matrixIdx >= 0 ? Math.min(matrixIdx, copy.length) : copy.length,
              0,
              matrixSnapshot,
            );
            return copy;
          });
        }
        updateToast(toastId, {
          kind: 'err',
          title: 'Échec suppression groupe (restauré)',
          text: (err as Error).message,
        });
      }
    },
    [userId, groups, matrix, pushToast, updateToast],
  );

  const handleGroupAdded = useCallback(
    (created: FbGroupTarget) => {
      serverGroupsRef.current.set(created.groupId, created);
      setGroups((prev) => [created, ...prev.filter((g) => g.groupId !== created.groupId)]);
      setMatrix((prev) => [
        {
          groupId: created.groupId,
          name: created.name,
          isActive: created.isActive,
          totalFetched: created.totalFetched || 0,
          uniqueAccepted: created.uniqueAccepted || 0,
          approvedCount: created.approvedCount || 0,
          duplicateSkipped: created.duplicateSkipped || 0,
          landSkipped: created.landSkipped || 0,
          videoOnlySkipped: created.videoOnlySkipped || 0,
          spamSkipped: created.spamSkipped || 0,
          sharedTotal: 0,
          redundancyRate: 0,
          topOverlaps: [],
        },
        ...prev.filter((m) => m.groupId !== created.groupId),
      ]);
      pushToast(
        {
          kind: 'ok',
          title: 'Groupe ajouté',
          text: created.name,
        },
        3500,
      );
    },
    [pushToast],
  );

  const handleCandidateCountDelta = useCallback(
    (
      groupId: string,
      delta: { approvedCount?: number; rejectedCount?: number },
    ) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.groupId === groupId
            ? {
                ...g,
                approvedCount: Math.max(0, g.approvedCount + (delta.approvedCount || 0)),
                rejectedCount: Math.max(0, g.rejectedCount + (delta.rejectedCount || 0)),
              }
            : g,
        ),
      );
      if (delta.approvedCount) {
        setMatrix((prev) =>
          prev.map((m) =>
            m.groupId === groupId
              ? {
                  ...m,
                  approvedCount: Math.max(0, m.approvedCount + (delta.approvedCount || 0)),
                }
              : m,
          ),
        );
      }
    },
    [],
  );

  const startOptimisticRun = useCallback(
    async (mode: 'scrape' | 'snapshot', opts?: { groupIds?: string[]; groupName?: string; snapshotId?: string }) => {
      if (!userId || runActive) return;
      const prevConfig = config;
      const startedAtIso = new Date().toISOString();

      setLaunchingMode(mode);
      wasRunActiveRef.current = true;
      setRunOutcomeCard(null);
      setRunPollWarning(null);
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              lastPollStatus: mode === 'snapshot' ? 'importing_snapshot' : 'running',
              lastPollPhase:
                mode === 'snapshot' ? 'downloading_snapshot' : 'triggering_brightdata',
              lastPollStartedAt: startedAtIso,
              lastPollFinishedAt: null,
              lastSnapshotId: opts?.snapshotId || prev.lastSnapshotId,
              lastPollMessage:
                mode === 'snapshot'
                  ? `Démarrage de l'import ${opts?.snapshotId || ''}...`
                  : opts?.groupName
                  ? `Démarrage collecte pour « ${opts.groupName} »...`
                  : 'Démarrage de la collecte sur le serveur...',
              lastRunProgress: { current: 4, total: 100, percent: 4, unit: 'percent' },
            }
          : prev,
      );

      try {
        const res =
          mode === 'snapshot'
            ? await fbIngestionService.startImportSnapshot(userId, opts?.snapshotId || '')
            : await fbIngestionService.startRunNow(userId, opts?.groupIds);

        const msg =
          mode === 'snapshot'
            ? `Import du snapshot ${res.snapshotId || opts?.snapshotId} démarré en arrière-plan...`
            : opts?.groupName
            ? `Collecte démarrée pour « ${opts.groupName} ». Suivi en temps réel actif...`
            : `Collecte lancée sur ${res.groupsCount ?? 'les'} groupe(s) actif(s).`;

        pushToast(
          {
            kind: 'ok',
            title: mode === 'snapshot' ? 'Import Snapshot démarré' : 'Collecte démarrée',
            text: msg,
          },
          4500,
        );

        const cfg = await fbIngestionService.getConfig(userId);
        serverConfigRef.current = cfg;
        hasLoadedConfigRef.current = true;
        wasRunActiveRef.current =
          cfg.lastPollStatus === 'running' || cfg.lastPollStatus === 'importing_snapshot';
        lastKnownFinishedAtRef.current = cfg.lastPollFinishedAt || null;
        setConfig(cfg);
        if (cfg.lastPollStatus === 'importing_snapshot') {
          setLaunchingMode('snapshot');
        } else if (cfg.lastPollStatus === 'running') {
          setLaunchingMode('scrape');
        }
      } catch (err) {
        wasRunActiveRef.current = Boolean(
          prevConfig &&
            (prevConfig.lastPollStatus === 'running' ||
              prevConfig.lastPollStatus === 'importing_snapshot'),
        );
        if (prevConfig) {
          setConfig(prevConfig);
        }
        const msg = (err as Error).message;
        setRunOutcomeCard({ status: 'error', message: msg });
        pushToast({
          kind: 'err',
          title: mode === 'snapshot' ? 'Échec lancement import' : 'Impossible de lancer le scraper',
          text: msg,
        });
      }
    },
    [userId, runActive, config, pushToast],
  );

  const handleRunActiveGroups = useCallback(
    () => startOptimisticRun('scrape'),
    [startOptimisticRun],
  );

  const handleImportSnapshot = useCallback(() => {
    if (!snapshotInput.trim()) return;
    return startOptimisticRun('snapshot', { snapshotId: snapshotInput.trim() });
  }, [snapshotInput, startOptimisticRun]);

  const handleStartSingleGroupRun = useCallback(
    (g: FbGroupTarget) =>
      startOptimisticRun('scrape', { groupIds: [g.groupId], groupName: g.name }),
    [startOptimisticRun],
  );

  const handleCancelRun = useCallback(async () => {
    if (!userId || isCancellingRun) return;
    setIsCancellingRun(true);
    isPollingCompletionRef.current = true;
    try {
      const cfg = await fbIngestionService.cancelRun(userId);
      serverConfigRef.current = cfg;
      wasRunActiveRef.current = false;
      lastKnownFinishedAtRef.current = cfg.lastPollFinishedAt || null;
      setConfig(cfg);
      setRunPollWarning(null);
      const msg = 'Collecte annulée / état réinitialisé.';
      setRunOutcomeCard({ status: 'cancelled', message: msg });
      pushToast({ kind: 'warn', title: 'Opération annulée', text: msg });
    } catch (err) {
      const msg = (err as Error).message;
      pushToast({ kind: 'err', title: 'Échec annulation', text: msg });
    } finally {
      setIsCancellingRun(false);
      isPollingCompletionRef.current = false;
    }
  }, [userId, isCancellingRun, pushToast]);

  const handleRecoverPendingSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!userId || recoveringSnapshotId || runActive) return;
      setRecoveringSnapshotId(snapshotId);
      try {
        const res = await fbIngestionService.recoverPendingSnapshot(userId, snapshotId);
        if (res.action === 'importing') {
          setLaunchingMode('snapshot');
          wasRunActiveRef.current = true;
          setRunOutcomeCard(null);
          pushToast(
            {
              kind: 'ok',
              title: 'Récupération gratuite démarrée',
              text: res.message,
            },
            4500,
          );
        } else if (res.action === 'still_running') {
          pushToast(
            {
              kind: 'warn',
              title: 'Bright Data encore en cours',
              text: res.message,
            },
            4500,
          );
        } else {
          pushToast(
            {
              kind: 'err',
              title: 'Snapshot échoué chez Bright Data',
              text: res.message,
            },
            5000,
          );
        }
        await pollRunStatusNow();
      } catch (err) {
        pushToast({
          kind: 'err',
          title: 'Erreur vérification snapshot',
          text: (err as Error).message,
        });
      } finally {
        setRecoveringSnapshotId(null);
      }
    },
    [userId, recoveringSnapshotId, runActive, pushToast, pollRunStatusNow],
  );

  const handleDismissPendingSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!userId) return;
      try {
        const cfg = await fbIngestionService.dismissPendingSnapshot(userId, snapshotId);
        serverConfigRef.current = cfg;
        setConfig(cfg);
        pushToast(
          {
            kind: 'ok',
            title: 'Snapshot retiré',
            text: `${snapshotId} retiré de la file d'attente.`,
          },
          3000,
        );
      } catch (err) {
        pushToast({
          kind: 'err',
          title: 'Impossible de retirer',
          text: (err as Error).message,
        });
      }
    },
    [userId, pushToast],
  );

  const handleStartBackfill = useCallback(async () => {
    if (!userId || backfillActive) return;
    const prevJob = backfillJob;
    const startedAtIso = new Date().toISOString();

    setShowBackfillCard(true);
    setBackfillPollWarning(null);
    setBackfillJob({
      status: 'running',
      phase: 'starting',
      message: 'Démarrage de la migration en arrière-plan...',
      current: 0,
      total: 0,
      percent: 2,
      etaSeconds: null,
      scanned: 0,
      migratedScraped: 0,
      markedOrganic: 0,
      markedAdminManual: 0,
      avatarsPersisted: 0,
      errorCount: 0,
      lastError: null,
      startedAt: startedAtIso,
      finishedAt: null,
      updatedAt: startedAtIso,
    });

    try {
      const res = await fbIngestionService.startBackfillShadowOwners(userId);
      setBackfillJob(res.job);
      pushToast(
        {
          kind: 'ok',
          title: res.alreadyRunning ? 'Migration déjà en cours' : 'Migration démarrée',
          text:
            res.job.message ||
            'Analyse des annonces et upload des avatars sur GCS en arrière-plan...',
        },
        4500,
      );
    } catch (err) {
      const msg = (err as Error).message || 'Erreur lors du démarrage de la migration.';
      setBackfillJob({
        status: 'error',
        phase: 'error',
        message: msg,
        current: prevJob?.current ?? 0,
        total: prevJob?.total ?? 0,
        percent: prevJob?.percent ?? 0,
        etaSeconds: null,
        scanned: prevJob?.scanned ?? 0,
        migratedScraped: prevJob?.migratedScraped ?? 0,
        markedOrganic: prevJob?.markedOrganic ?? 0,
        markedAdminManual: prevJob?.markedAdminManual ?? 0,
        avatarsPersisted: prevJob?.avatarsPersisted ?? 0,
        errorCount: (prevJob?.errorCount ?? 0) + 1,
        lastError: msg,
        startedAt: prevJob?.startedAt ?? null,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      pushToast({ kind: 'err', title: 'Erreur migration', text: msg });
    }
  }, [userId, backfillActive, backfillJob, pushToast]);

  const handleCancelBackfill = useCallback(async () => {
    if (!userId || isCancellingBackfill) return;
    setIsCancellingBackfill(true);
    try {
      const job = await fbIngestionService.cancelBackfill(userId);
      setBackfillJob(job);
      if (job.status === 'cancelled') {
        const msg = job.message || 'Migration annulée.';
        pushToast({ kind: 'warn', title: 'Migration annulée', text: msg });
      }
    } catch (err) {
      pushToast({ kind: 'err', title: 'Erreur annulation', text: (err as Error).message });
    } finally {
      setIsCancellingBackfill(false);
    }
  }, [userId, isCancellingBackfill, pushToast]);

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      const res = await fbIngestionService.adminLogin(loginIdentifier, loginPassword);
      setUser(res);
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(res));
      }
      setLoginPassword('');
    } catch (err) {
      setLoginError((err as Error).message || 'Identifiants administrateur invalides');
    } finally {
      setLoginBusy(false);
    }
  };

  const selectTab = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  const handleGroupError = useCallback(
    (msg: string) => pushToast({ kind: 'err', title: 'Erreur groupe', text: msg }),
    [pushToast],
  );

  const handleOriginsError = useCallback(
    (msg: string) => pushToast({ kind: 'err', title: 'Erreur Origines', text: msg }),
    [pushToast],
  );

  const handleScrollToTop = useCallback(() => {
    controlBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleFocusOriginsTab = useCallback(() => {
    selectTab('origins');
    setShowBackfillCard(true);
  }, [selectTab]);

  const handleDismissBackfillCard = useCallback(() => {
    setShowBackfillCard(false);
  }, []);

  if (!loading && (!currentUser || !isAdmin)) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] dark:bg-zinc-950">
        <Header />
        <div className="max-w-md mx-auto px-4 pt-28 pb-16">
          <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-8 border border-zinc-200/80 dark:border-zinc-800 space-y-5 shadow-sm">
            <div className="text-center space-y-2">
              <ShieldAlert className="w-11 h-11 text-brand-green mx-auto" />
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                Connexion Administrateur
              </h1>
              <p className="text-xs text-zinc-500">
                Connectez-vous avec votre numéro de téléphone ou email administrateur pour accéder au scraper Facebook et à la validation.
              </p>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300">
                {loginError}
              </div>
            )}

            <form onSubmit={handleAdminSignIn} className="space-y-3.5 text-left">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Téléphone ou Email Admin
                </label>
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="0340000001 ou admin@tranogasy.mg"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300 mb-1">
                  Mot de passe
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green"
                />
              </div>

              <button
                type="submit"
                disabled={loginBusy}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-brand-green text-white text-xs font-bold hover:opacity-95 transition disabled:opacity-50 cursor-pointer"
              >
                {loginBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                Se connecter à l&apos;administration
              </button>
            </form>

            <div className="flex justify-center gap-4 pt-2 text-xs text-zinc-500">
              <Link href="/account" className="hover:underline">
                Mon compte
              </Link>
              <Link href="/" className="hover:underline">
                Accueil
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] dark:bg-zinc-950 pb-20">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:pr-24 pt-24 space-y-6">
        {/* Top Master Control Bar */}
        <section
          ref={controlBarRef}
          className="bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Retour au compte
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                  Administration Ingestion Facebook
                </h1>
                {config && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors duration-150 ${
                      config.isLive
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        config.isLive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                      }`}
                    />
                    {config.isLive ? 'LIVE (Actif)' : 'EN PAUSE'}
                  </span>
                )}
                {syncingConfig && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Contrôlez la collecte Bright Data, le filtrage IA Gemini, le stock d&apos;images GCS et la validation humaine rapide avant mise en ligne.
              </p>
            </div>

            {config && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void updateConfigPatch({ isLive: !config.isLive })}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold shadow-sm transition-colors duration-150 cursor-pointer ${
                    config.isLive
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-brand-green text-white hover:opacity-95'
                  }`}
                >
                  {config.isLive ? <Pause className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                  {config.isLive ? 'Mettre en PAUSE' : 'Activer en LIVE'}
                </button>

                <button
                  type="button"
                  disabled={runActive}
                  onClick={() => void handleRunActiveGroups()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
                >
                  {runActive ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {runActive
                    ? `Collecte (${config.lastRunProgress?.percent ?? 5}%)...`
                    : 'Lancer collecte maintenant'}
                </button>

                {runActive && (
                  <button
                    type="button"
                    disabled={isCancellingRun}
                    onClick={() => void handleCancelRun()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-bold border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isCancellingRun ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Ban className="w-3.5 h-3.5" />
                    )}
                    Annuler
                  </button>
                )}

                <button
                  type="button"
                  disabled={isRefreshing}
                  onClick={() => void loadAll({ refreshSubTabs: true })}
                  title="Rafraîchir en arrière-plan"
                  className="p-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-zinc-600 dark:text-zinc-300 ${
                      isRefreshing ? 'animate-spin' : ''
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Runtime Settings Row */}
          {config && (
            <div className="pt-4 border-t border-zinc-200/70 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40">
                <label className="block font-semibold text-zinc-500 mb-1">
                  Fréquence de collecte (Poll Interval)
                </label>
                <select
                  value={config.pollIntervalMinutes}
                  onChange={(e) =>
                    void updateConfigPatch({ pollIntervalMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold"
                >
                  <option value={10}>Toutes les 10 minutes (Ultra-réactif)</option>
                  <option value={15}>Toutes les 15 minutes</option>
                  <option value={30}>Toutes les 30 minutes (Équilibré)</option>
                  <option value={60}>Toutes les 60 minutes (Économie)</option>
                </select>
              </div>

              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40">
                <label className="block font-semibold text-zinc-500 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-brand-green" /> Modèle Gemini
                </label>
                <select
                  value={config.geminiModel}
                  onChange={(e) => void updateConfigPatch({ geminiModel: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-semibold"
                >
                  {GEMINI_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-500">
                    Heures actives Tana ({config.activeHourStart}h–{config.activeHourEnd}h)
                  </span>
                  <AsyncToggleSwitch
                    checked={config.onlyActiveHours}
                    size="sm"
                    label="Activer la collecte uniquement pendant les heures actives de Tana"
                    onToggle={() =>
                      void updateConfigPatch({ onlyActiveHours: !config.onlyActiveHours })
                    }
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Économise ~33% de crédits la nuit (UTC+3).
                </p>
              </div>

              {/* Zero-cost Snapshot Import */}
              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40">
                <label className="block font-semibold text-zinc-500 mb-1">
                  Importer Snapshot Bright Data (Gratuit)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={snapshotInput}
                    onChange={(e) => setSnapshotInput(e.target.value)}
                    list="bd-snapshots"
                    placeholder="sd_..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-[11px]"
                  />
                  <datalist id="bd-snapshots">
                    {snapshots.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} ({s.dataset_size ?? '?'} items)
                      </option>
                    ))}
                  </datalist>
                  <button
                    type="button"
                    disabled={runActive}
                    onClick={() => void handleImportSnapshot()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-green text-white font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {runActive ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Zero-Touch Auto-Validation Control Row */}
          {config && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-brand-green/15 text-brand-green flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white">
                      Validation Automatique IA (&laquo; Zero-Touch &raquo;)
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        (config.autoApproveEnabled ?? true)
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {(config.autoApproveEnabled ?? true) ? 'ACTIF' : 'MANUEL'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Publie automatiquement les annonces complètes (téléphone, photo, Fokontany fiable et score suffisant).
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 font-semibold text-zinc-600 dark:text-zinc-300">
                  <span>Score min :</span>
                  <select
                    value={config.autoApproveMinQualityScore ?? 75}
                    onChange={(e) =>
                      void updateConfigPatch({
                        autoApproveMinQualityScore: Number(e.target.value),
                      })
                    }
                    className="px-2.5 py-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-bold text-xs"
                  >
                    <option value={65}>65 / 100 (Large)</option>
                    <option value={75}>75 / 100 (Recommandé)</option>
                    <option value={85}>85 / 100 (Strict)</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    void updateConfigPatch({
                      autoApproveAllowEstimatedPrice: !(
                        config.autoApproveAllowEstimatedPrice ?? true
                      ),
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold transition cursor-pointer ${
                    (config.autoApproveAllowEstimatedPrice ?? true)
                      ? 'bg-brand-green/15 border-brand-green/40 text-brand-green'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-500'
                  }`}
                  title="Auto-publier aussi les annonces complètes sans prix explicite en affichant l'Estimation TranoGasy"
                >
                  <span>
                    {(config.autoApproveAllowEstimatedPrice ?? true) ? '✓' : '○'} Inclure Prix Estimé IA
                  </span>
                </button>

                <AsyncToggleSwitch
                  checked={config.autoApproveEnabled ?? true}
                  size="sm"
                  label="Activer l'auto-publication IA des annonces fiables"
                  onToggle={() =>
                    void updateConfigPatch({
                      autoApproveEnabled: !(config.autoApproveEnabled ?? true),
                    })
                  }
                />
              </div>
            </div>
          )}

          {/* Live Cycle Cockpit, Countdown, Heartbeat & Activity Log */}
          {config && (
            <div className="space-y-3 pt-1">
              <ScraperCycleCockpit
                config={config}
                groups={groups}
                runActive={runActive}
                launchingMode={launchingMode}
                isRefreshing={isRefreshing}
                recoveringSnapshotId={recoveringSnapshotId}
                autoSyncIntervalSec={autoSyncIntervalSec}
                onToggleLive={() => void updateConfigPatch({ isLive: !config.isLive })}
                onRunNow={() => void handleRunActiveGroups()}
                onOpenGroupsTab={() => selectTab('groups')}
                onSelectSnapshotId={(id) => {
                  setSnapshotInput(id);
                  pushToast({
                    kind: 'ok',
                    title: 'Snapshot prêt à importer',
                    text: `${id} sélectionné dans le champ d'import gratuit.`,
                  }, 3000);
                }}
                onRecoverPendingSnapshot={(id) => void handleRecoverPendingSnapshot(id)}
                onDismissPendingSnapshot={(id) => void handleDismissPendingSnapshot(id)}
                onRefreshNow={() => void pollRunStatusNow()}
              />

              {runActive ? (
                <OperationProgressCard
                  title={
                    config.lastPollStatus === 'importing_snapshot' ||
                    launchingMode === 'snapshot'
                      ? `Import Snapshot Bright Data${
                          config.lastSnapshotId ? ` (${config.lastSnapshotId})` : ''
                        }`
                      : `Collecte Scraper Facebook${
                          config.lastSnapshotId ? ` (${config.lastSnapshotId})` : ''
                        }`
                  }
                  status="running"
                  message={config.lastPollMessage || 'Traitement en cours...'}
                  detail={config.lastRunProgress?.detail || null}
                  percent={
                    config.lastRunProgress?.percent ??
                    (config.lastRunProgress && config.lastRunProgress.total > 0
                      ? Math.round(
                          (config.lastRunProgress.current / config.lastRunProgress.total) * 100,
                        )
                      : 6)
                  }
                  countLabel={
                    config.lastRunProgress?.unit === 'posts' &&
                    config.lastRunProgress.total > 0
                      ? `${config.lastRunProgress.current} / ${config.lastRunProgress.total} posts`
                      : config.lastSnapshotId
                      ? `ID: ${config.lastSnapshotId}`
                      : null
                  }
                  startedAt={config.lastPollStartedAt}
                  etaSeconds={config.lastRunProgress?.etaSeconds ?? null}
                  etaFallbackLabel={getScraperEtaFallback(config.lastPollPhase)}
                  steps={buildScraperPipelineSteps(
                    config.lastPollPhase,
                    config.lastPollStatus === 'importing_snapshot' ||
                      launchingMode === 'snapshot',
                  )}
                  pollWarning={runPollWarning}
                  isCancelling={isCancellingRun}
                  onCancel={() => void handleCancelRun()}
                  onRefreshNow={() => void pollRunStatusNow()}
                />
              ) : runOutcomeCard ? (
                <OperationProgressCard
                  title={
                    launchingMode === 'snapshot'
                      ? 'Résultat import Snapshot Bright Data'
                      : 'Résultat collecte Scraper Facebook'
                  }
                  status={runOutcomeCard.status}
                  message={runOutcomeCard.message}
                  percent={runOutcomeCard.status === 'completed' ? 100 : 0}
                  elapsedSec={runOutcomeCard.elapsedSec}
                  onRetry={
                    runOutcomeCard.status === 'error' || runOutcomeCard.status === 'cancelled'
                      ? () =>
                          void (launchingMode === 'snapshot'
                            ? handleImportSnapshot()
                            : handleRunActiveGroups())
                      : undefined
                  }
                  onDismiss={() => setRunOutcomeCard(null)}
                />
              ) : null}

              {config.lastError && (
                <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 flex items-start justify-between gap-3 text-xs text-red-700 dark:text-red-300">
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div className="min-w-0 break-words">
                      <span className="font-bold">Dernière erreur : </span>
                      <span>{config.lastError}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void updateConfigPatch({ lastError: null })}
                    title="Effacer cette alerte"
                    className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {loadError && !config && (
          <div className="px-5 py-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 border border-red-200 dark:border-red-900">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="px-3 py-1 rounded-full bg-red-700 text-white text-[11px] font-bold hover:opacity-90 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        )}

        {displayedSummary && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-bold text-zinc-900 dark:text-white">
              Résumé {displayedSummary.snapshotId} :
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              +{displayedSummary.candidatesCreated} créés
            </span>
            {(displayedSummary.autoApprovedCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-green/15 text-brand-green font-bold">
                <Zap className="w-3 h-3" /> {displayedSummary.autoApprovedCount} auto-publiés
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
              {displayedSummary.duplicateSkipped} doublons ({displayedSummary.crossGroupOverlaps}{' '}
              inter-groupes)
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
              {displayedSummary.landSkipped} terrains ignorés
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
              {displayedSummary.videoOnlySkipped} vidéos ignorées
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
              {displayedSummary.spamSkipped} spams/recherches
            </span>
            <span className="text-zinc-400">
              ({displayedSummary.geminiCalls} appels Gemini
              {(typeof displayedSummary.placesCacheHits === 'number' ||
                typeof displayedSummary.placesApiCalls === 'number') && (
                <>
                  {' '}
                  • {displayedSummary.placesCacheHits ?? 0} cache Geo •{' '}
                  {displayedSummary.placesApiCalls ?? 0} API Places
                </>
              )}
              )
            </span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => selectTab('queue')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <CheckSquare className="w-4 h-4" /> File de validation rapide
          </button>

          <button
            type="button"
            onClick={() => selectTab('groups')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'groups'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <Layers className="w-4 h-4" /> Groupes cibles &amp; Fréquence ({groups.length})
          </button>

          <button
            type="button"
            onClick={() => selectTab('matrix')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <GitCompare className="w-4 h-4" /> Matrice de similarité
          </button>

          <button
            type="button"
            onClick={() => selectTab('origins')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition cursor-pointer ${
              activeTab === 'origins'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Origines &amp; Réclamations
          </button>
        </div>

        {/* Tab Views (Visited tabs stay mounted so switching is 0ms and preserves unsaved edits) */}
        {loading || !config ? (
          <div className="py-20 flex items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin text-brand-green" /> Chargement de la console...
          </div>
        ) : (
          <>
            {visitedTabs.has('queue') && (
              <div className={activeTab === 'queue' ? 'block' : 'hidden'}>
                <ValidationQueueTab
                  userId={userId}
                  groups={groups}
                  refreshNonce={queueRefreshNonce}
                  onCandidateCountDelta={handleCandidateCountDelta}
                  onPushToast={pushToast}
                  onUpdateToast={updateToast}
                />
              </div>
            )}

            {visitedTabs.has('groups') && (
              <div className={activeTab === 'groups' ? 'block' : 'hidden'}>
                <GroupsManagerTab
                  userId={userId}
                  groups={groups}
                  config={config}
                  isAnyRunActive={runActive}
                  syncingGroupIds={syncingGroupIds}
                  onUpdateGroup={handleUpdateGroupOptimistic}
                  onDeleteGroup={handleDeleteGroupOptimistic}
                  onGroupAdded={handleGroupAdded}
                  onStartSingleGroupRun={handleStartSingleGroupRun}
                  onCancelRun={handleCancelRun}
                  onError={handleGroupError}
                />
              </div>
            )}

            {visitedTabs.has('matrix') && (
              <div className={activeTab === 'matrix' ? 'block' : 'hidden'}>
                <OverlapMatrixTab
                  matrix={matrix}
                  syncingGroupIds={syncingGroupIds}
                  onUpdateGroup={handleUpdateGroupOptimistic}
                />
              </div>
            )}

            {visitedTabs.has('origins') && (
              <div className={activeTab === 'origins' ? 'block' : 'hidden'}>
                <PublishedOriginsTab
                  userId={userId}
                  backfillJob={backfillJob}
                  backfillPollWarning={backfillPollWarning}
                  isStartingBackfill={false}
                  isCancellingBackfill={isCancellingBackfill}
                  showBackfillCard={showBackfillCard}
                  refreshNonce={originsRefreshNonce}
                  onStartBackfill={() => void handleStartBackfill()}
                  onCancelBackfill={() => void handleCancelBackfill()}
                  onRefreshBackfillStatus={() => void pollBackfillStatusNow()}
                  onDismissBackfillCard={handleDismissBackfillCard}
                  onError={handleOriginsError}
                />
              </div>
            )}
          </>
        )}
      </main>

      <FloatingOperationHud
        activeRun={
          runActive && config
            ? {
                title:
                  config.lastPollStatus === 'importing_snapshot'
                    ? 'Import Snapshot Bright Data'
                    : 'Collecte Scraper Facebook',
                message: config.lastPollMessage || 'Traitement en cours...',
                percent: config.lastRunProgress?.percent ?? 6,
                startedAt: config.lastPollStartedAt,
                etaSeconds: config.lastRunProgress?.etaSeconds ?? null,
                countLabel:
                  config.lastRunProgress?.unit === 'posts' &&
                  config.lastRunProgress.total > 0
                    ? `${config.lastRunProgress.current}/${config.lastRunProgress.total} posts`
                    : null,
                isCancelling: isCancellingRun,
                onCancel: handleCancelRun,
                onScrollToTop: handleScrollToTop,
              }
            : null
        }
        activeBackfill={backfillJob}
        isCancellingBackfill={isCancellingBackfill}
        onCancelBackfill={handleCancelBackfill}
        onFocusOriginsTab={handleFocusOriginsTab}
        toasts={toasts}
        onDismissToast={dismissToast}
      />
    </div>
  );
}
