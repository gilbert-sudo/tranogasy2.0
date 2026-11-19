import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  Messaging,
  MessagePayload,
} from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;

export function isNativeMobileApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null;
  if (!getApps().length) {
    if (!firebaseConfig.apiKey) {
      console.warn('Firebase config API key is missing');
      return null;
    }
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;

  const supported = await isSupported().catch(() => false);
  if (!supported) {
    console.warn('Firebase Messaging is not supported in this browser environment.');
    return null;
  }

  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  return getMessaging(firebaseApp);
}

/**
 * Checks current notification permission status across Native (iOS/Android Capacitor) and Web.
 */
export async function getPushPermissionStatus(): Promise<NotificationPermission> {
  if (typeof window === 'undefined') return 'default';

  if (isNativeMobileApp()) {
    try {
      const status = await PushNotifications.checkPermissions();
      if (status.receive === 'granted') return 'granted';
      if (status.receive === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'default';
    }
  }

  if ('Notification' in window) {
    return Notification.permission;
  }
  return 'default';
}

export interface RequestPushTokenResult {
  token: string | null;
  permission: NotificationPermission;
  error?: string;
}

/**
 * Requests push notification permission and generates a push token:
 * - iOS Capacitor: APNs device token prefixed with `apns:`
 * - Android Capacitor: Native FCM registration token
 * - Web / PWA: Firebase Web Push FCM token
 */
export async function requestPushTokenWithStatus(): Promise<RequestPushTokenResult> {
  if (typeof window === 'undefined') {
    return { token: null, permission: 'default', error: 'Environnement non supporté.' };
  }

  // 1. Native Capacitor Mobile App (iOS & Android)
  if (isNativeMobileApp()) {
    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (
        permStatus.receive === 'prompt' ||
        permStatus.receive === 'prompt-with-rationale'
      ) {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        return {
          token: null,
          permission: 'denied',
          error:
            'Notifications refusées. Activez-les dans Réglages > TranoGasy > Notifications.',
        };
      }

      const platform = Capacitor.getPlatform();

      // Attach listeners BEFORE calling register() to avoid race conditions on cached tokens
      const rawToken = await new Promise<string>((resolve, reject) => {
        let settled = false;
        let regHandle: { remove: () => Promise<void> } | null = null;
        let errHandle: { remove: () => Promise<void> } | null = null;

        const cleanup = () => {
          regHandle?.remove().catch(() => {});
          errHandle?.remove().catch(() => {});
        };

        const timeoutId = setTimeout(() => {
          if (!settled) {
            settled = true;
            cleanup();
            reject(
              new Error(
                'Délai dépassé lors de l’enregistrement des notifications push.'
              )
            );
          }
        }, 15000);

        Promise.all([
          PushNotifications.addListener('registration', (tokenData) => {
            if (!settled) {
              settled = true;
              clearTimeout(timeoutId);
              cleanup();
              resolve(tokenData.value);
            }
          }),
          PushNotifications.addListener('registrationError', (err) => {
            if (!settled) {
              settled = true;
              clearTimeout(timeoutId);
              cleanup();
              reject(
                new Error(
                  (err as { error?: string })?.error ||
                    'Impossible d’enregistrer l’appareil pour les notifications.'
                )
              );
            }
          }),
        ])
          .then(([rHandle, eHandle]) => {
            regHandle = rHandle;
            errHandle = eHandle;
            return PushNotifications.register();
          })
          .catch((err) => {
            if (!settled) {
              settled = true;
              clearTimeout(timeoutId);
              cleanup();
              reject(err);
            }
          });
      });

      const formattedToken =
        platform === 'ios' && !rawToken.startsWith('apns:')
          ? `apns:${rawToken}`
          : rawToken;

      return { token: formattedToken, permission: 'granted' };
    } catch (capErr: unknown) {
      const msg =
        capErr instanceof Error
          ? capErr.message
          : 'Erreur lors de l’activation des notifications push.';
      console.warn('[Push] Capacitor push registration error:', msg);
      return { token: null, permission: 'default', error: msg };
    }
  }

  // 2. Standard Web Push (Chrome, Firefox, Safari PWA, Edge, Android Chrome)
  if (!('Notification' in window)) {
    return {
      token: null,
      permission: 'denied',
      error: 'Ce navigateur ne prend pas en charge les notifications push.',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      token: null,
      permission,
      error: 'Permission de notification refusée.',
    };
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) {
    return {
      token: null,
      permission,
      error: 'Firebase Messaging non disponible dans ce navigateur.',
    };
  }

  try {
    await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    const readyRegistration = await navigator.serviceWorker.ready;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: readyRegistration,
    });

    if (!token) {
      return {
        token: null,
        permission,
        error: 'Impossible d’obtenir le jeton de notification.',
      };
    }

    return { token, permission: 'granted' };
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? error.message
        : 'Erreur lors de la récupération du jeton FCM.';
    console.warn('[Push] Error retrieving Web FCM token:', msg);
    return { token: null, permission, error: msg };
  }
}

export async function requestPushToken(): Promise<string | null> {
  const res = await requestPushTokenWithStatus();
  return res.token;
}

/**
 * Listens for incoming push notifications while the app is in the foreground
 * (supports both Capacitor native iOS/Android and Firebase Web Push).
 */
export function onForegroundMessage(
  callback: (payload: MessagePayload) => void,
): (() => void) | null {
  if (typeof window === 'undefined') return null;

  if (isNativeMobileApp()) {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      if (cancelled) return;
      callback({
        from: 'apns',
        collapseKey: '',
        messageId: notification.id || `native_${Date.now()}`,
        notification: {
          title: notification.title || 'TranoGasy',
          body: notification.body || '',
        },
        data: (notification.data as Record<string, string>) || {},
      });
    })
      .then((handle) => {
        if (cancelled) {
          handle.remove().catch(() => {});
        } else {
          listenerHandle = handle;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listenerHandle?.remove().catch(() => {});
    };
  }

  let unsubscribe: (() => void) | null = null;
  getFirebaseMessaging().then((messaging) => {
    if (messaging) {
      unsubscribe = onMessage(messaging, (payload) => {
        callback(payload);
      });
    }
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}
