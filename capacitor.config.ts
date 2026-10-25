import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Bundle id and display name. Change appId BEFORE registering the app in App Store Connect —
 * it can't be changed after the first upload. The display name lives in src/brand.ts too.
 */
const config: CapacitorConfig = {
  appId: 'com.sam3lds.catsanddogs',
  appName: 'Cats & Dogs',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#FBF7EF',
    scrollEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      // Reminders are silent by default; the player opts in from Settings.
      iconColor: '#D9603F',
    },
  },
};

export default config;
