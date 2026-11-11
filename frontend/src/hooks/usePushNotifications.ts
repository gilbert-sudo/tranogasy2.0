import { useState, useEffect, useCallback } from 'react';
import { requestPushToken, onForegroundMessage } from '../services/firebase';
import { notificationService, AppNotification } from '../services/notification.service';
import { useUserStore } from '../store/userStore';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [latestNotification, setLatestNotification] = useState<AppNotification | null>(null);

  const currentUserSession = useUserStore((state) => state.user);
  const activeUser = currentUserSession?.user || currentUserSession;
  const userId = activeUser?._id && !String(activeUser._id).startsWith('tg_') ? activeUser._id : null;

  // Check initial permission status on client
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
      const savedToken = localStorage.getItem('fcm_token');
      if (savedToken) {
        setToken(savedToken);
        setIsSubscribed(true);
      }
    }
  }, []);

  // Listen for foreground notifications
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

      // Play soft notification sound or browser alert if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
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
    try {
      const fcmToken = await requestPushToken();
      if (fcmToken) {
        setToken(fcmToken);
        setIsSubscribed(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('fcm_token', fcmToken);
        }

        if (userId) {
          await notificationService.registerToken(userId, fcmToken);
        }

        if (typeof window !== 'undefined' && 'Notification' in window) {
          setPermission(Notification.permission);
        }

        return { success: true, token: fcmToken };
      }
      return { success: false, reason: 'Permission non accordée' };
    } catch (err: any) {
      console.error('[Push] Failed to enable notifications:', err);
      return { success: false, reason: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const sendTest = useCallback(async () => {
    if (!token && !userId) {
      return { success: false, reason: 'Activez d’abord les notifications' };
    }
    return notificationService.sendTestNotification({
      token: token || undefined,
      userId: userId || undefined,
      title: '🎉 Notification Push TranoGasy',
      body: 'Félicitations ! Vos notifications Push Firebase et Papi fonctionnent parfaitement.',
    });
  }, [token, userId]);

  return {
    permission,
    token,
    isSubscribed,
    isLoading,
    latestNotification,
    enableNotifications,
    sendTest,
  };
}

