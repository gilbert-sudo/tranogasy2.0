'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  RefreshCw,
  Loader2,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  Clock,
  Building2,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  Phone,
  Link2,
} from 'lucide-react';
import {
  fbIngestionService,
  type AdminOriginProperty,
  type AdminOriginPropertyListResponse,
  type BackfillJobState,
} from '@/services/fbIngestion.service';
import OperationProgressCard, { type ProgressStatItem } from './OperationProgressCard';

interface PublishedOriginsTabProps {
  userId: string;
  backfillJob: BackfillJobState | null;
  backfillElapsedSec: number;
  backfillPollWarning?: string | null;
  isStartingBackfill: boolean;
  isCancellingBackfill: boolean;
  showBackfillCard: boolean;
  refreshNonce?: number;
  onStartBackfill: () => void;
  onCancelBackfill: () => void;
  onRefreshBackfillStatus: () => void;
  onDismissBackfillCard: () => void;
  onError: (msg: string) => void;
}

const ORIGIN_LABELS: Record<string, { label: string; className: string }> = {
  facebook_scraper: {
    label: 'Facebook Scraper',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  },
  admin_manual: {
    label: 'Saisie Admin',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  },
  user: {
    label: 'Utilisateur réel',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  },
};

const CLAIM_LABELS: Record<string, { label: string; className: string }> = {
  unclaimed: {
    label: 'Non réclamée (Shadow)',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  claimed: {
    label: 'Réclamée par le propriétaire',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  not_applicable: {
    label: 'Organique / Directe',
    className: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  },
};

export default function PublishedOriginsTab({
  userId,
  backfillJob,
  backfillElapsedSec,
  backfillPollWarning,
  isStartingBackfill,
  isCancellingBackfill,
  showBackfillCard,
  refreshNonce = 0,
  onStartBackfill,
  onCancelBackfill,
  onRefreshBackfillStatus,
  onDismissBackfillCard,
  onError,
}: PublishedOriginsTabProps) {
  const [originFilter, setOriginFilter] = useState<'all' | 'facebook_scraper' | 'user' | 'admin_manual'>('all');
  const [claimFilter, setClaimFilter] = useState<'all' | 'unclaimed' | 'claimed'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<AdminOriginPropertyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const isBackfilling = isStartingBackfill || backfillJob?.status === 'running';

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadProperties = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setListError(null);
    try {
      const res = await fbIngestionService.listAdminProperties(userId, {
        origin: originFilter,
        claimStatus: claimFilter,
        q: searchQuery,
        page,
        limit: 20,
      });
      setData(res);
    } catch (err) {
      const msg = (err as Error).message || 'Impossible de charger la liste des origines.';
      setListError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId, originFilter, claimFilter, searchQuery, page, onError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProperties();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadProperties, refreshNonce]);

  const backfillStats: ProgressStatItem[] = backfillJob
    ? [
        { label: 'Analysées', value: backfillJob.current || backfillJob.scanned },
        { label: 'Migrées Shadow FB', value: backfillJob.migratedScraped, tone: 'green' },
        { label: 'Avatars sauvés GCS', value: backfillJob.avatarsPersisted },
        { label: 'Saisie Admin', value: backfillJob.markedAdminManual, tone: 'amber' },
        { label: 'Utilisateurs réels', value: backfillJob.markedOrganic, tone: 'green' },
        {
          label: 'Erreurs',
          value: backfillJob.errorCount || 0,
          tone: (backfillJob.errorCount || 0) > 0 ? 'red' : 'default',
        },
      ]
    : [];

  const counts = data?.counts || {
    all: 0,
    facebook_scraper: 0,
    user: 0,
    admin_manual: 0,
    unclaimed: 0,
    claimed: 0,
  };

  return (
    <div className="space-y-5">
      {/* Summary & Legacy Backfill Bar */}
      <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-green" />
              Audit Origine, Identités FB &amp; Réclamations
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Distingue les vraies annonces utilisateurs des annonces issues du scraper Facebook (visibles comme utilisateurs natifs en public), conserve les IDs / liens Facebook et suit les réclamations par téléphone.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadProperties()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-brand-green transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>

            <button
              type="button"
              onClick={onStartBackfill}
              disabled={isBackfilling}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isBackfilling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <DatabaseZap className="w-3.5 h-3.5 text-brand-green" />
              )}
              <span>
                {isBackfilling
                  ? `Migration en cours${backfillJob?.total ? ` (${backfillJob.percent}%)` : '...'}`
                  : 'Migrer les anciennes annonces FB (Shadow Users)'}
              </span>
            </button>
          </div>
        </div>

        {(isStartingBackfill || (showBackfillCard && backfillJob && backfillJob.status !== 'idle')) && (
          <OperationProgressCard
            title="Migration des annonces (Shadow Users & Avatars GCS)"
            status={
              isStartingBackfill && backfillJob?.status !== 'running'
                ? 'running'
                : backfillJob?.status === 'running'
                ? 'running'
                : backfillJob?.status === 'completed'
                ? 'completed'
                : backfillJob?.status === 'cancelled'
                ? 'cancelled'
                : 'error'
            }
            message={
              isStartingBackfill && (!backfillJob || backfillJob.status !== 'running')
                ? 'Démarrage de la migration en arrière-plan...'
                : backfillJob?.message || 'Migration en cours...'
            }
            detail={
              backfillJob?.status === 'running' && backfillJob.currentItemTitle
                ? `En cours : ${backfillJob.currentItemTitle}`
                : backfillJob?.lastError
                ? `Dernière alerte : ${backfillJob.lastError}`
                : null
            }
            percent={backfillJob?.percent ?? 3}
            countLabel={
              backfillJob && backfillJob.total > 0
                ? `${backfillJob.current} / ${backfillJob.total} annonces`
                : null
            }
            elapsedSec={
              backfillJob?.status === 'running'
                ? backfillElapsedSec
                : backfillJob?.startedAt && backfillJob?.finishedAt
                ? Math.max(
                    1,
                    Math.round(
                      (new Date(backfillJob.finishedAt).getTime() -
                        new Date(backfillJob.startedAt).getTime()) /
                        1000,
                    ),
                  )
                : undefined
            }
            etaSeconds={backfillJob?.etaSeconds ?? null}
            etaFallbackLabel={
              backfillJob?.status === 'running' ? 'Calcul du temps restant...' : null
            }
            stats={backfillStats}
            pollWarning={backfillPollWarning}
            isCancelling={isCancellingBackfill}
            onCancel={onCancelBackfill}
            onRetry={onStartBackfill}
            onRefreshNow={onRefreshBackfillStatus}
            onDismiss={onDismissBackfillCard}
          />
        )}

        {listError && (
          <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
            <span>{listError}</span>
            <button
              type="button"
              onClick={() => void loadProperties()}
              className="px-3 py-1 rounded-full bg-red-700 text-white text-[11px] font-bold hover:opacity-90 cursor-pointer"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Toutes (${counts.all})` },
                { id: 'facebook_scraper', label: `Scrapées FB (${counts.facebook_scraper})` },
                { id: 'user', label: `Utilisateurs réels (${counts.user})` },
                { id: 'admin_manual', label: `Manuel Admin (${counts.admin_manual})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setOriginFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                  originFilter === tab.id
                    ? 'bg-brand-green text-white shadow-2xs'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={claimFilter}
              onChange={(e) => {
                setClaimFilter(e.target.value as 'all' | 'unclaimed' | 'claimed');
                setPage(1);
              }}
              aria-label="Filtrer par statut de réclamation"
              className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
            >
              <option value="all">Toutes réclamations</option>
              <option value="unclaimed">Non réclamées ({counts.unclaimed})</option>
              <option value="claimed">Réclamées ({counts.claimed})</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Titre, nom FB, ID FB, tél..."
                className="pl-8 pr-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs w-56 focus:outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Results List */}
      {loading && !data ? (
        <div className="py-16 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin text-brand-green" />
          Chargement des propriétés...
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-12 text-center text-sm text-zinc-500">
          Aucune annonce trouvée pour ce filtre.
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((item: AdminOriginProperty) => {
            const originBadge = ORIGIN_LABELS[item.origin] || {
              label: item.origin,
              className: 'bg-zinc-100 text-zinc-700',
            };
            const claimBadge = CLAIM_LABELS[item.claimStatus] || CLAIM_LABELS.not_applicable;

            const rawFirstImage = item.images?.[0];
            const firstImage =
              typeof rawFirstImage === 'string'
                ? rawFirstImage
                : rawFirstImage?.src || null;

            const publisherName = item.owner?.username || item.sources?.username || '—';
            const publisherAvatar = item.owner?.avatar || item.sources?.avatar || null;
            const fbUserId = item.sources?.fbUserId || item.owner?.fbUserId || null;
            const fbProfileUrl = item.sources?.link || item.owner?.fbProfileUrl || null;
            const fbPostUrl = item.sources?.postUrl || null;
            const displayAmount = item.type === 'rent' ? item.rent : item.price;

            return (
              <div
                key={item._id}
                className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs"
              >
                {/* Left: Property & Publisher Identity */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-700">
                    {firstImage ? (
                      <img src={firstImage} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-400">
                        <Building2 className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${originBadge.className}`}
                      >
                        {originBadge.label}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${claimBadge.className}`}
                      >
                        {item.claimStatus === 'claimed' ? (
                          <UserCheck className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {claimBadge.label}
                      </span>
                      {item.owner?.isShadowAccount && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          Shadow Profile
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Link
                        href={`/properties/${item._id}`}
                        target="_blank"
                        className="text-sm font-bold text-zinc-900 dark:text-white hover:text-brand-green transition truncate max-w-md"
                      >
                        {item.title}
                      </Link>
                      {displayAmount && (
                        <span className="text-xs font-extrabold text-brand-green">
                          {Number(displayAmount).toLocaleString('fr-FR')} Ar
                          {item.type === 'rent' ? '/mois' : ''}
                        </span>
                      )}
                    </div>

                    {/* Retained FB Publisher & Phone Metadata */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        {publisherAvatar && (
                          <img
                            src={publisherAvatar}
                            alt={publisherName}
                            className="w-5 h-5 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                          />
                        )}
                        {item.owner?._id ? (
                          <Link
                            href={`/profile/${item.owner._id}`}
                            target="_blank"
                            className="font-semibold text-zinc-800 dark:text-zinc-200 hover:text-brand-green underline-offset-2 hover:underline"
                          >
                            {publisherName}
                          </Link>
                        ) : (
                          <strong className="text-zinc-800 dark:text-zinc-200">
                            {publisherName}
                          </strong>
                        )}
                      </span>

                      {(item.phone1 || item.phone2 || item.phone3) && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                          <Phone className="w-3 h-3 text-brand-green" />
                          {[item.phone1, item.phone2, item.phone3].filter(Boolean).join(' / ')}
                        </span>
                      )}

                      {fbUserId && (
                        <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                          FB ID: {fbUserId}
                        </span>
                      )}

                      {item.claimedBy && (
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                          Réclamé par : {item.claimedBy.username}
                          {item.claimedBy.phone ? ` (${item.claimedBy.phone})` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: External FB Profile & Post Links for Audit */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {fbProfileUrl && (
                    <a
                      href={fbProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 text-xs font-semibold hover:opacity-90 transition"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Profil FB
                    </a>
                  )}
                  {fbPostUrl && (
                    <a
                      href={fbPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold hover:border-brand-green transition"
                    >
                      Post FB
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-zinc-500">
                Page {data.page} / {data.totalPages} ({data.total} annonces)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Précédent
                </button>
                <button
                  type="button"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-xs font-semibold disabled:opacity-40 cursor-pointer"
                >
                  Suivant <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
