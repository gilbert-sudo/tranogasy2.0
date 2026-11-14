'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
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

  const [activeTab, setActiveTab] = useState<'queue' | 'groups' | 'matrix' | 'origins'>('queue');
  const [config, setConfig] = useState<FbIngestionConfig | null>(null);
  const [groups, setGroups] = useState<FbGroupTarget[]>([]);
  const [matrix, setMatrix] = useState<FbOverlapMatrixRow[]>([]);
  const [snapshots, setSnapshots] = useState<BrightDataSnapshotMeta[]>([]);
  const [snapshotInput, setSnapshotInput] = useState('sd_mwewhh3hvi9vt8yqk');
  const [loading, setLoading] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingMode, setLaunchingMode] = useState<'scrape' | 'snapshot'>('scrape');
  const [isCancellingRun, setIsCancellingRun] = useState(false);
  const [runPollWarning, setRunPollWarning] = useState<string | null>(null);
  const [runOutcomeCard, setRunOutcomeCard] = useState<{
    status: 'completed' | 'cancelled' | 'error';
    message: string;
    elapsedSec?: number;
  } | null>(null);

  const [backfillJob, setBackfillJob] = useState<BackfillJobState | null>(null);
  const [isStartingBackfill, setIsStartingBackfill] = useState(false);
  const [isCancellingBackfill, setIsCancellingBackfill] = useState(false);
  const [backfillPollWarning, setBackfillPollWarning] = useState<string | null>(null);
  const [showBackfillCard, setShowBackfillCard] = useState(false);
  const [originsRefreshNonce, setOriginsRefreshNonce] = useState(0);

  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [hudToast, setHudToast] = useState<HudToast | null>(null);
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const isPollingCompletionRef = useRef(false);
  const isBackfillCompletionRef = useRef(false);
  const runPollFailuresRef = useRef(0);
  const backfillPollFailuresRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlBarRef = useRef<HTMLElement | null>(null);

  const pushToast = useCallback((nextToast: HudToast, autoHideMs = 9000) => {
    setHudToast(nextToast);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (nextToast.kind === 'ok' && autoHideMs > 0) {
      toastTimerRef.current = setTimeout(() => {
        setHudToast((curr) => (curr === nextToast ? null : curr));
      }, autoHideMs);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const runActive =
    isLaunching ||
    config?.lastPollStatus === 'running' ||
    config?.lastPollStatus === 'importing_snapshot';

  const backfillActive = isStartingBackfill || backfillJob?.status === 'running';

  const elapsedSec =
    runActive && config?.lastPollStartedAt
      ? Math.max(0, Math.round((nowMs - new Date(config.lastPollStartedAt).getTime()) / 1000))
      : 0;

  const backfillElapsedSec =
    backfillActive && backfillJob?.startedAt
      ? Math.max(0, Math.round((nowMs - new Date(backfillJob.startedAt).getTime()) / 1000))
      : 0;

  const displayedSummary = lastSummary || config?.lastRunSummary || null;

  useEffect(() => {
    initializeUser();
  }, [initializeUser]);

  const loadAll = useCallback(async () => {
    if (!userId || !isAdmin) {
      setLoading(false);
      return;
    }
    try {
      const [cfg, grp, mat] = await Promise.all([
        fbIngestionService.getConfig(userId),
        fbIngestionService.listGroups(userId),
        fbIngestionService.getOverlapMatrix(userId),
      ]);
      setConfig(cfg);
      if (cfg.lastRunSummary) {
        setLastSummary(cfg.lastRunSummary);
      }
      if (cfg.backfillJob) {
        setBackfillJob(cfg.backfillJob);
        if (cfg.backfillJob.status === 'running' || cfg.backfillJob.phase === 'interrupted') {
          setShowBackfillCard(true);
        }
      }
      setGroups(grp);
      setMatrix(mat.groups);

      // Load remote Bright Data snapshot list asynchronously so slow external calls never block UI
      fbIngestionService
        .listRemoteSnapshots(userId)
        .then(setSnapshots)
        .catch(() => {});
    } catch (err) {
      const msg = (err as Error).message;
      setBanner({ kind: 'err', text: msg });
      pushToast({ kind: 'err', title: 'Erreur de chargement', text: msg });
    } finally {
      setLoading(false);
    }
  }, [userId, isAdmin, pushToast]);

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
        setConfig(cfg);
        if (cfg.lastRunSummary) {
          setLastSummary(cfg.lastRunSummary);
        }
        if (cfg.backfillJob) {
          setBackfillJob(cfg.backfillJob);
          if (cfg.backfillJob.status === 'running' || cfg.backfillJob.phase === 'interrupted') {
            setShowBackfillCard(true);
          }
        }
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
          setBanner({ kind: 'err', text: msg });
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
  }, [userId, isAdmin, pushToast]);

  const pollRunStatusNow = useCallback(async () => {
    if (!userId || !isAdmin) return;
    try {
      const cfg = await fbIngestionService.getConfig(userId);
      runPollFailuresRef.current = 0;
      setRunPollWarning(null);
      setConfig(cfg);

      const stillRunning =
        cfg.lastPollStatus === 'running' || cfg.lastPollStatus === 'importing_snapshot';
      if (!stillRunning && !isPollingCompletionRef.current) {
        isPollingCompletionRef.current = true;
        setIsLaunching(false);
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
          setBanner({ kind: 'err', text: msg });
          pushToast({ kind: 'warn', title: 'Opération annulée', text: msg });
        } else if (cfg.lastPollStatus === 'error') {
          const msg = cfg.lastError || cfg.lastPollMessage || 'Erreur lors de la collecte Facebook.';
          setRunOutcomeCard({ status: 'error', message: msg, elapsedSec: runDurationSec });
          setBanner({ kind: 'err', text: msg });
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
          setBanner({
            kind: cfg.lastRunSummary.errors?.length > 0 ? 'err' : 'ok',
            text: msg,
          });
          pushToast({
            kind: cfg.lastRunSummary.errors?.length > 0 ? 'warn' : 'ok',
            title: 'Collecte terminée',
            text: msg,
          });
        } else {
          const msg = cfg.lastPollMessage || 'Collecte terminée. Groupes et file mis à jour.';
          setRunOutcomeCard({ status: 'completed', message: msg, elapsedSec: runDurationSec });
          setBanner({ kind: 'ok', text: msg });
          pushToast({ kind: 'ok', title: 'Collecte terminée', text: msg });
        }

        await loadAll();
        isPollingCompletionRef.current = false;
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

  // Live poll every 2 seconds whenever an ingestion or snapshot import is running
  useEffect(() => {
    if (!userId || !isAdmin || !runActive) return;
    runPollFailuresRef.current = 0;

    const intervalId = setInterval(() => {
      void pollRunStatusNow();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [userId, isAdmin, runActive, pollRunStatusNow]);

  const pollBackfillStatusNow = useCallback(async () => {
    if (!userId || !isAdmin) return;
    try {
      const job = await fbIngestionService.getBackfillStatus(userId);
      backfillPollFailuresRef.current = 0;
      setBackfillPollWarning(null);
      setBackfillJob(job);

      if (job.status !== 'running' && !isBackfillCompletionRef.current) {
        isBackfillCompletionRef.current = true;
        setIsStartingBackfill(false);
        setIsCancellingBackfill(false);

        if (job.status === 'completed') {
          const msg =
            job.message ||
            `Migration terminée (${job.scanned} analysées) : ${job.migratedScraped} annonces FB migrées.`;
          setBanner({ kind: 'ok', text: msg });
          pushToast({ kind: 'ok', title: 'Migration terminée', text: msg });
        } else if (job.status === 'cancelled') {
          const msg = job.message || 'Migration annulée.';
          setBanner({ kind: 'err', text: msg });
          pushToast({ kind: 'warn', title: 'Migration annulée', text: msg });
        } else if (job.status === 'error') {
          const msg = job.lastError || job.message || 'Erreur durant la migration.';
          setBanner({ kind: 'err', text: msg });
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

  // Smooth local elapsed timer during any active operation
  useEffect(() => {
    if (!runActive && !backfillActive) return;
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [runActive, backfillActive]);

  const updateConfigPatch = async (patch: Parameters<typeof fbIngestionService.updateConfig>[1]) => {
    if (!userId) return;
    try {
      const updated = await fbIngestionService.updateConfig(userId, patch);
      setConfig(updated);
      if (patch.lastError === null) return;
      const msg =
        typeof patch.isLive === 'boolean'
          ? patch.isLive
            ? 'Scraper activé en mode LIVE (surveillance automatique démarrée).'
            : 'Scraper mis en PAUSE (0 crédit consommé).'
          : 'Configuration mise à jour.';
      setBanner({ kind: 'ok', text: msg });
      pushToast({ kind: 'ok', title: 'Configuration enregistrée', text: msg });
    } catch (err) {
      const msg = (err as Error).message;
      setBanner({ kind: 'err', text: msg });
      pushToast({ kind: 'err', title: 'Erreur configuration', text: msg });
    }
  };

  const handleRunActiveGroups = async () => {
    if (!userId || runActive) return;
    setLaunchingMode('scrape');
    setIsLaunching(true);
    setRunOutcomeCard(null);
    setRunPollWarning(null);
    setBanner(null);
    try {
      const res = await fbIngestionService.startRunNow(userId);
      const msg = `Collecte lancée sur ${res.groupsCount ?? 'les'} groupe(s) actif(s). Suivi en direct ci-dessus...`;
      setBanner({ kind: 'ok', text: msg });
      pushToast({ kind: 'ok', title: 'Collecte démarrée', text: msg }, 5000);
      const cfg = await fbIngestionService.getConfig(userId);
      setConfig(cfg);
      setIsLaunching(false);
    } catch (err) {
      setIsLaunching(false);
      const msg = (err as Error).message;
      setRunOutcomeCard({ status: 'error', message: msg });
      setBanner({ kind: 'err', text: msg });
      pushToast({ kind: 'err', title: 'Impossible de lancer le scraper', text: msg });
    }
  };

  const handleImportSnapshot = async () => {
    if (!userId || !snapshotInput.trim() || runActive) return;
    setLaunchingMode('snapshot');
    setIsLaunching(true);
    setRunOutcomeCard(null);
    setRunPollWarning(null);
    setBanner(null);
    try {
      const res = await fbIngestionService.startImportSnapshot(userId, snapshotInput.trim());
      const msg = `Import du snapshot ${res.snapshotId || snapshotInput.trim()} démarré en arrière-plan...`;
      setBanner({ kind: 'ok', text: msg });
      pushToast({ kind: 'ok', title: 'Import Snapshot démarré', text: msg }, 5000);
      const cfg = await fbIngestionService.getConfig(userId);
      setConfig(cfg);
      setIsLaunching(false);
    } catch (err) {
      setIsLaunching(false);
      const msg = (err as Error).message;
      setRunOutcomeCard({ status: 'error', message: msg });
      setBanner({ kind: 'err', text: msg });
      pushToast({ kind: 'err', title: 'Échec lancement import', text: msg });
    }
  };

  const handleCancelRun = async () => {
    if (!userId || isCancellingRun) return;
    setIsCancellingRun(true);
    isPollingCompletionRef.current = true;
    try {
      const cfg = await fbIngestionService.cancelRun(userId);
      setConfig(cfg);
      setIsLaunching(false);
      setRunPollWarning(null);
      const msg = 'Collecte annulée / état réinitialisé.';
      setRunOutcomeCard({ status: 'cancelled', message: msg });
      setBanner({ kind: 'err', text: msg });
      pushToast({ kind: 'warn', title: 'Opération annulée', text: msg });
    } catch (err) {
      const msg = (err as Error).message;
      setBanner({ kind: 'err', text: msg });
      pushToast({ kind: 'err', title: 'Échec annulation', text: msg });
    } finally {
      setIsCancellingRun(false);
      isPollingCompletionRef.current = false;
    }
  };

  const handleStartBackfill = async () => {
    if (!userId || backfillActive) return;
    setIsStartingBackfill(true);
    setShowBackfillCard(true);
    setBackfillPollWarning(null);
    setBanner(null);
    try {
      const res = await fbIngestionService.startBackfillShadowOwners(userId);
      setBackfillJob(res.job);
      setIsStartingBackfill(false);
      pushToast(
        {
          kind: 'ok',
          title: res.alreadyRunning ? 'Migration déjà en cours' : 'Migration démarrée',
          text:
            res.job.message ||
            'Analyse des annonces et upload des avatars sur GCS en arrière-plan...',
        },
        5000,
      );
    } catch (err) {
      setIsStartingBackfill(false);
      const msg = (err as Error).message || 'Erreur lors du démarrage de la migration.';
      setBackfillJob((prev) => ({
        status: 'error',
        phase: 'error',
        message: msg,
        current: prev?.current ?? 0,
        total: prev?.total ?? 0,
        percent: prev?.percent ?? 0,
        etaSeconds: null,
        scanned: prev?.scanned ?? 0,
        migratedScraped: prev?.migratedScraped ?? 0,
        markedOrganic: prev?.markedOrganic ?? 0,
        markedAdminManual: prev?.markedAdminManual ?? 0,
        avatarsPersisted: prev?.avatarsPersisted ?? 0,
        errorCount: (prev?.errorCount ?? 0) + 1,
        lastError: msg,
        startedAt: prev?.startedAt ?? null,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      setBanner({ kind: 'err', text: msg });
      pushToast({ kind: 'err', title: 'Erreur migration', text: msg });
    }
  };

  const handleCancelBackfill = async () => {
    if (!userId || isCancellingBackfill) return;
    setIsCancellingBackfill(true);
    try {
      const job = await fbIngestionService.cancelBackfill(userId);
      setBackfillJob(job);
      if (job.status === 'cancelled') {
        setIsStartingBackfill(false);
        const msg = job.message || 'Migration annulée.';
        setBanner({ kind: 'err', text: msg });
        pushToast({ kind: 'warn', title: 'Migration annulée', text: msg });
      }
    } catch (err) {
      pushToast({ kind: 'err', title: 'Erreur annulation', text: (err as Error).message });
    } finally {
      setIsCancellingBackfill(false);
    }
  };

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
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-brand-green text-white text-xs font-bold hover:opacity-95 transition disabled:opacity-50"
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
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
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
              </div>
              <p className="text-xs text-zinc-500">
                Contrôlez la collecte Bright Data, le filtrage IA Gemini, le stock d&apos;images GCS et la validation humaine rapide avant mise en ligne.
              </p>
            </div>

            {config && (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => updateConfigPatch({ isLive: !config.isLive })}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold shadow-sm transition ${
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
                  onClick={handleRunActiveGroups}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 transition disabled:opacity-50"
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
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-bold border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 transition disabled:opacity-50"
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
                  onClick={() => loadAll()}
                  title="Rafraîchir"
                  className="p-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  <RefreshCw className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
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
                    updateConfigPatch({ pollIntervalMinutes: Number(e.target.value) })
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
                  onChange={(e) => updateConfigPatch({ geminiModel: e.target.value })}
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
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-500">
                    Heures actives Tana ({config.activeHourStart}h–{config.activeHourEnd}h)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateConfigPatch({ onlyActiveHours: !config.onlyActiveHours })
                    }
                    className={`w-10 h-5 rounded-full p-0.5 transition flex items-center ${
                      config.onlyActiveHours
                        ? 'bg-brand-green justify-end'
                        : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shadow" />
                  </button>
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
                    onClick={handleImportSnapshot}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-green text-white font-bold disabled:opacity-50"
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

          {/* Telemetry Footer */}
          {config && (
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-500">
                <span className="inline-flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-brand-green" />
                  Statut : <strong>{config.lastPollStatus}</strong>
                </span>
                <span>Runs : {config.totalRuns}</span>
                <span>Posts récupérés : {config.totalBrightDataRecords}</span>
                <span>Appels Gemini : {config.totalGeminiCalls}</span>
                {config.lastSnapshotId && (
                  <span className="font-mono text-zinc-600 dark:text-zinc-300">
                    Snapshot : {config.lastSnapshotId}
                  </span>
                )}
                {config.lastPollFinishedAt && (
                  <span>
                    Dernière synchro : {new Date(config.lastPollFinishedAt).toLocaleString('fr-FR')}
                  </span>
                )}
              </div>

              {runActive ? (
                <OperationProgressCard
                  title={
                    (config.lastPollStatus === 'importing_snapshot' ||
                      (isLaunching && launchingMode === 'snapshot'))
                      ? `Import Snapshot Bright Data${config.lastSnapshotId ? ` (${config.lastSnapshotId})` : ''}`
                      : `Collecte Scraper Facebook${config.lastSnapshotId ? ` (${config.lastSnapshotId})` : ''}`
                  }
                  status="running"
                  message={
                    config.lastPollMessage ||
                    (isLaunching ? 'Démarrage de la collecte sur le serveur...' : 'Traitement en cours...')
                  }
                  detail={config.lastRunProgress?.detail || null}
                  percent={
                    config.lastRunProgress?.percent ??
                    (config.lastRunProgress && config.lastRunProgress.total > 0
                      ? Math.round(
                          (config.lastRunProgress.current / config.lastRunProgress.total) * 100,
                        )
                      : isLaunching
                      ? 4
                      : 8)
                  }
                  countLabel={
                    config.lastRunProgress?.unit === 'posts' &&
                    config.lastRunProgress.total > 0
                      ? `${config.lastRunProgress.current} / ${config.lastRunProgress.total} posts`
                      : config.lastSnapshotId
                      ? `ID: ${config.lastSnapshotId}`
                      : null
                  }
                  elapsedSec={elapsedSec}
                  etaSeconds={config.lastRunProgress?.etaSeconds ?? null}
                  etaFallbackLabel={getScraperEtaFallback(config.lastPollPhase)}
                  steps={buildScraperPipelineSteps(
                    config.lastPollPhase,
                    config.lastPollStatus === 'importing_snapshot' ||
                      (isLaunching && launchingMode === 'snapshot'),
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
                    onClick={() => updateConfigPatch({ lastError: null })}
                    title="Effacer cette alerte"
                    className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notifications / Last Run Summary */}
        {banner && (
          <div
            className={`px-5 py-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between ${
              banner.kind === 'ok'
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900'
                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 border border-red-200 dark:border-red-900'
            }`}
          >
            <span>{banner.text}</span>
            <button type="button" onClick={() => setBanner(null)}>
              <X className="w-4 h-4" />
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
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
              {displayedSummary.duplicateSkipped} doublons ({displayedSummary.crossGroupOverlaps} inter-groupes)
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
            <span className="text-zinc-400">({displayedSummary.geminiCalls} appels Gemini)</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition ${
              activeTab === 'queue'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <CheckSquare className="w-4 h-4" /> File de validation rapide
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition ${
              activeTab === 'groups'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <Layers className="w-4 h-4" /> Groupes cibles & Fréquence ({groups.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition ${
              activeTab === 'matrix'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <GitCompare className="w-4 h-4" /> Matrice de similarité
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('origins')}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition ${
              activeTab === 'origins'
                ? 'bg-brand-green text-white shadow-sm'
                : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Origines &amp; Réclamations
          </button>
        </div>

        {/* Tab Views */}
        {loading || !config ? (
          <div className="py-20 flex items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin text-brand-green" /> Chargement de la console...
          </div>
        ) : activeTab === 'queue' ? (
          <ValidationQueueTab
            userId={userId}
            groups={groups}
            onRefreshAll={loadAll}
            onNotify={(notice) =>
              pushToast({
                kind: notice.kind,
                title: notice.kind === 'ok' ? 'Validation mise à jour' : 'Erreur validation',
                text: notice.text,
              })
            }
          />
        ) : activeTab === 'groups' ? (
          <GroupsManagerTab
            userId={userId}
            groups={groups}
            config={config}
            isAnyRunActive={runActive}
            onRefresh={loadAll}
            onCancelRun={() => void handleCancelRun()}
            onRunStarted={async (msg) => {
              setLaunchingMode('scrape');
              setRunOutcomeCard(null);
              setRunPollWarning(null);
              setBanner({ kind: 'ok', text: msg });
              pushToast({ kind: 'ok', title: 'Collecte démarrée', text: msg }, 5000);
              try {
                const cfg = await fbIngestionService.getConfig(userId);
                setConfig(cfg);
              } catch {
                // Polling effect picks up active state
              }
            }}
            onError={(msg) => {
              setBanner({ kind: 'err', text: msg });
              pushToast({ kind: 'err', title: 'Erreur groupe', text: msg });
            }}
          />
        ) : activeTab === 'origins' ? (
          <PublishedOriginsTab
            userId={userId}
            backfillJob={backfillJob}
            backfillElapsedSec={backfillElapsedSec}
            backfillPollWarning={backfillPollWarning}
            isStartingBackfill={isStartingBackfill}
            isCancellingBackfill={isCancellingBackfill}
            showBackfillCard={showBackfillCard}
            refreshNonce={originsRefreshNonce}
            onStartBackfill={() => void handleStartBackfill()}
            onCancelBackfill={() => void handleCancelBackfill()}
            onRefreshBackfillStatus={() => void pollBackfillStatusNow()}
            onDismissBackfillCard={() => setShowBackfillCard(false)}
            onError={(msg) => {
              setBanner({ kind: 'err', text: msg });
              pushToast({ kind: 'err', title: 'Erreur Origines', text: msg });
            }}
          />
        ) : (
          <OverlapMatrixTab
            userId={userId}
            matrix={matrix}
            onRefresh={loadAll}
            onError={(msg) => {
              setBanner({ kind: 'err', text: msg });
              pushToast({ kind: 'err', title: 'Erreur matrice', text: msg });
            }}
          />
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
                percent: config.lastRunProgress?.percent ?? (isLaunching ? 4 : 8),
                elapsedSec,
                etaSeconds: config.lastRunProgress?.etaSeconds ?? null,
                countLabel:
                  config.lastRunProgress?.unit === 'posts' &&
                  config.lastRunProgress.total > 0
                    ? `${config.lastRunProgress.current}/${config.lastRunProgress.total} posts`
                    : null,
                isCancelling: isCancellingRun,
                onCancel: () => void handleCancelRun(),
                onScrollToTop: () =>
                  controlBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              }
            : null
        }
        activeBackfill={backfillJob}
        backfillElapsedSec={backfillElapsedSec}
        isCancellingBackfill={isCancellingBackfill}
        onCancelBackfill={() => void handleCancelBackfill()}
        onFocusOriginsTab={() => {
          setActiveTab('origins');
          setShowBackfillCard(true);
        }}
        toast={hudToast}
        onDismissToast={() => setHudToast(null)}
      />
    </div>
  );
}
