// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/app';
import type { AdService } from '../src/services/ads';
import { GameScreen } from '../src/screens/game';
import { loadPuzzle } from '../src/game/puzzles';
import { CAT, DOG, EMPTY } from '../src/engine/types';
import { MARK } from '../src/game/session';
import { KEYS, clearGameData, kv, loadProgress, migrateV1 } from '../src/services/storage';
import { loadSession, saveSession } from '../src/services/sessions';
import { Session } from '../src/game/session';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

class FakeAds implements AdService {
  rewarded: Array<ReturnType<typeof deferred<boolean>>> = [];
  interstitials: Array<ReturnType<typeof deferred<boolean>>> = [];
  maybeShowInterstitial() {
    const d = deferred<boolean>();
    this.interstitials.push(d);
    return d.promise;
  }
  showRewarded() {
    const d = deferred<boolean>();
    this.rewarded.push(d);
    return d.promise;
  }
}

let clock = 1_000_000;
let ads: FakeAds;
let root: HTMLElement;
let app: App;

function makeApp() {
  root = document.createElement('div');
  document.body.appendChild(root);
  ads = new FakeAds();
  app = new App(root, { ads, iap: { purchaseRemoveAds: async () => false, restore: async () => false }, haptics: { play() {} }, now: () => clock });
  app.ctx.flags.seenRules = true;
  return app;
}

function tapCell(r: number, c: number) {
  const el = root.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`) as HTMLButtonElement;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
}

function click(sel: string, within: ParentNode = document) {
  (within.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

function game(): GameScreen {
  return app.screen as GameScreen;
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  clock = 1_000_000;
});

afterEach(() => {
  app?.destroy();
});

describe('autosave and restore', () => {
  it('restores marks, pets, tool, hearts and active time after leaving mid-level', () => {
    makeApp();
    app.ctx.nav.play({ kind: 'level', level: 1 });
    const p = game().debug.session.puzzle;
    // Mark one free cell, place one correct cat, pick the dog tool.
    let mark: [number, number] | null = null;
    let cat: [number, number] | null = null;
    for (let r = 0; r < p.size; r++)
      for (let c = 0; c < p.size; c++) {
        if (game().debug.session.givenMask[r][c]) continue;
        if (!mark && p.solution[r][c] === EMPTY) mark = [r, c];
        if (!cat && p.solution[r][c] === CAT) cat = [r, c];
      }
    tapCell(mark![0], mark![1]); // ✕
    tapCell(cat![0], cat![1]); // ✕
    tapCell(cat![0], cat![1]); // cat
    click('[data-tool="dog"]', root);
    clock += 42_000;
    app.ctx.nav.home();

    app.ctx.nav.play({ kind: 'level', level: 1 });
    const s = game().debug.session;
    expect(s.cells[mark![0]][mark![1]]).toBe(MARK);
    expect(s.cells[cat![0]][cat![1]]).toBe(CAT);
    expect(s.tool).toBe('dog');
    expect(s.hearts).toBe(3);
    expect(Math.round(game().debug.timer.elapsedMs() / 1000)).toBe(42);
    expect(root.querySelector('[data-tool="dog"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('saves when the page is hidden', () => {
    makeApp();
    app.ctx.nav.play({ kind: 'level', level: 2 });
    const s = game().debug.session;
    const free = (() => {
      for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++) if (!s.givenMask[r][c]) return [r, c];
      return [0, 0];
    })();
    tapCell(free[0], free[1]);
    app.persistNow();
    expect(loadSession('campaign-0002')!.cells).toContain('x');
  });

  it('a won puzzle leaves no saved session, so replay starts fresh', async () => {
    makeApp();
    app.ctx.nav.play({ kind: 'level', level: 1 });
    const s = game().debug.session;
    for (let r = 0; r < s.size; r++)
      for (let c = 0; c < s.size; c++) {
        const v = s.puzzle.solution[r][c];
        if (v !== EMPTY && !s.givenMask[r][c]) s.setCell(r, c, v);
      }
    // Drive the screen's outcome handling through one more (ignored) tap.
    (game() as unknown as { checkOutcome(): void }).checkOutcome();
    await flush();
    expect(loadSession('campaign-0001')).toBeNull();
    expect(app.ctx.progress.level).toBe(2);
  });
});

describe('lifecycle: nothing outlives its screen', () => {
  it('a rewarded ad that finishes after leaving does not touch the next screen', async () => {
    makeApp();
    app.ctx.nav.play({ kind: 'level', level: 1 });
    click('[data-act="hint"]', root);
    expect(ads.rewarded).toHaveLength(1);
    app.ctx.nav.home();
    ads.rewarded[0].resolve(true);
    await flush();
    expect(document.querySelector('.overlay')).toBeNull();
    expect(root.querySelector('.home')).not.toBeNull();
  });

  it('an interstitial that finishes after leaving does not open a result sheet', async () => {
    makeApp();
    app.ctx.settings.faces = 'off'; // skip the celebration delay; faces have their own tests
    app.ctx.nav.play({ kind: 'level', level: 1 });
    const s = game().debug.session;
    const winning: Array<[number, number, 1 | 2]> = [];
    for (let r = 0; r < s.size; r++)
      for (let c = 0; c < s.size; c++) {
        const v = s.puzzle.solution[r][c];
        if (v !== EMPTY && !s.givenMask[r][c]) winning.push([r, c, v as 1 | 2]);
      }
    const last = winning.pop()!;
    for (const [r, c, v] of winning) s.setCell(r, c, v);
    click(`[data-tool="${last[2] === CAT ? 'cat' : 'dog'}"]`, root);
    tapCell(last[0], last[1]);
    tapCell(last[0], last[1]);
    await flush();
    expect(ads.interstitials).toHaveLength(1);
    expect(app.ctx.progress.level).toBe(2); // recorded once, before the ad
    app.ctx.nav.home();
    ads.interstitials[0].resolve(true);
    await flush();
    expect(document.querySelector('.overlay')).toBeNull();
    expect(app.ctx.progress.level).toBe(2);
  });

  it('unmounting clears every timer the screen created', () => {
    vi.useFakeTimers();
    try {
      makeApp();
      const before = vi.getTimerCount();
      app.ctx.nav.play({ kind: 'level', level: 1 });
      expect(vi.getTimerCount()).toBeGreaterThan(before);
      app.ctx.nav.home();
      expect(vi.getTimerCount()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the timer does not run while a sheet covers the board or the page is hidden', () => {
    makeApp();
    app.ctx.nav.play({ kind: 'level', level: 1 });
    clock += 10_000;
    click('[data-act="pause"]', root);
    clock += 60_000; // paused: must not count
    click('.overlay [data-act="resume"]');
    clock += 5_000;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    clock += 300_000; // backgrounded: must not count
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(Math.round(game().debug.timer.elapsedMs() / 1000)).toBe(15);
  });

  it('long-pressing a cell does not change it', () => {
    vi.useFakeTimers();
    try {
      makeApp();
      app.ctx.nav.play({ kind: 'level', level: 1 });
      const s = game().debug.session;
      const g = s.puzzle.givens[0];
      let target: HTMLElement | null = null;
      for (let r = 0; r < s.size && !target; r++) for (let c = 0; c < s.size && !target; c++) if (!s.givenMask[r][c]) target = root.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
      const opts = { bubbles: true, pointerId: 1, clientX: 10, clientY: 10, pointerType: 'touch' } as PointerEventInit;
      target!.dispatchEvent(new PointerEvent('pointerdown', opts));
      vi.advanceTimersByTime(600);
      target!.dispatchEvent(new PointerEvent('pointerup', opts));
      const r = Number(target!.dataset.r);
      const c = Number(target!.dataset.c);
      expect(s.cells[r][c]).toBe(EMPTY);
      expect(s.cells[g.r][g.c]).toBe(g.kind);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('storage', () => {
  it('migrates v1 progress once and drops the unverified remove-ads flag', () => {
    kv.set(KEYS.legacyProgress, { level: 12, streak: 3, removeAds: true, bestTimes: { L3: 40 }, installDate: '2026-10-01T00:00:00.000Z' });
    const p = loadProgress();
    expect(p.level).toBe(12);
    expect(p.streak).toBe(3);
    expect(p.bestTimes.L3).toBe(40);
    expect(p.removeAds).toBe(false);
    expect(kv.get(KEYS.progress, null)).not.toBeNull();
    expect(migrateV1({}).level).toBe(1);
  });

  it('reset removes only game keys', () => {
    localStorage.setItem('other-app', 'keep');
    kv.set(KEYS.progress, { v: 2, level: 4 });
    localStorage.setItem('cvd.progress.v1', '{}');
    clearGameData();
    expect(localStorage.getItem('other-app')).toBe('keep');
    expect(localStorage.getItem(KEYS.progress)).toBeNull();
    expect(localStorage.getItem('cvd.progress.v1')).toBeNull();
  });

  it('keeps at most eight in-progress sessions, evicting the oldest', () => {
    for (let i = 1; i <= 10; i++) {
      const p = { ...loadPuzzle({ kind: 'level', level: 1 }), id: `campaign-${String(i).padStart(4, '0')}` };
      const snap = new Session(p).toSnapshot(0);
      snap.savedAt = i;
      saveSession(p.id!, snap);
    }
    expect(loadSession('campaign-0001')).toBeNull();
    expect(loadSession('campaign-0002')).toBeNull();
    expect(loadSession('campaign-0010')).not.toBeNull();
  });

  it('rejects a snapshot saved for a different puzzle', () => {
    const p = { ...loadPuzzle({ kind: 'level', level: 1 }), id: 'campaign-0001' };
    kv.set(KEYS.session('campaign-0002'), new Session(p).toSnapshot(0));
    expect(loadSession('campaign-0002')).toBeNull();
    void DOG;
  });
});
