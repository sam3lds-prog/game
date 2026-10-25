/** Haptics. Web fallback uses the Vibration API (Android browsers); iOS Safari ignores it. Native plugin wired in Sprint 6. */
export type HapticKind = 'light' | 'error' | 'success';

export interface Haptics {
  play(kind: HapticKind): void;
}

export const webHaptics: Haptics = {
  play(kind) {
    try {
      const pattern = kind === 'light' ? 10 : kind === 'error' ? [30, 40, 30] : [15, 30, 15, 30, 40];
      navigator.vibrate?.(pattern);
    } catch {
      /* unsupported */
    }
  },
};
