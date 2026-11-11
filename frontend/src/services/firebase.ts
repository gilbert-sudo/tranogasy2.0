import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  Messaging,
  MessagePayload,
} from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;

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
 * Requests push notification permission and generates an FCM token.
 * Ready for both Web PWA and future Capacitor native mobile builds.
 */
export async function requestPushToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // 1. Check if running inside Capacitor native mobile app
  const capacitor = (window as any).Capacitor;
  if (
    capacitor &&
    typeof capacitor.isNativePlatform === 'function' &&
    capacitor.isNativePlatform()
  ) {
    console.log('[Push] Running in Capacitor native mobile environment');
    const pushPlugin = capacitor.Plugins?.PushNotifications;
    if (pushPlugin) {
      try {
        const permStatus = await pushPlugin.requestPermissions();
        if (permStatus.receive === 'granted') {
          await pushPlugin.register();
          return new Promise<string | null>((resolve) => {
            pushPlugin.addListener(
              'registration',
              (tokenData: { value: string }) => {
                resolve(tokenData.value);
              },
            );
            pushPlugin.addListener('registrationError', (err: any) => {
              console.error('[Push] Capacitor registration error:', err);
              resolve(null);
            });
          });
        }
      } catch (capErr) {
        console.warn('[Push] Capacitor push registration error:', capErr);
      }
    }
    return null;
  }

  // 2. Standard Web Push (Chrome, Firefox, Safari, Edge, Android Chrome)
  if (!('Notification' in window)) {
    console.warn('[Push] Browser does not support notifications.');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('[Push] Notification permission denied or dismissed by user.');
    return null;
  }

  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;

  try {
    // Register the dedicated Firebase Messaging Service Worker and wait until active
    await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    const readyRegistration = await navigator.serviceWorker.ready;

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: readyRegistration,
    });

    return token || null;
  } catch (error) {
    console.error('[Push] Error retrieving Web FCM token:', error);
    return null;
  }
}

/**
 * Listens for incoming push notifications while the web app is in the foreground.
 */
export function onForegroundMessage(
  callback: (payload: MessagePayload) => void,
): (() => void) | null {
  if (typeof window === 'undefined') return null;

  let unsubscribe: (() => void) | null = null;
  getFirebaseMessaging().then((messaging) => {
    if (messaging) {
      unsubscribe = onMessage(messaging, (payload) => {
        console.log('[Push] Foreground notification received:', payload);
        callback(payload);
      });
    }
  });

  return () => {
    if (unsubscribe) unsubscribe();
  };
}
