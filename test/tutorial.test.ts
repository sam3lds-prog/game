// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildLessons, lessonComplete, lessonSession } from '../src/game/tutorial';
import { campaignPuzzle, tutorialPool } from '../src/game/catalog';
import { CAT, DOG, EMPTY } from '../src/engine/types';
import { canonicalKey } from '../src/engine/catalogFormat';
import { App } from '../src/app/app';
import type { TutorialScreen } from '../src/screens/tutorial';

const lessons = buildLessons(tutorialPool())!;

describe('tutorial lessons', () => {
  it('builds five lessons from the catalog tutorial pool', () => {
    expect(lessons).toHaveLength(5);
    expect(lessons.map((l) => l.step)).toEqual([1, 2, 3, 4, 5]);
  });

  it('every lesson board is a legal partial board: no pet breaks a rule', () => {
    for (const l of lessons) {
      const s = lessonSession(l);
      for (let r = 0; r < s.size; r++)
        for (let c = 0; c < s.size; c++) {
          const v = s.cells[r][c];
          if (v === CAT || v === DOG) expect(s.visibleViolation(r, c, v).violation, `lesson ${l.step}`).toBeUndefined();
        }
    }
  });

  it('lessons 1–4: the target completes the lesson, the decoy is rejected for the lesson’s reason', () => {
    const expected: Record<number, string | null> = { 1: null, 2: null, 3: 'duplicate_species_in_column', 4: 'adjacent_conflict' };
    for (const l of lessons.slice(0, 4)) {
      const s = lessonSession(l);
      if (l.decoy) {
        const res = s.setCell(l.decoy.r, l.decoy.c, l.target!.species);
        expect(res.violation, `lesson ${l.step}`).toBe(expected[l.step]);
        expect(res.heartLost).toBe(false);
      }
      expect(lessonComplete(l, s)).toBe(false);
      expect(s.setCell(l.target!.r, l.target!.c, l.target!.species).accepted).toBe(true);
      expect(lessonComplete(l, s)).toBe(true);
    }
  });

  it('lesson 2 starts on the Cat tool, and a cat in the target is rejected (the row has its cat)', () => {
    const l = lessons[1];
    const s = lessonSession(l);
    expect(s.tool).toBe('cat');
    expect(s.setCell(l.target!.r, l.target!.c, CAT).violation).toBe('duplicate_species_in_row');
  });

  it('lesson 4’s right answer touches a cat only at a corner', () => {
    const l = lessons[3];
    const t = l.target!;
    const s = lessonSession(l);
    let diagonalCat = false;
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (s.cells[t.r + dr]?.[t.c + dc] === CAT) diagonalCat = true;
    expect(diagonalCat).toBe(true);
  });

  it('lesson 5 is a full board not used anywhere in the campaign', () => {
    const mini = lessons[4];
    expect(mini.target).toBeNull();
    const key = canonicalKey(mini.puzzle.regions);
    for (let i = 1; i <= 200; i++) expect(canonicalKey(campaignPuzzle(i)!.regions)).not.toBe(key);
  });
});

describe('tutorial screen', () => {
  it('walks all five steps, then marks the tutorial done and opens Level 1', () => {
    localStorage.clear();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App(root, { ads: { maybeShowInterstitial: async () => false, showRewarded: async () => false }, iap: { purchaseRemoveAds: async () => false, restore: async () => false }, haptics: { play() {} } });
    app.ctx.settings.faces = 'off';
    expect(app.ctx.flags.tutorialDone).toBe(false);
    app.ctx.nav.tutorial();
    const screen = () => app.screen as TutorialScreen;
    const click = (sel: string) => (root.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    for (let i = 0; i < 4; i++) {
      const l = screen().debug.lessons[screen().debug.index];
      click(`[data-tool="${l.target!.species === CAT ? 'cat' : 'dog'}"]`);
      click(`.cell[data-r="${l.target!.r}"][data-c="${l.target!.c}"]`);
      click('[data-act="next"]');
    }
    const s = screen().debug.session;
    for (let r = 0; r < s.size; r++)
      for (let c = 0; c < s.size; c++) {
        const v = s.puzzle.solution[r][c];
        if (v === EMPTY || s.givenMask[r][c]) continue;
        click(`[data-tool="${v === CAT ? 'cat' : 'dog'}"]`);
        click(`.cell[data-r="${r}"][data-c="${c}"]`);
      }
    expect(s.outcome).toBe('won');
    click('[data-act="start"]');
    expect(app.ctx.flags.tutorialDone).toBe(true);
    expect(root.querySelector('.title')?.textContent).toBe('Level 1');
    app.destroy();
  });
});
