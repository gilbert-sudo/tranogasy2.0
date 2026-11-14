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

/**
 * Helper to resolve the clean `/profile/[id]` URL for any property owner, curated source, or comment author.
 */
export function resolveProfileHref(
  owner?: { _id?: string; username?: string; role?: string } | string | null,
  sources?: { username?: string | null; avatar?: string | null } | null,
  fallbackName?: string | null
): string {
  if (typeof owner === 'string' && owner.trim()) {
    return `/profile/${encodeURIComponent(owner.trim())}`;
  }

  const ownerObj = typeof owner === 'object' && owner !== null ? owner : null;

  if (ownerObj?._id) {
    return `/profile/${encodeURIComponent(ownerObj._id)}`;
  }

  if (ownerObj?.username && ownerObj.role !== 'admin') {
    return `/profile/${encodeURIComponent(ownerObj.username.trim())}`;
  }

  if (sources?.username) {
    return `/profile/${encodeURIComponent(sources.username.trim().replace(/^@/, ''))}`;
  }

  if (ownerObj?.username) {
    return `/profile/${encodeURIComponent(ownerObj.username.trim())}`;
  }

  if (sources?.username) {
    return `/profile/${encodeURIComponent(sources.username.trim())}`;
  }

  if (fallbackName && fallbackName.trim()) {
    return `/profile/${encodeURIComponent(fallbackName.trim().replace(/^@/, ''))}`;
  }

  return '/profile';
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
};

