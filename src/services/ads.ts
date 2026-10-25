/**
 * Ads: policy + provider.
 *
 * Release builds ship with NO ad provider (NoAdsProvider): nothing is shown, rewards are never
 * faked, and progress never depends on an ad. A real SDK (AdMob / AppLovin MAX) plugs in as an
 * AdProvider once credentials exist — see docs/monetization.md.
 *
 * Policy (initial test values, tune with data):
 *  - No ads in the tutorial or the first 5 campaign levels.
 *  - Never mid-puzzle. Interstitials only at a between-level transition (tapping Next after a win),
 *    at most one per 4 solved puzzles and at least 6 minutes apart.
 *  - Never after finishing the Daily.
 *  - Rewarded ads are optional, and the reward is granted only when the SDK confirms completion.
 *  - If no ad is available the player is never blocked (a free alternative is always offered).
 *  - A verified Remove Ads purchase turns interstitials off.
 */
import { kv, PREFIX } from './storage';

export type RewardPlacement = 'revive';
export type InterstitialResult = 'shown' | 'skipped' | 'unavailable' | 'failed';
export type RewardResult = 'rewarded' | 'dismissed' | 'unavailable' | 'failed';

export interface AdProvider {
  readonly id: string;
  available(): boolean;
  showInterstitial(): Promise<'shown' | 'unavailable' | 'failed'>;
  showRewarded(placement: RewardPlacement): Promise<RewardResult>;
}

export const AD_POLICY = {
  firstLevelWithAds: 6,
  solvesBetweenInterstitials: 4,
  minGapMs: 6 * 60_000,
} as const;

export interface TransitionInfo {
  kind: 'level' | 'daily' | 'unlimited' | 'tutorial';
  level?: number;
}

export interface AdState {
  solvesSinceInterstitial: number;
  lastInterstitialAt: number;
}

const STATE_KEY = `${PREFIX}v2.adstate`;

/** Pure policy check. */
export function interstitialAllowed(info: TransitionInfo, state: AdState, now: number, removeAds: boolean): boolean {
  if (removeAds) return false;
  if (info.kind === 'tutorial' || info.kind === 'daily') return false;
  if (info.kind === 'level' && (info.level ?? 0) < AD_POLICY.firstLevelWithAds) return false;
  if (state.solvesSinceInterstitial < AD_POLICY.solvesBetweenInterstitials) return false;
  if (now - state.lastInterstitialAt < AD_POLICY.minGapMs) return false;
  return true;
}

export interface AdService {
  /** True when an optional rewarded ad can be offered right now. */
  rewardedAvailable(): boolean;
  /** Record a solved puzzle (counts toward the interstitial spacing). */
  noteSolve(): void;
  /** Called at a between-level transition. Shows an interstitial only if policy allows. */
  betweenLevels(info: TransitionInfo): Promise<InterstitialResult>;
  /** Optional rewarded ad. Resolves true only when the SDK confirmed the reward. */
  rewarded(placement: RewardPlacement): Promise<boolean>;
}

export type AdEventSink = (event: 'ad_requested' | 'ad_shown' | 'ad_rewarded' | 'ad_failed', props: Record<string, string | number>) => void;

export class AdController implements AdService {
  constructor(
    private provider: AdProvider,
    private removeAds: () => boolean,
    private now: () => number = () => Date.now(),
    private emit: AdEventSink = () => undefined,
  ) {}

  private state(): AdState {
    return kv.get<AdState>(STATE_KEY, { solvesSinceInterstitial: 0, lastInterstitialAt: 0 });
  }

  rewardedAvailable(): boolean {
    return this.provider.available();
  }

  noteSolve(): void {
    const s = this.state();
    kv.set(STATE_KEY, { ...s, solvesSinceInterstitial: s.solvesSinceInterstitial + 1 });
  }

  async betweenLevels(info: TransitionInfo): Promise<InterstitialResult> {
    const s = this.state();
    if (!interstitialAllowed(info, s, this.now(), this.removeAds())) return 'skipped';
    if (!this.provider.available()) return 'unavailable';
    this.emit('ad_requested', { format: 'interstitial', provider: this.provider.id });
    const r = await this.provider.showInterstitial();
    if (r === 'shown') {
      kv.set(STATE_KEY, { solvesSinceInterstitial: 0, lastInterstitialAt: this.now() });
      this.emit('ad_shown', { format: 'interstitial', provider: this.provider.id });
    } else this.emit('ad_failed', { format: 'interstitial', reason: r });
    return r;
  }

  async rewarded(placement: RewardPlacement): Promise<boolean> {
    if (!this.provider.available()) return false;
    this.emit('ad_requested', { format: 'rewarded', placement });
    const r = await this.provider.showRewarded(placement);
    if (r === 'rewarded') this.emit('ad_rewarded', { placement });
    else if (r !== 'dismissed') this.emit('ad_failed', { format: 'rewarded', reason: r });
    return r === 'rewarded';
  }
}

/** Release default: no ads at all. */
export const noAdsProvider: AdProvider = {
  id: 'none',
  available: () => false,
  showInterstitial: async () => 'unavailable',
  showRewarded: async () => 'unavailable',
};

/**
 * Development-only demo provider: a clearly labeled placeholder screen. Never included in release
 * builds' behavior (main.ts only selects it when import.meta.env.DEV and the developer opted in).
 */
export const demoAdsProvider: AdProvider = {
  id: 'demo',
  available: () => true,
  showInterstitial: () => demoOverlay('Demo interstitial').then(() => 'shown' as const),
  showRewarded: (placement) => demoOverlay(`Demo rewarded ad · ${placement}`).then(() => 'rewarded' as const),
};

function demoOverlay(label: string): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'demo-ad';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<div><b>${label}</b><small>Development build only. Release builds show no ads.</small></div>`;
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
      resolve();
    }, 1200);
  });
}
