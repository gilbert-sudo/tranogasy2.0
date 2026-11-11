'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Bell,
  ArrowLeft,
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
  const fetchNotifications = useCallback(async () => {
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
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchNotifications();
    }
  }, [userId, fetchNotifications]);

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

  const handleOpen = () => {
    updateDropdownCoords();
    if (userId) fetchNotifications();
    setIsOpen(true);

    // On mobile, push history state so native back button closes the page smoothly
    if (window.innerWidth < 768) {
      window.history.pushState({ modal: 'tranogasy_notifications' }, '');
    }
  };

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (
      typeof window !== 'undefined' &&
      window.history.state?.modal === 'tranogasy_notifications'
    ) {
      window.history.back();
    }
  }, []);

  // Listen for hardware/browser back navigation on mobile
  useEffect(() => {
    const handlePopState = () => {
      setIsOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Close when pressing Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Lock body scroll on mobile when full-page view is active
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
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-green-500/20">
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
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-500/20">
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
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-400 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-500/20">
          <MessageCircle className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-green to-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-brand-green/20">
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

  // Full-page Mobile View + Desktop Popover Content
  const modalContent = (
    <>
      {/* Desktop Backdrop only */}
      <div
        className="hidden md:block fixed inset-0 bg-black/45 backdrop-blur-xs z-[9998] transition-opacity animate-in fade-in duration-200"
        onClick={handleClose}
      />

      {/* Main Container */}
      <div
        ref={modalRef}
        style={!isMobile ? { top: `${coords.top}px`, right: `${coords.right}px` } : undefined}
        className={`
          fixed z-[9999] flex flex-col

          /* ── MOBILE: Full-Page View with Native iOS/Android Slide Transition ── */
          max-md:inset-0 max-md:w-full max-md:h-[100dvh]
          max-md:bg-[#F5F5F7] max-md:dark:bg-zinc-950
          max-md:animate-in max-md:slide-in-from-right max-md:duration-300 max-md:ease-out

          /* ── DESKTOP: Floating liquid-glass card anchored under Bell button ── */
          md:w-[420px] md:max-h-[640px] md:rounded-[2.25rem]
          md:bg-white/95 md:dark:bg-zinc-900/95 md:backdrop-blur-2xl
          md:border md:border-zinc-200/80 md:dark:border-zinc-800/80
          md:shadow-[0_24px_64px_rgba(0,0,0,0.22)] md:dark:shadow-[0_24px_64px_rgba(0,0,0,0.7)]
          md:animate-in md:zoom-in-95 md:duration-150
          overflow-hidden
        `}
      >
        {/* ── Top Bar Header (With Native Mobile Go-Back Button) ── */}
        <header className="sticky top-0 z-10 w-full h-16 shrink-0 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60 shadow-xs px-4 sm:px-5 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Go-Back Button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Retour"
              className="md:hidden w-10 h-10 rounded-full flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 active:scale-90 transition-all cursor-pointer shadow-xs shrink-0"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
            </button>

            {/* Title & Badge */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="hidden md:flex w-9 h-9 rounded-full bg-brand-green/10 dark:bg-brand-green/20 items-center justify-center text-brand-green shrink-0">
                <Bell className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white truncate">
                Notifications
              </h2>
              {unreadCount > 0 && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-brand-green/15 dark:bg-brand-green/25 text-brand-green text-[11px] font-black">
                  {unreadCount}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Mark All Read Button */}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                title="Tout marquer comme lu"
                className="h-9 px-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
              >
                <CheckCheck className="w-3.5 h-3.5 text-brand-green" />
                <span>Tout lire</span>
              </button>
            )}

            {/* Desktop Close Button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Fermer"
              className="hidden md:flex w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 pb-24 md:pb-5">
          {/* Push Activation Card */}
          {!isSubscribed && permission !== 'denied' && (
            <div className="p-4 rounded-3xl bg-white dark:bg-zinc-900 border border-brand-green/30 shadow-[0_8px_24px_rgba(124,189,30,0.12)] flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-brand-green text-white flex items-center justify-center shrink-0 shadow-md shadow-brand-green/30">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white leading-snug">
                  Activer les alertes push
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                  Confirmations Papi & alertes en temps réel
                </p>
              </div>
              <button
                type="button"
                onClick={enableNotifications}
                disabled={isEnablingPush}
                className="shrink-0 text-xs font-black px-4 py-2 rounded-full bg-brand-green hover:bg-brand-green/90 text-white shadow-md shadow-brand-green/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isEnablingPush ? '…' : 'Activer'}
              </button>
            </div>
          )}

          {/* Push Active Status Bar */}
          {isSubscribed && (
            <div className="px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/70 shadow-xs flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-green" />
                </span>
                <span className="font-bold text-zinc-700 dark:text-zinc-300 text-xs">
                  Notifications push actives
                </span>
              </div>
              <button
                type="button"
                onClick={handleTestClick}
                disabled={testSent}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:underline cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${testSent ? 'animate-spin' : ''}`}
                />
                <span>{testSent ? 'Envoyé !' : 'Tester'}</span>
              </button>
            </div>
          )}

          {/* Notifications List */}
          {isLoadingList ? (
            <div className="py-20 text-center text-xs text-zinc-400">
              <RefreshCw className="w-6 h-6 mx-auto mb-2.5 animate-spin text-brand-green" />
              Chargement de vos notifications…
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-20 px-6 text-center bg-white dark:bg-zinc-900 rounded-[2.25rem] border border-zinc-200/60 dark:border-zinc-800/60 shadow-xs">
              <div className="w-16 h-16 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center mx-auto mb-3 shadow-inner">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-base font-black text-zinc-900 dark:text-white">
                Vous êtes à jour !
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
                Vos confirmations de recharge Papi, alertes d’annonces et messages apparaîtront ici.
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif._id}
                onClick={() => !notif.read && handleMarkAsRead(notif._id)}
                className={`group relative p-4 rounded-[1.75rem] transition-all cursor-pointer flex items-start gap-3.5 ${
                  notif.read
                    ? 'bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/50 dark:border-zinc-800/50 opacity-80'
                    : 'bg-white dark:bg-zinc-900 border-2 border-brand-green/30 shadow-[0_8px_24px_rgba(124,189,30,0.08)]'
                }`}
              >
                {/* Visual Icon Badge */}
                {getNotificationIcon(notif)}

                {/* Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white truncate">
                      {notif.title}
                    </p>
                    <span className="text-[11px] font-medium text-zinc-400 shrink-0">
                      {formatTimestamp(notif.created_at)}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1.5 leading-relaxed">
                    {notif.body}
                  </p>

                  {/* Deep Link Action */}
                  {notif.data?.url && (
                    <Link
                      href={notif.data.url}
                      onClick={handleClose}
                      className="inline-flex items-center gap-1.5 mt-2.5 px-3.5 py-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-800 dark:text-zinc-100 hover:text-brand-green transition-colors"
                    >
                      <span>Voir les détails</span>
                      <ChevronRight className="w-3.5 h-3.5 text-brand-green" />
                    </Link>
                  )}
                </div>

                {/* Mark as read indicator / button */}
                {!notif.read && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAsRead(notif._id);
                    }}
                    title="Marquer comme lu"
                    className="shrink-0 w-7 h-7 rounded-full bg-brand-green/10 hover:bg-brand-green text-brand-green hover:text-white flex items-center justify-center transition-all mt-0.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
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
        onClick={handleOpen}
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
