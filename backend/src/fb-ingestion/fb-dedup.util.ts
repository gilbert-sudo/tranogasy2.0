import * as crypto from 'crypto';

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
  user_url?: string;
  date_posted?: string;
  content?: string | null;
  post_id?: string;
  attachments?: BrightDataAttachment[];
  video_view_count?: number;
  original_post?: {
    post_id?: string;
    post_url?: string;
    date_posted?: string;
    user_name?: string;
    user_url?: string;
    content?: string | null;
    attachments?: BrightDataAttachment[];
  };
  avatar_image_url?: string;
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
  if (!text) return [];
  const cleaned = text.replace(/\+261\s*/g, '0');
  const matches = cleaned.match(/0?3[2-9][\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{2}/g) || [];
  const unique = new Set<string>();

  for (const raw of matches) {
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 9 && digits.startsWith('3')) {
      digits = `0${digits}`;
    }
    if (/^03[2-9]\d{7}$/.test(digits)) {
      unique.add(digits);
    }
  }

  return Array.from(unique);
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

  const parsedDate = new Date(raw.date_posted || Date.now());
  const datePosted = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const normalizedText = normalizeTextForHash(content);
  const textHash = sha256Text(normalizedText || canonicalPostId);
  const phones = extractMalagasyPhones(content);

  return {
    groupId,
    groupName: raw.group_name || `Group ${groupId}`,
    groupUrl: raw.group_url || raw.input?.url || `https://www.facebook.com/groups/${groupId}/`,
    outerPostId: raw.post_id,
    canonicalPostId,
    postUrl: raw.url || orig?.post_url || `https://www.facebook.com/groups/${groupId}/posts/${raw.post_id}/`,
    authorName: orig?.user_name || raw.user_name || 'Facebook User',
    authorUrl: orig?.user_url || raw.user_url || null,
    authorAvatar: raw.avatar_image_url || null,
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

