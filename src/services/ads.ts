/**
 * Ads. The game talks to `AdService` only; swapping in AdMob / AppLovin MAX is a one-file change.
 *
 * Policy (see `shouldShowInterstitial`): the celebration always comes first, interstitials only after the
 * player acknowledges results, never in onboarding, Paw Cup, or right after a loss, at most one per
 * 4 completed solo boards AND 8 minutes, capped at 3 a day. Rewarded ads are always optional.
 *
 * The visual stub exists in dev builds only. Production builds get `UnavailableAdService` until a real
 * SDK is integrated, so a release can never show a fake ad or grant a reward that no ad paid for.
 */

import type { ModeKind } from '../game/modes';

export type RewardedPlacement = 'revive' | 'hint';

export interface AdService {
  /** True when a real (or, in dev, simulated) ad network is ready. */
  readonly available: boolean;
  readonly isStub: boolean;
  showInterstitial(): Promise<boolean>;
  /** Resolves true only when the reward was earned. */
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
}

export interface AdCadenceState {
  removeAds: boolean;
  /** Journey levels completed so far (onboarding grace). */
  levelsCompleted: number;
  /** Solo boards completed since the last interstitial. */
  boardsSinceLast: number;
  lastShownAt: number | null;
  /** Interstitials shown today. */
  shownToday: number;
}

export interface AdTrigger {
  mode: ModeKind;
  outcome: 'won' | 'lost';
  now: number;
}

export const AD_POLICY = {
  onboardingGraceLevels: 8,
  minBoardsBetween: 4,
  minMsBetween: 8 * 60_000,
  dailyCap: 3,
} as const;

/** Pure cadence rule. Called only after the player taps through the results sheet. */
export function shouldShowInterstitial(s: AdCadenceState, t: AdTrigger): boolean {
  if (s.removeAds) return false;
  if (t.outcome !== 'won') return false; // never right after a loss
  if (t.mode === 'cup') return false; // never in competitive play
  if (s.levelsCompleted < AD_POLICY.onboardingGraceLevels) return false;
  if (s.shownToday >= AD_POLICY.dailyCap) return false;
  if (s.boardsSinceLast < AD_POLICY.minBoardsBetween) return false;
  if (s.lastShownAt !== null && t.now - s.lastShownAt < AD_POLICY.minMsBetween) return false;
  return true;
}

/** Production default until an SDK is wired: nothing to show, no rewards granted. */
export class UnavailableAdService implements AdService {
  readonly available = false;
  readonly isStub = false;
  async showInterstitial(): Promise<boolean> {
    return false;
  }
  async showRewarded(): Promise<boolean> {
    return false;
  }
}

/** Dev-only simulation with a clearly labeled overlay. */
export class DevStubAdService implements AdService {
  readonly available = true;
  readonly isStub = true;
  async showInterstitial(): Promise<boolean> {
    await fakeAd('Interstitial (dev stub)', 1200);
    return true;
  }
  async showRewarded(placement: RewardedPlacement): Promise<boolean> {
    await fakeAd(`Rewarded · ${placement} (dev stub)`, 1500);
    return true;
  }
}

function fakeAd(label: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fake-ad';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', label);
    const box = document.createElement('div');
    box.className = 'fake-ad__box';
    const l = document.createElement('div');
    l.className = 'fake-ad__label';
    l.textContent = label;
    const sub = document.createElement('div');
    sub.className = 'fake-ad__sub';
    sub.textContent = 'Development build only — no real ad network';
    box.append(l, sub);
    el.appendChild(box);
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve();
    }, ms);
  });
}

export function createAdService(isDev: boolean): AdService {
  return isDev ? new DevStubAdService() : new UnavailableAdService();
}

export const ads: AdService = createAdService(import.meta.env.DEV);
