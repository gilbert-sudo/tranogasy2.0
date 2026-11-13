import { apiFetch } from './api';

export interface FbIngestionConfig {
  key: string;
  isLive: boolean;
  pollIntervalMinutes: number;
  onlyActiveHours: boolean;
  activeHourStart: number;
  activeHourEnd: number;
  geminiModel: string;
  lastPollStatus: string;
  lastPollPhase: string | null;
  lastPollMessage: string | null;
  lastRunProgress: { current: number; total: number } | null;
  lastRunSummary: RunSummary | null;
  lastPollStartedAt: string | null;
  lastPollFinishedAt: string | null;
  lastSnapshotId: string | null;
  lastError: string | null;
  totalRuns: number;
  totalBrightDataRecords: number;
  totalGeminiCalls: number;
}

export interface AsyncRunStartResponse {
  started: boolean;
  status: string;
  phase: string;
  snapshotId?: string;
  groupsCount?: number;
}

export interface FbGroupTarget {
  _id: string;
  groupId: string;
  name: string;
  url: string;
  fbActivityNote: string;
  isActive: boolean;
  scrapeLimitPer30Min: number;
  recentPostIds: string[];
  measuredPostsPerDay: number;
  measuredPostsPer30Min: number;
  peakPostsPer30Min: number;
  lastRunAt: string | null;
  lastRunFetchedCount: number;
  lastRunNewCount: number;
  lastRunCapturedAll: boolean;
  missedWindowAlerts: number;
  totalFetched: number;
  uniqueAccepted: number;
  approvedCount: number;
  rejectedCount: number;
  duplicateSkipped: number;
  landSkipped: number;
  videoOnlySkipped: number;
  spamSkipped: number;
  overlapByGroup: Record<string, number>;
}

export interface FbOverlapMatrixRow {
  groupId: string;
  name: string;
  isActive: boolean;
  totalFetched: number;
  uniqueAccepted: number;
  approvedCount: number;
  duplicateSkipped: number;
  landSkipped: number;
  videoOnlySkipped: number;
  spamSkipped: number;
  sharedTotal: number;
  redundancyRate: number;
  topOverlaps: Array<{
    otherGroupId: string;
    otherGroupName: string;
    sharedPostsCount: number;
  }>;
}

export interface FbIngestedCandidate {
  _id: string;
  status: 'pending' | 'approved' | 'rejected';
  groupId: string;
  groupName: string;
  canonicalPostId: string;
  postUrl: string;
  authorName: string;
  authorAvatarUrl: string | null;
  datePosted: string;
  rawContent: string;
  gcsImages: string[];
  extracted: {
    title: string;
    description: string;
    type: 'rent' | 'sale' | null;
    houseType: 'maison' | 'appartement' | null;
    price: number | null;
    rent: number | null;
    rooms: number | null;
    livingRoom: number | null;
    kitchen: number | null;
    toilet: number | null;
    bathrooms: number | null;
    area: number | null;
    floor: string | null;
    phone1: string | null;
    phone2: string | null;
    phone3: string | null;
    features: Record<string, boolean>;
    locationHints: string[];
  };
  matchedCityId: string | null;
  matchedCityLabel: string | null;
  cityCandidates: Array<{ _id: string; label: string; score: number }>;
  missingFields: string[];
  aiConfidence: 'high' | 'medium' | 'low';
  aiNotes: string | null;
  publishedPropertyId: string | null;
  reviewedAt: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RunSummary {
  snapshotId: string;
  totalRawRecords: number;
  unwrappedCount: number;
  videoOnlySkipped: number;
  duplicateSkipped: number;
  crossGroupOverlaps: number;
  landSkipped: number;
  spamSkipped: number;
  candidatesCreated: number;
  geminiCalls: number;
  errors: string[];
}

export interface BrightDataSnapshotMeta {
  id: string;
  dataset_id: string;
  status: string;
  dataset_size?: number;
  created?: string;
}

export interface CandidateListResponse {
  items: FbIngestedCandidate[];
  total: number;
  page: number;
  limit: number;
  counts: {
    pending: number;
    approved: number;
    rejected: number;
  };
}

function withAdminHeaders(userId: string, options: RequestInit = {}): RequestInit {
  return {
    ...options,
    headers: {
      'x-user-id': userId,
      ...(options.headers || {}),
    },
  };
}

export const fbIngestionService = {
  adminLogin: (identifier: string, password: string) =>
    apiFetch<{ message: string; user: Record<string, unknown> }>('/fb-ingestion/admin-login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),

  getConfig: (userId: string) =>
    apiFetch<FbIngestionConfig>('/fb-ingestion/config', withAdminHeaders(userId)),

  updateConfig: (
    userId: string,
    patch: Partial<{
      isLive: boolean;
      pollIntervalMinutes: number;
      onlyActiveHours: boolean;
      activeHourStart: number;
      activeHourEnd: number;
      geminiModel: string;
      lastError: string | null;
    }>,
  ) =>
    apiFetch<FbIngestionConfig>(
      '/fb-ingestion/config',
      withAdminHeaders(userId, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    ),

  listGroups: (userId: string) =>
    apiFetch<FbGroupTarget[]>('/fb-ingestion/groups', withAdminHeaders(userId)),

  addGroup: (
    userId: string,
    payload: { url: string; name?: string; scrapeLimitPer30Min?: number; isActive?: boolean },
  ) =>
    apiFetch<FbGroupTarget>(
      '/fb-ingestion/groups',
      withAdminHeaders(userId, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    ),

  updateGroup: (
    userId: string,
    groupId: string,
    patch: { name?: string; isActive?: boolean; scrapeLimitPer30Min?: number; fbActivityNote?: string },
  ) =>
    apiFetch<FbGroupTarget>(
      `/fb-ingestion/groups/${encodeURIComponent(groupId)}`,
      withAdminHeaders(userId, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    ),

  deleteGroup: (userId: string, groupId: string) =>
    apiFetch<{ deleted: boolean; groupId: string }>(
      `/fb-ingestion/groups/${encodeURIComponent(groupId)}`,
      withAdminHeaders(userId, { method: 'DELETE' }),
    ),

  getOverlapMatrix: (userId: string) =>
    apiFetch<{ generatedAt: string; groups: FbOverlapMatrixRow[] }>(
      '/fb-ingestion/overlap-matrix',
      withAdminHeaders(userId),
    ),

  listRemoteSnapshots: (userId: string) =>
    apiFetch<BrightDataSnapshotMeta[]>('/fb-ingestion/snapshots', withAdminHeaders(userId)),

  runNow: (userId: string, groupIds?: string[]) =>
    apiFetch<RunSummary>(
      '/fb-ingestion/run',
      withAdminHeaders(userId, {
        method: 'POST',
        body: JSON.stringify(groupIds ? { groupIds } : {}),
      }),
    ),

  startRunNow: (userId: string, groupIds?: string[]) =>
    apiFetch<AsyncRunStartResponse>(
      '/fb-ingestion/run',
      withAdminHeaders(userId, {
        method: 'POST',
        body: JSON.stringify({ ...(groupIds ? { groupIds } : {}), async: true }),
      }),
    ),

  importSnapshot: (userId: string, snapshotId: string) =>
    apiFetch<RunSummary>(
      '/fb-ingestion/import-snapshot',
      withAdminHeaders(userId, {
        method: 'POST',
        body: JSON.stringify({ snapshotId }),
      }),
    ),

  startImportSnapshot: (userId: string, snapshotId: string) =>
    apiFetch<AsyncRunStartResponse>(
      '/fb-ingestion/import-snapshot',
      withAdminHeaders(userId, {
        method: 'POST',
        body: JSON.stringify({ snapshotId, async: true }),
      }),
    ),

  listCandidates: (
    userId: string,
    params: { status?: string; groupId?: string; type?: string; page?: number; limit?: number } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.groupId) query.set('groupId', params.groupId);
    if (params.type) query.set('type', params.type);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    return apiFetch<CandidateListResponse>(
      `/fb-ingestion/candidates?${query.toString()}`,
      withAdminHeaders(userId),
    );
  },

  updateCandidate: (userId: string, id: string, patch: Record<string, unknown>) =>
    apiFetch<FbIngestedCandidate>(
      `/fb-ingestion/candidates/${encodeURIComponent(id)}`,
      withAdminHeaders(userId, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    ),

  approveCandidate: (userId: string, id: string, edits?: Record<string, unknown>) =>
    apiFetch<{ candidate: FbIngestedCandidate; property: Record<string, unknown> }>(
      `/fb-ingestion/candidates/${encodeURIComponent(id)}/approve`,
      withAdminHeaders(userId, {
        method: 'POST',
        body: JSON.stringify(edits ? { edits } : {}),
      }),
    ),

  rejectCandidate: (userId: string, id: string) =>
    apiFetch<{ rejected: boolean; id: string; deletedGcsImages: number }>(
      `/fb-ingestion/candidates/${encodeURIComponent(id)}`,
      withAdminHeaders(userId, { method: 'DELETE' }),
    ),
};
