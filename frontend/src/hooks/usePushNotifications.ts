import { useState, useEffect, useCallback } from 'react';
import {
  requestPushTokenWithStatus,
  getPushPermissionStatus,
  onForegroundMessage,
  isNativeMobileApp,
} from '../services/firebase';
import { notificationService, AppNotification } from '../services/notification.service';
import { useUserStore } from '../store/userStore';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [latestNotification, setLatestNotification] = useState<AppNotification | null>(null);

  const currentUserSession = useUserStore((state) => state.user);
  const activeUser = currentUserSession?.user || currentUserSession;
  const userId =
    activeUser?._id && !String(activeUser._id).startsWith('tg_')
      ? activeUser._id
      : null;

  // Restore saved token & real permission status across both Native iOS/Android and Web
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let active = true;

    const savedToken = localStorage.getItem('fcm_token');
    if (savedToken) {
      setToken(savedToken);
      setIsSubscribed(true);
    }

    getPushPermissionStatus().then((status) => {
      if (!active) return;
      setPermission(status);
      if (status === 'denied') {
        setIsSubscribed(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  // Listen for foreground notifications (both Native Capacitor & Web FCM)
  useEffect(() => {
    const unsubscribe = onForegroundMessage((payload) => {
      const title = payload.notification?.title || payload.data?.title || 'TranoGasy';
      const body = payload.notification?.body || payload.data?.body || '';

      const notifObj: AppNotification = {
        _id: `fg_${Date.now()}`,
        user: userId || '',
        title,
        body,
        data: payload.data,
        read: false,
        created_at: new Date().toISOString(),
      };

      setLatestNotification(notifObj);

      // Web-only browser Notification popup (iOS/Android Capacitor uses native presentationOptions)
      if (
        !isNativeMobileApp() &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        new Notification(title, {
          body,
          icon: '/icon-logo.png',
        });
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  // If user logs in and we already have a saved token, sync with backend
  useEffect(() => {
    if (userId && token) {
      notificationService.registerToken(userId, token).catch((err) => {
        console.warn('[Push] Auto-sync token failed:', err);
      });
    }
  }, [userId, token]);

  const enableNotifications = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await requestPushTokenWithStatus();
      setPermission(res.permission);

      if (res.token) {
        setToken(res.token);
        setIsSubscribed(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('fcm_token', res.token);
        }

        if (userId) {
          await notificationService.registerToken(userId, res.token);
        }

        setFeedback('Notifications activées avec succès.');
        return { success: true, token: res.token };
      }

      const reason = res.error || 'Permission de notification non accordée.';
      setFeedback(reason);
      return { success: false, reason };
    } catch (err: unknown) {
      const reason =
        err instanceof Error
          ? err.message
          : 'Impossible d’activer les notifications.';
      setFeedback(reason);
      return { success: false, reason };
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const sendTest = useCallback(async () => {
    setFeedback(null);
    if (!token && !userId) {
      const reason = 'Activez d’abord les notifications.';
      setFeedback(reason);
      return { success: false, reason };
    }
    try {
      const res = await notificationService.sendTestNotification({
        token: token || undefined,
        userId: userId || undefined,
        title: '🎉 Notification Push TranoGasy',
        body: 'Vos notifications Push TranoGasy fonctionnent parfaitement !',
      });
      if (res?.success === false && res?.message) {
        setFeedback(res.message);
      }
      return res;
    } catch (err: unknown) {
      const reason =
        err instanceof Error
          ? err.message
          : 'Impossible d’envoyer la notification de test.';
      setFeedback(reason);
      return { success: false, reason };
    }
  }, [token, userId]);

  return {
    permission,
    token,
    isSubscribed,
    isLoading,
    feedback,
    latestNotification,
    enableNotifications,
    sendTest,
  };
}
