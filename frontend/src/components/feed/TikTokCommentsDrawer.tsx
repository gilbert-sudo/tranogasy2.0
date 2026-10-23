'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Heart,
  MessageCircle,
  Sparkles,
  User as UserIcon,
  LogIn,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import { FeedProperty } from './types';
import { commentService, CommentItem } from '@/services/comment.service';
import { useUserStore } from '@/store/userStore';
import { useModalStore } from '@/store/modalStore';

interface TikTokCommentsDrawerProps {
  property: FeedProperty | null;
  isOpen: boolean;
  onClose: () => void;
  isDesktop?: boolean;
}

const QUICK_QUESTIONS = [
  'Bonjour, ce bien est-il toujours disponible ?',
  'Le prix est-il négociable ?',
  'Quelles sont les conditions de visite ?',
  'Est-ce facilement accessible en voiture ?',
  'Y a-t-il une caution ou avance demandée ?',
];

function formatCommentDate(dateString?: string) {
  if (!dateString) return "À l'instant";
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "À l'instant";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `Il y a ${diffInMinutes} min`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `Il y a ${diffInHours} h`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `Il y a ${diffInDays} j`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `Il y a ${diffInMonths} mois`;
  const diffInYears = Math.floor(diffInMonths / 12);
  return `Il y a ${diffInYears} an${diffInYears > 1 ? 's' : ''}`;
}

export default function TikTokCommentsDrawer({
  property,
  isOpen,
  onClose,
  isDesktop = false,
}: TikTokCommentsDrawerProps) {
  const { user } = useUserStore();
  const currentUser = user?.user || user;
  const isLoggedIn = !!currentUser;
  const openModal = useModalStore((state) => state.openModal);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentCount, setCommentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});

  // Edit / Delete states
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const commentsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch comments when open or property changes
  useEffect(() => {
    if (!isOpen || !property?._id) return;

    let isMounted = true;
    const fetchComments = async () => {
      setLoading(true);
      try {
        const data = await commentService.getComments(property._id);
        if (isMounted) {
          setComments(data.comments || []);
          setCommentCount(data.count || 0);

          // Restore liked state for current user
          const currentId = currentUser?._id || 'guest';
          const likes: Record<string, boolean> = {};
          (data.comments || []).forEach((c) => {
            if (c.likedBy && c.likedBy.includes(currentId)) {
              likes[c._id] = true;
            }
          });
          setLikedMap(likes);
        }
      } catch (err) {
        console.error('Error fetching comments:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchComments();
    return () => {
      isMounted = false;
    };
  }, [isOpen, property?._id, currentUser?._id]);

  // Focus input on open if logged in
  useEffect(() => {
    if (isOpen && isLoggedIn) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isLoggedIn]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isLoggedIn) {
      openModal('login');
      return;
    }

    if (!property?._id || !inputText.trim() || submitting) return;

    const text = inputText.trim();
    setSubmitting(true);
    try {
      const newComment = await commentService.addComment(property._id, text, currentUser);
      setComments((prev) => [newComment, ...prev]);
      setCommentCount((prev) => prev + 1);
      setInputText('');
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickQuestionClick = (q: string) => {
    if (!isLoggedIn) {
      openModal('login');
      return;
    }
    setInputText(q);
    inputRef.current?.focus();
  };

  const handleToggleLike = async (commentId: string) => {
    if (!property?._id) return;
    const currentLiked = !!likedMap[commentId];

    // Optimistic UI
    setLikedMap((prev) => ({ ...prev, [commentId]: !currentLiked }));
    setComments((prev) =>
      prev.map((c) => {
        if (c._id === commentId) {
          return {
            ...c,
            likes: Math.max(0, c.likes + (currentLiked ? -1 : 1)),
          };
        }
        return c;
      })
    );

    try {
      await commentService.toggleLike(commentId, property._id, currentUser?._id);
    } catch (e) {
      console.error('Like toggle failed:', e);
    }
  };

  // Start editing
  const handleStartEdit = (comment: CommentItem) => {
    setEditingCommentId(comment._id);
    setEditContent(comment.content);
    setDeletingCommentId(null);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  // Save edit
  const handleSaveEdit = async (commentId: string) => {
    if (!property?._id || !editContent.trim() || isSavingEdit) return;

    const trimmed = editContent.trim();
    setIsSavingEdit(true);

    // Optimistic update
    setComments((prev) =>
      prev.map((c) => (c._id === commentId ? { ...c, content: trimmed, isEdited: true } : c))
    );
    setEditingCommentId(null);

    try {
      await commentService.updateComment(commentId, property._id, trimmed, currentUser?._id);
    } catch (err) {
      console.error('Failed to update comment:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!property?._id) return;

    // Optimistic remove
    setComments((prev) => prev.filter((c) => c._id !== commentId));
    setCommentCount((prev) => Math.max(0, prev - 1));
    setDeletingCommentId(null);

    try {
      await commentService.deleteComment(commentId, property._id, currentUser?._id);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  if (!isOpen && !isDesktop) return null;

  const content = (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white select-none">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-brand-green" />
          <h3 className="font-bold text-base text-zinc-900 dark:text-white">Commentaires</h3>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            {commentCount}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
          title="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Real Estate Questions Chips */}
      <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800/60 overflow-x-auto no-scrollbar shrink-0 flex items-center gap-2 bg-zinc-50/60 dark:bg-zinc-900/50">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          Suggérer :
        </span>
        {QUICK_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleQuickQuestionClick(q)}
            className="shrink-0 px-3 py-1 rounded-full text-xs bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-white/5 hover:border-brand-green/40 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white shadow-xs transition-all cursor-pointer whitespace-nowrap"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 no-scrollbar">
        {loading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="w-24 h-3 rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="w-full h-3 rounded bg-zinc-100 dark:bg-zinc-800/60" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 text-zinc-500 dark:text-zinc-400">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-white/5 flex items-center justify-center mb-3 text-brand-green">
              <MessageCircle className="w-7 h-7" />
            </div>
            <p className="font-semibold text-zinc-900 dark:text-white text-sm">
              Aucun commentaire pour l&apos;instant
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[260px]">
              Soyez le premier à poser une question ou partager votre avis sur cette annonce !
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const isLiked = !!likedMap[comment._id];
            const isOwner =
              isLoggedIn &&
              (comment.user === currentUser?._id ||
                (comment as any).userId === currentUser?._id ||
                comment.authorName === currentUser?.username);

            const isEditing = editingCommentId === comment._id;
            const isDeleting = deletingCommentId === comment._id;

            const avatarUrl =
              comment.authorAvatar ||
              `https://ui-avatars.com/api/?name=${encodeURIComponent(
                comment.authorName || 'Utilisateur'
              )}&background=7cbd1e&color=fff&bold=true`;

            return (
              <div
                key={comment._id}
                className="flex gap-3 items-start group p-2 rounded-2xl transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                {/* User Avatar */}
                <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 shadow-xs">
                  <img
                    src={avatarUrl}
                    alt={comment.authorName}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Comment Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        @{comment.authorName}
                      </span>
                      {isOwner && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-brand-green/15 text-brand-green border border-brand-green/30">
                          Vous
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                        • {formatCommentDate(comment.created_at)}
                      </span>
                      {comment.isEdited && (
                        <span className="text-[9px] text-zinc-400 dark:text-zinc-500 italic shrink-0">
                          (modifié)
                        </span>
                      )}
                    </div>

                    {/* Owner Action Buttons (Edit & Delete) */}
                    {isOwner && !isEditing && !isDeleting && (
                      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(comment)}
                          className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
                          title="Modifier mon commentaire"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCommentId(comment._id)}
                          className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-500 hover:text-red-500 transition-colors cursor-pointer"
                          title="Supprimer mon commentaire"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Comment Text or Inline Edit Form */}
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={2}
                        maxLength={300}
                        autoFocus
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl p-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-brand-green focus:ring-1 focus:ring-brand-green resize-none"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-3 py-1 rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(comment._id)}
                          disabled={!editContent.trim() || isSavingEdit}
                          className="px-3.5 py-1 rounded-full text-xs font-bold bg-brand-green hover:bg-emerald-500 text-white flex items-center gap-1 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-700 dark:text-zinc-200 mt-1 leading-relaxed break-words">
                      {comment.content}
                    </p>
                  )}

                  {/* Delete Confirmation Card */}
                  {isDeleting && (
                    <div className="mt-2 p-2.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-2 text-xs animate-in fade-in duration-150">
                      <span className="text-red-700 dark:text-red-400 font-bold text-xs">
                        Supprimer ce commentaire ?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment._id)}
                          className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                        >
                          Oui, supprimer
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCommentId(null)}
                          className="px-3 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Like Button */}
                <button
                  type="button"
                  onClick={() => handleToggleLike(comment._id)}
                  className="flex flex-col items-center gap-0.5 pt-1 px-1 cursor-pointer transition-transform hover:scale-110 active:scale-95 shrink-0"
                  title="Aimer ce commentaire"
                >
                  <Heart
                    className={`w-4 h-4 transition-colors ${
                      isLiked
                        ? 'fill-brand-red text-brand-red'
                        : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
                    }`}
                  />
                  {comment.likes > 0 && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                      {comment.likes}
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Bottom Footer: Comment Form or Login Prompt */}
      {isLoggedIn ? (
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 shrink-0 flex items-center gap-2"
        >
          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.username || 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-4 h-4" />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ajouter un commentaire en tant que @${currentUser.username || 'vous'}...`}
            maxLength={300}
            className="flex-1 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-white/10 rounded-full px-4 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-brand-green/60 focus:ring-1 focus:ring-brand-green/60 transition-all"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || submitting}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              inputText.trim() && !submitting
                ? 'bg-brand-green hover:bg-brand-green/90 text-white shadow-md hover:scale-105 active:scale-95'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
            }`}
            title="Envoyer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      ) : (
        <div className="p-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/95 shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-400 min-w-0">
            <LogIn className="w-4 h-4 text-brand-green shrink-0" />
            <span className="truncate">Connectez-vous pour laisser un commentaire</span>
          </div>
          <button
            type="button"
            onClick={() => openModal('login')}
            className="px-4 py-2 rounded-full text-xs font-bold bg-brand-green hover:bg-green-600 text-white shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
          >
            Se connecter
          </button>
        </div>
      )}
    </div>
  );

  // Desktop view: modal dialog with elegant backdrop
  if (isDesktop) {
    if (!isOpen) return null;
    return (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg h-[620px] rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 relative animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );
  }

  // Mobile view: bottom sheet drawer
  return (
    <>
      {/* Semi-transparent Backdrop */}
      <div
        className={`fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Slide-Up Sheet */}
      <div
        className={`fixed left-0 right-0 bottom-0 z-[120] bg-white dark:bg-zinc-900 rounded-t-[2.5rem] shadow-2xl border-t border-zinc-200 dark:border-zinc-800 max-h-[82dvh] h-[540px] transition-transform duration-300 ease-out flex flex-col overflow-hidden ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Pull Indicator Pill */}
        <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto my-2 shrink-0" />
        <div className="flex-1 overflow-hidden">{content}</div>
      </div>
    </>
  );
}
