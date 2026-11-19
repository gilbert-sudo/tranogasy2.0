import type { CapacitorConfig } from '@capacitor/cli';

type MobileTargetPlatform = 'ios' | 'android';

/**
 * Resolves whether Capacitor is currently syncing for iOS or Android.
 * Supports explicit `CAP_TARGET_PLATFORM=ios|android` or auto-detection from `cap sync ios|android` CLI args.
 */
function resolveMobilePlatform(): MobileTargetPlatform {
  const explicit = process.env.CAP_TARGET_PLATFORM?.toLowerCase();
  if (explicit === 'android' || explicit === 'ios') {
    return explicit;
  }
  const cliArgs = process.argv.map((arg) => arg.toLowerCase());
  if (cliArgs.includes('android')) {
    return 'android';
  }
  return 'ios';
}

const targetPlatform = resolveMobilePlatform();

const IOS_PRODUCTION_URL =
  process.env.CAP_IOS_SERVER_URL || 'https://tranogasy-ios.vercel.app';
const ANDROID_PRODUCTION_URL =
  process.env.CAP_ANDROID_SERVER_URL || 'https://tranogasy2.vercel.app';

const activeServerUrl =
  targetPlatform === 'android' ? ANDROID_PRODUCTION_URL : IOS_PRODUCTION_URL;

const config: CapacitorConfig = {
  appId: 'mg.tranogasy.app',
  appName: 'TranoGasy',
  webDir: 'mobile-shell',
  server: {
    url: activeServerUrl,
    cleartext: false,
    allowNavigation: [
      'tranogasy-ios.vercel.app',
      'tranogasy2.vercel.app',
      '*.vercel.app',
      'app.papi.mg',
      '*.papi.mg',
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: '#ffffff',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#09090b',
  },
};

export default config;
