/**
 * Ad service. The game talks to this interface only, so swapping the stub for
 * Capacitor AdMob / AppLovin MAX is a one-file change.
 *
 * Cadence copies what works in the category: interstitial after a level, with a cooldown
 * that tightens as players prove they stick around (120s → 100s → 90s by tenure).
 */

import type { Progress } from './storage';
import { tenureDays } from './storage';

export interface AdService {
  /** Show an interstitial if the cooldown allows and ads aren't removed. Resolves when dismissed. */
  maybeShowInterstitial(p: Progress): Promise<boolean>;
  /** Show a rewarded video. Resolves true if the reward was earned. */
  showRewarded(placement: 'revive' | 'hint', p: Progress): Promise<boolean>;
}

export function interstitialCooldownMs(p: Progress): number {
  const days = tenureDays(p);
  if (days < 2) return 120_000;
  if (days < 7) return 100_000;
  return 90_000;
}

/** Stub used in the browser and until the native SDK is wired. Simulates a short ad with an overlay. */
export class StubAdService implements AdService {
  private lastInterstitial = 0;

  async maybeShowInterstitial(p: Progress): Promise<boolean> {
    if (p.removeAds) return false;
    const now = Date.now();
    if (now - this.lastInterstitial < interstitialCooldownMs(p)) return false;
    this.lastInterstitial = now;
    await fakeAd('Interstitial ad', 1500);
    return true;
  }

  async showRewarded(placement: 'revive' | 'hint'): Promise<boolean> {
    await fakeAd(`Rewarded ad · ${placement}`, 2000);
    return true;
  }
}

function fakeAd(label: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fake-ad';
    el.innerHTML = `<div class="fake-ad__box"><div class="fake-ad__label">${label}</div><div class="fake-ad__sub">(stub — AdMob goes here)</div></div>`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve();
    }, ms);
  });
}

export const ads: AdService = new StubAdService();
