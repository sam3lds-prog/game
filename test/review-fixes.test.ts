// @vitest-environment happy-dom
/** Regression tests for the independent code review of Sprint 6 (one block per finding). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { GameScreen, shareText } from '../src/screens/game';
import { TutorialScreen } from '../src/screens/tutorial';
import { CAT, DOG, EMPTY } from '../src/engine/types';
import { KEYS, clearGameData, defaultSettings, kv } from '../src/services/storage';
import { MAX_SESSIONS, loadSession, saveSession } from '../src/services/sessions';
import { Session } from '../src/game/session';
import { loadPuzzle, puzzleKey, type PuzzleRef } from '../src/game/puzzles';
import { localDateKey } from '../src/engine/levels';
import { dailyCreditDay } from '../src/game/streak';
import { createAnalytics } from '../src/services/analytics';
import { AdController, type AdProvider } from '../src/services/ads';
import { Purchases, hasEntitlement, type IapProvider, type PurchaseResult } from '../src/services/iap';
import { BoardView } from '../src/ui/board';
import { Scope } from '../src/app/scope';
import { testServices } from './helpers';

let clock = new Date(2026, 9, 25, 12, 0).getTime();
let root: HTMLElement;
let app: App;

function makeApp() {
  root = document.createElement('div');
  document.body.appendChild(root);
  app = new App(root, testServices({ now: () => clock }));
  app.ctx.flags.seenRules = true;
  app.ctx.flags.tutorialDone = true;
  app.ctx.settings.faces = 'off';
  app.ctx.settings.inputMode = 'direct';
  return app;
}
const game = () => app.screen as GameScreen;
const fire = (el: Element | null) => (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
const click = (sel: string) => fire(document.querySelector(sel));
/** Cells take keyboard-style clicks (detail 0) in tests; pointer taps go through pointer events. */
const tap = (r: number, c: number) => (root.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
const today = () => localDateKey(new Date(clock));
const dailyRef = (): PuzzleRef => ({ kind: 'daily', dateKey: today() });

/** Places one correct pet (so the board is "touched"). */
function placeOne(s: Session) {
  for (let r = 0; r < s.size; r++)
    for (let c = 0; c < s.size; c++) {
      const v = s.puzzle.solution[r][c];
      if (v !== EMPTY && !s.givenMask[r][c]) {
        fire(root.querySelector(`[data-tool="${v === CAT ? 'cat' : 'dog'}"]`));
        tap(r, c);
        return;
      }
    }
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  clock = new Date(2026, 9, 25, 12, 0).getTime();
});
afterEach(() => app?.destroy());

describe('P1 · Reset progress from inside a game', () => {
  it('does not write the open board back after the reset', () => {
    makeApp();
    app.ctx.nav.play(dailyRef());
    placeOne(game().debug.session);
    app.persistNow();
    const key = puzzleKey(dailyRef());
    expect(loadSession(key)).not.toBeNull();
    click('[data-act="pause"]');
    click('.overlay [data-act="settings"]');
    click('.overlay [data-act="reset"]');
    click('.overlay [data-act="reset"]'); // confirm
    app.persistNow();
    expect(loadSession(key)).toBeNull();
    expect(kv.get<Record<string, number>>(KEYS.sessionIndex, {})[key]).toBeUndefined();
    expect(app.screen).not.toBeInstanceOf(GameScreen);
  });
});

describe('P1/P2 · Reset keeps purchases, settings (incl. reminder) and the privacy choice', () => {
  it('keeps verified entitlements, settings and analytics consent; erases progress and boards', () => {
    kv.set('cd.v2.entitlements', [{ product: 'remove_ads', source: 'storekit', transactionId: 't1', verifiedAt: '2026-10-25' }]);
    kv.set(KEYS.settings, { ...defaultSettings(), reminder: { enabled: true, hour: 8, minute: 30 } });
    const analytics = createAnalytics();
    analytics.setConsent(true);
    analytics.track('level_started', { size: 5 });
    kv.set(KEYS.progress, { v: 2, level: 9 });
    kv.set(KEYS.session('campaign-0003'), { v: 2 });
    kv.set('cd.v2.adstate', { solvesSinceInterstitial: 3, lastInterstitialAt: 0 });

    clearGameData();

    expect(hasEntitlement('remove_ads')).toBe(true);
    expect(kv.get<{ reminder: { enabled: boolean } }>(KEYS.settings, defaultSettings()).reminder.enabled).toBe(true);
    // In-memory consent and storage still agree; the buffer is intact.
    expect(analytics.consent).toBe(true);
    expect(createAnalytics().consent).toBe(true);
    expect(analytics.recent()).toHaveLength(1);
    expect(kv.getRaw(KEYS.progress)).toBeNull();
    expect(kv.getRaw(KEYS.session('campaign-0003'))).toBeNull();
    expect(kv.getRaw('cd.v2.adstate')).toBeNull();
  });
});

describe('P1 · Opening boards never deletes a real in-progress board', () => {
  it('untouched boards are not saved, so browsing levels keeps today’s Daily', () => {
    makeApp();
    app.ctx.nav.play(dailyRef());
    placeOne(game().debug.session);
    app.ctx.nav.home();
    for (let level = 1; level <= MAX_SESSIONS + 2; level++) {
      app.ctx.nav.play({ kind: 'level', level });
      app.ctx.nav.home();
    }
    expect(loadSession(puzzleKey(dailyRef()))).not.toBeNull();
    expect(loadSession('campaign-0001')).toBeNull();
  });

  it('today’s Daily and the current level survive even many played boards', () => {
    const snap = (id: string, at: number) => {
      const s = new Session({ ...loadPuzzle({ kind: 'level', level: 1 })!, id });
      const sn = s.toSnapshot(0);
      sn.savedAt = at;
      return sn;
    };
    const keep = ['daily-2026-10-25', 'campaign-0001'];
    saveSession('daily-2026-10-25', snap('daily-2026-10-25', 1), keep);
    saveSession('campaign-0001', snap('campaign-0001', 2), keep);
    for (let i = 0; i < MAX_SESSIONS + 4; i++) saveSession(`unlimited-${i}`, snap(`unlimited-${i}`, 10 + i), keep);
    expect(loadSession('daily-2026-10-25')).not.toBeNull();
    expect(loadSession('campaign-0001')).not.toBeNull();
    expect(Object.keys(kv.get(KEYS.sessionIndex, {}))).toHaveLength(MAX_SESSIONS);
  });

  it('undoing every move and leaving drops the old save instead of restoring stale moves', () => {
    makeApp();
    app.ctx.nav.play({ kind: 'level', level: 1 });
    placeOne(game().debug.session);
    app.persistNow();
    expect(loadSession('campaign-0001')).not.toBeNull();
    click('[data-act="undo"]');
    app.ctx.nav.home();
    expect(loadSession('campaign-0001')).toBeNull();
  });
});

describe('P2 · One hint counts once', () => {
  it('Explain + Reveal is one hint, asking again for the same step is not another, a new step is', () => {
    makeApp();
    app.ctx.nav.play({ kind: 'level', level: 1 });
    const s = game().debug.session;
    click('[data-act="hint"]');
    click('[data-act="hint"]');
    click('[data-act="hint-reveal"]');
    expect(s.hintsUsed).toBe(1);
    expect(shareText({ kind: 'level', level: 1 }, s, 60)).toContain('1 hint');
    click('[data-act="hint"]');
    expect(s.hintsUsed).toBe(2);
  });
});

describe('P2 · A Daily finished just after midnight counts for its day', () => {
  it('credit-day rule', () => {
    expect(dailyCreditDay('2026-10-25', '2026-10-25', '2026-10-25')).toBe('2026-10-25');
    expect(dailyCreditDay('2026-10-25', '2026-10-25', '2026-10-26')).toBe('2026-10-25');
    expect(dailyCreditDay('2026-10-25', '2026-10-25', '2026-10-27')).toBe('2026-10-27');
    expect(dailyCreditDay('2026-10-25', null, '2026-10-26')).toBe('2026-10-26');
    expect(dailyCreditDay('2026-10-25', '2026-10-26', '2026-10-26')).toBe('2026-10-26');
  });

  it('opened at 23:58, solved at 00:01: the day is solved on time and the streak counts it', async () => {
    clock = new Date(2026, 9, 25, 23, 58).getTime();
    makeApp();
    app.ctx.nav.play({ kind: 'daily', dateKey: '2026-10-25' });
    placeOne(game().debug.session);
    app.persistNow();
    clock = new Date(2026, 9, 26, 0, 1).getTime();
    app.ctx.nav.home();
    app.ctx.nav.play({ kind: 'daily', dateKey: '2026-10-25' }); // resumed after midnight
    const s = game().debug.session;
    for (let r = 0; r < s.size; r++)
      for (let c = 0; c < s.size; c++) {
        const v = s.puzzle.solution[r][c];
        if (v !== EMPTY && !s.givenMask[r][c] && s.cells[r][c] !== v) s.setCell(r, c, v);
      }
    (game() as unknown as { checkOutcome(): void }).checkOutcome();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(app.ctx.records.daily['2026-10-25'].solvedOn).toBe('2026-10-25');
    expect(app.ctx.progress.streak).toBe(1);
    expect(document.querySelector('.overlay')?.textContent).not.toContain('Solved from the calendar');
  });
});

describe('P2 · Turning pips on/off refits the board', () => {
  it('re-runs the fit when the frame changes', () => {
    const scope = new Scope();
    const p = loadPuzzle({ kind: 'level', level: 200 })!;
    const board = new BoardView(p, scope, { tap() {} }, { counters: true, patterns: false });
    const wrap = document.createElement('div');
    Object.defineProperty(wrap, 'clientWidth', { value: 300 });
    Object.defineProperty(wrap, 'clientHeight', { value: 300 });
    wrap.appendChild(board.el);
    board.fitTo(wrap);
    const withPips = board.cellSize;
    board.setOptions({ counters: false, patterns: false });
    expect(board.cellSize).toBe(Math.floor((300 - 6) / p.size));
    board.setOptions({ counters: true, patterns: false });
    expect(board.cellSize).toBe(withPips);
    scope.dispose();
  });
});

describe('P2 · Tutorial controls stay in place', () => {
  it('Hint and Next keep their slot (hidden, not removed); Next works only once earned', () => {
    localStorage.clear();
    root = document.createElement('div');
    document.body.appendChild(root);
    app = new App(root, testServices({}));
    app.ctx.settings.faces = 'off';
    app.ctx.nav.tutorial();
    const t = () => app.screen as TutorialScreen;
    const cta = () => root.querySelector('[data-cta]') as HTMLButtonElement;
    expect(root.querySelectorAll('[data-act="hint"]')).toHaveLength(1);
    expect(cta().classList.contains('is-off')).toBe(true);
    fire(cta()); // not earned yet: nothing happens
    expect(t().debug.index).toBe(0);
    const l = t().debug.lessons[0];
    fire(root.querySelector(`[data-tool="${l.target!.species === CAT ? 'cat' : 'dog'}"]`));
    tap(l.target!.r, l.target!.c);
    expect(cta().classList.contains('is-off')).toBe(false);
    expect(root.querySelector('[data-lesson-success]')!.classList.contains('is-off')).toBe(false);
    expect(root.querySelector('[data-lesson-body]')!.classList.contains('is-off')).toBe(true);
    fire(cta());
    expect(t().debug.index).toBe(1);
    expect(root.querySelectorAll('[data-act="hint"]')).toHaveLength(1);
    void DOG;
  });
});

describe('P2 · Purchases and ads fail safe', () => {
  const fake = (purchase: () => Promise<PurchaseResult>, restore: () => Promise<never[]> = async () => []): IapProvider => ({ id: 'fake', available: () => true, price: () => '$3.99', purchase, restore });

  it('a "purchased" result that stored nothing is reported as failed', async () => {
    const r = await new Purchases(fake(async () => ({ status: 'purchased', entitlement: { product: 'remove_ads', source: 'storekit', transactionId: '', verifiedAt: '' } }))).buy('remove_ads');
    expect(r.status).toBe('failed');
    expect(hasEntitlement('remove_ads')).toBe(false);
  });

  it('a throwing store never rejects', async () => {
    const p = new Purchases(fake(async () => Promise.reject(new Error('boom')), async () => Promise.reject(new Error('boom'))));
    expect((await p.buy('remove_ads')).status).toBe('failed');
    expect(await p.restore()).toBe(0);
  });

  it('a throwing ad SDK never blocks Next or grants a reward', async () => {
    const bad: AdProvider = { id: 'bad', available: () => true, showInterstitial: () => Promise.reject(new Error('sdk')), showRewarded: () => Promise.reject(new Error('sdk')) };
    const c = new AdController(bad, () => false, () => 99 * 60_000);
    for (let i = 0; i < 5; i++) c.noteSolve();
    await expect(c.betweenLevels({ kind: 'unlimited' })).resolves.toBe('failed');
    await expect(c.rewarded('revive')).resolves.toBe(false);
  });
});
