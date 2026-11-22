import { Capacitor } from '@capacitor/core';
import { apiFetch } from './api';

export interface PublicProfileUser {
  _id: string;
  username: string;
  avatar?: string | null;
  coverImage?: string | null;
  fallbackCoverImage?: string | null;
  bio?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: 'user' | 'admin' | 'superadmin' | string;
  location?: string | null;
  created_at?: string;
  lastConnectedAt?: string;
}

export interface PublicProfileStats {
  totalListings: number;
  rentCount: number;
  saleCount: number;
  activeCommunes: string[];
}

export interface PublicProfileResponse {
  user: PublicProfileUser;
  stats: PublicProfileStats;
  properties: any[];
}

export interface UpdateUserProfilePayload {
  username?: string;
  bio?: string;
  avatar?: string;
  coverImage?: string | null;
  location?: string;
  email?: string;
}

export interface ResolvedProfileTarget {
  identifier: string;
  sourceName: string | null;
  href: string;
  initialUser: Partial<PublicProfileUser> | null;
}

function buildProfilePath(identifier: string, sourceName?: string | null): string {
  const encoded = encodeURIComponent(identifier);
  const sourceQuery = sourceName ? `source=${encodeURIComponent(sourceName)}` : '';
  try {
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      return `/profile?id=${encoded}${sourceQuery ? `&${sourceQuery}` : ''}`;
    }
  } catch {
    // Web fallback
  }
  return `/profile/${encoded}${sourceQuery ? `?${sourceQuery}` : ''}`;
}

/**
 * Resolves the target identifier, optional sourceName, URL href, and immediate
 * preview metadata (username/avatar) for any property owner, curated source, or comment author.
 */
export function resolveProfileTarget(
  owner?: { _id?: string; username?: string; avatar?: string | null; role?: string } | string | null,
  sources?: { username?: string | null; avatar?: string | null } | null,
  fallbackName?: string | null
): ResolvedProfileTarget {
  if (typeof owner === 'string' && owner.trim()) {
    const clean = owner.trim();
    return {
      identifier: clean,
      sourceName: null,
      href: buildProfilePath(clean),
      initialUser: {
        _id: clean,
        username: fallbackName?.trim() || clean,
      },
    };
  }

  const ownerObj = typeof owner === 'object' && owner !== null ? owner : null;
  const hasCuratedSource =
    ownerObj?.role === 'admin' && Boolean(sources?.username && sources.username.trim());

  const previewUsername = hasCuratedSource
    ? sources?.username?.trim().replace(/^@/, '') || fallbackName?.trim() || 'Annonceur'
    : ownerObj?.username?.trim() ||
      sources?.username?.trim().replace(/^@/, '') ||
      fallbackName?.trim() ||
      'Utilisateur';

  const previewAvatar = hasCuratedSource
    ? sources?.avatar || ownerObj?.avatar || null
    : ownerObj?.avatar || sources?.avatar || null;

  if (ownerObj?._id && !hasCuratedSource) {
    const id = String(ownerObj._id).trim();
    return {
      identifier: id,
      sourceName: null,
      href: buildProfilePath(id),
      initialUser: {
        _id: id,
        username: previewUsername,
        avatar: previewAvatar,
        role: ownerObj.role || 'user',
      },
    };
  }

  if (ownerObj?.username && ownerObj.role !== 'admin') {
    const name = ownerObj.username.trim();
    return {
      identifier: name,
      sourceName: null,
      href: buildProfilePath(name),
      initialUser: {
        _id: name,
        username: name,
        avatar: previewAvatar,
        role: ownerObj.role || 'user',
      },
    };
  }

  if (sources?.username && sources.username.trim()) {
    const sourceClean = sources.username.trim().replace(/^@/, '');
    return {
      identifier: sourceClean,
      sourceName: null,
      href: buildProfilePath(sourceClean),
      initialUser: {
        _id: sourceClean,
        username: sourceClean,
        avatar: previewAvatar,
        role: 'user',
      },
    };
  }

  if (ownerObj?._id) {
    const id = String(ownerObj._id).trim();
    return {
      identifier: id,
      sourceName: null,
      href: buildProfilePath(id),
      initialUser: {
        _id: id,
        username: previewUsername,
        avatar: previewAvatar,
        role: ownerObj.role || 'user',
      },
    };
  }

  if (ownerObj?.username) {
    const name = ownerObj.username.trim();
    return {
      identifier: name,
      sourceName: null,
      href: buildProfilePath(name),
      initialUser: {
        _id: name,
        username: name,
        avatar: previewAvatar,
        role: ownerObj.role || 'user',
      },
    };
  }

  if (fallbackName && fallbackName.trim()) {
    const cleanFallback = fallbackName.trim().replace(/^@/, '');
    return {
      identifier: cleanFallback,
      sourceName: null,
      href: buildProfilePath(cleanFallback),
      initialUser: {
        _id: cleanFallback,
        username: cleanFallback,
        avatar: previewAvatar,
        role: 'user',
      },
    };
  }

  return {
    identifier: '',
    sourceName: null,
    href: '/profile',
    initialUser: null,
  };
}

export function parseProfileHref(href: string): {
  identifier: string;
  sourceName: string | null;
} {
  if (!href) return { identifier: '', sourceName: null };
  try {
    const url = new URL(href, 'http://localhost');
    const idParam = url.searchParams.get('id');
    const sourceParam = url.searchParams.get('source');
    if (idParam) {
      return {
        identifier: decodeURIComponent(idParam),
        sourceName: sourceParam ? decodeURIComponent(sourceParam) : null,
      };
    }
    const match = url.pathname.match(/^\/profile\/([^/]+)/);
    if (match && match[1]) {
      return {
        identifier: decodeURIComponent(match[1]),
        sourceName: sourceParam ? decodeURIComponent(sourceParam) : null,
      };
    }
  } catch {
    // Fallback parsing
  }
  return { identifier: '', sourceName: null };
}

/**
 * Helper to resolve the clean `/profile/[id]` URL (or `/profile?id=...` in locally bundled mobile apps)
 * for any property owner, curated source, or comment author.
 */
export function resolveProfileHref(
  owner?: { _id?: string; username?: string; avatar?: string | null; role?: string } | string | null,
  sources?: { username?: string | null; avatar?: string | null } | null,
  fallbackName?: string | null
): string {
  return resolveProfileTarget(owner, sources, fallbackName).href;
}

export const userService = {
  getPublicProfile: (
    identifier: string,
    sourceName?: string | null
  ): Promise<PublicProfileResponse> => {
    const encodedId = encodeURIComponent(identifier);
    const query = sourceName ? `?source=${encodeURIComponent(sourceName)}` : '';
    return apiFetch<PublicProfileResponse>(`/users/profile/${encodedId}${query}`);
  },

  updateProfile: (
    userId: string,
    payload: UpdateUserProfilePayload
  ): Promise<{ message: string; user: PublicProfileUser }> => {
    return apiFetch<{ message: string; user: PublicProfileUser }>(
      `/users/${encodeURIComponent(userId)}/profile`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  deleteAccount: (
    userId: string
  ): Promise<{
    deleted: boolean;
    message: string;
    deletedPropertiesCount: number;
  }> => {
    return apiFetch<{
      deleted: boolean;
      message: string;
      deletedPropertiesCount: number;
    }>(`/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  },
};

