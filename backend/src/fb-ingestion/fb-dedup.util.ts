import * as crypto from 'crypto';
import { extractAllMalagasyPhones } from '../common/phone.util';

export interface BrightDataAttachment {
  id?: string;
  type?: string;
  url?: string;
  downloadable_url?: string;
  thumbnail?: string;
  video_url?: string;
  attachment_text?: string;
}

export interface BrightDataPostRecord {
  url?: string;
  input?: {
    url?: string;
    num_of_posts?: number;
  };
  group_name?: string;
  group_id?: string;
  group_url?: string;
  user_name?: string;
  user_username_raw?: string | null;
  group_user_name?: string | null;
  user_url?: string;
  profile_id?: string | null;
  publisher_image_url?: string | null;
  avatar_image_url?: string | null;
  header_image?: string | null;
  date_posted?: string;
  content?: string | null;
  post_id?: string;
  attachments?: BrightDataAttachment[];
  video_view_count?: number;
  original_post?: {
    post_id?: string;
    post_url?: string;
    date_posted?: string;
    user_id?: string | null;
    user_name?: string;
    user_url?: string;
    avatar_image_url?: string | null;
    content?: string | null;
    attachments?: BrightDataAttachment[];
  };
  error?: string;
  error_code?: string;
}

export interface UnwrappedFbPost {
  groupId: string;
  groupName: string;
  groupUrl: string;
  outerPostId: string;
  canonicalPostId: string;
  postUrl: string;
  authorName: string;
  authorFbId: string | null;
  authorUrl: string | null;
  authorAvatar: string | null;
  datePosted: Date;
  content: string;
  photoUrls: string[];
  hasVideo: boolean;
  isVideoOnly: boolean;
  normalizedText: string;
  textHash: string;
  phones: string[];
}

export function extractGroupIdFromUrl(url?: string | null): string {
  if (!url) return '';
  const match = url.match(/groups\/([^/?#]+)/i);
  return match ? match[1] : '';
}

export function normalizeTextForHash(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha256Text(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Extracts normalized Malagasy mobile phone numbers (032/033/034/037/038/039 + 7 digits).
 */
export function extractMalagasyPhones(text: string): string[] {
  return extractAllMalagasyPhones(text);
}

/**
 * Strips volatile Facebook tracking query parameters from profile links while
 * preserving `profile.php?id=...`.
 */
export function normalizeFbProfileUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    const idParam = parsed.searchParams.get('id');
    if (parsed.pathname.toLowerCase().includes('profile.php') && idParam) {
      return `https://www.facebook.com/profile.php?id=${idParam}`;
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (!cleanPath || cleanPath === '/') return null;
    return `https://www.facebook.com${cleanPath}`;
  } catch {
    return trimmed.split('&__')[0] || trimmed;
  }
}

/**
 * Extracts a canonical Facebook user/profile ID from Bright Data raw IDs or URLs.
 * Prefers stable numeric IDs (`1000...` / `615...`) over transient `pfbid` tokens.
 */
export function extractFbUserId(candidates: Array<string | null | undefined>): string | null {
  let pfbidFallback: string | null = null;
  let slugFallback: string | null = null;

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const val = raw.trim();
    if (!val) continue;

    if (/^\d{5,}$/.test(val)) {
      return val;
    }

    const urlNumericMatch =
      val.match(/[?&]id=(\d{5,})/i) ||
      val.match(/facebook\.com\/people\/[^/]+\/(\d{5,})/i) ||
      val.match(/facebook\.com\/(?:groups\/\d+\/)?user\/(\d{5,})/i) ||
      val.match(/facebook\.com\/(\d{5,})(?:\/|$|\?)/i);

    if (urlNumericMatch?.[1]) {
      return urlNumericMatch[1];
    }

    if (!pfbidFallback) {
      if (/^pfbid[0-9a-z]+$/i.test(val)) {
        pfbidFallback = val;
      } else {
        const pfbMatch = val.match(/(pfbid[0-9a-z]+)/i);
        if (pfbMatch?.[1]) {
          pfbidFallback = pfbMatch[1];
        }
      }
    }

    if (!slugFallback && /^https?:\/\/(?:www\.|m\.)?facebook\.com\//i.test(val)) {
      try {
        const parsed = new URL(val);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (
          parts.length === 1 &&
          !['profile.php', 'people', 'groups', 'pages', 'permalink.php'].includes(
            parts[0].toLowerCase(),
          )
        ) {
          slugFallback = parts[0];
        }
      } catch {
        // Ignore invalid URL syntax
      }
    }
  }

  return pfbidFallback || slugFallback || null;
}

function isUsableFbAvatarUrl(raw: BrightDataPostRecord, candidateUrl?: string | null): boolean {
  if (!candidateUrl || !/^https?:\/\//i.test(candidateUrl)) return false;
  // Bright Data sometimes populates avatar_image_url with the group header image or default FB silhouette
  if (raw.header_image && candidateUrl === raw.header_image) return false;
  if (candidateUrl.includes('116687302_959241714549285')) return false;
  return true;
}

/**
 * Computes token-based Jaccard similarity for near-duplicate cross-group posts.
 */
export function computeTextSimilarity(a: string, b: string): number {
  const normA = normalizeTextForHash(a);
  const normB = normalizeTextForHash(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const tokensA = new Set(normA.split(' ').filter((w) => w.length >= 2));
  const tokensB = new Set(normB.split(' ').filter((w) => w.length >= 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Parses Bright Data date fields (ISO string or Unix epoch seconds/ms) safely.
 */
const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 0,
  janv: 0,
  janvier: 0,
  january: 0,
  feb: 1,
  fev: 1,
  fevr: 1,
  fevrier: 1,
  february: 1,
  mar: 2,
  mars: 2,
  march: 2,
  apr: 3,
  avr: 3,
  avril: 3,
  april: 3,
  may: 4,
  mai: 4,
  jun: 5,
  juin: 5,
  june: 5,
  jul: 6,
  juil: 6,
  juillet: 6,
  july: 6,
  aug: 7,
  aou: 7,
  aout: 7,
  august: 7,
  sep: 8,
  sept: 8,
  septembre: 8,
  september: 8,
  oct: 9,
  octobre: 9,
  october: 9,
  nov: 10,
  novembre: 10,
  november: 10,
  dec: 11,
  decembre: 11,
  december: 11,
};

const MADA_OFFSET_MS = 3 * 3600 * 1000;

function makeMadaUtcDate(year: number, monthIdx: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, monthIdx, day, hour, minute, 0, 0) - MADA_OFFSET_MS);
}

function to24Hour(hour: number, meridiem?: string): number | null {
  if (hour < 0 || hour > 23) return null;
  if (!meridiem) return hour;
  const m = meridiem.toLowerCase();
  if (hour === 0 || hour > 12) return null;
  if (m === 'am') return hour === 12 ? 0 : hour;
  if (m === 'pm') return hour === 12 ? 12 : hour + 12;
  return hour;
}

export function parseBrightDataDate(value: unknown, referenceNow: Date = new Date()): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{9,13}$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 1e12 ? num * 1000 : num;
      const parsed = new Date(ms);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const ascii = trimmed
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, "'")
      .toLowerCase();

    if (/^(?:just\s+now|a\s+l'instant)$/.test(ascii)) {
      return new Date(referenceNow.getTime());
    }

    const relMin = ascii.match(/^(?:il\s+y\s+a\s+)?(\d+)\s*(?:m|min|mins|minute|minutes)(?:\s+ago)?$/);
    if (relMin) {
      return new Date(referenceNow.getTime() - Number(relMin[1]) * 60_000);
    }

    const relHour = ascii.match(/^(?:il\s+y\s+a\s+)?(\d+)\s*(?:h|hr|hrs|hour|hours|heure|heures)(?:\s+ago)?$/);
    if (relHour) {
      return new Date(referenceNow.getTime() - Number(relHour[1]) * 3_600_000);
    }

    const relDay = ascii.match(/^(?:il\s+y\s+a\s+)?(\d+)\s*(?:d|day|days|j|jour|jours)(?:\s+ago)?$/);
    if (relDay) {
      return new Date(referenceNow.getTime() - Number(relDay[1]) * 86_400_000);
    }

    // "Yesterday at 10:18 AM" / "Hier à 10:18" / "Today at 10:18 AM" (interpreted in Indian/Antananarivo UTC+3)
    const todayOrYesterday = ascii.match(
      /^(today|aujourd'hui|yesterday|hier)(?:\s+(?:at|a))?\s+(\d{1,2})[:h](\d{2})(?:\s*(am|pm))?$/,
    );
    if (todayOrYesterday) {
      const hour = to24Hour(Number(todayOrYesterday[2]), todayOrYesterday[4]);
      const minute = Number(todayOrYesterday[3]);
      if (hour !== null && minute >= 0 && minute <= 59) {
        const refMada = new Date(referenceNow.getTime() + MADA_OFFSET_MS);
        const isYesterday = todayOrYesterday[1] === 'yesterday' || todayOrYesterday[1] === 'hier';
        if (isYesterday) {
          refMada.setUTCDate(refMada.getUTCDate() - 1);
        }
        return makeMadaUtcDate(
          refMada.getUTCFullYear(),
          refMada.getUTCMonth(),
          refMada.getUTCDate(),
          hour,
          minute,
        );
      }
    }

    // "14 novembre à 10:18" or "Nov 14 at 10:18 AM" or "November 14, 2026 at 10:18 AM"
    const dayFirst = ascii.match(
      /^(\d{1,2})\s+([a-z]+)\.?(?:[,\s]+(\d{4}))?(?:\s+(?:at|a))?\s+(\d{1,2})[:h](\d{2})(?:\s*(am|pm))?$/,
    );
    if (dayFirst && MONTH_INDEX_MAP[dayFirst[2]] !== undefined) {
      const hour = to24Hour(Number(dayFirst[4]), dayFirst[6]);
      const minute = Number(dayFirst[5]);
      if (hour !== null && minute >= 0 && minute <= 59) {
        const refYear = new Date(referenceNow.getTime() + MADA_OFFSET_MS).getUTCFullYear();
        const year = dayFirst[3] ? Number(dayFirst[3]) : refYear;
        const candidate = makeMadaUtcDate(year, MONTH_INDEX_MAP[dayFirst[2]], Number(dayFirst[1]), hour, minute);
        if (!dayFirst[3] && candidate.getTime() - referenceNow.getTime() > 7 * 86_400_000) {
          return makeMadaUtcDate(year - 1, MONTH_INDEX_MAP[dayFirst[2]], Number(dayFirst[1]), hour, minute);
        }
        return candidate;
      }
    }

    const monthFirst = ascii.match(
      /^([a-z]+)\.?\s+(\d{1,2})(?:[,\s]+(\d{4}))?(?:\s+(?:at|a))?\s+(\d{1,2})[:h](\d{2})(?:\s*(am|pm))?$/,
    );
    if (monthFirst && MONTH_INDEX_MAP[monthFirst[1]] !== undefined) {
      const hour = to24Hour(Number(monthFirst[4]), monthFirst[6]);
      const minute = Number(monthFirst[5]);
      if (hour !== null && minute >= 0 && minute <= 59) {
        const refYear = new Date(referenceNow.getTime() + MADA_OFFSET_MS).getUTCFullYear();
        const year = monthFirst[3] ? Number(monthFirst[3]) : refYear;
        const candidate = makeMadaUtcDate(year, MONTH_INDEX_MAP[monthFirst[1]], Number(monthFirst[2]), hour, minute);
        if (!monthFirst[3] && candidate.getTime() - referenceNow.getTime() > 7 * 86_400_000) {
          return makeMadaUtcDate(year - 1, MONTH_INDEX_MAP[monthFirst[1]], Number(monthFirst[2]), hour, minute);
        }
        return candidate;
      }
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Normalizes Bright Data FB group records where shared posts wrap real content inside `original_post`.
 */
export function unwrapBrightDataPost(raw: BrightDataPostRecord): UnwrappedFbPost | null {
  if (!raw || raw.error || !raw.post_id) {
    return null;
  }

  const groupId = raw.group_id || extractGroupIdFromUrl(raw.group_url || raw.input?.url || raw.url);
  if (!groupId) return null;

  const orig = raw.original_post;
  const canonicalPostId = orig?.post_id || raw.post_id;
  const content = (orig?.content ?? raw.content ?? '').trim();

  const attachments: BrightDataAttachment[] = [
    ...(Array.isArray(orig?.attachments) ? orig.attachments : []),
    ...(Array.isArray(raw.attachments) ? raw.attachments : []),
  ];

  const photoUrlsSet = new Set<string>();
  let hasVideo = Boolean(raw.video_view_count && raw.video_view_count > 0);

  for (const att of attachments) {
    const attType = (att.type || '').toLowerCase();
    if (attType === 'video' || att.video_url) {
      hasVideo = true;
    }
    if (attType === 'photo' || (!attType && att.downloadable_url && !att.video_url)) {
      const candidateUrl = att.downloadable_url || att.url || att.thumbnail;
      if (candidateUrl && /^https?:\/\//i.test(candidateUrl)) {
        photoUrlsSet.add(candidateUrl);
      }
    }
  }

  const photoUrls = Array.from(photoUrlsSet);
  const isVideoOnly = photoUrls.length === 0 && (hasVideo || /video/i.test(raw.url || ''));

  const rawAny = raw as Record<string, unknown>;
  const origAny = orig as Record<string, unknown> | undefined;
  const datePosted =
    parseBrightDataDate(orig?.date_posted) ??
    parseBrightDataDate(origAny?.created_time) ??
    parseBrightDataDate(origAny?.timestamp) ??
    parseBrightDataDate(origAny?.post_timestamp) ??
    parseBrightDataDate(origAny?.date) ??
    parseBrightDataDate(raw.date_posted) ??
    parseBrightDataDate(rawAny.created_time) ??
    parseBrightDataDate(rawAny.timestamp) ??
    parseBrightDataDate(rawAny.post_timestamp) ??
    parseBrightDataDate(rawAny.date) ??
    new Date();

  const normalizedText = normalizeTextForHash(content);
  const textHash = sha256Text(normalizedText || canonicalPostId);
  const phones = extractMalagasyPhones(content);

  const rawAuthorName = (
    raw.user_username_raw ||
    raw.user_name ||
    raw.group_user_name ||
    ''
  ).trim();
  const origAuthorName = (orig?.user_name || '').trim();
  const normalizedRawUrl = normalizeFbProfileUrl(raw.user_url);
  const normalizedOrigUrl = normalizeFbProfileUrl(orig?.user_url);

  const sameAuthorAsOrig =
    !orig ||
    !origAuthorName ||
    Boolean(raw.profile_id && orig.user_id && raw.profile_id === orig.user_id) ||
    Boolean(normalizedRawUrl && normalizedOrigUrl && normalizedRawUrl === normalizedOrigUrl) ||
    Boolean(
      rawAuthorName &&
        origAuthorName &&
        rawAuthorName.toLowerCase() === origAuthorName.toLowerCase(),
    );

  const authorName = origAuthorName || rawAuthorName || 'Membre TranoGasy';
  const authorUrl = sameAuthorAsOrig
    ? normalizedOrigUrl || normalizedRawUrl
    : normalizedOrigUrl;

  const authorFbId = sameAuthorAsOrig
    ? extractFbUserId([raw.profile_id, orig?.user_id, orig?.user_url, raw.user_url])
    : extractFbUserId([orig?.user_id, orig?.user_url]);

  let authorAvatar: string | null = null;
  if (sameAuthorAsOrig) {
    if (isUsableFbAvatarUrl(raw, raw.publisher_image_url)) {
      authorAvatar = raw.publisher_image_url!.trim();
    } else if (isUsableFbAvatarUrl(raw, orig?.avatar_image_url)) {
      authorAvatar = orig!.avatar_image_url!.trim();
    } else if (isUsableFbAvatarUrl(raw, raw.avatar_image_url)) {
      authorAvatar = raw.avatar_image_url!.trim();
    }
  } else if (isUsableFbAvatarUrl(raw, orig?.avatar_image_url)) {
    authorAvatar = orig!.avatar_image_url!.trim();
  }

  return {
    groupId,
    groupName: raw.group_name || `Group ${groupId}`,
    groupUrl: raw.group_url || raw.input?.url || `https://www.facebook.com/groups/${groupId}/`,
    outerPostId: raw.post_id,
    canonicalPostId,
    postUrl: raw.url || orig?.post_url || `https://www.facebook.com/groups/${groupId}/posts/${raw.post_id}/`,
    authorName,
    authorFbId,
    authorUrl,
    authorAvatar,
    datePosted,
    content,
    photoUrls,
    hasVideo,
    isVideoOnly,
    normalizedText,
    textHash,
    phones,
  };
}

