import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { webHaptics, type Haptics as HapticsService } from '../services/haptics';
import { hasPlugin, isNative } from './platform';

/** Taptic Engine on iPhone; Vibration API fallback elsewhere. */
export const nativeHaptics: HapticsService = {
  play(kind) {
    if (!isNative() || !hasPlugin('Haptics')) return webHaptics.play(kind);
    const p =
      kind === 'light'
        ? Haptics.impact({ style: ImpactStyle.Light })
        : Haptics.notification({ type: kind === 'error' ? NotificationType.Error : NotificationType.Success });
    void p.catch(() => undefined);
  },
};
