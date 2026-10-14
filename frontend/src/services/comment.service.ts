import { apiFetch } from './api';

export interface CommentItem {
  _id: string;
  property: string;
  user?: string;
  content: string;
  authorName: string;
  authorAvatar?: string | null;
  likes: number;
  likedBy?: string[];
  isEdited?: boolean;
  created_at: string;
}

const LOCAL_STORAGE_KEY_PREFIX = 'tranogasy_comments_';

function getLocalComments(propertyId: string): CommentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${propertyId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalComment(propertyId: string, comment: CommentItem) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalComments(propertyId);
    const updated = [comment, ...existing.filter((c) => c._id !== comment._id)];
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${propertyId}`, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save local comment:', e);
  }
}

function updateLocalComment(propertyId: string, commentId: string, newContent: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalComments(propertyId);
    const updated = existing.map((c) =>
      c._id === commentId ? { ...c, content: newContent, isEdited: true } : c
    );
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${propertyId}`, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to update local comment:', e);
  }
}

function deleteLocalComment(propertyId: string, commentId: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalComments(propertyId);
    const updated = existing.filter((c) => c._id !== commentId);
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${propertyId}`, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to delete local comment:', e);
  }
}

export const commentService = {
  async getComments(propertyId: string): Promise<{ comments: CommentItem[]; count: number }> {
    const local = getLocalComments(propertyId);
    try {
      const data = await apiFetch<{ comments: CommentItem[]; count: number }>(
        `/comments/property/${propertyId}`
      );
      // Merge remote comments with any locally added ones
      const remoteIds = new Set((data.comments || []).map((c) => c._id));
      const mergedLocal = local.filter((c) => !remoteIds.has(c._id));
      const allComments = [...mergedLocal, ...(data.comments || [])];
      return { comments: allComments, count: allComments.length };
    } catch (e) {
      return { comments: local, count: local.length };
    }
  },

  async addComment(
    propertyId: string,
    content: string,
    user: { _id?: string; username?: string; avatar?: string }
  ): Promise<CommentItem> {
    const authorName = user?.username || 'Utilisateur';
    const authorAvatar = user?.avatar || null;

    try {
      const res = await apiFetch<{ comment: CommentItem; success: boolean }>('/comments', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          content,
          userId: user?._id,
          authorName,
          authorAvatar,
        }),
      });

      if (res?.comment) {
        saveLocalComment(propertyId, res.comment);
        return res.comment;
      }
    } catch (e) {
      console.warn('API addComment failed, using local fallback:', e);
    }

    // Local fallback
    const fallbackComment: CommentItem = {
      _id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      property: propertyId,
      user: user?._id,
      content,
      authorName,
      authorAvatar,
      likes: 0,
      likedBy: [],
      isEdited: false,
      created_at: new Date().toISOString(),
    };
    saveLocalComment(propertyId, fallbackComment);
    return fallbackComment;
  },

  async updateComment(
    commentId: string,
    propertyId: string,
    content: string,
    userId?: string
  ): Promise<{ comment?: CommentItem; success: boolean }> {
    updateLocalComment(propertyId, commentId, content);

    try {
      const res = await apiFetch<{ comment: CommentItem; success: boolean }>(
        `/comments/${commentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ content, userId }),
        }
      );
      return res;
    } catch (e) {
      console.warn('API updateComment failed, using local update:', e);
      return { success: true };
    }
  },

  async deleteComment(
    commentId: string,
    propertyId: string,
    userId?: string
  ): Promise<boolean> {
    deleteLocalComment(propertyId, commentId);

    try {
      await apiFetch<{ success: boolean }>(`/comments/${commentId}`, {
        method: 'DELETE',
        params: userId ? { userId } : undefined,
      });
      return true;
    } catch (e) {
      console.warn('API deleteComment failed, using local delete:', e);
      return true;
    }
  },

  async toggleLike(
    commentId: string,
    propertyId: string,
    userId?: string
  ): Promise<{ liked: boolean; likes: number }> {
    const identifier = userId || (typeof window !== 'undefined' ? localStorage.getItem('guest_id') || 'guest' : 'guest');
    
    try {
      const res = await apiFetch<{ liked: boolean; likes: number }>(`/comments/${commentId}/like`, {
        method: 'POST',
        body: JSON.stringify({ userId: identifier }),
      });
      return res;
    } catch (e) {
      // Local fallback toggle
      const local = getLocalComments(propertyId);
      const target = local.find((c) => c._id === commentId);
      if (target) {
        const hasLiked = (target.likedBy || []).includes(identifier);
        if (hasLiked) {
          target.likedBy = (target.likedBy || []).filter((id) => id !== identifier);
          target.likes = Math.max(0, target.likes - 1);
        } else {
          target.likedBy = [...(target.likedBy || []), identifier];
          target.likes += 1;
        }
        localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${propertyId}`, JSON.stringify(local));
        return { liked: !hasLiked, likes: target.likes };
      }
      return { liked: true, likes: 1 };
    }
  },
};
