import { describe, expect, it } from 'vitest';
import { nextAfterWin, modeKey, isValidModeRef } from '../../src/game/modes';
import { captureSession, hasMeaningfulProgress, resumeSession } from '../../src/game/sessionPersistence';
import { GENERATOR_VERSION, puzzleFor } from '../../src/game/puzzles';
import { Session } from '../../src/game/session';
import { CAT, EMPTY } from '../../src/engine/types';
import { AD_POLICY, shouldShowInterstitial, type AdCadenceState } from '../../src/services/ads';
import { createIapService, entitlementCounts } from '../../src/services/iap';
import { addDaysKey, daysBetween, localWeekStart, prevDateKey, utcWeekBounds, utcWeekKey } from '../../src/game/dates';

describe('Next level (regression: v1 replayed the completed level)', () => {
  it('advances Journey to the following level', () => {
    expect(nextAfterWin({ kind: 'level', level: 1 })).toEqual({ kind: 'level', level: 2 });
    expect(nextAfterWin({ kind: 'level', level: 18 })).toEqual({ kind: 'level', level: 19 });
  });
  it('sends other modes back to their hub', () => {
    expect(nextAfterWin({ kind: 'daily', dateKey: '2026-10-25' })).toBe('home');
    expect(nextAfterWin({ kind: 'zen', size: 6, seed: 3 })).toBe('home');
    expect(nextAfterWin({ kind: 'cup', weekKey: '2026-W43', index: 0 })).toBe('cup');
  });
});

describe('mode refs', () => {
  it('keys are stable', () => {
    expect(modeKey({ kind: 'level', level: 7 })).toBe('L7');
    expect(modeKey({ kind: 'daily', dateKey: '2026-10-25' })).toBe('D2026-10-25');
  });
  it('validates untrusted saved refs', () => {
    expect(isValidModeRef({ kind: 'level', level: 3 })).toBe(true);
    expect(isValidModeRef({ kind: 'level', level: 0 })).toBe(false);
    expect(isValidModeRef({ kind: 'zen', size: 12, seed: 1 })).toBe(false);
    expect(isValidModeRef({ kind: 'daily', dateKey: 'yesterday' })).toBe(false);
    expect(isValidModeRef(null)).toBe(false);
  });
});

describe('resume after the app is closed', () => {
  it('restores the exact board', () => {
    const mode = { kind: 'level' as const, level: 4 };
    const s = new Session(puzzleFor(mode));
    const p = s.puzzle;
    let placed = 0;
    for (let r = 0; r < p.size && placed < 2; r++)
      for (let c = 0; c < p.size && placed < 2; c++)
        if (p.solution[r][c] !== EMPTY && !s.givenMask[r][c]) {
          s.place(r, c, p.solution[r][c] as 1 | 2);
          placed++;
        }
    const saved = JSON.parse(JSON.stringify(captureSession(mode, s)));
    expect(hasMeaningfulProgress(saved)).toBe(true);
    const back = resumeSession(saved)!;
    expect(back.mode).toEqual(mode);
    expect(back.session.cells).toEqual(s.cells);
  });

  it('refuses to resume when the layout digest or generator version differs', () => {
    const mode = { kind: 'level' as const, level: 2 };
    const s = new Session(puzzleFor(mode));
    const saved = captureSession(mode, s)!;
    expect(resumeSession({ ...saved, digest: 'deadbeef' })).toBeNull();
    expect(resumeSession({ ...saved, generatorVersion: GENERATOR_VERSION + 1 })).toBeNull();
  });

  it('does not keep finished boards or lost Paw Cup attempts', () => {
    const cup = { kind: 'cup' as const, weekKey: '2026-W43', index: 0 };
    const s = new Session(puzzleFor(cup));
    const p = s.puzzle;
    let wrong: [number, number] | null = null;
    for (let r = 0; r < p.size && !wrong; r++) for (let c = 0; c < p.size && !wrong; c++) if (p.solution[r][c] !== CAT && !s.givenMask[r][c]) wrong = [r, c];
    for (let i = 0; i < 3; i++) s.place(wrong![0], wrong![1], CAT);
    expect(captureSession(cup, s)).toBeNull();
  });
});

describe('ad cadence policy', () => {
  const base: AdCadenceState = { removeAds: false, levelsCompleted: 20, boardsSinceLast: 5, lastShownAt: null, shownToday: 0 };
  const win = { mode: 'level' as const, outcome: 'won' as const, now: 10_000_000 };
  it('allows one after enough boards and time', () => {
    expect(shouldShowInterstitial(base, win)).toBe(true);
  });
  it('never during onboarding, after a loss, in Paw Cup, or for ad-free players', () => {
    expect(shouldShowInterstitial({ ...base, levelsCompleted: AD_POLICY.onboardingGraceLevels - 1 }, win)).toBe(false);
    expect(shouldShowInterstitial(base, { ...win, outcome: 'lost' })).toBe(false);
    expect(shouldShowInterstitial(base, { ...win, mode: 'cup' })).toBe(false);
    expect(shouldShowInterstitial({ ...base, removeAds: true }, win)).toBe(false);
  });
  it('respects spacing and the daily cap', () => {
    expect(shouldShowInterstitial({ ...base, boardsSinceLast: 2 }, win)).toBe(false);
    expect(shouldShowInterstitial({ ...base, lastShownAt: win.now - 60_000 }, win)).toBe(false);
    expect(shouldShowInterstitial({ ...base, shownToday: AD_POLICY.dailyCap }, win)).toBe(false);
  });
});

describe('purchases', () => {
  it('release builds cannot buy anything until a real store is wired', async () => {
    const store = createIapService(false);
    expect(store.available).toBe(false);
    expect(await store.purchase('remove_ads')).toEqual({ ok: false, reason: 'unavailable' });
    expect((await store.products()).every((p) => p.price === null)).toBe(true);
  });
  it('dev-stub grants never count in a release build', () => {
    expect(entitlementCounts('dev', false)).toBe(false);
    expect(entitlementCounts('dev', true)).toBe(true);
    expect(entitlementCounts('store', false)).toBe(true);
    expect(entitlementCounts(null, true)).toBe(false);
  });
});

describe('dates', () => {
  it('steps across month, year and DST boundaries by calendar day', () => {
    expect(prevDateKey('2026-03-01')).toBe('2026-02-28');
    expect(prevDateKey('2027-01-01')).toBe('2026-12-31');
    expect(prevDateKey('2026-03-09')).toBe('2026-03-08'); // US DST starts Mar 8 2026
    expect(addDaysKey('2026-11-01', 1)).toBe('2026-11-02'); // US DST ends Nov 1 2026
    expect(daysBetween('2026-10-01', '2026-10-25')).toBe(24);
    expect(localWeekStart('2026-10-25')).toBe('2026-10-19');
  });
  it('computes ISO weeks in UTC', () => {
    expect(utcWeekKey(new Date('2026-10-25T23:30:00Z'))).toBe('2026-W43');
    expect(utcWeekKey(new Date('2026-10-26T00:00:00Z'))).toBe('2026-W44');
    expect(utcWeekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    expect(utcWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    const { start, end } = utcWeekBounds(new Date('2026-10-25T12:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
});
