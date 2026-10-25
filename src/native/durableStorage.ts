/**
 * iOS can clear a WebView's localStorage under storage pressure. Every write is mirrored to
 * @capacitor/preferences (UserDefaults), and on launch any game key missing from localStorage is
 * restored from it — so progress survives even if the WebView data is purged.
 */
import { Preferences } from '@capacitor/preferences';
import { PREFIX, setStorageMirror } from '../services/storage';
import { hasPlugin, isNative } from './platform';

export async function enableDurableStorage(): Promise<{ restored: number }> {
  if (!isNative() || !hasPlugin('Preferences')) return { restored: 0 };
  let restored = 0;
  try {
    const { keys } = await Preferences.keys();
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      if (localStorage.getItem(key) !== null) continue;
      const { value } = await Preferences.get({ key });
      if (value !== null) {
        localStorage.setItem(key, value);
        restored++;
      }
    }
    // Back up anything that exists only in localStorage (first launch after this update).
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && !keys.includes(key)) await Preferences.set({ key, value: localStorage.getItem(key)! });
    }
  } catch {
    /* keep going with localStorage only */
  }
  setStorageMirror({
    set: (key, value) => void Preferences.set({ key, value }).catch(() => undefined),
    remove: (key) => void Preferences.remove({ key }).catch(() => undefined),
  });
  return { restored };
}
