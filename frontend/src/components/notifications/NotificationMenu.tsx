'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Bell,
  Check,
  CheckCheck,
  Sparkles,
  X,
  CreditCard,
  Building,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { notificationService, AppNotification } from '@/services/notification.service';
import { useUserStore } from '@/store/userStore';

export default function NotificationMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({
    top: 68,
    right: 16,
  });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const {
    permission,
    isSubscribed,
    isLoading: isEnablingPush,
    latestNotification,
    enableNotifications,
    sendTest,
  } = usePushNotifications();

  const currentUserSession = useUserStore((state) => state.user);
  const activeUser = currentUserSession?.user || currentUserSession;
  const userId =
    activeUser?._id && !String(activeUser._id).startsWith('tg_')
      ? activeUser._id
      : null;

  // Mount tracking and screen size detection
  useEffect(() => {
    setMounted(true);
    const updateSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Fetch notifications from server when user is logged in
  const fetchNotifications = async () => {
    if (!userId) return;
    setIsLoadingList(true);
    try {
      const res = await notificationService.getUserNotifications(userId);
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Ignore when offline
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchNotifications();
    }
  }, [userId]);

  // When a new foreground push notification arrives, prepend it and increment count
  useEffect(() => {
    if (latestNotification) {
      setNotifications((prev) => [latestNotification, ...prev]);
      setUnreadCount((c) => c + 1);
    }
  }, [latestNotification]);

  // Update position relative to trigger button for desktop
  const updateDropdownCoords = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: Math.round(rect.bottom + 8),
        right: Math.max(16, Math.round(window.innerWidth - rect.right)),
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      updateDropdownCoords();
      if (userId) fetchNotifications();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Close when clicking outside of modal on desktop
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Lock body scroll on mobile when sheet is active
  useEffect(() => {
    if (isOpen && isMobile) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, isMobile]);

  const handleMarkAsRead = async (id: string) => {
    if (!userId) return;
    try {
      await notificationService.markAsRead(id, userId);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    try {
      await notificationService.markAllAsRead(userId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read', err);
    }
  };

  const handleTestClick = async () => {
    setTestSent(true);
    await sendTest();
    setTimeout(() => setTestSent(false), 3000);
  };

  // Helper to choose aesthetic icon by notification type
  const getNotificationIcon = (notif: AppNotification) => {
    const type = notif.data?.type || '';
    const title = (notif.title || '').toLowerCase();

    if (
      type.includes('payment') ||
      title.includes('paiement') ||
      title.includes('jp') ||
      title.includes('recharge')
    ) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-green-500/20">
          <CreditCard className="w-5 h-5" />
        </div>
      );
    }
    if (
      type.includes('property') ||
      title.includes('annonce') ||
      title.includes('bien')
    ) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-500/20">
          <Building className="w-5 h-5" />
        </div>
      );
    }
    if (
      type.includes('comment') ||
      title.includes('message') ||
      title.includes('commentaire')
    ) {
      return (
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-400 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-purple-500/20">
          <MessageCircle className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-green to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-brand-green/20">
        <Sparkles className="w-5 h-5" />
      </div>
    );
  };

  const formatTimestamp = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "À l'instant";
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      if (diffHours < 24) return `Il y a ${diffHours} h`;
      if (diffDays === 1) return 'Hier';
      if (diffDays < 7) return `Il y a ${diffDays} j`;
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
    } catch {
      return '';
    }
  };

  // The actual modal/bottom-sheet content
  const modalContent = (
    <>
      {/* Dimmed backdrop - closes on click */}
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[9998] transition-opacity animate-in fade-in duration-200"
        onClick={() => setIsOpen(false)}
      />

      {/* Main Drawer / Sheet Container */}
      <div
        ref={modalRef}
        style={!isMobile ? { top: `${coords.top}px`, right: `${coords.right}px` } : undefined}
        className={`
          fixed z-[9999] flex flex-col
          bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100
          overflow-hidden

          /* ── MOBILE: Full bottom sheet pinned to screen bottom ── */
          max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85dvh]
          max-md:rounded-t-[2.5rem] max-md:border-t max-md:border-zinc-200/90 max-md:dark:border-zinc-800/90
          max-md:shadow-[0_-16px_50px_rgba(0,0,0,0.35)]
          max-md:animate-in max-md:slide-in-from-bottom max-md:duration-250

          /* ── DESKTOP: Floating card positioned under the bell button ── */
          md:w-[410px] md:max-h-[620px] md:rounded-[2rem]
          md:border md:border-zinc-200/80 md:dark:border-zinc-800/80
          md:shadow-[0_24px_64px_rgba(0,0,0,0.25)] md:dark:shadow-[0_24px_64px_rgba(0,0,0,0.7)]
          md:animate-in md:zoom-in-95 md:duration-150
        `}
      >
        {/* Mobile Drag Handle Notch */}
        <div className="pt-3 pb-1 flex justify-center md:hidden shrink-0">
          <div className="w-12 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        {/* ── Top Bar Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-green/10 dark:bg-brand-green/20 flex items-center justify-center text-brand-green">
              <Bell className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white leading-tight">
                Notifications
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                {unreadCount > 0
                  ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`
                  : 'Toutes lues'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                title="Tout marquer comme lu"
                className="h-8 px-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tout lire</span>
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Fermer"
              className="w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Push Notification Banner Card ── */}
        {!isSubscribed && permission !== 'denied' && (
          <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-brand-green/15 via-emerald-500/10 to-transparent border border-brand-green/25 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-green text-white flex items-center justify-center shrink-0 shadow-md shadow-brand-green/30">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-zinc-900 dark:text-white">
                  Activer les notifications push
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300 line-clamp-1 mt-0.5">
                  Confirmations Papi & alertes en direct
                </p>
              </div>
              <button
                onClick={enableNotifications}
                disabled={isEnablingPush}
                className="shrink-0 text-xs font-extrabold px-3.5 py-2 rounded-full bg-brand-green text-white hover:bg-brand-green/90 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isEnablingPush ? '…' : 'Activer'}
              </button>
            </div>
          </div>
        )}

        {/* ── Push Active Quick Status & Test Button ── */}
        {isSubscribed && (
          <div className="mx-4 mt-2 px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-800/80 flex items-center justify-between text-xs shrink-0">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-green" />
              </span>
              <span className="font-semibold text-zinc-600 dark:text-zinc-300 text-[11px]">
                Push actif sur cet appareil
              </span>
            </div>
            <button
              onClick={handleTestClick}
              disabled={testSent}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-green hover:underline cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3 h-3 ${testSent ? 'animate-spin' : ''}`}
              />
              <span>{testSent ? 'Envoyé !' : 'Tester'}</span>
            </button>
          </div>
        )}

        {/* ── Notification Scroll Area ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-zinc-100 dark:divide-zinc-800/60 p-2 sm:p-3 space-y-1">
          {isLoadingList ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-brand-green" />
              Chargement des notifications…
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-zinc-100 dark:bg-zinc-800/80 text-zinc-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <ShieldCheck className="w-7 h-7 text-brand-green" />
              </div>
              <h4 className="text-sm font-extrabold text-zinc-900 dark:text-white">
                Vous êtes à jour !
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[240px] mx-auto leading-relaxed">
                Vos recharges JP, paiements Papi et messages apparaîtront ici.
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif._id}
                onClick={() => !notif.read && handleMarkAsRead(notif._id)}
                className={`group relative p-3.5 rounded-2xl transition-all cursor-pointer flex items-start gap-3.5 ${
                  notif.read
                    ? 'bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/40 opacity-80'
                    : 'bg-brand-green/5 dark:bg-brand-green/10 hover:bg-brand-green/10 border border-brand-green/15'
                }`}
              >
                {/* Visual Icon */}
                {getNotificationIcon(notif)}

                {/* Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                      {notif.title}
                    </p>
                    <span className="text-[10px] font-medium text-zinc-400 shrink-0">
                      {formatTimestamp(notif.created_at)}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-relaxed">
                    {notif.body}
                  </p>

                  {/* Deep Link Action */}
                  {notif.data?.url && (
                    <Link
                      href={notif.data.url}
                      onClick={() => setIsOpen(false)}
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px] font-bold text-zinc-800 dark:text-zinc-100 hover:text-brand-green shadow-xs transition-colors"
                    >
                      <span>Voir les détails</span>
                      <ChevronRight className="w-3 h-3 text-brand-green" />
                    </Link>
                  )}
                </div>

                {/* Mark as read indicator / button */}
                {!notif.read && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAsRead(notif._id);
                    }}
                    title="Marquer comme lu"
                    className="shrink-0 w-6 h-6 rounded-full bg-brand-green/10 hover:bg-brand-green text-brand-green hover:text-white flex items-center justify-center transition-all mt-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Bottom Safe Area on Mobile ── */}
        <div className="h-6 md:hidden shrink-0" />
      </div>
    </>
  );

  return (
    <>
      {/* ── Bell Trigger Button (Lives in Header) ── */}
      <button
        ref={buttonRef}
        id="header-notif-btn"
        aria-label="Notifications"
        onClick={handleToggle}
        className="relative flex h-11 w-11 items-center justify-center rounded-full
          bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
          border border-white/80 dark:border-white/10
          shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
          text-zinc-800 dark:text-zinc-200
          hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-brand-red text-white text-[11px] font-black ring-2 ring-white dark:ring-zinc-900 shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : (
          !isSubscribed && (
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-800" />
          )
        )}
      </button>

      {/* ── Portaled Modal Content (Teleports outside Header to document.body) ── */}
      {isOpen && mounted && typeof document !== 'undefined'
        ? createPortal(modalContent, document.body)
        : null}
    </>
  );
}
