import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mg.tranogasy.app',
  appName: 'TranoGasy',
  webDir: 'www',
  server: {
    url: 'https://tranogasy-ios.vercel.app',
    cleartext: false,
    allowNavigation: [
      'tranogasy-ios.vercel.app',
      '*.vercel.app',
      'app.papi.mg',
      '*.papi.mg',
    ],
  },
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: '#FFFFFF',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DEFAULT',
      overlaysWebView: true,
    },
  },
};

export default config;
