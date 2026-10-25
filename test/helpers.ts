import type { AdService } from '../src/services/ads';
import type { AppServices } from '../src/app/app';

/** Ads that never show anything (like a release build). */
export const quietAds: AdService = {
  rewardedAvailable: () => false,
  noteSolve: () => undefined,
  betweenLevels: async () => 'skipped',
  rewarded: async () => false,
};

export function testServices(over: Partial<AppServices> = {}): AppServices {
  return { ads: quietAds, haptics: { play() {} }, ...over };
}
