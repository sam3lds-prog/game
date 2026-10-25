import './style.css';
import './style/animal-faces.css';
import './style/coats.css';
import { App } from './app/app';
import { AdController, demoAdsProvider, noAdsProvider } from './services/ads';
import { Purchases, demoIap, hasEntitlement, unavailableIap } from './services/iap';
import { createAnalytics, installCrashReporting } from './services/analytics';
import { webSound } from './services/sound';
import { nativeHaptics } from './native/haptics';
import { enableDurableStorage } from './native/durableStorage';
import { shareText } from './native/share';
import { onAppBackground } from './native/lifecycle';
import { cancelDailyReminder, remindersAvailable, scheduleDailyReminder } from './native/reminders';

async function boot() {
  // Restore progress from the native backup if the WebView storage was cleared (iOS app only).
  await enableDurableStorage();

  // Ads and purchases are OFF in release builds until real, verified providers are configured.
  // Developers can preview the flows locally with localStorage['cd.dev.demo'] = '1' in `npm run dev`.
  let demo = false;
  try {
    demo = import.meta.env.DEV && localStorage.getItem('cd.dev.demo') === '1';
  } catch {
    demo = false;
  }

  const analytics = createAnalytics({ endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT, appVersion: __APP_VERSION__ });
  installCrashReporting(analytics);
  const ads = new AdController(demo ? demoAdsProvider : noAdsProvider, () => hasEntitlement('remove_ads'), () => Date.now(), (e, p) => analytics.track(e, p));
  const purchases = new Purchases(demo ? demoIap : unavailableIap, (e, p) => analytics.track(e, p));

  const root = document.getElementById('app')!;
  const app = new App(root, {
    ads,
    purchases,
    analytics,
    haptics: nativeHaptics,
    sound: webSound,
    share: shareText,
    reminders: { available: remindersAvailable, schedule: scheduleDailyReminder, cancel: cancelDailyReminder },
  });

  // Save the board whenever the app may be about to disappear.
  const save = () => app.persistNow();
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });
  onAppBackground(save);

  app.ctx.nav.home();
}

void boot();
