import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Multi-platform Capacitor configuration for TranoGasy (iOS & Android).
 *
 * The Next.js frontend is exported statically (`npm run build:mobile:ios` or `build:mobile:android`)
 * into `frontend/out/` and bundled directly inside the native app binary for instant offline-first
 * launch and zero remote-HTML latency.
 */
const config: CapacitorConfig = {
  appId: 'mg.tranogasy.app',
  appName: 'TranoGasy',
  webDir: 'out',
  server: {
    iosScheme: 'capacitor',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'app.papi.mg',
      '*.papi.mg',
      'tranogasy-ios.vercel.app',
      'tranogasy2.vercel.app',
      '*.vercel.app',
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#09090b',
      showSpinner: false,
    },
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: '#09090b',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#09090b',
  },
};

export default config;
