// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBu2zvLh3Ly8Uacn3NXs1gFiWllnN-CbBw",
  authDomain: "tranogasy-3400.firebaseapp.com",
  projectId: "tranogasy-3400",
  storageBucket: "tranogasy-3400.firebasestorage.app",
  messagingSenderId: "770761472243",
  appId: "1:770761472243:web:3836a7c757ec1955235f86"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle =
    payload.notification?.title || payload.data?.title || 'TranoGasy';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: payload.notification?.icon || '/icon-logo.png',
    badge: '/icon-logo.png',
    data: {
      url: payload.data?.url || payload.fcmOptions?.link || '/',
    },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      }),
  );
});

