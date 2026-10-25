// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { AD_POLICY, AdController, interstitialAllowed, noAdsProvider, type AdProvider, type RewardResult } from '../src/services/ads';
import { Purchases, hasEntitlement, loadEntitlements, unavailableIap, type IapProvider, type PurchaseResult } from '../src/services/iap';
import { createAnalytics } from '../src/services/analytics';
import { App } from '../src/app/app';
import { testServices } from './helpers';
import { campaignPuzzle } from '../src/game/catalog';
import { CAT } from '../src/engine/types';
import type { Session } from '../src/game/session';

beforeEach(() => localStorage.clear());

describe('ad policy', () => {
  const ready = { solvesSinceInterstitial: 10, lastInterstitialAt: 0 };
  const now = 10 * 60_000;
  it('never during the tutorial, the first 5 levels, or after a daily', () => {
    expect(interstitialAllowed({ kind: 'tutorial' }, ready, now, false)).toBe(false);
    for (let l = 1; l < AD_POLICY.firstLevelWithAds; l++) expect(interstitialAllowed({ kind: 'level', level: l }, ready, now, false)).toBe(false);
    expect(interstitialAllowed({ kind: 'daily' }, ready, now, false)).toBe(false);
    expect(interstitialAllowed({ kind: 'level', level: 6 }, ready, now, false)).toBe(true);
  });
  it('at most one per 4 solves and 6 minutes apart; never with Remove Ads', () => {
    expect(interstitialAllowed({ kind: 'unlimited' }, { solvesSinceInterstitial: 3, lastInterstitialAt: 0 }, now, false)).toBe(false);
    expect(interstitialAllowed({ kind: 'unlimited' }, { solvesSinceInterstitial: 4, lastInterstitialAt: now - 5 * 60_000 }, now, false)).toBe(false);
    expect(interstitialAllowed({ kind: 'unlimited' }, { solvesSinceInterstitial: 4, lastInterstitialAt: now - 6 * 60_000 }, now, false)).toBe(true);
    expect(interstitialAllowed({ kind: 'unlimited' }, ready, now, true)).toBe(false);
  });
});

function provider(result: RewardResult): AdProvider & { shown: number } {
  return { id: 'fake', shown: 0, available: () => true, showInterstitial: async function () { this.shown++; return 'shown'; }, showRewarded: async () => result };
}

describe('ad controller', () => {
  it('grants a reward only when the SDK confirms it', async () => {
    for (const r of ['dismissed', 'unavailable', 'failed'] as RewardResult[]) expect(await new AdController(provider(r), () => false).rewarded('revive')).toBe(false);
    expect(await new AdController(provider('rewarded'), () => false).rewarded('revive')).toBe(true);
  });
  it('the release provider never shows anything and never rewards', async () => {
    const c = new AdController(noAdsProvider, () => false);
    for (let i = 0; i < 10; i++) c.noteSolve();
    expect(c.rewardedAvailable()).toBe(false);
    expect(await c.rewarded('revive')).toBe(false);
    expect(await c.betweenLevels({ kind: 'unlimited' })).toBe('unavailable');
  });
  it('spaces interstitials by solves and time', async () => {
    let t = 0;
    const p = provider('rewarded');
    const c = new AdController(p, () => false, () => t);
    t = 60 * 60_000;
    for (let i = 0; i < 4; i++) c.noteSolve();
    expect(await c.betweenLevels({ kind: 'level', level: 20 })).toBe('shown');
    for (let i = 0; i < 4; i++) c.noteSolve();
    t += 2 * 60_000;
    expect(await c.betweenLevels({ kind: 'level', level: 24 })).toBe('skipped'); // too soon
    t += 5 * 60_000;
    expect(await c.betweenLevels({ kind: 'level', level: 24 })).toBe('shown');
    expect(p.shown).toBe(2);
  });
});

describe('purchases record entitlements only from verified results', () => {
  const fake = (result: PurchaseResult): IapProvider => ({ id: 'fake', available: () => true, price: () => '$3.99', purchase: async () => result, restore: async () => [] });
  it('cancelled, pending and failed purchases grant nothing', async () => {
    for (const r of [{ status: 'cancelled' }, { status: 'pending' }, { status: 'failed', message: 'x' }] as PurchaseResult[]) {
      await new Purchases(fake(r)).buy('remove_ads');
      expect(hasEntitlement('remove_ads')).toBe(false);
    }
  });
  it('a verified purchase grants Remove Ads, which then disables interstitials', async () => {
    await new Purchases(fake({ status: 'purchased', entitlement: { product: 'remove_ads', source: 'storekit', transactionId: 't1', verifiedAt: '2026-10-25' } })).buy('remove_ads');
    expect(hasEntitlement('remove_ads')).toBe(true);
    const c = new AdController(provider('rewarded'), () => hasEntitlement('remove_ads'), () => 99 * 60_000);
    for (let i = 0; i < 5; i++) c.noteSolve();
    expect(await c.betweenLevels({ kind: 'unlimited' })).toBe('skipped');
  });
  it('a purchase result without a transaction id is ignored', async () => {
    await new Purchases(fake({ status: 'purchased', entitlement: { product: 'remove_ads', source: 'storekit', transactionId: '', verifiedAt: '' } })).buy('remove_ads');
    expect(loadEntitlements()).toEqual([]);
  });
  it('the release store is unavailable, so the purchase UI is hidden', () => {
    localStorage.clear();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App(root, testServices({ purchases: new Purchases(unavailableIap) }));
    app.ctx.flags.tutorialDone = true;
    app.ctx.nav.home();
    (root.querySelector('[data-act="settings"]') as HTMLElement).click();
    expect(document.querySelector('.overlay [data-act="buy"]')).toBeNull();
    expect(document.querySelector('.overlay [data-act="restore"]')).toBeNull();
    app.destroy();
  });
});

describe('analytics', () => {
  it('records nothing without consent', () => {
    const a = createAnalytics();
    a.track('level_started', { puzzleId: 'campaign-0001' });
    expect(a.recent()).toEqual([]);
    expect(localStorage.getItem('cd.v2.analytics.id')).toBeNull();
  });
  it('with consent: keeps safe props only; turning it off deletes the id and events', () => {
    const a = createAnalytics();
    a.setConsent(true);
    a.track('level_completed', { puzzleId: 'campaign-0001', seconds: 90, 'bad key': 'x', note: 'y'.repeat(200) });
    const [ev] = a.recent();
    expect(ev.e).toBe('level_completed');
    expect(ev.p).toEqual({ puzzleId: 'campaign-0001', seconds: 90, note: 'y'.repeat(64) });
    a.setConsent(false);
    expect(a.recent()).toEqual([]);
    expect(localStorage.getItem('cd.v2.analytics.id')).toBeNull();
  });
  it('the game reports start, hints, completion and one face summary per board', () => {
    const a = createAnalytics();
    a.setConsent(true);
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App(root, testServices({ analytics: a }));
    app.ctx.flags.tutorialDone = true;
    app.ctx.nav.play({ kind: 'level', level: 3 });
    (root.querySelector('[data-act="hint"]') as HTMLElement).click();
    (root.querySelector('[data-act="hint-reveal"]') as HTMLElement).click();
    app.ctx.nav.home();
    const names = a.recent().map((e) => e.e);
    expect(names).toEqual(expect.arrayContaining(['level_started', 'hint_explained', 'hint_revealed', 'face_reaction_summary']));
    expect(names.filter((n) => n === 'face_reaction_summary')).toHaveLength(1);
    app.destroy();
  });
});

describe('never blocked by ads', () => {
  it('out of hearts with no ad available offers “Keep going in Zen”, which keeps the board', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App(root, testServices());
    app.ctx.flags.tutorialDone = true;
    app.ctx.settings.defaultMode = 'challenge';
    app.ctx.settings.faces = 'off';
    app.ctx.nav.play({ kind: 'level', level: 2 });
    const g = () => app.screen as unknown as { debug: { session: Session }; checkOutcome(): void };
    const s = g().debug.session;
    const p = campaignPuzzle(2)!;
    let wrong: [number, number] | null = null;
    for (let r = 0; r < p.size && !wrong; r++) for (let c = 0; c < p.size && !wrong; c++) if (!s.givenMask[r][c] && p.solution[r][c] !== CAT) wrong = [r, c];
    for (let i = 0; i < 3; i++) s.setCell(wrong![0], wrong![1], CAT);
    g().checkOutcome();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(document.querySelector('.overlay [data-act="revive"]')).toBeNull();
    (document.querySelector('.overlay [data-act="zen"]') as HTMLElement).click();
    const after = g().debug.session;
    expect(after.mode).toBe('zen');
    expect(after.outcome).toBe('playing');
    expect(root.querySelector('[data-mode]')?.textContent).toBe('Zen');
    app.destroy();
  });
});
