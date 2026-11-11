'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, Check, CheckCheck, Sparkles, AlertCircle, X, ExternalLink } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { notificationService, AppNotification } from '@/services/notification.service';
import { useUserStore } from '@/store/userStore';

export default function NotificationMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  const userId = activeUser?._id && !String(activeUser._id).startsWith('tg_') ? activeUser._id : null;

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

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

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

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        id="header-notif-btn"
        aria-label="Notifications"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && userId) fetchNotifications();
        }}
        className="relative flex h-11 w-11 items-center justify-center rounded-full
          bg-white/75 dark:bg-zinc-800/70 backdrop-blur-xl
          border border-white/80 dark:border-white/10
          shadow-[0_4px_16px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3)]
          text-zinc-800 dark:text-zinc-200
          hover:scale-105 active:scale-95 transition-all cursor-pointer"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-brand-red text-white text-[10px] font-extrabold ring-2 ring-white dark:ring-zinc-900 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : (
          !isSubscribed && (
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-800" />
          )
        )}
      </button>

      {/* Floating Dropdown Modal */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl
            bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl
            border border-zinc-200/80 dark:border-zinc-800/80
            shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)]
            overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-brand-green/10 dark:bg-brand-green/20 text-brand-green text-[11px] font-bold px-2 py-0.5">
                  {unreadCount} nouvelle{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  title="Tout marquer comme lu"
                  className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Web Push Permission Banner */}
          {!isSubscribed && permission !== 'denied' && (
            <div className="p-3 mx-3 my-2 rounded-xl bg-gradient-to-r from-brand-green/10 via-brand-green/5 to-transparent border border-brand-green/20">
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-brand-green text-white flex-shrink-0 mt-0.5">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-zinc-900 dark:text-white">
                    Activer les notifications push
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-0.5">
                    Recevez vos confirmations de paiement Papi et alertes en temps réel.
                  </p>
                  <button
                    onClick={enableNotifications}
                    disabled={isEnablingPush}
                    className="mt-2 text-xs font-extrabold px-3 py-1.5 rounded-full bg-brand-green text-white hover:bg-brand-green/90 active:scale-95 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    {isEnablingPush ? 'Activation en cours…' : 'Activer maintenant'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Test push button (visible when subscribed) */}
          {isSubscribed && (
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-50/80 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800/60 text-xs">
              <span className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-brand-green" />
                Push actif
              </span>
              <button
                onClick={handleTestClick}
                disabled={testSent}
                className="text-[11px] font-bold text-brand-green hover:underline cursor-pointer disabled:opacity-50"
              >
                {testSent ? '✓ Envoyé !' : 'Tester la notification'}
              </button>
            </div>
          )}

          {/* List of notifications */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {isLoadingList ? (
              <div className="p-6 text-center text-xs text-zinc-400">
                Chargement de vos notifications…
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mb-2">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Aucune notification
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Vos recharges et alertes apparaîtront ici.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  onClick={() => !notif.read && handleMarkAsRead(notif._id)}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                    notif.read
                      ? 'bg-transparent hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20'
                      : 'bg-brand-green/5 dark:bg-brand-green/10 hover:bg-brand-green/10'
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                      notif.read ? 'bg-transparent' : 'bg-brand-green'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-zinc-900 dark:text-white leading-snug">
                      {notif.title}
                    </p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-0.5 leading-relaxed">
                      {notif.body}
                    </p>
                    {notif.data?.url && (
                      <Link
                        href={notif.data.url}
                        onClick={() => setIsOpen(false)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-green hover:underline mt-1"
                      >
                        Voir les détails <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    )}
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {new Date(notif.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  {!notif.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notif._id);
                      }}
                      title="Marquer comme lu"
                      className="p-1 rounded-md text-zinc-400 hover:text-brand-green hover:bg-brand-green/10 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

