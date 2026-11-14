'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  FbGroupTarget,
  FbIngestionConfig,
  fbIngestionService,
} from '@/services/fbIngestion.service';
import AsyncToggleSwitch from './AsyncToggleSwitch';

interface Props {
  userId: string;
  groups: FbGroupTarget[];
  config: FbIngestionConfig;
  isAnyRunActive?: boolean;
  syncingGroupIds?: ReadonlySet<string>;
  onUpdateGroup: (
    groupId: string,
    patch: { name?: string; isActive?: boolean; scrapeLimitPer30Min?: number; fbActivityNote?: string },
  ) => Promise<void>;
  onDeleteGroup: (group: FbGroupTarget) => Promise<void>;
  onGroupAdded: (created: FbGroupTarget) => void;
  onStartSingleGroupRun: (group: FbGroupTarget) => Promise<void>;
  onCancelRun?: () => void;
  onError: (msg: string) => void;
}

function GroupLimitInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (nextVal: number) => void;
}) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const displayed = editingValue !== null ? editingValue : String(value);

  const commit = () => {
    if (editingValue === null) return;
    const parsed = Number(editingValue);
    setEditingValue(null);
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.max(1, Math.min(200, Math.round(parsed)));
      if (clamped !== value) {
        onCommit(clamped);
      }
    }
  };

  return (
    <input
      type="number"
      min={1}
      max={200}
      value={displayed}
      onFocus={() => setEditingValue(String(value))}
      onChange={(e) => setEditingValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setEditingValue(null);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="w-16 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 font-bold text-center focus:outline-none focus:ring-2 focus:ring-brand-green"
    />
  );
}

export default function GroupsManagerTab({
  userId,
  groups,
  config,
  isAnyRunActive = false,
  syncingGroupIds,
  onUpdateGroup,
  onDeleteGroup,
  onGroupAdded,
  onStartSingleGroupRun,
  onCancelRun,
  onError,
}: Props) {
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newLimit, setNewLimit] = useState(5);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [launchingGroupId, setLaunchingGroupId] = useState<string | null>(null);

  const activeGroups = groups.filter((g) => g.isActive);
  const totalPostsPerPoll = activeGroups.reduce(
    (sum, g) => sum + Math.round((g.scrapeLimitPer30Min || 10) * (config.pollIntervalMinutes / 30)),
    0,
  );
  const activeHoursSpan = config.onlyActiveHours
    ? Math.max(1, config.activeHourEnd - config.activeHourStart)
    : 24;
  const pollsPerDay = Math.max(1, Math.round((activeHoursSpan * 60) / config.pollIntervalMinutes));
  const estDailyBrightDataRecords = totalPostsPerPoll * pollsPerDay;
  const alertsCount = groups.filter((g) => !g.lastRunCapturedAll || g.missedWindowAlerts > 0).length;

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim() || adding) return;
    setAdding(true);
    try {
      const created = await fbIngestionService.addGroup(userId, {
        url: newUrl.trim(),
        name: newName.trim() || undefined,
        scrapeLimitPer30Min: newLimit,
        isActive: true,
      });
      setNewUrl('');
      setNewName('');
      onGroupAdded(created);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleRunSingleGroup = async (g: FbGroupTarget) => {
    if (isAnyRunActive || launchingGroupId === g.groupId) return;
    setLaunchingGroupId(g.groupId);
    try {
      await onStartSingleGroupRun(g);
    } finally {
      setLaunchingGroupId(null);
    }
  };

  const runPercent = config.lastRunProgress?.percent ?? 5;

  return (
    <div className="space-y-6">
      {isAnyRunActive && (
        <div className="rounded-2xl p-4 bg-emerald-50/85 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Loader2 className="w-4 h-4 animate-spin text-brand-green shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-emerald-950 dark:text-emerald-100 truncate">
                  {config.lastPollMessage || 'Collecte Facebook en cours...'}
                </span>
                <span className="font-mono font-bold text-brand-green shrink-0">
                  {runPercent}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-emerald-200/70 dark:bg-emerald-900/60 overflow-hidden mt-1.5">
                <div
                  className="h-full bg-brand-green transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, Math.round(runPercent)))}%` }}
                />
              </div>
            </div>
          </div>
          {onCancelRun && (
            <button
              type="button"
              onClick={onCancelRun}
              className="px-3 py-1 rounded-full bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 font-bold hover:bg-red-50 shrink-0 cursor-pointer"
            >
              Annuler
            </button>
          )}
        </div>
      )}

      {/* KPI Budget & Coverage Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-900 rounded-[1.5rem] p-5 border border-zinc-200/80 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500">Groupes actifs</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1 tabular-nums">
            {activeGroups.length}{' '}
            <span className="text-sm font-normal text-zinc-400">/ {groups.length}</span>
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-[1.5rem] p-5 border border-zinc-200/80 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500">
            Posts demandés / cycle ({config.pollIntervalMinutes} min)
          </p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-white mt-1 tabular-nums">
            {totalPostsPerPoll}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-[1.5rem] p-5 border border-zinc-200/80 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500">
            Consommation Bright Data estimée / jour
          </p>
          <p className="text-2xl font-bold text-brand-green mt-1 tabular-nums">
            ~{estDailyBrightDataRecords.toLocaleString('fr-FR')} records
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {pollsPerDay} cycles/jour ({activeHoursSpan}h actives)
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-[1.5rem] p-5 border border-zinc-200/80 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500">Alertes fenêtre saturée</p>
          <p
            className={`text-2xl font-bold mt-1 tabular-nums ${
              alertsCount > 0 ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {alertsCount}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Groupes dépassant leur limite / 30 min
          </p>
        </div>
      </div>

      {/* Add New Target Group */}
      <form
        onSubmit={handleAddGroup}
        className="bg-white dark:bg-zinc-900 rounded-[2rem] p-5 border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs font-semibold text-zinc-500 mb-1">
            URL ou ID du groupe Facebook public *
          </label>
          <input
            type="text"
            required
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://www.facebook.com/groups/123456789/"
            className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs focus:outline-none focus:ring-2 focus:ring-brand-green"
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-semibold text-zinc-500 mb-1">Nom du groupe</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="TRANO AHOFA ..."
            className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs focus:outline-none focus:ring-2 focus:ring-brand-green"
          />
        </div>

        <div className="w-32">
          <label className="block text-xs font-semibold text-zinc-500 mb-1">
            Limite / 30 min
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={newLimit}
            onChange={(e) => setNewLimit(Number(e.target.value) || 5)}
            className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-semibold"
          />
        </div>

        <button
          type="submit"
          disabled={adding}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold bg-brand-green text-white hover:opacity-95 transition disabled:opacity-50 cursor-pointer"
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-4 h-4" />}
          Ajouter groupe
        </button>
      </form>

      {/* Targets Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold border-b border-zinc-200/80 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3.5">Actif</th>
                <th className="px-4 py-3.5">Groupe cible</th>
                <th className="px-4 py-3.5">Fréquence réelle mesurée</th>
                <th className="px-4 py-3.5">Limite / 30 min</th>
                <th className="px-4 py-3.5">Couverture</th>
                <th className="px-4 py-3.5">Rendement (Acceptés / Publiés / Rejets)</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
              {groups.map((g) => {
                const isSyncing = syncingGroupIds?.has(g.groupId) ?? false;
                const isConfirmingDelete = confirmDeleteId === g.groupId;
                const isLaunchingThis = launchingGroupId === g.groupId;
                return (
                  <tr
                    key={g.groupId}
                    className={`transition-opacity duration-150 ${
                      !g.isActive ? 'opacity-60 bg-zinc-50/40 dark:bg-zinc-950/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <AsyncToggleSwitch
                        checked={g.isActive}
                        syncing={isSyncing}
                        label={`Activer ou mettre en pause le groupe ${g.name}`}
                        onToggle={() =>
                          void onUpdateGroup(g.groupId, { isActive: !g.isActive })
                        }
                      />
                    </td>

                    <td className="px-4 py-3.5 max-w-[260px]">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {g.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span>{g.fbActivityNote || `ID: ${g.groupId}`}</span>
                        <a
                          href={g.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-green hover:underline inline-flex items-center"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-bold text-zinc-800 dark:text-zinc-200">
                        {g.measuredPostsPer30Min.toFixed(1)} posts / 30 min
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        ~{g.measuredPostsPerDay} / jour (pic {g.peakPostsPer30Min}/30m)
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <GroupLimitInput
                          value={g.scrapeLimitPer30Min}
                          onCommit={(nextVal) =>
                            void onUpdateGroup(g.groupId, { scrapeLimitPer30Min: nextVal })
                          }
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {!g.lastRunCapturedAll ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 font-semibold">
                            <AlertCircle className="w-3 h-3" /> Saturé ({g.missedWindowAlerts})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void onUpdateGroup(g.groupId, {
                                scrapeLimitPer30Min: Math.min(200, g.scrapeLimitPer30Min + 3),
                              })
                            }
                            className="block text-[11px] font-bold text-brand-green hover:underline cursor-pointer"
                          >
                            +3 posts limite
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Complet
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                          {g.uniqueAccepted} uniques
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold">
                          {g.approvedCount} publiés
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {g.duplicateSkipped} doublons • {g.landSkipped} terrains •{' '}
                          {g.videoOnlySkipped} vidéos • {g.spamSkipped} spam
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-full px-2 py-1">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                void onDeleteGroup(g);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 cursor-pointer"
                            >
                              <Check className="w-3 h-3" /> Supprimer
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Annuler suppression"
                              className="p-0.5 rounded-full text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              title="Scraper uniquement ce groupe maintenant"
                              disabled={isAnyRunActive || isLaunchingThis}
                              onClick={() => void handleRunSingleGroup(g)}
                              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-700 hover:border-brand-green text-zinc-700 dark:text-zinc-200 transition disabled:opacity-40 cursor-pointer"
                            >
                              {isLaunchingThis ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Play className="w-3.5 h-3.5 text-brand-green" />
                              )}
                            </button>
                            <button
                              type="button"
                              title="Supprimer ce groupe"
                              onClick={() => setConfirmDeleteId(g.groupId)}
                              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-700 hover:border-red-500 text-red-500 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
