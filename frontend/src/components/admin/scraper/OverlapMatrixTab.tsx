'use client';

import React, { useState } from 'react';
import { GitCompare, Loader2, PauseCircle } from 'lucide-react';
import { FbOverlapMatrixRow, fbIngestionService } from '@/services/fbIngestion.service';

interface Props {
  userId: string;
  matrix: FbOverlapMatrixRow[];
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
}

export default function OverlapMatrixTab({ userId, matrix, onRefresh, onError }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = [...matrix].sort((a, b) => b.redundancyRate - a.redundancyRate || b.uniqueAccepted - a.uniqueAccepted);

  const handlePauseGroup = async (groupId: string) => {
    setBusyId(groupId);
    try {
      await fbIngestionService.updateGroup(userId, groupId, { isActive: false });
      await onRefresh();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-5 border border-zinc-200/80 dark:border-zinc-800 flex items-start gap-3">
        <GitCompare className="w-5 h-5 text-brand-green shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
          <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            Analyse de similarité & d&apos;efficacité inter-groupes
          </p>
          Compare les publications uniques capturées par chaque groupe face aux doublons partagés avec les autres groupes. Plus un groupe a un taux de redondance élevé et peu de publications exclusives, plus vous économisez de crédits Bright Data et de tokens Gemini en le mettant en pause.
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 font-semibold border-b border-zinc-200/80 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3.5">Groupe</th>
                <th className="px-4 py-3.5">Uniques conservés</th>
                <th className="px-4 py-3.5">Doublons filtrés</th>
                <th className="px-4 py-3.5">Taux de redondance</th>
                <th className="px-4 py-3.5">Groupes les plus similaires (posts partagés)</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
              {sorted.map((row) => (
                <tr key={row.groupId} className={!row.isActive ? 'opacity-60' : ''}>
                  <td className="px-4 py-3.5 font-semibold text-zinc-900 dark:text-zinc-100 max-w-[240px]">
                    <div className="truncate">{row.name}</div>
                    <span className="text-[11px] font-normal text-zinc-400">
                      {row.isActive ? 'Actif' : 'En pause'} • {row.totalFetched} récupérés
                    </span>
                  </td>

                  <td className="px-4 py-3.5 font-bold text-emerald-600">
                    {row.uniqueAccepted} ({row.approvedCount} publiés)
                  </td>

                  <td className="px-4 py-3.5 text-zinc-700 dark:text-zinc-300">
                    {row.duplicateSkipped}
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            row.redundancyRate >= 60
                              ? 'bg-red-500'
                              : row.redundancyRate >= 35
                              ? 'bg-amber-500'
                              : 'bg-brand-green'
                          }`}
                          style={{ width: `${Math.min(100, row.redundancyRate)}%` }}
                        />
                      </div>
                      <span className="font-bold">{row.redundancyRate}%</span>
                    </div>
                  </td>

                  <td className="px-4 py-3.5">
                    {row.topOverlaps.length === 0 ? (
                      <span className="text-zinc-400">Aucun chevauchement inter-groupes détecté</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {row.topOverlaps.map((o) => (
                          <span
                            key={o.otherGroupId}
                            className="px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-[11px]"
                          >
                            {o.otherGroupName}: <strong>{o.sharedPostsCount}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    {row.isActive ? (
                      <button
                        type="button"
                        disabled={busyId === row.groupId}
                        onClick={() => handlePauseGroup(row.groupId)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 hover:border-amber-500 text-zinc-700 dark:text-zinc-200 font-semibold transition"
                      >
                        {busyId === row.groupId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        Mettre en pause
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-400 font-semibold">Déjà en pause</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

