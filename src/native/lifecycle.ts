import { App as CapApp } from '@capacitor/app';
import { hasPlugin, isNative } from './platform';

/** Calls `onBackground` when the iOS app goes to the background (in addition to pagehide/visibilitychange). */
export function onAppBackground(onBackground: () => void): void {
  if (!isNative() || !hasPlugin('App')) return;
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) onBackground();
  }).catch(() => undefined);
  void CapApp.addListener('pause', onBackground).catch(() => undefined);
}
